/** All money is integer cents. Never use floats for amounts. */

/** Parse "1,234.56", "$19.89", "-45.00", "(45.00)" into cents. Returns null when not a number. */
export function parseCents(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  let s = String(input).trim();
  if (s === '') return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$,\s]/g, '');
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.endsWith('-')) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (!/^\d*(\.\d*)?$/.test(s) || s === '' || s === '.') return null;
  const [whole = '0', frac = ''] = s.split('.');
  const fracPadded = (frac + '000').slice(0, 3);
  let cents = Number(whole || '0') * 100 + Number(fracPadded.slice(0, 2));
  if (Number(fracPadded[2]) >= 5) cents += 1;
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = (abs % 100).toString().padStart(2, '0');
  return `${neg ? '-' : ''}$${whole}.${frac}`;
}

/** Plain decimal for input fields: 1989 -> "19.89". */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  const neg = cents < 0;
  const abs = Math.abs(cents);
  return `${neg ? '-' : ''}${Math.floor(abs / 100)}.${(abs % 100).toString().padStart(2, '0')}`;
}

/** Round half away from zero for a ratio of integers, without float drift. */
export function mulDivRound(amount: number, numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  const sign = Math.sign(amount) * Math.sign(numerator) * Math.sign(denominator);
  const a = BigInt(Math.abs(amount));
  const n = BigInt(Math.abs(numerator));
  const d = BigInt(Math.abs(denominator));
  const q = (a * n * 2n + d) / (d * 2n);
  return sign * Number(q);
}

/**
 * Share `total` across `weights` in proportion, rounding each share to the cent.
 * Any leftover cents go to the largest weight so the shares add up exactly.
 */
export function allocate(total: number, weights: number[]): number[] {
  const base = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  let largest = 0;
  weights.forEach((w, i) => {
    if (Math.abs(w) > Math.abs(weights[largest] ?? 0)) largest = i;
  });
  if (base === 0) {
    const out = weights.map(() => 0);
    out[largest] = total;
    return out;
  }
  const shares = weights.map((w) => mulDivRound(total, w, base));
  const leftover = total - shares.reduce((a, b) => a + b, 0);
  shares[largest] = (shares[largest] ?? 0) + leftover;
  return shares;
}

export interface TaxableLine {
  amountCents: number;
  taxed: boolean | null;
}

/**
 * Spread a receipt's tax across its lines (expense-ledger spec).
 * Lines marked not taxed get nothing. When nothing is marked, every line is taxed.
 */
export function allocateTax(lines: TaxableLine[], taxCents: number): number[] {
  if (lines.length === 0) return [];
  let taxable = lines.map((l) => l.taxed !== false);
  if (!taxable.some(Boolean)) taxable = lines.map(() => true);
  const weights = lines.map((l, i) => (taxable[i] ? l.amountCents : 0));
  if (weights.every((w) => w === 0)) {
    // Nothing to weigh by: put the tax on the first taxable line.
    const out = lines.map(() => 0);
    out[taxable.indexOf(true)] = taxCents;
    return out;
  }
  return allocate(taxCents, weights);
}

/** Effective tax rate in hundredths of a basis point (8.875% -> 88750), or null. */
export function effectiveRate(taxCents: number, taxableBaseCents: number): number | null {
  if (taxableBaseCents === 0) return null;
  return mulDivRound(taxCents, 1_000_000, taxableBaseCents);
}

export function formatRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return '';
  return `${(rate / 10_000).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}%`;
}
