import ExcelJS from 'exceljs';
import { shortId } from './names.ts';
import { CATEGORIES, groupBy, NOT_TAX_ADVICE, PROPERTY_TYPE_LABEL, sumRows, taxTreatment, type LedgerRow, type Property, type PropertyType } from '@uvl/shared';

/** Column order of the Expenses sheet. Keep stable: the accountant may build on it. */
export const EXPENSE_HEADERS = [
  'Date',
  'Vendor',
  'Vendor Address',
  'Vendor Phone',
  'Vendor Email',
  'Invoice #',
  'Property',
  'Property Type',
  'Category',
  'Tax Treatment',
  'Labor/Materials',
  'Description',
  'Quantity',
  'Unit Price',
  'Amount',
  'Tax',
  'Total incl. Tax',
  'Tax State',
  'Tax Rate',
  'Payment Method',
  'Receipt ID',
  'Needs Attention',
  'Notes',
] as const;

const WIDTHS = [12, 24, 30, 16, 24, 14, 22, 14, 28, 24, 16, 36, 10, 12, 14, 12, 16, 10, 10, 18, 14, 16, 30];
const MONEY = '"$"#,##0.00';
const KIND_LABEL = { labor: 'Labor', materials: 'Materials', other: 'Other' } as const;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Columns of the Expenses sheet that the summaries add up.
const E = { date: 'A', vendor: 'B', property: 'G', category: 'I', treatment: 'J', kind: 'K', amount: 'O', tax: 'P', total: 'Q' };
const ref = (col: string) => `Expenses!$${col}:$${col}`;
const dollars = (cents: number) => cents / 100;
const quote = (text: string) => `"${text.replace(/"/g, '""')}"`;

/** A formula cell that also carries its value, for viewers that do not recalculate (iOS Quick Look). */
function formula(text: string, cents: number): ExcelJS.CellFormulaValue {
  return { formula: text, result: dollars(cents) };
}

function header(sheet: ExcelJS.Worksheet, titles: string[], widths: number[]) {
  sheet.addRow(titles).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  widths.forEach((w, i) => (sheet.getColumn(i + 1).width = w));
}

function moneyColumns(sheet: ExcelJS.Worksheet, columns: number[]) {
  columns.forEach((c) => (sheet.getColumn(c).numFmt = MONEY));
}

function dateCell(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}


export interface WorkbookInput {
  year: number;
  rows: LedgerRow[];
  properties: Property[];
  receiptCount: number;
  needsAttentionCount: number;
  exportedAt: Date;
}


