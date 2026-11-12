import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  where,
  type FirestoreError,
  type Unsubscribe,
} from 'firebase/firestore';
import { useSyncExternalStore } from 'react';
import {
  DEFAULT_MODEL,
  threeWayMerge,
  type AppSettings,
  type FieldConflict,
  type Meta,
  type Property,
  type Receipt,
  type UsageMonth,
  type Vendor,
  type YearMeta,
} from '@uvl/shared';
import { auth, db } from './firebase.ts';

export type SyncedCollection = 'properties' | 'vendors' | 'receipts' | 'yearMeta';

/** A change made while offline, waiting to be sent with its version check. */
export interface OutboxEntry {
  col: SyncedCollection;
  base: Meta;
  mine: Meta;
}

export interface PendingConflict {
  col: SyncedCollection;
  base: Meta;
  mine: Meta;
  theirs: Meta;
  merged: Meta;
  conflicts: FieldConflict[];
}

export interface AppState {
  authReady: boolean;
  user: { uid: string; email: string; verified: boolean } | null;
  /** Signed in, but the rules refused the data: not on the members list. */
  denied: boolean;
  loaded: boolean;
  properties: Property[];
  vendors: Vendor[];
  receipts: Receipt[];
  years: YearMeta[];
  settings: AppSettings;
  usage: UsageMonth;
  online: boolean;
  /** Documents written locally that the server has not confirmed yet. */
  unsynced: number;
  outbox: OutboxEntry[];
  conflicts: PendingConflict[];
  error: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  id: 'app',
  version: 0,
  createdAt: 0,
  createdBy: '',
  updatedAt: 0,
  updatedBy: '',
  anthropicKey: '',
  monthlyCapCents: 1000,
  model: DEFAULT_MODEL,
  lastPropertyId: null,
};

export const OVERHEAD_ID = 'overhead';
const OUTBOX_KEY = 'uvl.outbox.v1';
const META_KEYS = ['id', 'version', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'];

export function monthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function todayIso(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function loadOutbox(): OutboxEntry[] {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? '[]') as OutboxEntry[];
  } catch {
    return [];
  }
}

interface Raw {
  properties: Property[];
  vendors: Vendor[];
  receipts: Receipt[];
  yearMeta: YearMeta[];
}

const raw: Raw = { properties: [], vendors: [], receipts: [], yearMeta: [] };
const pending: Record<string, number> = {};
const firstLoad = new Set<string>();

let state: AppState = {
  authReady: false,
  user: null,
  denied: false,
  loaded: false,
  properties: [],
  vendors: [],
  receipts: [],
  years: [],
  settings: DEFAULT_SETTINGS,
  usage: { id: monthKey(), costMicros: 0, scans: 0 },
  online: navigator.onLine,
  unsynced: 0,
  outbox: loadOutbox(),
  conflicts: [],
  error: '',
};

const listeners = new Set<() => void>();

function set(patch: Partial<AppState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function getState(): AppState {
  return state;
}

export function useAppState(): AppState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** Show offline edits on top of what the server last sent. */
function overlay<T extends Meta>(col: SyncedCollection, items: T[]): T[] {
  const mine = state.outbox.filter((e) => e.col === col);
  if (mine.length === 0) return items;
  const byId = new Map(mine.map((e) => [e.mine.id, e.mine as T]));
  return items.map((item) => byId.get(item.id) ?? item);
}

function publish() {
  set({
    properties: overlay('properties', raw.properties).sort((a, b) => a.name.localeCompare(b.name)),
    vendors: overlay('vendors', raw.vendors).sort((a, b) => a.name.localeCompare(b.name)),
    receipts: overlay('receipts', raw.receipts),
    years: overlay('yearMeta', raw.yearMeta),
    unsynced: Object.values(pending).reduce((a, b) => a + b, 0),
    loaded: ['properties', 'vendors', 'receipts', 'yearMeta', 'settings'].every((k) => firstLoad.has(k)),
  });
}

function setOutbox(outbox: OutboxEntry[]) {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(outbox));
  state = { ...state, outbox };
  publish();
}

export function reportError(error: unknown) {
  const code = (error as FirestoreError)?.code;
  if (code === 'permission-denied') set({ denied: true });
  else set({ error: error instanceof Error ? error.message : String(error) });
  console.error(error);
}

export function clearError() {
  set({ error: '' });
}

