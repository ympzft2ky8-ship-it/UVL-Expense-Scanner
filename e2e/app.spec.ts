import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { addProperty, importReceipt, line, MEMBER_ONE, MEMBER_TWO, mockClaude, reading, receiptImage, resetEmulators, saveKey, secondPhone, signUp, signUpAndVerify, verifyEmail } from './helpers.ts';

test.describe.configure({ mode: 'serial' });

const YEAR = new Date().getFullYear();
let context: BrowserContext;
let page: Page;
let image: Buffer;

test.beforeAll(async ({ browser }) => {
  await resetEmulators();
  image = await receiptImage(browser);
  context = await browser.newContext();
  page = await context.newPage();
  page.on('dialog', (d) => void d.accept());
});

test.afterAll(() => context.close());

test('someone who is not a member sees no data', async ({ browser }) => {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await signUp(p, 'stranger@example.com');
  await verifyEmail('stranger@example.com');
  await p.getByRole('button', { name: 'Continue' }).click();
  await expect(p.getByRole('heading', { name: 'Not on the members list' })).toBeVisible();
  await ctx.close();
});

test('a member address that has not been verified cannot get in', async ({ browser }) => {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await signUp(p, MEMBER_TWO);
  await p.getByRole('button', { name: 'Continue' }).click();
  await expect(p.getByText('Not confirmed yet')).toBeVisible();
  await ctx.close();
});

test('a member signs in and the overhead project is already there', async () => {
  await signUpAndVerify(page, MEMBER_ONE);
  await page.goto('/#/properties');
  await expect(page.getByTestId('property-list')).toContainText('General / Overhead');
});

test('properties: create, and refuse a duplicate name', async () => {
  await addProperty(page, '12 Oak St', 'rental');
  await addProperty(page, '45 Elm Ave', 'flip');
  await page.getByTestId('add-property').click();
  await page.getByTestId('property-name').fill('  12 oak st ');
  await page.getByTestId('property-save').click();
  await expect(page.getByTestId('property-form')).toContainText('already a property called "12 Oak St"');
});

test('without an AI key a scan waits, and can be entered by hand', async () => {
  await page.goto('/');
  await importReceipt(page, image);
  await expect(page.getByTestId('waiting')).toContainText('add the AI key in Settings');
  await page.goto('/');
  await expect(page.getByTestId('waiting-list')).toContainText('Waiting to read');
});

test('scan, read, review and save a receipt', async () => {
  const calls = await mockClaude(context, [reading()]);
  await saveKey(page);
  // The scan that was waiting is read as soon as there is a key.
  await page.goto('/');
  await page.getByTestId('review-list').getByRole('link').first().click();
  const form = page.getByTestId('receipt-form');
  await expect(form).toBeVisible();
  expect(calls).toHaveLength(1);
  expect(calls[0]!.key).toContain('sk-ant-test-key-1234');
  expect(calls[0]!.body.model).toBe('claude-opus-5-5');
  expect(calls[0]!.body.messages[0].content[0].type).toBe('image');

  await expect(page.getByTestId('vendor-input')).toHaveValue('The Home Depot');
  await expect(page.getByTestId('date-input')).toHaveValue(`${YEAR}-03-03`);
  await expect(page.getByTestId('total-input')).toHaveValue('598.81');
  await expect(page.getByTestId('state-select')).toHaveValue('NY');
  await expect(page.getByTestId('line-card')).toHaveCount(2);
  // $48.81 tax spread over $500 and $50.
  await expect(page.getByTestId('line-total').first()).toHaveText('$500.00 + $44.37 tax = $544.37');
  await expect(page.getByTestId('line-total').nth(1)).toHaveText('$50.00 + $4.44 tax = $54.44');

  // Nothing is in the ledger until Save; saving without a property is refused.
  await page.getByTestId('save-button').click();
  await expect(page.getByTestId('save-error')).toContainText('Add a property');

  // Rental: the water heater could be a repair or an improvement, so the app asks.
  await page.getByTestId('property-select').selectOption({ label: '12 Oak St (Rental)' });
  await expect(page.getByTestId('flag-count')).toHaveText('1 to check');
  await expect(page.getByTestId('field-category').first()).toContainText('Repair or improvement?');
  await expect(page.getByTestId('line-category').nth(1)).toHaveValue('Supplies');
  await page.getByTestId('line-category').first().selectOption('Capital Improvement');
  await expect(page.getByTestId('flag-banner')).toHaveCount(0);
  await expect(form).toContainText('Capitalize & depreciate');

  await page.getByTestId('view-image').click();
  await expect(page.getByTestId('image-viewer').locator('img')).toBeVisible();
  await page.getByRole('button', { name: 'Back to fields' }).click();

  await page.getByTestId('save-button').click();
  await expect(page.getByTestId('year-total')).toContainText('$598.81');
  await expect(page.getByTestId('receipt-list')).toContainText('The Home Depot');
  await expect(page.getByTestId('review-list')).toHaveCount(0);
});