export function buildWorkbook(input: WorkbookInput): ExcelJS.Workbook {
  const { rows, year } = input;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'UVL Expenses';
  wb.created = input.exportedAt;

  // 1. Expenses: one row per line item, or per property share of a split line.
  const expenses = wb.addWorksheet('Expenses');
  header(expenses, [...EXPENSE_HEADERS], WIDTHS);
  for (const r of rows) {
    expenses.addRow([
      dateCell(r.date),
      r.vendor,
      r.vendorAddress,
      r.vendorPhone,
      r.vendorEmail,
      r.invoiceNo,
      r.property,
      r.propertyType ? PROPERTY_TYPE_LABEL[r.propertyType] : '',
      r.category,
      r.taxTreatment,
      KIND_LABEL[r.kind],
      r.description,
      r.qty,
      r.unitPriceCents === null ? null : dollars(r.unitPriceCents),
      dollars(r.amountCents),
      dollars(r.taxCents),
      formula(`O${expenses.rowCount + 1}+P${expenses.rowCount + 1}`, r.totalCents),
      r.taxState,
      r.taxRate === null ? null : r.taxRate / 1_000_000,
      r.paymentMethod,
      shortId(r.receiptId),
      r.needsAttention ? 'Yes' : '',
      r.notes,
    ]);
  }
  expenses.getColumn(1).numFmt = 'yyyy-mm-dd';
  moneyColumns(expenses, [14, 15, 16, 17]);
  expenses.getColumn(19).numFmt = '0.000%';

  // 2. By Property: categories down, Labor / Materials / Other across.
  const byProperty = wb.addWorksheet('By Property');
  header(byProperty, ['Property', 'Category', 'Labor', 'Materials', 'Other', 'Tax', 'Total incl. Tax'], [24, 30, 14, 14, 14, 12, 16]);
  const propertyNames = [...groupBy(rows, (r) => r.property).keys()].sort();
  for (const name of propertyNames) {
    const ofProperty = rows.filter((r) => r.property === name);
    const type = ofProperty[0]?.propertyType as PropertyType | null;
    const order = type ? CATEGORIES[type] : [];
    const categories = [...groupBy(ofProperty, (r) => r.category).keys()].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) || a.localeCompare(b));
    for (const category of categories) {
      const cell = ofProperty.filter((r) => r.category === category);
      const n = byProperty.rowCount + 1;
      const where = `${ref(E.property)},$A${n},${ref(E.category)},$B${n}`;
      const kind = (k: keyof typeof KIND_LABEL) =>
        formula(`SUMIFS(${ref(E.amount)},${where},${ref(E.kind)},${quote(KIND_LABEL[k])})`, sumRows(cell.filter((r) => r.kind === k)).amountCents);
      byProperty.addRow([name, category, kind('labor'), kind('materials'), kind('other'), formula(`SUMIFS(${ref(E.tax)},${where})`, sumRows(cell).taxCents), formula(`SUMIFS(${ref(E.total)},${where})`, sumRows(cell).totalCents)]);
    }
    const n = byProperty.rowCount + 1;
    const where = `${ref(E.property)},$A${n}`;
    const t = sumRows(ofProperty);
    const kind = (k: keyof typeof KIND_LABEL) =>
      formula(`SUMIFS(${ref(E.amount)},${where},${ref(E.kind)},${quote(KIND_LABEL[k])})`, sumRows(ofProperty.filter((r) => r.kind === k)).amountCents);
    byProperty.addRow([name, 'Total', kind('labor'), kind('materials'), kind('other'), formula(`SUMIFS(${ref(E.tax)},${where})`, t.taxCents), formula(`SUMIFS(${ref(E.total)},${where})`, t.totalCents)]).font = { bold: true };
    byProperty.addRow([]);
  }
  {
    const t = sumRows(rows);
    const kind = (k: keyof typeof KIND_LABEL) =>
      formula(`SUMIFS(${ref(E.amount)},${ref(E.kind)},${quote(KIND_LABEL[k])})`, sumRows(rows.filter((r) => r.kind === k)).amountCents);
    byProperty.addRow(['All properties', 'Grand total', kind('labor'), kind('materials'), kind('other'), formula(`SUM(${ref(E.tax)})`, t.taxCents), formula(`SUM(${ref(E.total)})`, t.totalCents)]).font = { bold: true };
  }
  moneyColumns(byProperty, [3, 4, 5, 6, 7]);

  // 3. By Category, grouped by tax treatment.
  const byCategory = wb.addWorksheet('By Category');
  header(byCategory, ['Tax Treatment', 'Category', 'Amount', 'Tax', 'Total incl. Tax'], [26, 30, 14, 12, 16]);
  const treatmentOrder = ['Deduct this year', 'Capitalize & depreciate', 'Add to property cost', 'Reduces sale proceeds', ''];
  const pairs = [...groupBy(rows, (r) => `${r.taxTreatment}\u0000${r.category}`).entries()].sort(
    ([a], [b]) => treatmentOrder.indexOf(a.split('\u0000')[0]!) - treatmentOrder.indexOf(b.split('\u0000')[0]!) || a.localeCompare(b),
  );
  for (const [key, group] of pairs) {
    const [treatment = '', category = ''] = key.split('\u0000');
    const n = byCategory.rowCount + 1;
    const where = `${ref(E.treatment)},$A${n},${ref(E.category)},$B${n}`;
    const t = sumRows(group);
    byCategory.addRow([treatment, category, formula(`SUMIFS(${ref(E.amount)},${where})`, t.amountCents), formula(`SUMIFS(${ref(E.tax)},${where})`, t.taxCents), formula(`SUMIFS(${ref(E.total)},${where})`, t.totalCents)]);
  }
  {
    const t = sumRows(rows);
    byCategory.addRow(['Total', '', formula(`SUM(${ref(E.amount)})`, t.amountCents), formula(`SUM(${ref(E.tax)})`, t.taxCents), formula(`SUM(${ref(E.total)})`, t.totalCents)]).font = { bold: true };
  }
  moneyColumns(byCategory, [3, 4, 5]);

  // 4. By Vendor, largest first.
  const byVendor = wb.addWorksheet('By Vendor');
  header(byVendor, ['Vendor', 'Phone', 'Email', 'Address', 'Receipts', 'Total incl. Tax'], [26, 16, 26, 34, 10, 16]);
  const vendorGroups = [...groupBy(rows, (r) => r.vendor).entries()].sort(([, a], [, b]) => sumRows(b).totalCents - sumRows(a).totalCents);
  for (const [vendor, group] of vendorGroups) {
    const n = byVendor.rowCount + 1;
    const first = (pick: (r: LedgerRow) => string) => group.map(pick).find(Boolean) ?? '';
    byVendor.addRow([
      vendor,
      first((r) => r.vendorPhone),
      first((r) => r.vendorEmail),
      first((r) => r.vendorAddress),
      new Set(group.map((r) => r.receiptId)).size,
      formula(`SUMIFS(${ref(E.total)},${ref(E.vendor)},$A${n})`, sumRows(group).totalCents),
    ]);
  }
  moneyColumns(byVendor, [6]);

  // 5. By Month: months down, properties across.
  const byMonth = wb.addWorksheet('By Month');
  header(byMonth, ['Month', ...propertyNames, 'Total'], [14, ...propertyNames.map(() => 18), 16]);
  MONTHS.forEach((month, m) => {
    const inMonth = rows.filter((r) => Number(r.date.slice(5, 7)) === m + 1);
    const range = `${ref(E.date)},">="&DATE(${year},${m + 1},1),${ref(E.date)},"<"&DATE(${year},${m + 2},1)`;
    byMonth.addRow([
      month,
      ...propertyNames.map((name) => formula(`SUMIFS(${ref(E.total)},${range},${ref(E.property)},${quote(name)})`, sumRows(inMonth.filter((r) => r.property === name)).totalCents)),
      formula(`SUMIFS(${ref(E.total)},${range})`, sumRows(inMonth).totalCents),
    ]);
  });
  byMonth.addRow([
    'Total',
    ...propertyNames.map((name) => formula(`SUMIFS(${ref(E.total)},${ref(E.property)},${quote(name)})`, sumRows(rows.filter((r) => r.property === name)).totalCents)),
    formula(`SUM(${ref(E.total)})`, sumRows(rows).totalCents),
  ]).font = { bold: true };
  moneyColumns(byMonth, propertyNames.map((_, i) => i + 2).concat(propertyNames.length + 2));

  // 6. About
  const about = wb.addWorksheet('About');
  about.getColumn(1).width = 28;
  about.getColumn(2).width = 80;
  about.addRow(['Urban Vibes Living LLC', 'Expense records']).font = { bold: true };
  about.addRow(['Tax year', year]);
  about.addRow(['Exported', input.exportedAt.toLocaleString('en-US')]);
  about.addRow(['Receipts', input.receiptCount]);
  about.addRow(['Line items', rows.length]);
  about.addRow(['Still marked Needs Attention', input.needsAttentionCount]);
  about.addRow(['Note', NOT_TAX_ADVICE]);
  about.getCell('B7').alignment = { wrapText: true };
  // Tax treatment legend, so the labels can be read without the app.
  about.addRow([]);
  about.addRow(['Tax treatment labels']).font = { bold: true };
  for (const type of ['rental', 'flip', 'overhead'] as const) {
    for (const category of CATEGORIES[type]) about.addRow([`${PROPERTY_TYPE_LABEL[type]}: ${category}`, taxTreatment(type, category)]);
  }
  return wb;
}

export async function workbookBytes(input: WorkbookInput): Promise<Uint8Array> {
  return new Uint8Array(await buildWorkbook(input).xlsx.writeBuffer());
}
