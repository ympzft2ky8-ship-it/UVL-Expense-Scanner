import Anthropic from '@anthropic-ai/sdk';
import { collection, deleteDoc, doc, getDocs, increment, query, runTransaction, setDoc, where, writeBatch } from 'firebase/firestore';
import {
  categoryFromMemory,
  extractReceipt,
  fillMissingContact,
  findVendorMatch,
  isValidCategory,
  normalizeVendorName,
  REPAIR_VS_IMPROVEMENT_HINT,
  runChecks,
  type Flags,
  type Line,
  type Property,
  type PropertyType,
  type Receipt,
  type Vendor,
  type YearMeta,
} from '@uvl/shared';
import { deletePages, loadPages, savePages, type StoredPage } from './blobs.ts';
import { pageToParts } from './capture/image.ts';
import { db } from './firebase.ts';
import { create, getState, monthKey, newId, onOnline, openYears, reportError, save, saveSettings, todayIso } from './store.ts';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const KEEP_DELETED_DAYS = 30;
const STALE_READING_MS = 3 * 60 * 1000;
const PICK_CATEGORY = 'Pick a category';

export function blankReceipt(partial: Partial<Receipt> = {}): Receipt {
  const year = new Date().getFullYear();
  return {
    id: newId(),
    version: 0,
    createdAt: 0,
    createdBy: '',
    updatedAt: 0,
    updatedBy: '',
    ledgerYear: year,
    status: 'toReview',
    source: 'manual',
    date: '',
    vendorId: null,
    vendorName: '',
    vendorAddress: '',
    vendorPhone: '',
    vendorEmail: '',
    vendorWebsite: '',
    invoiceNo: '',
    subtotalCents: null,
    taxCents: 0,
    totalCents: null,
    taxState: 'NY',
    taxStateConfirmed: false,
    taxRatePrinted: null,
    paymentMethod: '',
    paymentRef: '',
    propertyId: null,
    lines: [],
    flags: {},
    needsAttention: false,
    notes: '',
    pageCount: 0,
    failReason: '',
    readingBy: '',
    readingAt: 0,
    deletedAt: null,
    ...partial,
  };
}

export function blankLine(partial: Partial<Line> = {}): Line {
  return {
    id: newId(),
    description: '',
    sku: '',
    qty: null,
    unitPriceCents: null,
    amountCents: 0,
    taxed: null,
    kind: 'materials',
    isCharge: false,
    propertyId: null,
    category: null,
    splits: [],
    suggest: null,
    ...partial,
  };
}

/** The property pre-selected on a new receipt: the one used last, if it is still active. */
export function defaultPropertyId(): string | null {
  const { settings, properties } = getState();
  const last = properties.find((p) => p.id === settings.lastPropertyId && !p.archivedAt);
  return last?.id ?? null;
}

export function propertyTypeOf(line: Line, receipt: Pick<Receipt, 'propertyId'>, properties: Property[]): PropertyType | null {
  return properties.find((p) => p.id === (line.propertyId ?? receipt.propertyId))?.type ?? null;
}

/**
 * Give lines a category for their property type. Returns the lines and the flags for those
 * a member has to decide. Repair-vs-improvement is never defaulted (expense-categories spec).
 */
export function categorize(
  receipt: Pick<Receipt, 'propertyId' | 'lines'>,
  properties: Property[],
  vendor: Vendor | null,
): { lines: Line[]; flags: Flags } {
  const flags: Flags = {};
  const lines = receipt.lines.map((line) => {
    const type = propertyTypeOf(line, receipt, properties);
    if (!type) return line;
    if (isValidCategory(type, line.category)) return line;
    const remembered = categoryFromMemory(vendor?.categoryCounts, type);
    if (remembered) return { ...line, category: remembered };
    if (line.suggest) {
      if (type === 'rental' && line.suggest.unclear) {
        flags[`lines.${line.id}.category`] = `Repair or improvement? ${REPAIR_VS_IMPROVEMENT_HINT}`;
        return { ...line, category: null };
      }
      return { ...line, category: line.suggest[type] };
    }
    return { ...line, category: null };
  });
  // Delivery, fees and discounts follow the largest item on the receipt.
  const filled = lines.map((line) => {
    if (line.category || !line.isCharge) return line;
    const type = propertyTypeOf(line, receipt, properties);
    const lead = lines
      .filter((l) => !l.isCharge && l.category && propertyTypeOf(l, receipt, properties) === type)
      .sort((a, b) => Math.abs(b.amountCents) - Math.abs(a.amountCents))[0];
    return lead ? { ...line, category: lead.category } : line;
  });
  for (const line of filled) {
    const key = `lines.${line.id}.category`;
    if (!line.category && !flags[key] && propertyTypeOf(line, receipt, properties)) flags[key] = PICK_CATEGORY;
  }
  return { lines: filled, flags };
}