/** The current year, plus last year until it has been closed and cleared. */
export function openYears(years: YearMeta[] = state.years, now = new Date()): number[] {
  const thisYear = now.getFullYear();
  const last = years.find((y) => y.year === thisYear - 1);
  return last?.status === 'cleared' ? [thisYear] : [thisYear, thisYear - 1];
}

let unsubscribers: Unsubscribe[] = [];
let receiptsUnsub: Unsubscribe | null = null;
let receiptYears = '';

function listen<K extends keyof Raw>(key: K, q: ReturnType<typeof query>) {
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snap) => {
      raw[key] = snap.docs.map((d) => d.data()) as Raw[K];
      pending[key] = snap.docs.filter((d) => d.metadata.hasPendingWrites).length;
      firstLoad.add(key);
      if (key === 'yearMeta') listenReceipts();
      publish();
      if (key === 'properties' && !snap.metadata.fromCache) ensureOverhead();
    },
    reportError,
  );
}

function listenReceipts() {
  const years = openYears(raw.yearMeta);
  const key = years.join(',');
  if (key === receiptYears) return;
  receiptYears = key;
  receiptsUnsub?.();
  receiptsUnsub = listen('receipts', query(collection(db, 'receipts'), where('ledgerYear', 'in', years)));
}

function ensureOverhead() {
  if (raw.properties.some((p) => p.id === OVERHEAD_ID)) return;
  const now = Date.now();
  const overhead: Property = {
    id: OVERHEAD_ID,
    version: 1,
    createdAt: now,
    createdBy: 'system',
    updatedAt: now,
    updatedBy: 'system',
    name: 'General / Overhead',
    type: 'overhead',
    address: '',
    city: '',
    state: '',
    zip: '',
    notes: '',
    purchaseDate: '',
    saleDate: '',
    inServiceDate: '',
    archivedAt: null,
  };
  setDoc(doc(db, 'properties', OVERHEAD_ID), overhead).catch(reportError);
}

function stopListening() {
  unsubscribers.forEach((u) => u());
  unsubscribers = [];
  receiptsUnsub?.();
  receiptsUnsub = null;
  receiptYears = '';
  firstLoad.clear();
  raw.properties = [];
  raw.vendors = [];
  raw.receipts = [];
  raw.yearMeta = [];
}

function startListening() {
  stopListening();
  unsubscribers = [
    listen('properties', query(collection(db, 'properties'))),
    listen('vendors', query(collection(db, 'vendors'))),
    listen('yearMeta', query(collection(db, 'yearMeta'))),
    onSnapshot(
      doc(db, 'config', 'app'),
      (snap) => {
        firstLoad.add('settings');
        state = { ...state, settings: { ...DEFAULT_SETTINGS, ...(snap.data() as Partial<AppSettings> | undefined) } };
        publish();
      },
      reportError,
    ),
    onSnapshot(
      doc(db, 'usage', monthKey()),
      (snap) => set({ usage: { id: monthKey(), costMicros: 0, scans: 0, ...(snap.data() as Partial<UsageMonth> | undefined) } }),
      reportError,
    ),
  ];
}

function toUser(user: User | null): AppState['user'] {
  return user ? { uid: user.uid, email: user.email ?? '', verified: user.emailVerified } : null;
}

/** Call after the member verifies their email, so the new status reaches the rules. */
export async function refreshUser() {
  if (!auth.currentUser) return;
  await auth.currentUser.reload();
  await auth.currentUser.getIdToken(true);
  applyUser(auth.currentUser);
}

function applyUser(user: User | null) {
  const next = toUser(user);
  set({ authReady: true, user: next, denied: false });
  if (next?.verified) {
    if (unsubscribers.length === 0) startListening();
    void flushOutbox();
  } else {
    stopListening();
    set({ loaded: false, properties: [], vendors: [], receipts: [], years: [] });
  }
}

const whenOnline: (() => void)[] = [];

/** Run something every time the connection comes back (and once at start). */
export function onOnline(fn: () => void) {
  whenOnline.push(fn);
}

export function initStore() {
  onAuthStateChanged(auth, applyUser);
  window.addEventListener('online', () => {
    set({ online: true });
    void flushOutbox();
    whenOnline.forEach((fn) => fn());
  });
  window.addEventListener('offline', () => set({ online: false }));
}

