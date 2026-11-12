import { describe, expect, it } from 'vitest';
import { arithmeticChecks, missingRequired, plausibilityChecks, runChecks } from '../src/checks.ts';
import { line } from './fixtures.ts';

const ctx = { today: '2026-03-15', openYears: [2026, 2025] };
const base = { date: '2026-03-03', subtotalCents: null as number | null, taxCents: 0, totalCents: null as number | null };

describe('arithmetic checks', () => {
  it('passes a receipt that adds up', () => {
    const r = { ...base, subtotalCents: 15000, taxCents: 1331, totalCents: 16331, lines: [line({ id: 'a', amountCents: 10000 }), line({ id: 'b', amountCents: 5000 })] };
    expect(arithmeticChecks(r)).toEqual({});
  });
  it('(a) flags quantity x unit price', () => {
    const r = { ...base, lines: [line({ id: 'a', qty: 3, unitPriceCents: 500, amountCents: 1400 })] };
    expect(Object.keys(arithmeticChecks(r))).toEqual(['lines.a.amount']);
  });
  it('(b) flags subtotal and every line when lines do not add up', () => {
    const r = { ...base, subtotalCents: 12410, lines: [line({ id: 'a', amountCents: 10000 }), line({ id: 'b', amountCents: 4210 })] };
    const flags = arithmeticChecks(r);
    expect(flags.subtotal).toBe('Line items add up to $142.10 but the subtotal says $124.10');
    expect(flags['lines.a.amount']).toBeDefined();
    expect(flags['lines.b.amount']).toBeDefined();
  });
  it('(b) accepts a subtotal printed before or after a receipt-level discount', () => {
    const lines = [line({ id: 'a', amountCents: 10000 }), line({ id: 'd', amountCents: -1000, isCharge: true })];
    expect(arithmeticChecks({ ...base, subtotalCents: 10000, lines })).toEqual({});
    expect(arithmeticChecks({ ...base, subtotalCents: 9000, lines })).toEqual({});
  });
  it('(c) flags total and tax, but not lines the subtotal vouches for', () => {
    const r = { ...base, subtotalCents: 10000, taxCents: 800, totalCents: 18000, lines: [line({ id: 'a', amountCents: 10000 })] };
    const flags = arithmeticChecks(r);
    expect(Object.keys(flags).sort()).toEqual(['tax', 'total']);
  });
  it('(c) includes delivery charges', () => {
    const r = { ...base, subtotalCents: 10000, taxCents: 0, totalCents: 17500, lines: [line({ id: 'a', amountCents: 10000 }), line({ id: 'c', amountCents: 7500, isCharge: true })] };
    expect(arithmeticChecks(r)).toEqual({});
  });
  it('allows a one-cent rounding difference', () => {
    const r = { ...base, taxCents: 887, totalCents: 10888, lines: [line({ id: 'a', amountCents: 10000 })] };
    expect(arithmeticChecks(r)).toEqual({});
  });
});

describe('plausibility checks', () => {
  const lines = [line({ id: 'a', amountCents: 10000 })];
  it('flags a future date', () => {
    expect(plausibilityChecks({ ...base, date: '2026-04-01', lines }, ctx).date).toMatch(/future/);
  });
  it('flags a receipt from last year while that year is open', () => {
    expect(plausibilityChecks({ ...base, date: '2025-12-28', lines }, ctx).date).toBe('This receipt is from last year');
  });
  it('flags a year that is not open', () => {
    expect(plausibilityChecks({ ...base, date: '2024-06-01', lines }, ctx).date).toMatch(/not an open year/);
  });
  it('flags a missing date', () => {
    expect(plausibilityChecks({ ...base, date: '', lines }, ctx).date).toBeDefined();
  });
  it('(e) flags a tax rate above 10%', () => {
    expect(plausibilityChecks({ ...base, taxCents: 1500, lines }, ctx).tax).toBeDefined();
    expect(plausibilityChecks({ ...base, taxCents: 888, lines }, ctx).tax).toBeUndefined();
  });
  it('(e) measures the rate against taxed lines only', () => {
    const mixed = [line({ id: 'm', amountCents: 40000, taxed: true }), line({ id: 'l', amountCents: 60000, taxed: false })];
    expect(plausibilityChecks({ ...base, taxCents: 3550, lines: mixed }, ctx).tax).toBeUndefined();
  });
  it('runChecks merges both kinds', () => {
    const flags = runChecks({ ...base, date: '2026-04-01', totalCents: 5, lines }, ctx);
    expect(flags.date).toBeDefined();
    expect(flags.total).toBeDefined();
  });
});

describe('missingRequired', () => {
  it('lists what blocks saving', () => {
    expect(missingRequired({ date: '', totalCents: null, propertyId: null, taxState: 'NY', taxStateConfirmed: false })).toEqual(['date', 'total', 'property', 'taxState']);
    expect(missingRequired({ date: '2026-01-02', totalCents: 100, propertyId: 'p', taxState: 'NY', taxStateConfirmed: true })).toEqual([]);
  });
});