export function checkContext() {
  return { today: todayIso(), openYears: openYears() };
}

/** Everything that still needs a member's eye: reader doubts plus failed checks. */
export function allFlags(receipt: Receipt): Flags {
  return { ...receipt.flags, ...runChecks(receipt, checkContext()) };
}

// ---------- capture ----------

/** Store a new scan. It is read right away when online, or waits in the queue. */
export function createScan(pages: StoredPage[]): Receipt {
  const receipt = blankReceipt({
    status: 'queued',
    source: 'scan',
    pageCount: pages.length,
    propertyId: defaultPropertyId(),
  });
  savePages(receipt.id, receipt.ledgerYear, pages);
  const created = create('receipts', receipt);
  void processQueue();
  return created;
}

export function createManual(): Receipt {
  return blankReceipt({ date: todayIso(), propertyId: defaultPropertyId(), taxStateConfirmed: true });
}

// ---------- reading ----------

let working = false;

export function readingBlocker(): 'nokey' | 'cap' | 'offline' | null {
  const { settings, usage, online } = getState();
  if (!settings.anthropicKey) return 'nokey';
  if (usage.costMicros >= settings.monthlyCapCents * 10_000) return 'cap';
  if (!online) return 'offline';
  return null;
}

export const BLOCKER_TEXT: Record<string, string> = {
  nokey: 'Waiting to read – add the AI key in Settings',
  cap: 'Waiting to read – monthly limit reached',
  offline: 'Waiting to read – no connection',
};

/** Read every waiting scan, one at a time. Safe to call often. */
export async function processQueue(): Promise<void> {
  if (working) return;
  working = true;
  try {
    for (;;) {
      if (readingBlocker()) return;
      const now = Date.now();
      const next = getState().receipts.find(
        (r) => !r.deletedAt && (r.status === 'queued' || (r.status === 'reading' && now - r.readingAt > STALE_READING_MS)),
      );
      if (!next) return;
      const claimed = await claim(next.id);
      if (claimed) await readOne(claimed);
      else await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } catch (error) {
    reportError(error);
  } finally {
    working = false;
  }
}

/** Mark a scan as being read by this phone, so the other phone leaves it alone. */
async function claim(id: string): Promise<Receipt | null> {
  const ref = doc(db, 'receipts', id);
  const email = getState().user?.email ?? '';
  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const r = snap.data() as Receipt | undefined;
      if (!r || r.deletedAt) return null;
      const stale = r.status === 'reading' && Date.now() - r.readingAt > STALE_READING_MS;
      if (r.status !== 'queued' && !stale) return null;
      const next: Receipt = { ...r, status: 'reading', readingBy: email, readingAt: Date.now(), failReason: '', version: r.version + 1 };
      tx.set(ref, next);
      return next;
    });
  } catch {
    return null;
  }
}

