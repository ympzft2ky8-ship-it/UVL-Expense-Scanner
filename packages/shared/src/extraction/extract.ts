import Anthropic from '@anthropic-ai/sdk';
import { arithmeticChecks, type Flags } from '../checks.ts';
import { parseCents } from '../money.ts';
import type { Line, Receipt } from '../types.ts';
import { RECEIPT_JSON_SCHEMA, type ModelReceipt } from './schema.ts';
import { SYSTEM_PROMPT, USER_INSTRUCTION, rereadInstruction } from './prompt.ts';

export const DEFAULT_MODEL = 'claude-opus-5-5';

/** Dollars per million tokens. Update together with DEFAULT_MODEL. */
export const PRICES: Record<string, { input: number; output: number }> = {
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
};

export interface DocumentPart {
  mediaType: 'image/jpeg' | 'image/png' | 'application/pdf';
  base64: string;
}

/** The part of a receipt that reading fills in. */
export type ReceiptDraft = Pick<
  Receipt,
  | 'date'
  | 'vendorName'
  | 'vendorAddress'
  | 'vendorPhone'
  | 'vendorEmail'
  | 'vendorWebsite'
  | 'invoiceNo'
  | 'subtotalCents'
  | 'taxCents'
  | 'totalCents'
  | 'taxState'
  | 'taxRatePrinted'
  | 'paymentMethod'
  | 'paymentRef'
  | 'lines'
  | 'flags'
>;

export type ExtractResult =
  | { ok: true; draft: ReceiptDraft; costMicros: number; reread: boolean }
  | { ok: false; reason: ExtractFailure; message: string; costMicros: number };

export type ExtractFailure = 'not_receipt' | 'bad_key' | 'rate_limited' | 'offline' | 'refused' | 'unreadable' | 'error';

export class ExtractError extends Error {
  constructor(
    public reason: ExtractFailure,
    message: string,
    public costMicros = 0,
  ) {
    super(message);
  }
}

const HARD_TO_READ = 'Hard to read – please check against the receipt';

const HEADER_FLAG: Record<string, string> = {
  vendor_name: 'vendorName',
  vendor_address: 'vendorAddress',
  state: 'taxState',
  invoice_number: 'invoiceNo',
  date: 'date',
  subtotal: 'subtotal',
  tax_total: 'tax',
  total: 'total',
  payment: 'paymentMethod',
};

function isoDate(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) return '';
  return value;
}

function parseQty(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Turn the model's reading into receipt fields. `newId` supplies line ids. */
export function draftFromModel(m: ModelReceipt, newId: () => string): ReceiptDraft {
  const flags: Flags = {};
  for (const f of m.low_confidence_fields) {
    const key = HEADER_FLAG[f];
    if (key) flags[key] = HARD_TO_READ;
  }
  const lines: Line[] = [];
  for (const l of m.lines) {
    const id = newId();
    const amount = parseCents(l.amount);
    if (l.low_confidence || amount === null) flags[`lines.${id}.amount`] = HARD_TO_READ;
    lines.push({
      id,
      description: l.description,
      sku: l.sku ?? '',
      qty: parseQty(l.quantity),
      unitPriceCents: parseCents(l.unit_price),
      amountCents: amount ?? 0,
      taxed: l.taxed,
      kind: l.kind,
      isCharge: false,
      propertyId: null,
      category: null,
      splits: [],
      suggest: {
        rental: l.category_rental,
        flip: l.category_flip,
        overhead: l.category_overhead,
        unclear: l.repair_vs_improvement_unclear,
      },
    });
  }
  for (const c of m.charges) {
    const amount = parseCents(c.amount);
    if (amount === null) continue;
    lines.push({
      id: newId(),
      description: c.label,
      sku: '',
      qty: null,
      unitPriceCents: null,
      amountCents: amount,
      taxed: c.taxed,
      kind: 'other',
      isCharge: true,
      propertyId: null,
      category: null,
      splits: [],
      suggest: null,
    });
  }
  const rate = m.tax_rate_percent === null ? null : Number(m.tax_rate_percent);
  const state = (m.state ?? '').trim().toUpperCase();
  return {
    date: isoDate(m.date),
    vendorName: m.vendor_name ?? '',
    vendorAddress: m.vendor_address ?? '',
    vendorPhone: m.vendor_phone ?? '',
    vendorEmail: m.vendor_email ?? '',
    vendorWebsite: m.vendor_website ?? '',
    invoiceNo: m.invoice_number ?? '',
    subtotalCents: parseCents(m.subtotal),
    taxCents: parseCents(m.tax_total) ?? 0,
    totalCents: parseCents(m.total),
    taxState: /^[A-Z]{2}$/.test(state) ? state : '',
    taxRatePrinted: rate !== null && Number.isFinite(rate) ? Math.round(rate * 10_000) : null,
    paymentMethod: m.payment_method ?? '',
    paymentRef: m.payment_reference ?? '',
    lines,
    flags,
  };
}

function costMicros(model: string, usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }): number {
  const price = PRICES[model] ?? PRICES[DEFAULT_MODEL]!;
  const input = usage.input_tokens + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
  // $/MTok is the same number as micro-dollars per token.
  return Math.round(input * price.input + usage.output_tokens * price.output);
}