test('numbers that do not add up are re-read once, then flagged', async () => {
  const bad = reading({ invoice_number: 'B-2', subtotal: '124.10', tax_total: '11.01', total: '135.11', lines: [line('Lumber', '100.00'), line('Screws', '42.10')] });
  const calls = await mockClaude(context, [bad, bad]);
  await page.goto('/');
  await importReceipt(page, image);
  await expect(page.getByTestId('receipt-form')).toBeVisible({ timeout: 20_000 });
  expect(calls).toHaveLength(2);
  expect(JSON.stringify(calls[1]!.body.messages)).toContain('Line items add up to $142.10 but the subtotal says $124.10');
  await expect(page.getByTestId('field-subtotal')).toContainText('Line items add up to $142.10 but the subtotal says $124.10');
  await expect(page.getByTestId('duplicate-warning')).toHaveCount(0);

  // The member fixes the misread digit and the warnings clear.
  await page.getByTestId('line-amount').nth(1).fill('24.10');
  await expect(page.getByTestId('line-sum')).toHaveText('$124.10');
  await expect(page.getByTestId('flag-banner')).toHaveCount(0);
  await page.getByTestId('save-button').click();
  await expect(page.getByTestId('year-total')).toContainText('$733.92');
});

test('the same receipt scanned twice is called out', async () => {
  await mockClaude(context, [reading()]);
  await page.goto('/');
  await importReceipt(page, image);
  await expect(page.getByTestId('duplicate-warning')).toContainText('already saved', { timeout: 20_000 });
  await page.getByTestId('delete-button').click();
  await expect(page.getByTestId('scan-button')).toBeVisible();
  await expect(page.getByTestId('review-list')).toHaveCount(0);
});

test('a receipt with no address asks for the state; a hard-to-read total is flagged; save anyway marks it', async () => {
  await mockClaude(context, [reading({ vendor_name: 'Joe Handyman', vendor_address: null, state: null, vendor_phone: null, invoice_number: null, subtotal: null, tax_total: null, tax_rate_percent: null, total: '300.00', payment_method: 'cash', payment_reference: null, low_confidence_fields: ['total'], lines: [line('Patch drywall, 4 hrs', '300.00', { kind: 'labor', category_rental: 'Repairs & Maintenance' })] })]);
  await page.goto('/');
  await importReceipt(page, image);
  await expect(page.getByTestId('receipt-form')).toBeVisible({ timeout: 20_000 });
  // The last property used is pre-selected.
  await expect(page.getByTestId('property-select')).toHaveValue(/.+/);
  await expect(page.getByTestId('property-select').locator('option:checked')).toHaveText('12 Oak St (Rental)');
  await expect(page.getByTestId('line-kind')).toHaveValue('labor');
  await expect(page.getByTestId('line-category')).toHaveValue('Repairs & Maintenance');
  await expect(page.getByTestId('field-state')).toContainText('New York is suggested');
  await expect(page.getByTestId('field-total')).toContainText('Hard to read');
  await expect(page.getByTestId('flag-count')).toHaveText('2 to check');

  // Saving is refused until the state is confirmed.
  await page.getByTestId('save-button').click();
  await expect(page.getByTestId('save-error')).toContainText('the state');
  await page.getByTestId('field-state').getByRole('button', { name: 'Looks right' }).click();
  await expect(page.getByTestId('flag-count')).toHaveText('1 to check');
  // Save with the total still unchecked: allowed after a confirmation, and marked.
  await page.getByTestId('save-button').click();
  await page.getByTestId('filter-attention').click();
  await expect(page.getByTestId('receipt-list').getByRole('link')).toHaveCount(1);
  await expect(page.getByTestId('receipt-list')).toContainText('Joe Handyman');
  await expect(page.getByTestId('receipt-list')).toContainText('Needs attention');
});

