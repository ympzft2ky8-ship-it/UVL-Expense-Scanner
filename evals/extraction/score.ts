import { normalizeVendorName, parseCents, type ModelReceipt } from '@uvl/shared';
import type { ReceiptDraft } from '@uvl/shared';

/** The answer key for one sample: the model's schema, confirmed by an owner. */
export interface Expected extends ModelReceipt {
  verified_by?: string | null;
  verified_at?: string | null;
}

export interface FieldResult {
  field: string;
  expected: string;
  got: string;
  correct: boolean;
  /** Was the field marked needs-check after the consistency checks ran? */
  flagged: boolean;
}

export interface SampleScore {
  id: string;
  tags: string[];
  fields: FieldResult[];
  linesExpected: number;
  linesCorrect: number;
  costMicros: number;
  error?: string;
}

const money = (v: string | null) => parseCents(v);
const show = (v: unknown) => (v === null || v === undefined || v === '' ? '(empty)' : String(v));

function field(name: string, expected: unknown, got: unknown, flagged: boolean, same = (a: unknown, b: unknown) => a === b): FieldResult {
  return { field: name, expected: show(expected), got: show(got), correct: same(expected, got), flagged };
}

/**
 * Compare a reading with its answer key (scoring rules in the extraction-eval skill):
 * money and dates exact; vendor ignoring case, punctuation, "Inc" and store numbers;
 * lines paired by amount.
 */
export function scoreSample(id: string, tags: string[], expected: Expected, draft: ReceiptDraft, flags: Record<string, string>, costMicros: number): SampleScore {
  const flagged = (key: string) => key in flags;
  const fields: FieldResult[] = [
    field('total', money(expected.total), draft.totalCents, flagged('total')),
    field('date', expected.date ?? '', draft.date, flagged('date')),
    field('vendor', normalizeVendorName(expected.vendor_name ?? ''), normalizeVendorName(draft.vendorName), flagged('vendorName')),
    field('subtotal', money(expected.subtotal), draft.subtotalCents, flagged('subtotal')),
    field('tax', money(expected.tax_total) ?? 0, draft.taxCents, flagged('tax')),
    field('state', (expected.state ?? '').toUpperCase(), draft.taxState, flagged('taxState')),
  ];

  // Pair lines by amount: each expected line claims one unread line with the same amount.
  const want = [
    ...expected.lines.map((l) => ({ amount: money(l.amount), kind: l.kind as string, description: l.description })),
    ...expected.charges.map((c) => ({ amount: money(c.amount), kind: 'other', description: c.label })),
  ];
  const pool = draft.lines.map((l) => ({ line: l, used: false }));
  let linesCorrect = 0;
  for (const w of want) {
    const match = pool.find((p) => !p.used && p.line.amountCents === w.amount);
    if (match) {
      match.used = true;
      linesCorrect++;
      fields.push(field(`kind: ${w.description}`, w.kind, match.line.kind, false));
    } else {
      // A missed or misread line counts as flagged when any line amount on the receipt was flagged.
      const anyFlag = Object.keys(flags).some((k) => k.endsWith('.amount')) || flagged('subtotal') || flagged('total');
      fields.push({ field: `line amount: ${w.description}`, expected: show(w.amount), got: '(no line with this amount)', correct: false, flagged: anyFlag });
    }
  }
  for (const extra of pool.filter((p) => !p.used)) {
    const anyFlag = flagged(`lines.${extra.line.id}.amount`) || flagged('subtotal') || flagged('total');
    fields.push({ field: `extra line: ${extra.line.description}`, expected: '(not on the receipt)', got: show(extra.line.amountCents), correct: false, flagged: anyFlag });
  }
  return { id, tags, fields, linesExpected: want.length, linesCorrect, costMicros };
}

export interface Summary {
  samples: number;
  headline: Record<'total' | 'date' | 'vendor', number>;
  lineAccuracy: number;
  unflaggedErrors: FieldResult[];
  gate: { passed: boolean; reasons: string[] };
  costPerReceiptMicros: number;
}

