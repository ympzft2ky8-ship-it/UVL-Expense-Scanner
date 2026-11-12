import JSZip from 'jszip';
import { ledgerRows, type Property, type Receipt, type Vendor } from '@uvl/shared';
import { loadPages } from '../blobs.ts';
import { shortId, workbookBytes } from './workbook.ts';

export interface YearData {
  year: number;
  receipts: Receipt[];
  properties: Property[];
  vendors: Vendor[];
}

export function yearReceipts(receipts: Receipt[], year: number): Receipt[] {
  return receipts.filter((r) => r.ledgerYear === year && r.status === 'saved' && !r.deletedAt);
}

export async function exportWorkbook(data: YearData, exportedAt = new Date()): Promise<Uint8Array> {
  const saved = yearReceipts(data.receipts, data.year);
  return workbookBytes({
    year: data.year,
    rows: ledgerRows(data.receipts, data.properties, data.year),
    properties: data.properties,
    receiptCount: saved.length,
    needsAttentionCount: saved.filter((r) => r.needsAttention).length,
    exportedAt,
  });
}

function safe(text: string): string {
  return text.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'unknown';
}

/** "2026-03-03_Home-Depot_1A2B3C4D_p1.jpg": matches the Receipt ID column of the spreadsheet. */
export function imageFileName(r: Pick<Receipt, 'id' | 'date' | 'vendorName'>, page: number, mime: string): string {
  const ext = mime === 'application/pdf' ? 'pdf' : 'jpg';
  return `${r.date || 'undated'}_${safe(r.vendorName)}_${shortId(r.id)}_p${page + 1}.${ext}`;
}

/**
 * The year-end archive: the spreadsheet, every receipt image, and a data file from which
 * the year could be rebuilt. Images are stored uncompressed (JPEGs do not shrink).
 */
export async function buildArchive(data: YearData, onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const zip = new JSZip();
  const saved = yearReceipts(data.receipts, data.year);
  zip.file(`UVL-Expenses-${data.year}.xlsx`, await exportWorkbook(data));
  zip.file(
    'data.json',
    JSON.stringify({ format: 'uvl-expenses-archive-v1', year: data.year, receipts: saved, properties: data.properties, vendors: data.vendors }, null, 2),
  );
  const images = zip.folder('receipts')!;
  let done = 0;
  for (const r of saved) {
    if (r.pageCount > 0) {
      const pages = await loadPages(r.id);
      pages.forEach((p, i) => images.file(imageFileName(r, i, p.mime), p.bytes, { compression: 'STORE' }));
    }
    onProgress?.(++done, saved.length);
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export function archiveFileName(year: number): string {
  return `UVL-Expenses-${year}-Archive.zip`;
}

/** Hand a file to the phone's share sheet (Save to Files, Mail, AirDrop); download elsewhere. */
export async function shareOrDownload(bytes: Blob | Uint8Array, name: string, type: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes as BlobPart], { type });
  const file = new File([blob], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    } catch (error) {
      if ((error as DOMException).name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'downloaded';
}
