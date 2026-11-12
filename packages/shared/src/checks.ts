import { formatCents, effectiveRate } from './money.ts';
import type { Line, Receipt } from './types.ts';

/** field path -> plain-language reason. Paths: "date", "total", "subtotal", "tax", "lines.<id>.amount" ... */
export type Flags = Record<string, string>;

export interface CheckInput {
  date: string;
  subtotalCents: number | null;
  taxCents: number;
  totalCents: number | null;
  lines: Pick<Line, 'id' | 'qty' | 'unitPriceCents' | 'amountCents' | 'isCharge' | 'taxed'>[];
}

export interface CheckContext {
  /** Today as YYYY-MM-DD. */
  today: string;
  /** Ledger years that are still open (current year, and last year until it is closed). */
  openYears: number[];
}

const within = (a: number, b: number) => Math.abs(a - b) <= 1;

/** Checks a-c of the receipt-extraction spec: the arithmetic ones. */
export function arithmeticChecks(r: CheckInput): Flags {
  const flags: Flags = {};
  // (a) quantity x unit price = line amount
  for (const l of r.lines) {
    if (l.qty !== null && l.unitPriceCents !== null) {
      const expected = Math.round(l.qty * l.unitPriceCents);
      if (!within(expected, l.amountCents)) {
        flags[`lines.${l.id}.amount`] =
          `${l.qty} × ${formatCents(l.unitPriceCents)} is ${formatCents(expected)}, but the line says ${formatCents(l.amountCents)}`;
      }
    }
  }
  const items = r.lines.filter((l) => !l.isCharge);
  const charges = r.lines.filter((l) => l.isCharge);
  const itemSum = items.reduce((a, l) => a + l.amountCents, 0);
  const discountSum = charges.filter((l) => l.amountCents < 0).reduce((a, l) => a + l.amountCents, 0);
  const allSum = r.lines.reduce((a, l) => a + l.amountCents, 0);

  // (b) line items (less discounts) = subtotal
  if (r.subtotalCents !== null && items.length > 0) {
    const ok =
      within(itemSum, r.subtotalCents) ||
      within(itemSum + discountSum, r.subtotalCents) ||
      within(allSum, r.subtotalCents);
    if (!ok) {
      const msg = `Line items add up to ${formatCents(itemSum)} but the subtotal says ${formatCents(r.subtotalCents)}`;
      flags.subtotal = msg;
      for (const l of items) flags[`lines.${l.id}.amount`] ??= msg;
    }
  }
  // (c) lines + tax = total
  if (r.totalCents !== null && r.lines.length > 0) {
    if (!within(allSum + r.taxCents, r.totalCents)) {
      const msg = `Lines (${formatCents(allSum)}) plus tax (${formatCents(r.taxCents)}) come to ${formatCents(allSum + r.taxCents)}, but the total says ${formatCents(r.totalCents)}`;
      flags.total = msg;
      flags.tax ??= msg;
      // Only blame the lines when the subtotal does not vouch for them.
      if (r.subtotalCents === null || flags.subtotal) {
        for (const l of r.lines) flags[`lines.${l.id}.amount`] ??= msg;
      }
    }
  }
  return flags;
}

/** Checks d-e: date and tax rate plausibility. */
export function plausibilityChecks(r: CheckInput, ctx: CheckContext): Flags {
  const flags: Flags = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || Number.isNaN(Date.parse(r.date))) {
    flags.date = 'The date is missing or could not be read';
  } else if (r.date > ctx.today) {
    flags.date = 'This date is in the future';
  } else {
    const year = Number(r.date.slice(0, 4));
    const thisYear = Number(ctx.today.slice(0, 4));
    if (!ctx.openYears.includes(year)) {
      flags.date = `This receipt is from ${year}, which is not an open year`;
    } else if (year < thisYear) {
      flags.date = 'This receipt is from last year';
    }
  }
  let taxableBase = r.lines.filter((l) => l.taxed !== false).reduce((a, l) => a + l.amountCents, 0);
  if (taxableBase === 0) taxableBase = r.lines.reduce((a, l) => a + l.amountCents, 0);
  const rate = effectiveRate(r.taxCents, taxableBase);
  if (rate !== null && (rate < 0 || rate > 100_000)) {
    flags.tax = `The tax works out to ${(rate / 10_000).toFixed(2)}% of the taxed items, which looks wrong`;
  }
  return flags;
}

export function runChecks(r: CheckInput, ctx: CheckContext): Flags {
  return { ...plausibilityChecks(r, ctx), ...arithmeticChecks(r) };
}

/** What blocks saving at all (expense-review spec): date, total, property and a confirmed state. */
export function missingRequired(r: Pick<Receipt, 'date' | 'totalCents' | 'propertyId' | 'taxState' | 'taxStateConfirmed'>): string[] {
  const missing: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) missing.push('date');
  if (r.totalCents === null) missing.push('total');
  if (!r.propertyId) missing.push('property');
  if (!r.taxState || !r.taxStateConfirmed) missing.push('taxState');
  return missing;
}
