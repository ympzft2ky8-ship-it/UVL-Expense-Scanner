import { describe, expect, it } from 'vitest';
import { joinChunks, splitChunks } from '../blobs.ts';
import { measureQuality, qualityWarnings, segmentPlan } from './image.ts';

function image(width: number, height: number, pixel: (x: number, y: number) => number): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) out[y * width + x] = pixel(x, y);
  return out;
}

describe('photo quality', () => {
  it('accepts sharp dark-on-light text', () => {
    const q = measureQuality(image(64, 64, (x, y) => ((x >> 1) + (y >> 1)) % 2 ? 235 : 25), 64, 64);
    expect(qualityWarnings(q)).toEqual([]);
  });
  it('flags a blurry photo', () => {
    const q = measureQuality(image(64, 64, (x) => 120 + x / 4), 64, 64);
    expect(qualityWarnings(q)).toContain('This photo looks blurry.');
  });
  it('flags a dark photo', () => {
    const q = measureQuality(image(64, 64, (x, y) => ((x + y) % 2 ? 40 : 5)), 64, 64);
    expect(qualityWarnings(q)).toContain('This photo looks too dark.');
  });
  it('flags glare on a washed-out photo', () => {
    const q = measureQuality(image(64, 64, (x) => (x < 40 ? 255 : 200)), 64, 64);
    expect(qualityWarnings(q)).toContain('There may be glare on this photo.');
  });
});

describe('long receipts', () => {
  it('leaves a normal page whole', () => {
    expect(segmentPlan(1000, 2500)).toEqual([{ top: 0, height: 2500 }]);
  });
  it('cuts a very tall receipt into overlapping pieces that cover all of it', () => {
    const plan = segmentPlan(600, 2200);
    expect(plan.length).toBeGreaterThan(1);
    expect(plan[0]!.top).toBe(0);
    const last = plan.at(-1)!;
    expect(last.top + last.height).toBe(2200);
    for (let i = 1; i < plan.length; i++) expect(plan[i]!.top).toBeLessThan(plan[i - 1]!.top + plan[i - 1]!.height);
  });
});

describe('image storage pieces', () => {
  it('splits under the document size limit and joins back exactly', () => {
    const bytes = new Uint8Array(1_800_000).map((_, i) => i % 251);
    const chunks = splitChunks(bytes);
    expect(chunks).toHaveLength(3);
    expect(Math.max(...chunks.map((c) => c.length))).toBeLessThanOrEqual(700 * 1024);
    expect(joinChunks(chunks)).toEqual(bytes);
  });
});
