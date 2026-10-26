import { test, expect, type Page } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { businessDate } from '@dinerdost/core';

const endpoint = '/api/inventory-tools/count-sheets';
async function register(page: Page) {
  // This spec creates synthetic tenants and must never run against a retained/live deployment.
  expect(process.env.QA_BASE_URL, 'Use isolated local QA only').toBeFalsy();
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': '10.' + [...randomBytes(3)].join('.') });
  await page.goto('/signup');
  for (const [name, value] of [['Your name', 'Sheet QA'], ['Restaurant name', 'Sheet QA'], ['First outlet', 'Main'], ['Email', `sheets-${randomUUID()}@example.test`], ['Password', randomBytes(24).toString('base64url')]]) await page.getByLabel(name, { exact: true }).fill(value);
  await page.getByLabel('Add a sample menu and 12 tables').press('Space');
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.waitForURL('**/app/overview');
  return (await page.request.get('/api/workspace')).json();
}
async function command(page: Page, action: string, input: unknown) {
  const reply = await page.request.post('/api/commands', { headers: { Origin: new URL(page.url()).origin, 'Idempotency-Key': randomUUID() }, data: { action, input } });
  const body = await reply.json(); expect(reply.ok(), JSON.stringify(body)).toBe(true); return body;
}
async function download(page: Page) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download count sheet', exact: true }).click();
  return readFile((await (await pending).path())!, 'utf8');
}
function fill(csv: string, values: string[]) {
  return csv.split('\r\n').map((row, n) => n ? row.replace(/""$/, `"${values[n - 1] ?? ''}"`) : row).join('\r\n');
}
async function upload(page: Page, csv: string) {
  await page.getByLabel('Completed count sheet').setInputFiles({ name: 'counts.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await page.getByRole('button', { name: 'Preview import', exact: true }).click();
}

for (const phone of [false, true]) test(`PP21 ${phone ? 'phone' : 'desktop'} download, print, invalid-file preview and confirmed zero count preserve balances`, async ({ page }) => {
  const w = await register(page), tag = 'Sheet ' + randomUUID().slice(0, 6);
  const stock = await command(page, 'ingredient', { outletId: w.outletId, name: tag + ' A flour', unit: 'kg' });
  await command(page, 'ingredient', { outletId: w.outletId, name: tag + ' B salt', unit: 'kg' });
  await command(page, 'receipt', { ingredientId: stock.id, batchNumber: randomUUID(), quantityMilli: 2000, unitCost: 1000, reference: 'Synthetic sheet QA', expiresAt: new Date(Date.now() + 172800000).toISOString() });
  if (phone) await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app/inventory?view=counts');
  await page.getByLabel('Search daily stock', { exact: true }).fill(tag);
  await expect(page.getByRole('row').filter({ hasText: tag + ' A flour' })).toBeVisible();
  await page.getByRole('button', { name: 'Count sheets', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Count sheets', exact: true });
  await expect(dialog).toContainText('2 items');
  const csv = await download(page);
  expect(csv).toContain('"Recorded count","Count"');
  expect(csv.trim().endsWith(',""')).toBe(true);
  const popup = page.waitForEvent('popup');
  await dialog.getByRole('link', { name: 'Print count sheet', exact: true }).click();
  const print = await popup;
  if (phone) await print.setViewportSize({ width: 390, height: 844 });
  await expect(print.getByRole('heading', { name: 'Opening stock count sheet' })).toBeVisible();
  await expect(print.locator('tbody tr')).toHaveCount(2);
  await expect(print.locator('tbody tr').first().locator('td').nth(2)).toBeEmpty();
  expect(await print.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await print.emulateMedia({ media: 'print' });
  await expect(print.getByRole('button', { name: 'Print count sheet' })).toBeHidden();
  await print.screenshot({ path: `verification/pp21-print-${phone ? 'phone' : 'desktop'}.png`, fullPage: true });
  await print.close();
  await upload(page, fill(csv, ['=1+1', '']));
  await expect(dialog.getByRole('alert')).toContainText('Row 2');
  await expect(dialog.getByRole('button', { name: 'Confirm and record counts' })).toHaveCount(0);
  await upload(page, fill(csv, ['0', '']));
  await expect(dialog.getByRole('status').filter({ hasText: 'counts to record' })).toContainText('1 counts to record · 1 blank rows skipped');
  await page.getByLabel('Count import correction reason').fill('Physical observation');
  await expect(dialog.getByRole('button', { name: 'Confirm and record counts' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Preview import', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Confirm and record counts' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await dialog.getByRole('button', { name: 'Confirm and record counts' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `verification/pp21-preview-${phone ? 'phone' : 'desktop'}.png` });
  await dialog.getByRole('button', { name: 'Confirm and record counts' }).click();
  await expect(dialog.getByRole('status').filter({ hasText: 'Counts recorded.' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.locator('#daily-stock-counts').getByRole('row').filter({ hasText: tag + ' A flour' })).toContainText('v1');
  await expect(page.locator('#daily-stock-counts').getByRole('row').filter({ hasText: tag + ' B salt' })).toContainText('Not counted');
  const after = await (await page.request.get('/api/workspace')).json();
  expect(Number(after.ingredients.find((i: { id: string }) => i.id === stock.id).on_hand)).toBe(2000);
  // Historical display has sheets but never an import button.
  await page.getByLabel('Count business date').fill('2020-01-01');
  await page.getByRole('button', { name: 'Count sheets', exact: true }).click();
  await expect(page.getByLabel('Completed count sheet')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toContainText('read-only');
});

test('PP21 stale confirmation fails atomically and HTTP auth, origin and payload guards remain enforced', async ({ page, browser }) => {
  const w = await register(page), tag = 'Stale ' + randomUUID().slice(0, 6);
  const a = await command(page, 'ingredient', { outletId: w.outletId, name: tag + ' A', unit: 'kg' });
  await command(page, 'ingredient', { outletId: w.outletId, name: tag + ' B', unit: 'kg' });
  await page.goto('/app/inventory?view=counts');
  await page.getByLabel('Search daily stock', { exact: true }).fill(tag);
  await expect(page.getByRole('row').filter({ hasText: tag + ' A' })).toBeVisible();
  await page.getByRole('button', { name: 'Count sheets', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('2 items');
  const csv = fill(await download(page), ['1', '2']);
  await upload(page, csv);
  await expect(dialog.getByRole('button', { name: 'Confirm and record counts' })).toBeVisible();
  await command(page, 'stockCounts', { outletId: w.outletId, date: businessDate(), phase: 'OPENING', counts: [{ ingredientId: a.id, quantityMilli: 3000, version: 0 }] });
  await dialog.getByRole('button', { name: 'Confirm and record counts' }).click();
  await expect(dialog.getByRole('alert')).toContainText('nothing was imported');
  await expect(dialog.getByRole('button', { name: 'Confirm and record counts' })).toHaveCount(0);
  const report = await (await page.request.get('/api/stock-counts?' + new URLSearchParams({ outletId: w.outletId, search: tag }))).json();
  expect(report.items.find((i: { id: string }) => i.id === a.id).opening.quantityMilli).toBe(3000);
  expect(report.items.find((i: { id: string }) => i.id !== a.id).opening).toBeNull();
  const input = { outletId: w.outletId, date: businessDate(), phase: 'OPENING', csv };
  expect((await page.request.post(endpoint, { headers: { Origin: 'https://unrelated.example' }, data: { action: 'preview', input } })).status()).toBe(403);
  expect((await page.request.post(endpoint, { headers: { Origin: new URL(page.url()).origin }, data: 'x'.repeat(2 * 1024 * 1024 + 1) })).status()).toBe(413);
  const anon = await browser.newContext();
  expect((await anon.request.get(new URL(endpoint + '?' + new URLSearchParams({ outletId: w.outletId, date: businessDate(), phase: 'OPENING' }), page.url()).href)).status()).toBe(401);
  await anon.close();
});
