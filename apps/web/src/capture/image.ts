/** Preparing photos on the phone before they are stored and read (design D5). */

export interface PreparedPage {
  mime: 'image/jpeg' | 'application/pdf';
  bytes: Uint8Array;
  /** Plain-language problems with the photo; empty when it looks fine. */
  warnings: string[];
}

export const MAX_LONG_EDGE = 2200;
export const MAX_PDF_BYTES = 8 * 1024 * 1024;
const JPEG_QUALITY = 0.82;

export class UnsupportedFileError extends Error {}

export interface Quality {
  /** Variance of the Laplacian: low means blurry. */
  sharpness: number;
  brightness: number;
  /** Share of pixels blown out to white. */
  glare: number;
}

/** Measure blur, darkness and glare on a grayscale image. */
export function measureQuality(gray: Uint8Array | Uint8ClampedArray, width: number, height: number): Quality {
  let sum = 0;
  let blown = 0;
  for (let i = 0; i < gray.length; i++) {
    const v = gray[i]!;
    sum += v;
    if (v >= 250) blown++;
  }
  let lapSum = 0;
  let lapSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = gray[i - width]! + gray[i + width]! + gray[i - 1]! + gray[i + 1]! - 4 * gray[i]!;
      lapSum += lap;
      lapSq += lap * lap;
      n++;
    }
  }
  const mean = n ? lapSum / n : 0;
  return {
    sharpness: n ? lapSq / n - mean * mean : 0,
    brightness: gray.length ? sum / gray.length : 0,
    glare: gray.length ? blown / gray.length : 0,
  };
}

export function qualityWarnings(q: Quality): string[] {
  const warnings: string[] = [];
  if (q.sharpness < 60) warnings.push('This photo looks blurry.');
  if (q.brightness < 60) warnings.push('This photo looks too dark.');
  if (q.glare > 0.35 && q.sharpness < 200) warnings.push('There may be glare on this photo.');
  return warnings;
}

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!blob) throw new Error('Could not save the photo.');
  return new Uint8Array(await blob.arrayBuffer());
}

async function decode(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new UnsupportedFileError('This photo could not be opened. Try taking it again.');
  }
}

/** Shrink a photo to a size that keeps small print readable, and check its quality. */
export async function prepareFile(file: File): Promise<PreparedPage> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (isPdf) {
    if (file.size > MAX_PDF_BYTES) throw new UnsupportedFileError('This PDF is larger than 8 MB. Try scanning fewer pages.');
    return { mime: 'application/pdf', bytes: new Uint8Array(await file.arrayBuffer()), warnings: [] };
  }
  if (!file.type.startsWith('image/') && !/\.(jpe?g|png|heic|heif|webp)$/i.test(file.name)) {
    throw new UnsupportedFileError('Only photos and PDF files can be added.');
  }
  const bitmap = await decode(file);
  const scale = Math.min(1, MAX_LONG_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = canvasOf(width, height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, width, height);

  // Quality is measured on a small grayscale copy: fast, and resolution-independent enough.
  const qScale = Math.min(1, 640 / Math.max(width, height));
  const qw = Math.max(3, Math.round(width * qScale));
  const qh = Math.max(3, Math.round(height * qScale));
  const small = canvasOf(qw, qh);
  const sctx = small.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(bitmap, 0, 0, qw, qh);
  bitmap.close();
  const rgba = sctx.getImageData(0, 0, qw, qh).data;
  const gray = new Uint8Array(qw * qh);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = (rgba[i * 4]! * 299 + rgba[i * 4 + 1]! * 587 + rgba[i * 4 + 2]! * 114) / 1000;
  }
  const warnings = qualityWarnings(measureQuality(gray, qw, qh));
  if (Math.min(width, height) < 500) warnings.push('This photo is small. Move closer so the text is easy to read.');
  return { mime: 'image/jpeg', bytes: await canvasToJpeg(canvas), warnings };
}

/** Where to cut a very tall receipt so each piece keeps its text readable; pieces overlap. */
export function segmentPlan(width: number, height: number): { top: number; height: number }[] {
  if (height <= width * 3) return [{ top: 0, height }];
  const segment = Math.round(width * 2);
  const step = Math.round(segment * 0.88);
  const plan: { top: number; height: number }[] = [];
  for (let top = 0; top < height; top += step) {
    const h = Math.min(segment, height - top);
    plan.push({ top, height: h });
    if (top + h >= height) break;
  }
  return plan;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

/** A stored page as the pieces sent to the reader: one piece, or several for a tall receipt. */
export async function pageToParts(page: { mime: string; bytes: Uint8Array }): Promise<{ mediaType: 'image/jpeg' | 'application/pdf'; base64: string }[]> {
  if (page.mime === 'application/pdf') return [{ mediaType: 'application/pdf', base64: toBase64(page.bytes) }];
  const bitmap = await decode(new Blob([page.bytes as BlobPart], { type: 'image/jpeg' }));
  const plan = segmentPlan(bitmap.width, bitmap.height);
  if (plan.length === 1) {
    bitmap.close();
    return [{ mediaType: 'image/jpeg', base64: toBase64(page.bytes) }];
  }
  const parts: { mediaType: 'image/jpeg'; base64: string }[] = [];
  for (const seg of plan) {
    const canvas = canvasOf(bitmap.width, seg.height);
    canvas.getContext('2d')!.drawImage(bitmap, 0, seg.top, bitmap.width, seg.height, 0, 0, bitmap.width, seg.height);
    parts.push({ mediaType: 'image/jpeg', base64: toBase64(await canvasToJpeg(canvas)) });
  }
  bitmap.close();
  return parts;
}