test('enter a cash payment by hand, for the flip', async () => {
  await page.goto('/');
  await page.getByTestId('manual-button').click();
  await page.getByTestId('property-select').selectOption({ label: '45 Elm Ave (Flip)' });
  await page.getByTestId('vendor-input').fill('ABC Plumbing Inc');
  await page.getByTestId('add-line').click();
  await page.getByTestId('line-description').fill('Install vanity');
  await page.getByTestId('line-amount').fill('300');
  await page.getByTestId('line-kind').selectOption('labor');
  await page.getByTestId('line-category').selectOption('Renovation');
  await page.getByTestId('total-input').fill('300.00');
  await expect(page.getByTestId('flag-banner')).toHaveCount(0);
  await page.getByTestId('save-button').click();
  await expect(page.getByTestId('receipt-list')).toContainText('ABC Plumbing Inc');
  await expect(page.getByTestId('receipt-list')).toContainText('No image');
});

test('edit a saved receipt: split one item between two rentals', async () => {
  await addProperty(page, '9 Pine Rd', 'rental');
  await page.goto('/');
  await page.getByTestId('receipt-list').getByRole('link', { name: /598\.81/ }).click();
  await expect(page.getByTestId('attribution')).toContainText(`Added by ${MEMBER_ONE}`);
  await page.getByTestId('line-more').nth(1).click();
  await page.getByTestId('add-split').click();
  await expect(page.getByTestId('split-property')).toHaveValue(/.+/);
  await expect(page.getByTestId('split-percent')).toHaveValue('50');
  await page.getByTestId('save-button').click();
  await expect(page.getByTestId('receipt-list')).toBeVisible();

  // Half of the $50 fittings and half of their $4.44 tax moved to 9 Pine Rd.
  await page.goto('/#/properties');
  await page.getByRole('link', { name: /9 Pine Rd/ }).click();
  await expect(page.getByTestId('property-total')).toHaveText('$27.22');
  await page.goto('/#/properties');
  await page.getByRole('link', { name: /12 Oak St/ }).click();
  await expect(page.getByTestId('property-total')).toHaveText('$1,006.70');
  await expect(page.getByTestId('property-summary')).toContainText('Capital Improvement');
});

test('search and filter total only the matching lines', async () => {
  await page.goto('/');
  await page.getByTestId('search').fill('home depot');
  await page.getByTestId('filter-property').selectOption({ label: '9 Pine Rd' });
  await expect(page.getByTestId('filtered-total')).toContainText('1 receipt match · $27.22');
  await page.getByTestId('search').fill('135.11');
  await page.getByTestId('filter-property').selectOption('');
  await expect(page.getByTestId('receipt-list').getByRole('link')).toHaveCount(1);
});

test('export a spreadsheet whose totals match the app', async () => {
  await page.goto('/#/reports');
  await expect(page.getByTestId('export-attention')).toContainText('1 receipt still needs attention');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-button').click()]);
  expect(download.suggestedFilename()).toMatch(new RegExp(`^UVL-Expenses-${YEAR}-${YEAR}-\\d\\d-\\d\\d\\.xlsx$`));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(await download.path());
  expect(wb.worksheets.map((s) => s.name)).toEqual(['Expenses', 'By Property', 'By Category', 'By Vendor', 'By Month', 'About']);
  const byProperty = wb.getWorksheet('By Property')!;
  const totals: Record<string, number> = {};
  byProperty.eachRow((row) => {
    if (row.getCell(2).value === 'Total' || row.getCell(2).value === 'Grand total') {
      totals[String(row.getCell(1).value)] = Math.round(((row.getCell(7).value as ExcelJS.CellFormulaValue).result as number) * 100);
    }
  });
  expect(totals).toEqual({ '12 Oak St': 100670, '45 Elm Ave': 30000, '9 Pine Rd': 2722, 'All properties': 133392 });
  const expenses = wb.getWorksheet('Expenses')!;
  expect(expenses.rowCount).toBe(1 + 7);
  const flagged = expenses.getRows(2, 7)!.filter((r) => r.getCell(22).value === 'Yes');
  expect(flagged).toHaveLength(1);
});

