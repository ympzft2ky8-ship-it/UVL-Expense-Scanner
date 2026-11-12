import { CATEGORIES } from '../categories.ts';

/** What the model returns. Money and quantities are decimal strings ("19.89"), never floats. */
export interface ModelLine {
  description: string;
  sku: string | null;
  quantity: string | null;
  unit_price: string | null;
  amount: string | null;
  taxed: boolean | null;
  kind: 'labor' | 'materials' | 'other';
  category_rental: string;
  category_flip: string;
  category_overhead: string;
  repair_vs_improvement_unclear: boolean;
  low_confidence: boolean;
}

export interface ModelCharge {
  label: string;
  amount: string;
  taxed: boolean | null;
}

export const HEADER_FIELDS = [
  'vendor_name',
  'vendor_address',
  'state',
  'invoice_number',
  'date',
  'subtotal',
  'tax_total',
  'total',
  'payment',
] as const;
export type HeaderField = (typeof HEADER_FIELDS)[number];

export interface ModelReceipt {
  is_receipt: boolean;
  not_receipt_reason: string | null;
  vendor_name: string | null;
  vendor_address: string | null;
  state: string | null;
  vendor_phone: string | null;
  vendor_email: string | null;
  vendor_website: string | null;
  invoice_number: string | null;
  date: string | null;
  subtotal: string | null;
  tax_total: string | null;
  tax_rate_percent: string | null;
  total: string | null;
  payment_method: 'card' | 'cash' | 'check' | 'transfer' | 'other' | null;
  payment_reference: string | null;
  lines: ModelLine[];
  charges: ModelCharge[];
  low_confidence_fields: HeaderField[];
}

const nullableString = { type: ['string', 'null'] } as const;
const nullableBoolean = { type: ['boolean', 'null'] } as const;

function object(properties: Record<string, unknown>) {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}

/** JSON Schema for structured output: every object closed, every property required. */
export const RECEIPT_JSON_SCHEMA = object({
  is_receipt: { type: 'boolean' },
  not_receipt_reason: nullableString,
  vendor_name: nullableString,
  vendor_address: nullableString,
  state: nullableString,
  vendor_phone: nullableString,
  vendor_email: nullableString,
  vendor_website: nullableString,
  invoice_number: nullableString,
  date: nullableString,
  subtotal: nullableString,
  tax_total: nullableString,
  tax_rate_percent: nullableString,
  total: nullableString,
  payment_method: { anyOf: [{ type: 'string', enum: ['card', 'cash', 'check', 'transfer', 'other'] }, { type: 'null' }] },
  payment_reference: nullableString,
  lines: {
    type: 'array',
    items: object({
      description: { type: 'string' },
      sku: nullableString,
      quantity: nullableString,
      unit_price: nullableString,
      amount: nullableString,
      taxed: nullableBoolean,
      kind: { type: 'string', enum: ['labor', 'materials', 'other'] },
      category_rental: { type: 'string', enum: CATEGORIES.rental },
      category_flip: { type: 'string', enum: CATEGORIES.flip },
      category_overhead: { type: 'string', enum: CATEGORIES.overhead },
      repair_vs_improvement_unclear: { type: 'boolean' },
      low_confidence: { type: 'boolean' },
    }),
  },
  charges: {
    type: 'array',
    items: object({ label: { type: 'string' }, amount: { type: 'string' }, taxed: nullableBoolean }),
  },
  low_confidence_fields: { type: 'array', items: { type: 'string', enum: [...HEADER_FIELDS] } },
});
