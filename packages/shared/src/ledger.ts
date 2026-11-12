import { allocate, allocateTax, effectiveRate } from './money.ts';
import { taxTreatment } from './categories.ts';
import type { Line, LineKind, Property, PropertyType, Receipt } from './types.ts';

export interface LineShare {
  propertyId: string | null;
  amountCents: number;
  taxCents: number;
}

/** A line's amount per property, following its splits. Shares add up to the line exactly. */
export function lineShares(line: Line, lineTaxCents: number, receiptPropertyId: string | null): LineShare[] {
  const own = line.propertyId ?? receiptPropertyId;
  if (line.splits.length === 0) return [{ propertyId: own, amountCents: line.amountCents, taxCents: lineTaxCents }];
  const amounts = line.splits.map((s) =>
    s.amountCents !== null
      ? s.amountCents
      : Math.sign(line.amountCents) * Math.round((Math.abs(line.amountCents) * (s.percentBp ?? 0)) / 10_000),
  );
  const used = amounts.reduce((a, b) => a + b, 0);
  const rest = line.amountCents - used;
  const parts = line.splits.map((s, i) => ({ propertyId: s.propertyId as string | null, amountCents: amounts[i] ?? 0 }));
  // Whatever the splits do not cover stays with the line's own property.
  if (rest !== 0) {
    const existing = parts.find((p) => p.propertyId === own);
    if (existing) existing.amountCents += rest;
    else parts.push({ propertyId: own, amountCents: rest });
  }
  const taxes = allocate(lineTaxCents, parts.map((p) => p.amountCents));
  return parts.map((p, i) => ({ ...p, taxCents: taxes[i] ?? 0 }));
}

/** One row of the Expenses sheet: a line item, or one property's share of a split line. */
export interface LedgerRow {
  receiptId: string;
  lineId: string;
  date: string;
  vendor: string;
  vendorAddress: string;
  vendorPhone: string;
  vendorEmail: string;
  invoiceNo: string;
  propertyId: string | null;
  property: string;
  propertyType: PropertyType | null;
  category: string;
  taxTreatment: string;
  kind: LineKind;
  description: string;
  qty: number | null;
  unitPriceCents: number | null;
  amountCents: number;
  taxCents: number;
  totalCents: number;
  taxState: string;
  taxRate: number | null;
  paymentMethod: string;
  needsAttention: boolean;
  notes: string;
}

export function receiptTaxRate(r: Pick<Receipt, 'taxCents' | 'lines' | 'taxRatePrinted'>): number | null {
  if (r.taxRatePrinted !== null) return r.taxRatePrinted;
  let base = r.lines.filter((l) => l.taxed !== false).reduce((a, l) => a + l.amountCents, 0);
  if (base === 0) base = r.lines.reduce((a, l) => a + l.amountCents, 0);
  return effectiveRate(r.taxCents, base);
}

export function paymentLabel(r: Pick<Receipt, 'paymentMethod' | 'paymentRef'>): string {
  const names = { '': '', card: 'Card', cash: 'Cash', check: 'Check', transfer: 'Bank transfer', other: 'Other' } as const;
  const name = names[r.paymentMethod];
  if (!name) return '';
  if (r.paymentMethod === 'card' && r.paymentRef) return `Card ending ${r.paymentRef}`;
  if (r.paymentMethod === 'check' && r.paymentRef) return `Check #${r.paymentRef}`;
  return name;
}

export function receiptRows(r: Receipt, properties: Map<string, Property>): LedgerRow[] {
  const taxes = allocateTax(r.lines, r.taxCents);
  const rate = receiptTaxRate(r);
  const rows: LedgerRow[] = [];
  r.lines.forEach((line, i) => {
    const ownProp = properties.get(line.propertyId ?? r.propertyId ?? '');
    for (const share of lineShares(line, taxes[i] ?? 0, r.propertyId)) {
      const prop = properties.get(share.propertyId ?? '');
      const category = line.category ?? '';
      // A category belongs to the property type it was picked for.
      const type = prop?.type ?? ownProp?.type ?? null;
      rows.push({
        receiptId: r.id,
        lineId: line.id,
        date: r.date,
        vendor: r.vendorName,
        vendorAddress: r.vendorAddress,
        vendorPhone: r.vendorPhone,
        vendorEmail: r.vendorEmail,
        invoiceNo: r.invoiceNo,
        propertyId: share.propertyId,
        property: prop?.name ?? '',
        propertyType: type,
        category,
        taxTreatment: type && category ? taxTreatment(type, category) : '',
        kind: line.kind,
        description: line.description,
        qty: line.qty,
        unitPriceCents: line.unitPriceCents,
        amountCents: share.amountCents,
        taxCents: share.taxCents,
        totalCents: share.amountCents + share.taxCents,
        taxState: r.taxState,
        taxRate: rate,
        paymentMethod: paymentLabel(r),
        needsAttention: r.needsAttention,
        notes: r.notes,
      });
    }
  });
  return rows;
}

/** Rows for every saved, not-deleted receipt of a year, sorted for the Expenses sheet. */
export function ledgerRows(receipts: Receipt[], properties: Property[], year: number): LedgerRow[] {
  const byId = new Map(properties.map((p) => [p.id, p]));
  return receipts
    .filter((r) => r.ledgerYear === year && r.status === 'saved' && !r.deletedAt)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .flatMap((r) => receiptRows(r, byId));
}

export interface Totals {
  amountCents: number;
  taxCents: number;
  totalCents: number;
}

export function sumRows(rows: Pick<LedgerRow, 'amountCents' | 'taxCents' | 'totalCents'>[]): Totals {
  return rows.reduce(
    (t, r) => ({
      amountCents: t.amountCents + r.amountCents,
      taxCents: t.taxCents + r.taxCents,
      totalCents: t.totalCents + r.totalCents,
    }),
    { amountCents: 0, taxCents: 0, totalCents: 0 },
  );
}

export function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k);
    if (list) list.push(item);
    else out.set(k, [item]);
  }
  return out;
}

/** Same vendor + date + total, or same vendor + invoice number (receipt-capture spec). */
export function findDuplicate(
  r: Pick<Receipt, 'id' | 'vendorName' | 'vendorId' | 'date' | 'totalCents' | 'invoiceNo'>,
  others: Receipt[],
  normalize: (name: string) => string,
): Receipt | null {
  const name = normalize(r.vendorName);
  if (!name && !r.vendorId) return null;
  for (const o of others) {
    if (o.id === r.id || o.deletedAt || o.status !== 'saved') continue;
    const sameVendor = (r.vendorId && o.vendorId === r.vendorId) || (name !== '' && normalize(o.vendorName) === name);
    if (!sameVendor) continue;
    if (r.invoiceNo && o.invoiceNo && r.invoiceNo.trim().toLowerCase() === o.invoiceNo.trim().toLowerCase()) return o;
    if (r.date && o.date === r.date && r.totalCents !== null && o.totalCents === r.totalCents) return o;
  }
  return null;
}
