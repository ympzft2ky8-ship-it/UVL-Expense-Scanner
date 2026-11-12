import { describe, expect, it } from 'vitest';
import { CATEGORIES, categoryFromMemory, isValidCategory, taxTreatment } from '../src/categories.ts';
import { findDuplicate, ledgerRows, lineShares, sumRows } from '../src/ledger.ts';
import { applyChoices, threeWayMerge } from '../src/merge.ts';
import { fillMissingContact, findVendorMatch, normalizeVendorName } from '../src/vendors.ts';
import { line, property, receipt } from './fixtures.ts';

describe('categories', () => {
  it('only accepts a category from the property type list', () => {
    expect(isValidCategory('rental', 'Repairs & Maintenance')).toBe(true);
    expect(isValidCategory('flip', 'Repairs & Maintenance')).toBe(false);
    expect(isValidCategory('rental', null)).toBe(false);
  });
  it('labels every category with one treatment', () => {
    expect(taxTreatment('rental', 'Capital Improvement')).toBe('Capitalize & depreciate');
    expect(taxTreatment('rental', 'Utilities')).toBe('Deduct this year');
    expect(taxTreatment('flip', 'Renovation')).toBe('Add to property cost');
    expect(taxTreatment('flip', 'Selling Costs')).toBe('Reduces sale proceeds');
    for (const c of CATEGORIES.overhead) expect(taxTreatment('overhead', c)).toBe('Deduct this year');
  });
  it('learns a vendor category after three choices', () => {
    expect(categoryFromMemory({ rental: { 'Repairs & Maintenance': 3 } }, 'rental')).toBe('Repairs & Maintenance');
    expect(categoryFromMemory({ rental: { 'Repairs & Maintenance': 2 } }, 'rental')).toBeNull();
    expect(categoryFromMemory({ rental: { 'Repairs & Maintenance': 3, 'Capital Improvement': 3 } }, 'rental')).toBeNull();
    expect(categoryFromMemory({ rental: { 'Repairs & Maintenance': 3 } }, 'flip')).toBeNull();
  });
});

describe('vendors', () => {
  it('normalizes store numbers and company suffixes away', () => {
    expect(normalizeVendorName('THE HOME DEPOT #1234')).toBe('home depot');
    expect(normalizeVendorName('ABC Plumbing, Inc.')).toBe('abc plumbing');
    expect(normalizeVendorName("Lowe's Home Centers, LLC")).toBe('lowe s home centers');
  });
  const vendors = [
    { id: 'hd', normalizedName: 'home depot', phone: '(914) 555-0100' },
    { id: 'abc', normalizedName: 'abc plumbing', phone: '' },
  ];
  it('matches on phone or on name', () => {
    expect(findVendorMatch({ name: 'HD Store', phone: '914-555-0100' }, vendors)?.id).toBe('hd');
    expect(findVendorMatch({ name: 'THE HOME DEPOT #1234' }, vendors)?.id).toBe('hd');
    expect(findVendorMatch({ name: 'ABC Plumbing Inc' }, vendors)?.id).toBe('abc');
    expect(findVendorMatch({ name: 'Other Co' }, vendors)).toBeNull();
  });
  it('fills in missing contact details without overwriting', () => {
    const { changed, vendor } = fillMissingContact({ address: '1 Main St', phone: '', email: '', website: '' }, { address: '2 Other St', phone: '555', email: '' });
    expect(changed).toBe(true);
    expect(vendor).toEqual({ address: '1 Main St', phone: '555', email: '', website: '' });
  });
});

