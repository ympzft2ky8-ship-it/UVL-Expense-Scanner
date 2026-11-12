import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { groupBy, ledgerRows, sumRows } from '@uvl/shared';
import { line, property, receipt } from '../../../../packages/shared/test/fixtures.ts';
import { exportFileName } from './names.ts';
import { EXPENSE_HEADERS, workbookBytes } from './workbook.ts';

const properties = [property('oak', '12 Oak St', 'rental'), property('elm', '45 Elm Ave', 'flip'), property('overhead', 'General / Overhead', 'overhead')];

// A year with a split line, an untaxed labor line, a return and a flagged receipt.
const receipts = [
  receipt({ id: 'aaaaaaaa-1', date: '2026-01-15', vendorName: 'Home Depot', vendorPhone: '914-555-0100', taxCents: 1775, totalCents: 21775, lines: [line({ id: 'a', description: 'Tile', amountCents: 20000, category: 'Supplies', splits: [{ propertyId: 'elm', amountCents: null, percentBp: 5000 }] })] }),
  receipt({ id: 'bbbbbbbb-2', date: '2026-02-03', vendorName: 'ABC Plumbing', propertyId: 'elm', taxCents: 3550, totalCents: 103550, lines: [line({ id: 'm', description: 'Vanity 36in', amountCents: 40000, taxed: true, category: 'Renovation' }), line({ id: 'l', description: 'Install vanity', amountCents: 60000, taxed: false, kind: 'labor', category: 'Renovation' })] }),
  receipt({ id: 'cccccccc-3', date: '2026-02-20', vendorName: 'Home Depot', taxCents: -399, totalCents: -4899, needsAttention: true, lines: [line({ id: 'r', description: 'Return: faucet', amountCents: -4500, category: 'Repairs & Maintenance' })] }),
  receipt({ id: 'dddddddd-4', date: '2026-12-31', vendorName: 'Staples', propertyId: 'overhead', taxCents: 89, totalCents: 1088, paymentMethod: 'card', paymentRef: '4821', lines: [line({ id: 'o', description: 'Paper', qty: 1, unitPriceCents: 999, amountCents: 999, category: 'Office & Supplies' })] }),
];
const rows = ledgerRows(receipts, properties, 2026);

async function load() {
  const bytes = await workbookBytes({ year: 2026, rows, properties, receiptCount: 4, needsAttentionCount: 1, exportedAt: new Date(2026, 8, 26, 10, 0) });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes.buffer as ArrayBuffer);
  return wb;
}

const result = (cell: ExcelJS.Cell): number => {
  const v = cell.value as ExcelJS.CellFormulaValue | number;
  // ExcelJS reads a cached 0 back as undefined; the raw-XML test below proves it is written.
  return typeof v === 'number' ? v : ((v.result as number | undefined) ?? 0);
};
const cents = (cell: ExcelJS.Cell) => Math.round(result(cell) * 100);

function findRow(sheet: ExcelJS.Worksheet, a: string, b?: string): ExcelJS.Row {
  for (let n = 1; n <= sheet.rowCount; n++) {
    const row = sheet.getRow(n);
    if (row.getCell(1).value === a && (b === undefined || row.getCell(2).value === b)) return row;
  }
  throw new Error(`row ${a} ${b ?? ''} not found`);
}