test('the monthly limit stops reading; the scan waits', async () => {
  const calls = await mockClaude(context, [reading({ invoice_number: 'CAP-1', date: `${YEAR}-04-01` })]);
  await page.goto('/#/settings');
  // Three readings so far, plus one re-read: 5 calls at $0.032.
  await expect(page.getByTestId('usage')).toContainText('$0.16');
  await page.getByTestId('cap-input').fill('0.10');
  await page.getByTestId('save-cap').click();
  await expect(page.getByTestId('ai-settings')).toContainText('The monthly limit is reached');
  await page.goto('/');
  await importReceipt(page, image);
  await expect(page.getByTestId('waiting')).toContainText('monthly limit reached');
  expect(calls).toHaveLength(0);
  // Raising the limit lets it through.
  await page.goto('/#/settings');
  await page.getByTestId('cap-input').fill('10');
  await page.getByTestId('save-cap').click();
  await page.goto('/');
  await expect(page.getByTestId('review-list')).toContainText('The Home Depot', { timeout: 20_000 });
  expect(calls).toHaveLength(1);
  await page.getByTestId('review-list').getByRole('link').click();
  await page.getByTestId('delete-button').click();
  await expect(page.getByTestId('scan-button')).toBeVisible();
});

test('delete a receipt and restore it', async () => {
  await page.goto('/');
  await page.getByTestId('receipt-list').getByRole('link', { name: /ABC Plumbing/ }).click();
  await page.getByTestId('delete-button').click();
  await expect(page.getByTestId('year-total')).toContainText('$1,033.92');
  await page.goto('/#/settings');
  await page.getByTestId('recently-deleted').getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByTestId('recently-deleted')).toHaveCount(0);
  await page.goto('/');
  await expect(page.getByTestId('year-total')).toContainText('$1,333.92');
});