describe('threeWayMerge', () => {
  const base = { date: '2026-01-01', notes: '', total: 100 };
  it('merges changes to different fields', () => {
    const { merged, conflicts } = threeWayMerge(base, { ...base, notes: 'mine' }, { ...base, total: 200 });
    expect(conflicts).toEqual([]);
    expect(merged).toEqual({ date: '2026-01-01', notes: 'mine', total: 200 });
  });
  it('reports a field both sides changed', () => {
    const { conflicts, merged } = threeWayMerge(base, { ...base, date: '2026-01-02' }, { ...base, date: '2026-01-03' });
    expect(conflicts).toEqual([{ field: 'date', base: '2026-01-01', mine: '2026-01-02', theirs: '2026-01-03' }]);
    expect(applyChoices(merged, conflicts, { date: 'mine' }).date).toBe('2026-01-02');
    expect(applyChoices(merged, conflicts, { date: 'theirs' }).date).toBe('2026-01-03');
  });
  it('does not report identical changes', () => {
    expect(threeWayMerge(base, { ...base, total: 5 }, { ...base, total: 5 }).conflicts).toEqual([]);
  });
});

describe('ledger', () => {
  const props = [property('oak', '12 Oak St', 'rental'), property('elm', '45 Elm Ave', 'flip')];
  it('splits a $200 line 50/50 with its tax', () => {
    const l = line({ id: 'a', amountCents: 20000, splits: [{ propertyId: 'elm', amountCents: null, percentBp: 5000 }] });
    expect(lineShares(l, 1775, 'oak')).toEqual([
      { propertyId: 'elm', amountCents: 10000, taxCents: 887 },
      { propertyId: 'oak', amountCents: 10000, taxCents: 888 },
    ]);
  });
  it('keeps the whole line with the receipt property when there are no splits', () => {
    expect(lineShares(line({ id: 'a', amountCents: 500 }), 40, 'oak')).toEqual([{ propertyId: 'oak', amountCents: 500, taxCents: 40 }]);
  });
  it('builds rows whose totals match the receipts, including a return', () => {
    const receipts = [
      receipt({ id: 'r1', taxCents: 1331, totalCents: 16331, lines: [line({ id: 'a', amountCents: 10000, category: 'Supplies' }), line({ id: 'b', amountCents: 5000, propertyId: 'elm', category: 'Renovation', kind: 'labor' })] }),
      receipt({ id: 'r2', date: '2026-04-01', taxCents: -399, totalCents: -4899, lines: [line({ id: 'c', amountCents: -4500, category: 'Supplies' })] }),
      receipt({ id: 'r3', status: 'toReview', lines: [line({ id: 'x', amountCents: 999 })] }),
      receipt({ id: 'r4', deletedAt: 5, lines: [line({ id: 'y', amountCents: 999 })] }),
    ];
    const rows = ledgerRows(receipts, props, 2026);
    expect(rows).toHaveLength(3);
    expect(sumRows(rows)).toEqual({ amountCents: 10500, taxCents: 932, totalCents: 11432 });
    const oak = rows.filter((r) => r.propertyId === 'oak');
    expect(sumRows(oak).totalCents).toBe(10000 + 887 - 4899);
    const elm = rows.find((r) => r.propertyId === 'elm')!;
    expect(elm.taxTreatment).toBe('Add to property cost');
    expect(elm.property).toBe('45 Elm Ave');
  });
  it('finds duplicates by vendor+date+total or vendor+invoice', () => {
    const saved = [receipt({ id: 's', totalCents: 5000, invoiceNo: 'INV-7' })];
    expect(findDuplicate(receipt({ id: 'n', vendorName: 'THE HOME DEPOT #22', totalCents: 5000 }), saved, normalizeVendorName)?.id).toBe('s');
    expect(findDuplicate(receipt({ id: 'n', date: '2026-05-05', totalCents: 1, invoiceNo: 'inv-7' }), saved, normalizeVendorName)?.id).toBe('s');
    expect(findDuplicate(receipt({ id: 'n', totalCents: 4999 }), saved, normalizeVendorName)).toBeNull();
    expect(findDuplicate(receipt({ id: 'n', vendorName: 'Lowes', totalCents: 5000 }), saved, normalizeVendorName)).toBeNull();
  });
});
