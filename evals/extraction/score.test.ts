import { describe, expect, it } from 'vitest';
import { draftFromModel, runChecks } from '@uvl/shared';
import { report, scoreSample, summarize, type Expected } from './score.ts';

const line = (description: string, amount: string) => ({ description, sku: null, quantity: null, unit_price: null, amount, taxed: null, kind: 'materials' as const, category_rental: 'Supplies', category_flip: 'Renovation', category_overhead: 'Office & Supplies', repair_vs_improvement_unclear: false, low_confidence: false });

const key: Expected = {
  is_receipt: true, not_receipt_reason: null, vendor_name: 'The Home Depot', vendor_address: null, state: 'NY', vendor_phone: null, vendor_email: null, vendor_website: null,
  invoice_number: null, date: '2026-03-03', subtotal: '124.10', tax_total: '11.01', tax_rate_percent: null, total: '135.11', payment_method: null, payment_reference: null,
  lines: [line('Lumber', '100.00'), line('Screws', '24.10')], charges: [], low_confidence_fields: [], verified_by: 'owner',
};

let n = 0;
function score(reading: Expected) {
  const draft = draftFromModel(reading, () => `l${++n}`);
  const flags = { ...draft.flags, ...runChecks(draft, { today: '2026-12-31', openYears: [2026] }) };
  return scoreSample('s1', ['thermal-faded'], key, draft, flags, 30000);
}

describe('eval scoring', () => {
  it('passes the gate on a perfect reading, ignoring vendor store numbers', () => {
    const s = summarize([score({ ...key, vendor_name: 'THE HOME DEPOT #1234' })]);
    expect(s.gate.passed).toBe(true);
    expect(s.headline).toEqual({ total: 1, date: 1, vendor: 1 });
    expect(s.lineAccuracy).toBe(1);
  });
  it('a misread line that the checks catch is wrong but flagged', () => {
    const sc = score({ ...key, lines: [line('Lumber', '100.00'), line('Screws', '42.10')] });
    const s = summarize([sc]);
    expect(sc.linesCorrect).toBe(1);
    expect(s.unflaggedErrors).toEqual([]);
    expect(s.gate.passed).toBe(false);
    expect(report('t', 'm', [sc])).toContain('| s1 | line amount: Screws | 2410 | (no line with this amount) | yes |');
  });
  it('a wrong date that nothing flags fails the gate as an unflagged error', () => {
    const s = summarize([score({ ...key, date: '2026-03-08' })]);
    expect(s.unflaggedErrors.map((e) => e.field)).toEqual(['s1 · date']);
    expect(s.gate.passed).toBe(false);
  });
});
