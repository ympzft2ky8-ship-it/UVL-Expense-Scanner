import { Bytes, collection, doc, getDocs, query, setDoc, where, writeBatch } from 'firebase/firestore';
import { db } from './firebase.ts';
import { reportError } from './store.ts';

/**
 * Receipt images and PDFs live in Firestore itself, cut into pieces under the 1 MiB
 * document limit, so the app needs no separate file storage service.
 */
export const CHUNK_BYTES = 700 * 1024;

export interface StoredPage {
  mime: string;
  bytes: Uint8Array;
}

interface BlobDoc {
  receiptId: string;
  ledgerYear: number;
  page: number;
  chunk: number;
  chunks: number;
  mime: string;
  data: Bytes;
}

export function splitChunks(bytes: Uint8Array, size = CHUNK_BYTES): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) out.push(bytes.subarray(i, i + size));
  return out.length ? out : [new Uint8Array()];
}

export function joinChunks(chunks: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

const cache = new Map<string, StoredPage[]>();

/** Save pages. Works offline: each piece is queued and sent when the phone is back online. */
export function savePages(receiptId: string, ledgerYear: number, pages: StoredPage[], firstPage = 0) {
  pages.forEach((page, p) => {
    const chunks = splitChunks(page.bytes);
    chunks.forEach((chunk, c) => {
      const data: BlobDoc = {
        receiptId,
        ledgerYear,
        page: firstPage + p,
        chunk: c,
        chunks: chunks.length,
        mime: page.mime,
        data: Bytes.fromUint8Array(chunk),
      };
      setDoc(doc(db, 'blobs', `${receiptId}_${firstPage + p}_${c}`), data).catch(reportError);
    });
  });
  cache.set(receiptId, [...(firstPage > 0 ? (cache.get(receiptId) ?? []) : []), ...pages]);
}

export async function loadPages(receiptId: string): Promise<StoredPage[]> {
  const cached = cache.get(receiptId);
  if (cached) return cached;
  const snap = await getDocs(query(collection(db, 'blobs'), where('receiptId', '==', receiptId)));
  const docs = snap.docs.map((d) => d.data() as BlobDoc).sort((a, b) => a.page - b.page || a.chunk - b.chunk);
  const pages: StoredPage[] = [];
  for (const d of docs) {
    if (d.chunk === 0) pages[d.page] = { mime: d.mime, bytes: d.data.toUint8Array() };
    else if (pages[d.page]) pages[d.page] = { mime: d.mime, bytes: joinChunks([pages[d.page]!.bytes, d.data.toUint8Array()]) };
  }
  const result = pages.filter(Boolean);
  if (result.length > 0) cache.set(receiptId, result);
  return result;
}

export async function deletePages(field: 'receiptId' | 'ledgerYear', value: string | number) {
  const snap = await getDocs(query(collection(db, 'blobs'), where(field, '==', value)));
  for (let i = 0; i < snap.docs.length; i += 200) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + 200).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  if (field === 'receiptId') cache.delete(value as string);
}
