import { describe, expect, it } from 'vitest';
import { allocate, allocateTax, centsToInput, effectiveRate, formatCents, formatRate, parseCents } from '../src/money.ts';

describe('parseCents', () => {
  it('reads plain and formatted amounts', () => {
    expect(parseCents('19.89')).toBe(1989);
    expect(parseCents('$1,234.5')).toBe(123450);
    expect(parseCents('7')).toBe(700);
    expect(parseCents('.5')).toBe(50);
  });
  it('reads negatives in every common form', () => {
    expect(parseCents('-45.00')).toBe(-4500);
    expect(parseCents('(45.00)')).toBe(-4500);
    expect(parseCents('45.00-')).toBe(-4500);
  });
  it('rounds a third decimal', () => {
    expect(parseCents('1.005')).toBe(101);
    expect(parseCents('1.004')).toBe(100);
  });
  it('rejects what is not a number', () => {
    expect(parseCents('')).toBeNull();
    expect(parseCents('abc')).toBeNull();
    expect(parseCents(null)).toBeNull();
    expect(parseCents('1.2.3')).toBeNull();
  });
});

describe('formatting', () => {
  it('formats dollars', () => {
    expect(formatCents(1845217)).toBe('$18,452.17');
    expect(formatCents(-4899)).toBe('-$48.99');
    expect(formatCents(5)).toBe('$0.05');
    expect(centsToInput(-4899)).toBe('-48.99');
  });
  it('formats rates', () => {
    expect(formatRate(88750)).toBe('8.875%');
    expect(formatRate(80000)).toBe('8%');
  });
});

describe('totals', () => {
  it('adds many small amounts exactly', () => {
    let total = 0;
    for (let i = 0; i < 1000; i++) total += parseCents('0.10')!;
    expect(total).toBe(10000);
  });
});

describe('allocateTax (expense-ledger spec)', () => {
  it('splits $13.31 across $100 and $50 as $8.87 and $4.44', () => {
    expect(allocateTax([{ amountCents: 10000, taxed: null }, { amountCents: 5000, taxed: null }], 1331)).toEqual([887, 444]);
  });
  it('gives untaxed labor nothing', () => {
    expect(allocateTax([{ amountCents: 40000, taxed: true }, { amountCents: 60000, taxed: false }], 3550)).toEqual([3550, 0]);
  });
  it('always adds up to the receipt tax, leftover cent to the largest line', () => {
    const shares = allocateTax([{ amountCents: 333, taxed: null }, { amountCents: 333, taxed: null }, { amountCents: 334, taxed: null }], 100);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
    expect(shares).toEqual([33, 33, 34]);
  });
  it('handles a return: negative tax follows negative lines', () => {
    expect(allocateTax([{ amountCents: -4500, taxed: null }], -399)).toEqual([-399]);
  });
  it('gives a discount line a negative share', () => {
    const shares = allocateTax([{ amountCents: 10000, taxed: null }, { amountCents: -1000, taxed: null }], 720);
    expect(shares).toEqual([800, -80]);
  });
  it('falls back to all lines when every line is marked untaxed but tax was charged', () => {
    expect(allocateTax([{ amountCents: 100, taxed: false }, { amountCents: 300, taxed: false }], 40)).toEqual([10, 30]);
  });
  it('copes with zero-amount lines', () => {
    expect(allocateTax([{ amountCents: 0, taxed: null }], 50)).toEqual([50]);
    expect(allocateTax([], 50)).toEqual([]);
  });
});

describe('allocate', () => {
  it('splits 50/50', () => {
    expect(allocate(20000, [1, 1])).toEqual([10000, 10000]);
  });
});

describe('effectiveRate', () => {
  it('computes NYC rate', () => {
    expect(effectiveRate(8875, 100000)).toBe(88750);
    expect(effectiveRate(100, 0)).toBeNull();
  });
});