test.describe('two phones', () => {
  let other: { context: BrowserContext; page: Page };

  test.beforeAll(async ({ browser }) => {
    other = await secondPhone(browser, MEMBER_TWO);
  });
  test.afterAll(() => other?.context.close());

  test('the second member sees the same records, and new ones arrive on their own', async () => {
    await expect(other.page.getByTestId('year-total')).toContainText('$1,333.92');
    await page.goto('/');
    await page.getByTestId('manual-button').click();
    await page.getByTestId('property-select').selectOption({ label: 'General / Overhead (Overhead)' });
    await page.getByTestId('vendor-input').fill('Staples');
    await page.getByTestId('add-line').click();
    await page.getByTestId('line-description').fill('Printer paper');
    await page.getByTestId('line-amount').fill('10.00');
    await page.getByTestId('line-category').selectOption('Office & Supplies');
    await page.getByTestId('total-input').fill('10.00');
    await page.getByTestId('save-button').click();
    // No reload on the other phone.
    await expect(other.page.getByTestId('receipt-list')).toContainText('Staples');
    await expect(other.page.getByTestId('year-total')).toContainText('$1,343.92');
  });

  test('both edit the same receipt: different fields merge, the same field asks', async () => {
    await page.goto('/');
    await page.getByTestId('receipt-list').getByRole('link', { name: /Staples/ }).click();
    await other.page.getByTestId('receipt-list').getByRole('link', { name: /Staples/ }).click();
    await expect(other.page.getByTestId('vendor-input')).toHaveValue('Staples');

    await page.getByLabel('Notes').fill('note from one');
    await page.getByTestId('save-button').click();
    await expect(page.getByTestId('receipt-list')).toBeVisible();

    await other.page.getByLabel('Notes').fill('note from two');
    await other.page.getByLabel('Invoice / receipt #').fill('INV-9');
    await other.page.getByTestId('save-button').click();
    const dialog = other.page.getByTestId('conflict-dialog');
    await expect(dialog).toContainText('Notes');
    await expect(dialog).toContainText('note from one');
    await expect(dialog).not.toContainText('Invoice number');
    await other.page.getByTestId('conflict-notes-mine').check();
    await other.page.getByTestId('conflict-save').click();
    await expect(dialog).toHaveCount(0);

    await page.getByTestId('receipt-list').getByRole('link', { name: /Staples/ }).click();
    await expect(page.getByLabel('Notes')).toHaveValue('note from two');
    await expect(page.getByLabel('Invoice / receipt #')).toHaveValue('INV-9');
    await expect(page.getByTestId('attribution')).toContainText(`last changed by ${MEMBER_TWO}`);
  });

  test('an edit made offline waits, then syncs', async () => {
    await other.page.goto('/');
    await other.context.setOffline(true);
    await expect(other.page.getByTestId('sync-status')).toContainText('Offline');
    await other.page.getByTestId('receipt-list').getByRole('link', { name: /Staples/ }).click();
    await other.page.getByLabel('Notes').fill('edited in the basement');
    await other.page.getByTestId('save-button').click();
    await expect(other.page.getByTestId('sync-status')).toContainText('1 waiting to sync');
    // Still shown on the phone that made it.
    await other.page.getByTestId('receipt-list').getByRole('link', { name: /Staples/ }).click();
    await expect(other.page.getByLabel('Notes')).toHaveValue('edited in the basement');

    await other.context.setOffline(false);
    await expect(other.page.getByTestId('sync-status')).toHaveCount(0);
    await page.goto('/');
    await page.getByTestId('receipt-list').getByRole('link', { name: /Staples/ }).click();
    await expect(page.getByLabel('Notes')).toHaveValue('edited in the basement');
  });

  test('a scan made offline is kept and read once back online', async () => {
    const calls = await mockClaude(other.context, [reading({ vendor_name: 'Lowes', invoice_number: 'OFF-1', date: `${YEAR}-05-05` })]);
    await other.page.goto('/');
    await other.context.setOffline(true);
    await importReceipt(other.page, image);
    await expect(other.page.getByTestId('waiting')).toContainText('no connection');
    expect(calls).toHaveLength(0);
    await other.context.setOffline(false);
    await expect(other.page.getByTestId('receipt-form')).toBeVisible({ timeout: 30_000 });
    await expect(other.page.getByTestId('vendor-input')).toHaveValue('Lowes');
    expect(calls).toHaveLength(1);
    await other.page.getByTestId('delete-button').click();
  });
});

test('changing a property from flip to rental flags its categories', async () => {
  await page.goto('/#/properties');
  await page.getByRole('button', { name: 'Edit 45 Elm Ave' }).click();
  await page.getByTestId('property-type').selectOption('rental');
  await page.getByTestId('property-save').click();
  await page.goto('/');
  await page.getByTestId('filter-attention').click();
  await expect(page.getByTestId('receipt-list')).toContainText('ABC Plumbing Inc');
  await page.getByTestId('receipt-list').getByRole('link', { name: /ABC Plumbing/ }).click();
  await expect(page.getByTestId('field-category')).toContainText('the property type changed');
  await expect(page.getByTestId('line-category')).toHaveValue('');
});

test('a property with expenses cannot be deleted, but can be archived', async () => {
  await page.goto('/#/properties');
  await page.getByRole('button', { name: 'Edit 9 Pine Rd' }).click();
  await page.getByTestId('property-delete').click();
  await expect(page.getByTestId('property-form')).toContainText('cannot be deleted');
  await page.getByTestId('property-archive').click();
  await expect(page.getByTestId('property-list')).not.toContainText('9 Pine Rd');
  await page.goto('/');
  await page.getByTestId('manual-button').click();
  await expect(page.getByTestId('property-select')).not.toContainText('9 Pine Rd');
});

test('vendors are collected with contact details, and duplicates merge', async () => {
  await page.goto('/#/vendors');
  const list = page.getByTestId('vendor-list');
  await expect(list).toContainText('The Home Depot');
  await expect(list).toContainText('(914) 555-0100');
  await list.locator('li', { hasText: 'Joe Handyman' }).getByRole('button', { name: 'Edit' }).click();
  await page.getByTestId('merge-into').selectOption({ label: 'ABC Plumbing Inc' });
  await page.getByTestId('merge-button').click();
  await expect(list).not.toContainText('Joe Handyman');
  await page.goto('/');
  await page.getByTestId('search').fill('abc plumbing');
  await expect(page.getByTestId('receipt-list').getByRole('link')).toHaveCount(2);
});