const GATED = (f: FieldResult) => f.field === 'total' || f.field === 'date' || f.field.startsWith('line amount') || f.field.startsWith('extra line');

/** Release gate from the receipt-extraction spec. */
export function summarize(scores: SampleScore[]): Summary {
  const ok = scores.filter((s) => !s.error);
  const rate = (name: string) => (ok.length ? ok.filter((s) => s.fields.find((f) => f.field === name)?.correct).length / ok.length : 0);
  const headline = { total: rate('total'), date: rate('date'), vendor: rate('vendor') };
  const lines = ok.reduce((a, s) => a + s.linesExpected, 0);
  const lineAccuracy = lines ? ok.reduce((a, s) => a + s.linesCorrect, 0) / lines : 1;
  const unflaggedErrors = ok.flatMap((s) => s.fields.filter((f) => !f.correct && !f.flagged && GATED(f)).map((f) => ({ ...f, field: `${s.id} · ${f.field}` })));
  const reasons: string[] = [];
  for (const [name, value] of Object.entries(headline)) if (value < 0.97) reasons.push(`${name} correct on ${(value * 100).toFixed(1)}% of receipts (needs 97%)`);
  if (lineAccuracy < 0.95) reasons.push(`line amounts ${(lineAccuracy * 100).toFixed(1)}% correct (needs 95%)`);
  if (unflaggedErrors.length > 0) reasons.push(`${unflaggedErrors.length} wrong value(s) on total, date or line amounts were not flagged (needs 0)`);
  if (scores.length !== ok.length) reasons.push(`${scores.length - ok.length} sample(s) failed to read`);
  return {
    samples: scores.length,
    headline,
    lineAccuracy,
    unflaggedErrors,
    gate: { passed: reasons.length === 0 && ok.length > 0, reasons },
    costPerReceiptMicros: scores.length ? Math.round(scores.reduce((a, s) => a + s.costMicros, 0) / scores.length) : 0,
  };
}

export function report(label: string, model: string, scores: SampleScore[]): string {
  const s = summarize(scores);
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const wrong = scores.flatMap((sc) => sc.fields.filter((f) => !f.correct).map((f) => `| ${sc.id} | ${f.field} | ${f.expected} | ${f.got} | ${f.flagged ? 'yes' : '**NO**'} |`));
  const byTag = new Map<string, number>();
  for (const sc of scores) if (sc.error || sc.fields.some((f) => !f.correct && GATED(f))) for (const t of sc.tags.length ? sc.tags : ['(untagged)']) byTag.set(t, (byTag.get(t) ?? 0) + 1);
  return [
    `# Extraction accuracy: ${label}`,
    '',
    `Model \`${model}\` · ${s.samples} receipts · about $${(s.costPerReceiptMicros / 1_000_000).toFixed(3)} per receipt`,
    '',
    `**Release gate: ${s.gate.passed ? 'PASSED' : 'NOT PASSED'}**`,
    ...s.gate.reasons.map((r) => `- ${r}`),
    '',
    '| Measure | Result | Needed |',
    '|---|---|---|',
    `| Total correct | ${pct(s.headline.total)} | 97% |`,
    `| Date correct | ${pct(s.headline.date)} | 97% |`,
    `| Vendor correct | ${pct(s.headline.vendor)} | 97% |`,
    `| Line amounts correct | ${pct(s.lineAccuracy)} | 95% |`,
    `| Wrong and not flagged (total, date, line amounts) | ${s.unflaggedErrors.length} | 0 |`,
    '',
    '## Every wrong value',
    '',
    wrong.length ? ['| Sample | Field | Expected | Got | Flagged? |', '|---|---|---|---|---|', ...wrong].join('\n') : 'None.',
    '',
    '## Receipts with a wrong total, date or line, by tag',
    '',
    byTag.size ? [...byTag.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `- ${t}: ${n}`).join('\n') : 'None.',
    '',
    ...scores.filter((sc) => sc.error).map((sc) => `- ${sc.id} could not be read: ${sc.error}`),
    '',
  ].join('\n');
}