function documentBlocks(parts: DocumentPart[]): Anthropic.Beta.BetaContentBlockParam[] {
  return parts.map((p) =>
    p.mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: p.base64 } }
      : { type: 'image', source: { type: 'base64', media_type: p.mediaType, data: p.base64 } },
  );
}

export interface ExtractOptions {
  model?: string;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  newId: () => string;
}

type MessagesClient = { beta: { messages: Pick<Anthropic['beta']['messages'], 'create'> } };

async function readOnce(
  client: MessagesClient,
  parts: DocumentPart[],
  instruction: string,
  model: string,
  effort: NonNullable<ExtractOptions['effort']>,
): Promise<{ reading: ModelReceipt; cost: number }> {
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: { effort, format: { type: 'json_schema', schema: RECEIPT_JSON_SCHEMA } },
      // If a safety classifier declines the request, the API retries it on another model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: [...documentBlocks(parts), { type: 'text', text: instruction }] }],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      throw new ExtractError('bad_key', 'The AI key was not accepted. Check it in Settings.');
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new ExtractError('rate_limited', 'The AI service is busy or the account is out of credit. Try again in a minute.');
    }
    if (error instanceof Anthropic.APIConnectionError) {
      throw new ExtractError('offline', 'Could not reach the AI service. Check your connection.');
    }
    if (error instanceof Anthropic.APIError) {
      throw new ExtractError('error', `The AI service returned an error (${error.status ?? 'unknown'}).`);
    }
    throw error;
  }
  const cost = costMicros(response.model in PRICES ? response.model : model, response.usage);
  if (response.stop_reason === 'refusal') {
    throw new ExtractError('refused', 'The AI service declined to read this document.', cost);
  }
  if (response.stop_reason === 'max_tokens') {
    throw new ExtractError('unreadable', 'This document was too long to read in one go. Try scanning it in fewer pages.', cost);
  }
  const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')?.text;
  if (!text) throw new ExtractError('unreadable', 'The AI service returned nothing for this document.', cost);
  let reading: ModelReceipt;
  try {
    reading = JSON.parse(text) as ModelReceipt;
  } catch {
    throw new ExtractError('unreadable', 'The AI service returned something unexpected for this document.', cost);
  }
  return { reading, cost };
}

/**
 * Read a document. When the numbers do not add up, read it once more with the
 * discrepancy spelled out, and keep the second reading only if it fixes the problem.
 */
export async function extractReceipt(client: MessagesClient, parts: DocumentPart[], options: ExtractOptions): Promise<ExtractResult> {
  const model = options.model ?? DEFAULT_MODEL;
  const effort = options.effort ?? 'high';
  let cost = 0;
  try {
    const first = await readOnce(client, parts, USER_INSTRUCTION, model, effort);
    cost += first.cost;
    if (!first.reading.is_receipt) {
      return {
        ok: false,
        reason: 'not_receipt',
        message: first.reading.not_receipt_reason || 'This does not look like a receipt or invoice.',
        costMicros: cost,
      };
    }
    let draft = draftFromModel(first.reading, options.newId);
    let reread = false;
    const problems = arithmeticChecks(draft);
    if (Object.keys(problems).length > 0) {
      try {
        const messages = [...new Set(Object.values(problems))];
        const second = await readOnce(client, parts, rereadInstruction(JSON.stringify(first.reading), messages), model, effort);
        cost += second.cost;
        reread = true;
        if (second.reading.is_receipt) {
          const secondDraft = draftFromModel(second.reading, options.newId);
          if (Object.keys(arithmeticChecks(secondDraft)).length === 0) draft = secondDraft;
        }
      } catch (error) {
        // The first reading stands, flagged by the checks the caller runs.
        if (error instanceof ExtractError) cost += error.costMicros;
        else throw error;
      }
    }
    return { ok: true, draft, costMicros: cost, reread };
  } catch (error) {
    if (error instanceof ExtractError) {
      return { ok: false, reason: error.reason, message: error.message, costMicros: cost + error.costMicros };
    }
    throw error;
  }
}