async function readOne(receipt: Receipt) {
  const { settings, properties, vendors } = getState();
  let patch: Partial<Receipt>;
  let cost = 0;
  try {
    const pages = await loadPages(receipt.id);
    if (pages.length === 0) throw new Error('The scan has not finished uploading from the phone that took it.');
    const parts = (await Promise.all(pages.map(pageToParts))).flat();
    const client = new Anthropic({ apiKey: settings.anthropicKey, dangerouslyAllowBrowser: true });
    const result = await extractReceipt(client, parts, { model: settings.model, newId });
    cost = result.costMicros;
    if (result.ok) {
      const draft = result.draft;
      const vendor = findVendorMatch({ name: draft.vendorName, phone: draft.vendorPhone }, vendors);
      const flags: Flags = { ...draft.flags };
      const stateFound = draft.taxState !== '';
      if (!stateFound) flags.taxState = 'No state found on the receipt – New York is suggested. Please confirm.';
      const withFields: Receipt = {
        ...receipt,
        ...draft,
        vendorId: vendor?.id ?? null,
        taxState: stateFound ? draft.taxState : 'NY',
        taxStateConfirmed: stateFound,
        ledgerYear: draft.date ? Number(draft.date.slice(0, 4)) : receipt.ledgerYear,
      };
      if (!openYears().includes(withFields.ledgerYear)) withFields.ledgerYear = receipt.ledgerYear;
      const categorized = categorize(withFields, properties, vendor);
      patch = { ...draft, vendorId: withFields.vendorId, taxState: withFields.taxState, taxStateConfirmed: stateFound, ledgerYear: withFields.ledgerYear, lines: categorized.lines, flags: { ...flags, ...categorized.flags }, status: 'toReview', failReason: '' };
    } else {
      patch = { status: 'failed', failReason: result.message };
    }
  } catch (error) {
    patch = { status: 'failed', failReason: error instanceof Error ? error.message : 'Something went wrong while reading.' };
  }
  if (cost > 0) {
    setDoc(doc(db, 'usage', monthKey()), { id: monthKey(), costMicros: increment(cost), scans: increment(1) }, { merge: true }).catch(reportError);
  }
  await save('receipts', { ...receipt, ...patch, readingBy: '', readingAt: 0 }, receipt);
}

export function retryReading(receipt: Receipt) {
  void save('receipts', { ...receipt, status: 'queued', failReason: '' }, receipt).then(() => processQueue());
}

// ---------- saving ----------

function upsertVendor(receipt: Receipt, firstSave: boolean, properties: Property[]): string | null {
  const { vendors } = getState();
  const name = receipt.vendorName.trim();
  if (!name) return null;
  const incoming = { address: receipt.vendorAddress, phone: receipt.vendorPhone, email: receipt.vendorEmail, website: receipt.vendorWebsite };
  const existing = vendors.find((v) => v.id === receipt.vendorId) ?? findVendorMatch({ name, phone: receipt.vendorPhone }, vendors);

  const counts = structuredClone(existing?.categoryCounts ?? {});
  if (firstSave) {
    for (const line of receipt.lines) {
      const type = propertyTypeOf(line, receipt, properties);
      if (!type || !line.category || line.isCharge) continue;
      const byType = (counts[type] ??= {});
      byType[line.category] = (byType[line.category] ?? 0) + 1;
    }
  }
  if (!existing) {
    const vendor: Vendor = {
      id: newId(),
      version: 0,
      createdAt: 0,
      createdBy: '',
      updatedAt: 0,
      updatedBy: '',
      name,
      normalizedName: normalizeVendorName(name),
      ...incoming,
      categoryCounts: counts,
    };
    create('vendors', vendor);
    return vendor.id;
  }
  const { changed, vendor } = fillMissingContact(existing, incoming);
  if (changed || firstSave) void save('vendors', { ...vendor, categoryCounts: counts }, existing).catch(reportError);
  return existing.id;
}

/** Put a reviewed receipt into the ledger, or save changes to one already there. */
export async function saveReceipt(draft: Receipt, base: Receipt | null): Promise<boolean> {
  const { properties } = getState();
  const firstSave = base?.status !== 'saved';
  const year = Number(draft.date.slice(0, 4));
  const next: Receipt = {
    ...draft,
    status: 'saved',
    ledgerYear: year,
    vendorId: upsertVendor(draft, firstSave, properties),
    failReason: '',
  };
  next.needsAttention = Object.keys(allFlags(next)).length > 0;
  if (next.propertyId) saveSettings({ lastPropertyId: next.propertyId });
  if (!base || base.version === 0) {
    create('receipts', next);
    return true;
  }
  return save('receipts', next, base);
}