export class ConflictError extends Error {
  constructor(public theirs: Meta) {
    super('This record was changed on another device.');
  }
}

function stamp<T extends Meta>(next: T, version: number): T {
  const email = state.user?.email ?? '';
  const now = Date.now();
  return {
    ...next,
    version,
    updatedAt: now,
    updatedBy: email,
    createdAt: next.createdAt || now,
    createdBy: next.createdBy || email,
  };
}

function isOfflineError(error: unknown): boolean {
  const code = (error as FirestoreError)?.code;
  return code === 'unavailable' || code === 'deadline-exceeded' || !navigator.onLine;
}

/** Create a record. Works offline: Firestore queues it and sends it later. */
export function create<T extends Meta>(col: SyncedCollection, record: T): T {
  const stamped = stamp(record, 1);
  setDoc(doc(db, col, record.id), stamped).catch(reportError);
  return stamped;
}

async function commit(col: SyncedCollection, mine: Meta, baseVersion: number): Promise<void> {
  const ref = doc(db, col, mine.id);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const theirs = snap.data() as Meta | undefined;
    if (theirs && theirs.version !== baseVersion) throw new ConflictError(theirs);
    tx.set(ref, stamp(mine, baseVersion + 1));
  });
}

/**
 * Save a change to an existing record. `base` is the record as it was when the edit began.
 * If someone else changed it meanwhile, fields only one side touched are merged; fields both
 * touched are put to the member to choose (state.conflicts). Returns false when a choice is pending.
 */
export async function save<T extends Meta>(col: SyncedCollection, mine: T, base: T): Promise<boolean> {
  if (!navigator.onLine) {
    enqueue(col, mine, base);
    return true;
  }
  try {
    await commit(col, mine, base.version);
    return true;
  } catch (error) {
    if (error instanceof ConflictError) {
      const { merged, conflicts } = threeWayMerge(
        base as unknown as Record<string, unknown>,
        mine as unknown as Record<string, unknown>,
        error.theirs as unknown as Record<string, unknown>,
        META_KEYS,
      );
      const mergedRecord = { ...(merged as unknown as T), id: mine.id };
      if (conflicts.length === 0) return save(col, mergedRecord, error.theirs as T);
      set({ conflicts: [...state.conflicts, { col, base, mine, theirs: error.theirs, merged: mergedRecord, conflicts }] });
      return false;
    }
    if (isOfflineError(error)) {
      enqueue(col, mine, base);
      return true;
    }
    throw error;
  }
}

function enqueue(col: SyncedCollection, mine: Meta, base: Meta) {
  const existing = state.outbox.find((e) => e.col === col && e.mine.id === mine.id);
  const entry: OutboxEntry = { col, mine: stamp(mine, base.version), base: existing?.base ?? base };
  setOutbox([...state.outbox.filter((e) => e !== existing), entry]);
}

let flushing = false;

export async function flushOutbox() {
  if (flushing || !navigator.onLine || !state.user?.verified) return;
  flushing = true;
  try {
    for (const entry of [...state.outbox]) {
      try {
        await commitOrMerge(entry);
      } catch (error) {
        if (isOfflineError(error)) return;
        reportError(error);
      }
      setOutbox(state.outbox.filter((e) => e !== entry));
    }
  } finally {
    flushing = false;
  }
}

async function commitOrMerge(entry: OutboxEntry) {
  // save() would re-queue while offline; here we are online and want the real outcome.
  await save(entry.col, entry.mine, entry.base);
}

/** The member picked which side wins for each clashing field. */
export async function resolveConflict(conflict: PendingConflict, choices: Record<string, 'mine' | 'theirs'>) {
  const resolved: Record<string, unknown> = { ...(conflict.merged as unknown as Record<string, unknown>) };
  for (const c of conflict.conflicts) resolved[c.field] = choices[c.field] === 'mine' ? c.mine : c.theirs;
  set({ conflicts: state.conflicts.filter((c) => c !== conflict) });
  await save(conflict.col, resolved as unknown as Meta, conflict.theirs);
}

export function newId(): string {
  return crypto.randomUUID();
}

export function saveSettings(patch: Partial<AppSettings>) {
  const email = state.user?.email ?? '';
  setDoc(doc(db, 'config', 'app'), { ...patch, id: 'app', updatedAt: Date.now(), updatedBy: email }, { merge: true }).catch(reportError);
}
