import { describe, expect, it, vi } from 'vitest';
import { arithmeticChecks } from '../src/checks.ts';
import { draftFromModel, extractReceipt } from '../src/extraction/extract.ts';
import { RECEIPT_JSON_SCHEMA, type ModelLine, type ModelReceipt } from '../src/extraction/schema.ts';

function modelLine(partial: Partial<ModelLine>): ModelLine {
  return {
    description: 'Item',
    sku: null,
    quantity: null,
    unit_price: null,
    amount: '0.00',
    taxed: null,
    kind: 'materials',
    category_rental: 'Supplies',
    category_flip: 'Renovation',
    category_overhead: 'Office & Supplies',
    repair_vs_improvement_unclear: false,
    low_confidence: false,
    ...partial,
  };
}

function reading(partial: Partial<ModelReceipt>): ModelReceipt {
  return {
    is_receipt: true,
    not_receipt_reason: null,
    vendor_name: 'The Home Depot',
    vendor_address: '601 Sprain Rd, Yonkers, NY 10710',
    state: 'NY',
    vendor_phone: '(914) 555-0100',
    vendor_email: null,
    vendor_website: null,
    invoice_number: null,
    date: '2026-03-03',
    subtotal: '150.00',
    tax_total: '13.31',
    tax_rate_percent: '8.875',
    total: '163.31',
    payment_method: 'card',
    payment_reference: '4821',
    lines: [modelLine({ description: '2x4 lumber', quantity: '10', unit_price: '10.00', amount: '100.00' }), modelLine({ description: 'Paint', amount: '50.00' })],
    charges: [],
    low_confidence_fields: [],
    ...partial,
  };
}

function fakeClient(responses: ModelReceipt[] | (() => never)) {
  let i = 0;
  const create = vi.fn(async () => {
    if (typeof responses === 'function') return responses();
    const body = responses[i++];
    return {
      model: 'claude-opus-5-5',
      stop_reason: 'end_turn',
      content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify(body) }],
      usage: { input_tokens: 3000, output_tokens: 1000 },
    };
  });
  return { client: { beta: { messages: { create } } } as never, create };
}

let n = 0;
const newId = () => `l${++n}`;
const part = { mediaType: 'image/jpeg' as const, base64: 'AAAA' };

describe('schema', () => {
  it('closes every object and requires every property', () => {
    const walk = (node: any) => {
      if (node?.type === 'object') {
        expect(node.additionalProperties).toBe(false);
        expect(node.required).toEqual(Object.keys(node.properties));
        Object.values(node.properties).forEach(walk);
      }
      if (node?.type === 'array') walk(node.items);
    };
    walk(RECEIPT_JSON_SCHEMA);
  });
});

describe('draftFromModel', () => {
  it('maps a clean reading', () => {
    const d = draftFromModel(reading({}), newId);
    expect(d.vendorName).toBe('The Home Depot');
    expect(d.taxState).toBe('NY');
    expect(d.subtotalCents).toBe(15000);
    expect(d.taxCents).toBe(1331);
    expect(d.totalCents).toBe(16331);
    expect(d.taxRatePrinted).toBe(88750);
    expect(d.paymentMethod).toBe('card');
    expect(d.lines[0]).toMatchObject({ qty: 10, unitPriceCents: 1000, amountCents: 10000, kind: 'materials' });
    expect(d.flags).toEqual({});
    expect(arithmeticChecks(d)).toEqual({});
  });
  it('leaves missing values empty rather than inventing them', () => {
    const d = draftFromModel(reading({ state: null, date: null, vendor_email: null, tax_rate_percent: null }), newId);
    expect(d.taxState).toBe('');
    expect(d.date).toBe('');
    expect(d.vendorEmail).toBe('');
    expect(d.taxRatePrinted).toBeNull();
  });
  it('turns charges into Other lines and flags low confidence', () => {
    const d = draftFromModel(reading({ charges: [{ label: 'Delivery', amount: '75.00', taxed: null }, { label: 'Pro discount', amount: '-10.00', taxed: null }], low_confidence_fields: ['total', 'date'], lines: [modelLine({ amount: '100.00', low_confidence: true })] }), newId);
    expect(d.lines.map((l) => [l.description, l.amountCents, l.isCharge, l.kind])).toEqual([
      ['Item', 10000, false, 'materials'],
      ['Delivery', 7500, true, 'other'],
      ['Pro discount', -1000, true, 'other'],
    ]);
    expect(d.flags.total).toBeDefined();
    expect(d.flags.date).toBeDefined();
    expect(d.flags[`lines.${d.lines[0]!.id}.amount`]).toBeDefined();
  });
  it('rejects a malformed date', () => {
    expect(draftFromModel(reading({ date: '03/03/2026' }), newId).date).toBe('');
  });
});

describe('extractReceipt', () => {
  it('reads once when the numbers add up, and meters the cost', async () => {
    const { client, create } = fakeClient([reading({})]);
    const result = await extractReceipt(client, [part], { newId });
    expect(create).toHaveBeenCalledTimes(1);
    expect(result.ok && result.reread).toBe(false);
    // 3000 input x $4 + 1000 output x $20 per million = $0.032
    expect(result.costMicros).toBe(32000);
    const args = (create.mock.calls[0] as any[])[0];
    expect(args.model).toBe('claude-opus-5-5');
    expect(args.output_config.format.type).toBe('json_schema');
    expect(args.messages[0].content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } });
  });
  it('re-reads once when lines do not add up and keeps the fixed reading', async () => {
    const bad = reading({ subtotal: '124.10', total: '137.41', lines: [modelLine({ amount: '100.00' }), modelLine({ amount: '42.10' })] });
    const good = reading({ subtotal: '124.10', tax_total: '13.31', total: '137.41', lines: [modelLine({ amount: '100.00' }), modelLine({ amount: '24.10' })] });
    const { client, create } = fakeClient([bad, good]);
    const result = await extractReceipt(client, [part], { newId });
    expect(create).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reread).toBe(true);
      expect(result.draft.lines[1]!.amountCents).toBe(2410);
      expect(result.costMicros).toBe(64000);
    }
    const second = (create.mock.calls[1] as any[])[0];
    expect(second.messages[0].content.at(-1).text).toContain('Line items add up to $142.10 but the subtotal says $124.10');
  });
  it('keeps the first reading when the second does not fix it, and never reads a third time', async () => {
    const bad = reading({ subtotal: '124.10', lines: [modelLine({ amount: '142.10' })] });
    const { client, create } = fakeClient([bad, bad]);
    const result = await extractReceipt(client, [part], { newId });
    expect(create).toHaveBeenCalledTimes(2);
    expect(result.ok && Object.keys(arithmeticChecks(result.draft)).length > 0).toBe(true);
  });
  it('reports a document that is not a receipt', async () => {
    const { client } = fakeClient([reading({ is_receipt: false, not_receipt_reason: 'A photo of a dog.' })]);
    const result = await extractReceipt(client, [part], { newId });
    expect(result).toMatchObject({ ok: false, reason: 'not_receipt', message: 'A photo of a dog.' });
  });
  it('sends PDFs as documents', async () => {
    const { client, create } = fakeClient([reading({})]);
    await extractReceipt(client, [{ mediaType: 'application/pdf', base64: 'PDF' }], { newId });
    expect((create.mock.calls[0] as any[])[0].messages[0].content[0].type).toBe('document');
  });
});