describe('spreadsheet export', () => {
  it('names the file by year and date', () => {
    expect(exportFileName(2026, new Date(2026, 8, 26))).toBe('UVL-Expenses-2026-2026-09-26.xlsx');
  });

  it('has the six sheets with the Expenses headers in the documented order', async () => {
    const wb = await load();
    expect(wb.worksheets.map((s) => s.name)).toEqual(['Expenses', 'By Property', 'By Category', 'By Vendor', 'By Month', 'About']);
    const headers = (wb.getWorksheet('Expenses')!.getRow(1).values as unknown[]).slice(1);
    expect(headers).toEqual([...EXPENSE_HEADERS]);
  });

  it('writes real dates and numbers, sorted by date', async () => {
    const sheet = (await load()).getWorksheet('Expenses')!;
    expect(sheet.rowCount).toBe(rows.length + 1);
    const first = sheet.getRow(2);
    expect(first.getCell(1).value).toBeInstanceOf(Date);
    expect((first.getCell(1).value as Date).toISOString().slice(0, 10)).toBe('2026-01-15');
    expect(typeof first.getCell(15).value).toBe('number');
    expect(sheet.getColumn(15).numFmt).toBe('"$"#,##0.00');
    const dates = sheet.getRows(2, rows.length)!.map((r) => (r.getCell(1).value as Date).getTime());
    expect([...dates].sort((a, b) => a - b)).toEqual(dates);
    const flagged = sheet.getRows(2, rows.length)!.filter((r) => r.getCell(22).value === 'Yes');
    expect(flagged).toHaveLength(1);
    const staples = sheet.getRows(2, rows.length)!.find((r) => r.getCell(2).value === 'Staples')!;
    expect(staples.getCell(20).value).toBe('Card ending 4821');
    expect(staples.getCell(21).value).toBe('DDDDDDDD');
  });

  it('every summary total equals the ledger to the cent', async () => {
    const wb = await load();
    const byProperty = wb.getWorksheet('By Property')!;
    for (const [name, group] of groupBy(rows, (r) => r.property)) {
      const total = findRow(byProperty, name, 'Total');
      expect(cents(total.getCell(7))).toBe(sumRows(group).totalCents);
      expect(cents(total.getCell(6))).toBe(sumRows(group).taxCents);
      expect(cents(total.getCell(3))).toBe(sumRows(group.filter((r) => r.kind === 'labor')).amountCents);
    }
    const grand = findRow(byProperty, 'All properties');
    expect(cents(grand.getCell(7))).toBe(sumRows(rows).totalCents);
    // Flip: renovation labor $600 untaxed, materials $400 with all the tax.
    const reno = findRow(byProperty, '45 Elm Ave', 'Renovation');
    expect([cents(reno.getCell(3)), cents(reno.getCell(4)), cents(reno.getCell(6))]).toEqual([60000, 40000, 3550]);

    const byCategory = wb.getWorksheet('By Category')!;
    expect(cents(findRow(byCategory, 'Total').getCell(5))).toBe(sumRows(rows).totalCents);
    expect(cents(findRow(byCategory, 'Add to property cost', 'Renovation').getCell(5))).toBe(103550);

    const byVendor = wb.getWorksheet('By Vendor')!;
    const hd = findRow(byVendor, 'Home Depot');
    expect(cents(hd.getCell(6))).toBe(21775 - 4899);
    expect(hd.getCell(5).value).toBe(2);
    expect(hd.getCell(2).value).toBe('914-555-0100');

    const byMonth = wb.getWorksheet('By Month')!;
    const last = byMonth.getRow(1).cellCount;
    expect(cents(findRow(byMonth, 'February').getCell(last))).toBe(103550 - 4899);
    expect(cents(findRow(byMonth, 'December').getCell(last))).toBe(1088);
    expect(cents(findRow(byMonth, 'Total').getCell(last))).toBe(sumRows(rows).totalCents);
  });

  it('writes a cached value next to every formula in the file itself', async () => {
    const bytes = await workbookBytes({ year: 2026, rows, properties, receiptCount: 4, needsAttentionCount: 1, exportedAt: new Date(2026, 8, 26) });
    const zip = await JSZip.loadAsync(bytes);
    let cells = 0;
    for (const name of Object.keys(zip.files).filter((n) => /worksheets\/sheet\d+\.xml$/.test(n))) {
      const xml = await zip.file(name)!.async('string');
      for (const cell of xml.match(/<c [^>]*>(?:(?!<\/c>).)*<f>.*?<\/c>/g) ?? []) {
        cells++;
        expect(cell).toMatch(/<v>-?[\d.]+(E-?\d+)?<\/v>/);
      }
    }
    expect(cells).toBeGreaterThan(20);
  });

  it('uses only SUM and SUMIFS formulas', async () => {
    const wb = await load();
    let formulas = 0;
    wb.eachSheet((sheet) =>
      sheet.eachRow((row) =>
        row.eachCell((cell) => {
          const v = cell.value as ExcelJS.CellFormulaValue;
          if (v && typeof v === 'object' && 'formula' in v) {
            formulas++;
            expect(v.formula).toMatch(/^(SUM\(|SUMIFS\(|O\d+\+P\d+$)/);
          }
        }),
      ),
    );
    expect(formulas).toBeGreaterThan(20);
  });

  it('carries the not-tax-advice note and the needs-attention count', async () => {
    const about = (await load()).getWorksheet('About')!;
    expect(about.getCell('B2').value).toBe(2026);
    expect(about.getCell('B6').value).toBe(1);
    expect(String(about.getCell('B7').value)).toContain('not tax advice');
  });
});