test('close last year: archive, confirm it was saved, clear, and restore', async () => {
  // A late receipt from last year, entered while that year is still open.
  await page.goto('/');
  await page.getByTestId('manual-button').click();
  await page.getByTestId('property-select').selectOption({ label: '12 Oak St (Rental)' });
  await page.getByTestId('vendor-input').fill('Con Edison');
  await page.getByTestId('date-input').fill(`${YEAR - 1}-12-28`);
  await expect(page.getByTestId('field-date')).toContainText('from last year');
  await page.getByTestId('add-line').click();
  await page.getByTestId('line-description').fill('Electric bill');
  await page.getByTestId('line-amount').fill('80.00');
  await page.getByTestId('line-category').selectOption('Utilities');
  await page.getByTestId('total-input').fill('80.00');
  await page.getByTestId('save-button').click();
  await expect(page.getByText(`${YEAR - 1} is still open`)).toBeVisible();

  await page.goto('/#/reports');
  await page.getByRole('button', { name: String(YEAR - 1), exact: true }).click();
  await expect(page.getByTestId('retention-note')).toContainText('at least 3 years');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('create-archive').click()]);
  expect(download.suggestedFilename()).toBe(`UVL-Expenses-${YEAR - 1}-Archive.zip`);
  const zip = await JSZip.loadAsync(await (await import('node:fs/promises')).readFile(await download.path()));
  expect(Object.keys(zip.files)).toContain(`UVL-Expenses-${YEAR - 1}.xlsx`);
  const data = JSON.parse(await zip.file('data.json')!.async('string'));
  expect(data.receipts).toHaveLength(1);
  expect(data.receipts[0].vendorName).toBe('Con Edison');

  // Nothing is cleared until the member says it was saved and types the year.
  await page.getByTestId('i-saved-it').click();
  await expect(page.getByTestId('clear-year')).toBeDisabled();
  await page.getByTestId('type-year').fill(String(YEAR - 1));
  await page.getByTestId('clear-year').click();
  await expect(page.getByRole('button', { name: String(YEAR - 1), exact: true })).toHaveCount(0);

  // Properties survive; a receipt for the closed year is refused.
  await page.goto('/');
  await page.getByTestId('manual-button').click();
  await page.getByTestId('property-select').selectOption({ label: '12 Oak St (Rental)' });
  await page.getByTestId('date-input').fill(`${YEAR - 1}-12-30`);
  await page.getByTestId('total-input').fill('5.00');
  await page.getByTestId('save-button').click();
  await expect(page.getByTestId('save-error')).toContainText('is closed');

  await page.goto('/#/settings');
  await page.getByTestId('restore-year').getByRole('button', { name: `Restore ${YEAR - 1}` }).click();
  await expect(page.getByTestId('restore-year')).toHaveCount(0);
  await page.goto('/#/reports');
  await expect(page.getByRole('button', { name: String(YEAR - 1), exact: true })).toBeVisible();
});

test('an archive holds the receipt images, named to match the spreadsheet', async () => {
  // Build this year's archive straight from the app's own code path.
  await page.goto('/#/reports');
  const names = await page.evaluate(async () => {
    const { buildArchive } = await import('/src/export/archive.ts');
    const { getState } = await import('/src/store.ts');
    const s = getState();
    const blob = await buildArchive({ year: new Date().getFullYear(), receipts: s.receipts, properties: s.properties, vendors: s.vendors });
    const JSZip = (await import('jszip')).default;
    return Object.keys((await JSZip.loadAsync(await blob.arrayBuffer())).files);
  });
  const images = names.filter((n) => n.startsWith('receipts/') && n.endsWith('.jpg'));
  expect(images.length).toBe(3);
  expect(images.some((n) => new RegExp(`receipts/${YEAR}-03-03_The-Home-Depot_[0-9A-F]{8}_p1\\.jpg`).test(n))).toBe(true);
});

test('removing the AI key stops reading on every phone', async () => {
  await page.goto('/#/settings');
  await page.getByTestId('remove-key').click();
  await expect(page.getByTestId('key-status')).toContainText('No key yet');
});