export function deleteReceipt(receipt: Receipt) {
  return save('receipts', { ...receipt, deletedAt: Date.now() }, receipt);
}

export function restoreReceipt(receipt: Receipt) {
  return save('receipts', { ...receipt, deletedAt: null }, receipt);
}

/** Discard a scan that never reached the ledger: nothing to keep, so remove it outright. */
export async function discardScan(receipt: Receipt) {
  await deleteDoc(doc(db, 'receipts', receipt.id));
  void deletePages('receiptId', receipt.id).catch(reportError);
}

export function attachPages(receipt: Receipt, pages: StoredPage[]) {
  savePages(receipt.id, receipt.ledgerYear, pages, receipt.pageCount);
  return { ...receipt, pageCount: receipt.pageCount + pages.length };
}

// ---------- vendors ----------

/** Fold one vendor into another: its receipts move over and it is removed. */
export async function mergeVendors(from: Vendor, into: Vendor) {
  const snap = await getDocs(query(collection(db, 'receipts'), where('vendorId', '==', from.id)));
  const batch = writeBatch(db);
  snap.docs.forEach((d) => batch.update(d.ref, { vendorId: into.id, vendorName: into.name, version: increment(1), updatedAt: Date.now() }));
  batch.delete(doc(db, 'vendors', from.id));
  await batch.commit();
  const counts = structuredClone(into.categoryCounts ?? {});
  for (const [type, byCat] of Object.entries(from.categoryCounts ?? {})) {
    const target = (counts[type as PropertyType] ??= {});
    for (const [cat, n] of Object.entries(byCat ?? {})) target[cat] = (target[cat] ?? 0) + n;
  }
  const { vendor } = fillMissingContact(into, from);
  await save('vendors', { ...vendor, categoryCounts: counts }, into);
}

// ---------- years ----------

function yearMeta(year: number): YearMeta {
  return (
    getState().years.find((y) => y.year === year) ?? {
      id: String(year),
      version: 0,
      createdAt: 0,
      createdBy: '',
      updatedAt: 0,
      updatedBy: '',
      year,
      status: 'open',
      archivedAt: null,
      purgeAt: null,
    }
  );
}

async function putYear(next: YearMeta, base: YearMeta) {
  if (base.version === 0) create('yearMeta', next);
  else await save('yearMeta', next, base);
}

export function markArchived(year: number) {
  const base = yearMeta(year);
  return putYear({ ...base, archivedAt: Date.now() }, base);
}

/** Hide a closed year. Its records stay recoverable for 30 days, then are deleted for good. */
export function clearYear(year: number) {
  const base = yearMeta(year);
  return putYear({ ...base, status: 'cleared', purgeAt: Date.now() + KEEP_DELETED_DAYS * DAY_MS }, base);
}

export function restoreYear(year: number) {
  const base = yearMeta(year);
  return putYear({ ...base, status: 'open', purgeAt: null }, base);
}

/** Permanently remove what is past its 30-day keep window. Runs when the app opens. */
export async function purgeExpired(now = Date.now()) {
  const { receipts, years } = getState();
  for (const r of receipts) {
    if (r.deletedAt && now - r.deletedAt > KEEP_DELETED_DAYS * DAY_MS) {
      await deleteDoc(doc(db, 'receipts', r.id));
      await deletePages('receiptId', r.id);
    }
  }
  for (const y of years) {
    if (y.status === 'cleared' && y.purgeAt && now > y.purgeAt) {
      const snap = await getDocs(query(collection(db, 'receipts'), where('ledgerYear', '==', y.year)));
      for (let i = 0; i < snap.docs.length; i += 200) {
        const batch = writeBatch(db);
        snap.docs.slice(i, i + 200).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      await deletePages('ledgerYear', y.year);
      await save('yearMeta', { ...y, purgeAt: null }, y);
    }
  }
}

onOnline(() => void processQueue());
