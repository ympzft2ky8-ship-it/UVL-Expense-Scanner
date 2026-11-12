import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

export const PROJECT = 'demo-uvl';
export const MEMBER_ONE = 'member-one@example.com';
export const MEMBER_TWO = 'member-two@example.com';
const AUTH = 'http://127.0.0.1:9099';
const FIRESTORE = 'http://127.0.0.1:8080';

export async function resetEmulators() {
  await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
}

/** Open the verification link the Auth emulator "sent" to this address. */
export async function verifyEmail(email: string) {
  const res = await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/oobCodes`);
  const { oobCodes } = (await res.json()) as { oobCodes: { email: string; oobLink: string; requestType: string }[] };
  const code = oobCodes.filter((c) => c.email === email && c.requestType === 'VERIFY_EMAIL').pop();
  if (!code) throw new Error(`no verification email for ${email}`);
  await fetch(code.oobLink);
}

export async function signUp(page: Page, email: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'First time? Create an account' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
}

export async function signUpAndVerify(page: Page, email: string) {
  await signUp(page, email);
  await verifyEmail(email);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('scan-button')).toBeVisible();
}

/** A second phone: sign in to an account that exists but has not confirmed its email yet. */
export async function secondPhone(browser: Browser, email: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('dialog', (d) => void d.accept());
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await verifyEmail(email);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByTestId('scan-button')).toBeVisible();
  return { context, page };
}

export interface Reading {
  [key: string]: unknown;
}

export function line(description: string, amount: string, extra: Record<string, unknown> = {}) {
  return {
    description,
    sku: null,
    quantity: null,
    unit_price: null,
    amount,
    taxed: null,
    kind: 'materials',
    category_rental: 'Supplies',
    category_flip: 'Renovation',
    category_overhead: 'Office & Supplies',
    repair_vs_improvement_unclear: false,
    low_confidence: false,
    ...extra,
  };
}

export function reading(extra: Reading = {}): Reading {
  return {
    is_receipt: true,
    not_receipt_reason: null,
    vendor_name: 'The Home Depot',
    vendor_address: '601 Sprain Rd, Yonkers, NY 10710',
    state: 'NY',
    vendor_phone: '(914) 555-0100',
    vendor_email: null,
    vendor_website: 'homedepot.com',
    invoice_number: '4417 00052 81234',
    date: `${new Date().getFullYear()}-03-03`,
    subtotal: '550.00',
    tax_total: '48.81',
    tax_rate_percent: '8.875',
    total: '598.81',
    payment_method: 'card',
    payment_reference: '4821',
    lines: [line('Water heater 50 gal', '500.00', { category_rental: 'Capital Improvement', repair_vs_improvement_unclear: true }), line('Pipe fittings', '50.00')],
    charges: [],
    low_confidence_fields: [],
    ...extra,
  };
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
};

/** Stand in for the Anthropic API: each call answers with the next reading in the list. */
export async function mockClaude(context: BrowserContext, readings: Reading[]) {
  const calls: { body: any; key: string | null }[] = [];
  await context.unroute('https://api.anthropic.com/**').catch(() => {});
  await context.route('https://api.anthropic.com/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = request.postDataJSON();
    calls.push({ body, key: (await request.headerValue('authorization')) ?? (await request.headerValue('x-api-key')) });
    const next = readings[Math.min(calls.length - 1, readings.length - 1)];
    await route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify({
        id: `msg_${calls.length}`,
        type: 'message',
        role: 'assistant',
        model: body.model,
        stop_reason: 'end_turn',
        stop_sequence: null,
        content: [{ type: 'text', text: JSON.stringify(next) }],
        usage: { input_tokens: 3000, output_tokens: 1000 },
      }),
    });
  });
  return calls;
}

/** A sharp picture of a receipt, made by rendering one. */
export async function receiptImage(browser: Browser): Promise<Buffer> {
  const page = await browser.newPage({ viewport: { width: 600, height: 900 } });
  await page.setContent(`<body style="font:22px monospace;padding:30px;background:#fff">
    <h2>THE HOME DEPOT #1234</h2><p>601 Sprain Rd, Yonkers, NY 10710<br>(914) 555-0100</p><hr>
    <p>WATER HEATER 50 GAL ........ 500.00<br>PIPE FITTINGS ............... 50.00</p><hr>
    <p>SUBTOTAL 550.00<br>SALES TAX 8.875% 48.81<br><b>TOTAL 598.81</b></p><p>VISA ****4821</p></body>`);
  const png = await page.screenshot();
  await page.close();
  return png;
}

export async function importReceipt(page: Page, image: Buffer, name = 'receipt.png') {
  await page.getByTestId('import-input').setInputFiles({ name, mimeType: name.endsWith('.pdf') ? 'application/pdf' : 'image/png', buffer: image });
  await expect(page.getByTestId('capture-sheet')).toBeVisible();
  await page.getByTestId('read-receipt').click();
}

export async function addProperty(page: Page, name: string, type: 'rental' | 'flip') {
  await page.goto('/#/properties');
  await page.getByTestId('add-property').click();
  await page.getByTestId('property-name').fill(name);
  await page.getByTestId('property-type').selectOption(type);
  await page.getByTestId('property-save').click();
  await expect(page.getByTestId('property-list')).toContainText(name);
}

export async function saveKey(page: Page) {
  await page.goto('/#/settings');
  await page.getByTestId('key-input').fill('sk-ant-test-key-1234');
  await page.getByTestId('save-key').click();
  await expect(page.getByTestId('key-status')).toContainText('1234');
}
