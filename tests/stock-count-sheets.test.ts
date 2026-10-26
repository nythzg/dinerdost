import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createEmbeddedDatabase, type Database } from '@dinerdost/database';
import { businessDate, type Actor } from '@dinerdost/core';
import * as s from '@dinerdost/services';

let db: Database, owner: Actor, outletId: string;
const key = () => randomUUID();
const base = (phase = 'OPENING') => ({ outletId, date: businessDate(), phase });
before(async () => {
  // Always isolated in-memory QA, even when the parent shell has production env vars.
  db = await createEmbeddedDatabase();
  await db.migrate();
  const signup = await s.signup(db, { name: 'Sheet QA', email: 'sheets@example.test', password: 'sheet-qa-password-123', restaurant: 'Sheet QA', outlet: 'Main', demo: false, qrEnabled: true }, 'sheet-qa');
  owner = await s.authenticate(db, signup.token);
  outletId = (await s.workspace(db, owner)).outletId;
});
after(async () => { await db?.close(); });

async function fixture(tag: string, size = 2) {
  const ids: string[] = [];
  for (let n = 0; n < size; n++) ids.push((await s.addIngredient(db, owner, key(), { outletId, name: `${tag} ${n}`, unit: 'kg' })).id);
  const sheet = await s.stockCountSheet(db, owner, { ...base(), search: tag });
  return { ids, sheet };
}
// The template intentionally contains a blank last cell. Keep its quoted CSV identity intact.
function fill(csv: string, values: (string | null)[]) {
  let index = 0;
  return csv.split('\r\n').map((line, n) => n && line ? line.replace(/""$/, `"${values[index++] ?? ''}"`) : line).join('\r\n');
}
async function snapshot() {
  return db.transaction(owner.restroId, async tx => {
    const result: Record<string, unknown> = {};
    for (const table of ['stock_batches', 'stock_movements', 'invoices', 'payment_attempts']) result[table] = (await tx.query(`SELECT * FROM ${table} ORDER BY id`)).rows;
    return result;
  });
}
const rejects = (operation: Promise<unknown>, pattern: RegExp) => assert.rejects(operation, pattern);

test('PP21 previews zero and blanks, then records once without changing stock or financial history', async () => {
  const { sheet, ids } = await fixture('Sheet zero');
  await s.receiveStock(db, owner, key(), { ingredientId: ids[0], batchNumber: key(), quantityMilli: 10000, unitCost: 500, reference: 'Synthetic count sheet receipt', expiresAt: new Date(Date.now() + 172800000).toISOString() }, true);
  const dish = (await s.saveMenu(db, owner, key(), { outletId, name: 'Sheet preservation dish', category: 'Food', price: 10000, taxBps: 0, station: 'Sheet kitchen', recipe: [{ id: ids[0], quantityMilli: 1000 }] })).id;
  let order = await s.createRound(db, owner, key(), { outletId, type: 'TAKEAWAY', items: [{ itemId: dish, quantity: 1 }], customer: { name: 'Sheet guest', phone: '9123456710' } }, true);
  order = (await s.recordPayment(db, owner, key(), order.id, order.rounds[0].id, { version: order.rounds[0].version, method: 'CASH', amount: Number(order.rounds[0].payable) }, true)).order;
  await s.completePreparedService(db, owner, key(), order.id, order.rounds[0].id, { version: order.rounds[0].version, confirmedPreparedAndServed: true });
  await s.generateBill(db, owner, key(), order.id, { final: true });
  const before = await snapshot();
  const input = { ...base(), csv: fill(sheet.csv, ['0', null]), note: '' };
  const preview = await s.previewStockCountImport(db, owner, input);
  assert.equal(preview.valid, true);
  assert.equal(preview.skipped, 1);
  assert.equal(preview.rows[0].quantityMilli, 0);
  assert.equal((await s.stockCountReport(db, owner, { outletId, date: businessDate(), search: 'Sheet zero' })).items.filter(i => i.opening).length, 0);
  const requestKey = key(), confirmed = { ...input, previewToken: preview.previewToken };
  const saved = await s.importStockCountSheet(db, owner, requestKey, confirmed);
  assert.deepEqual(await s.importStockCountSheet(db, owner, requestKey, confirmed), saved);
  assert.equal(saved.counts.length, 1);
  const report = await s.stockCountReport(db, owner, { outletId, date: businessDate(), search: 'Sheet zero' });
  assert.equal(report.items.find(i => i.id === ids[0])!.opening!.quantityMilli, 0);
  assert.equal(report.items.find(i => i.id === ids[1])!.opening, null);
  assert.deepEqual(await snapshot(), before);
});

test('PP21 sheets include authorized rows beyond screen pagination; a 101-row import is atomic', async () => {
  const { sheet } = await fixture('Sheet bulk', 101);
  assert.equal(sheet.items.length, 101);
  const input = { ...base(), csv: fill(sheet.csv, Array(101).fill('1.125')), note: '' };
  const preview = await s.previewStockCountImport(db, owner, input);
  assert.equal(preview.rows.length, 101);
  assert.equal((await s.importStockCountSheet(db, owner, key(), { ...input, previewToken: preview.previewToken })).counts.length, 101);
  const manual = sheet.items.map(i => ({ ingredientId: i.ingredientId, quantityMilli: 0, version: 1 }));
  await rejects(s.recordStockCounts(db, owner, key(), { ...base(), counts: manual, note: 'Manual guard' }), /100/);
});

test('PP21 stale preview and edited file reject the whole batch with no partial rows or audits', async () => {
  const { sheet, ids } = await fixture('Sheet stale');
  const input = { ...base(), csv: fill(sheet.csv, ['2', '3']), note: '' };
  const preview = await s.previewStockCountImport(db, owner, input);
  await s.recordStockCounts(db, owner, key(), { ...base(), counts: [{ ingredientId: ids[1], quantityMilli: 4000, version: 0 }] });
  const auditBefore = (await db.query('SELECT * FROM audit_events ORDER BY id')).rows;
  await rejects(s.importStockCountSheet(db, owner, key(), { ...input, previewToken: preview.previewToken }), /preview|changed|stale/i);
  assert.deepEqual((await db.query('SELECT * FROM audit_events ORDER BY id')).rows, auditBefore);
  const report = await s.stockCountReport(db, owner, { outletId, search: 'Sheet stale' });
  assert.equal(report.items.find(i => i.id === ids[0])!.opening, null);
  assert.equal(report.items.find(i => i.id === ids[1])!.opening!.quantityMilli, 4000);
  const fresh = await s.stockCountSheet(db, owner, { ...base(), search: 'Sheet stale' });
  const valid = { ...base(), csv: fill(fresh.csv, ['2', null]), note: '' };
  const again = await s.previewStockCountImport(db, owner, valid);
  await rejects(s.importStockCountSheet(db, owner, key(), { ...valid, csv: fill(fresh.csv, ['8', null]), previewToken: again.previewToken }), /preview|changed/i);
});

test('PP21 enforces correction reasons, closing prerequisites and immutable opening after closing', async () => {
  const { sheet } = await fixture('Sheet phases', 1);
  const confirm = async (csv: string, phase = 'OPENING', note = '') => {
    const input = { ...base(phase), csv, note }, p = await s.previewStockCountImport(db, owner, input);
    assert.equal(p.valid, true, JSON.stringify(p.errors));
    return s.importStockCountSheet(db, owner, key(), { ...input, previewToken: p.previewToken });
  };
  const early = await s.stockCountSheet(db, owner, { ...base('CLOSING'), search: 'Sheet phases' });
  assert.equal((await s.previewStockCountImport(db, owner, { ...base('CLOSING'), csv: fill(early.csv, ['1']) })).valid, false);
  await confirm(fill(sheet.csv, ['1']));
  const correction = await s.stockCountSheet(db, owner, { ...base(), search: 'Sheet phases' });
  assert.equal((await s.previewStockCountImport(db, owner, { ...base(), csv: fill(correction.csv, ['2']) })).valid, false);
  await confirm(fill(correction.csv, ['2']), 'OPENING', 'Recounted bags');
  const closing = await s.stockCountSheet(db, owner, { ...base('CLOSING'), search: 'Sheet phases' });
  await confirm(fill(closing.csv, ['0.5']), 'CLOSING');
  const locked = await s.stockCountSheet(db, owner, { ...base(), search: 'Sheet phases' });
  assert.equal((await s.previewStockCountImport(db, owner, { ...base(), csv: fill(locked.csv, ['3']), note: 'Another recount' })).valid, false);
});

test('PP21 preview reports invalid quantities, units, identities, dates, duplicates and malformed CSV without writes', async () => {
  const { sheet } = await fixture('Sheet invalid', 1);
  for (const value of ['-1', '1.0001', '=1+1', '1e2', 'NaN', '1000000.001']) {
    const p = await s.previewStockCountImport(db, owner, { ...base(), csv: fill(sheet.csv, [value]) });
    assert.equal(p.valid, false, value);
    assert.ok(p.errors.length);
  }
  const csv = fill(sheet.csv, ['1']);
  for (const broken of [csv.replace('"kg"', '"g"'), csv.replace(sheet.items[0].ingredientId, randomUUID()), csv.replace(businessDate(), '2020-01-01'), csv + '\r\n' + csv.split('\r\n')[1], csv + '"', csv.replace('"Count"', '"Other"')]) {
    const p = await s.previewStockCountImport(db, owner, { ...base(), csv: broken });
    assert.equal(p.valid, false, broken);
  }
  assert.equal((await s.previewStockCountImport(db, owner, { ...base(), csv: sheet.csv })).valid, false);
  await rejects(s.previewStockCountImport(db, owner, { ...base(), date: '2020-01-01', csv }), /today|read-only/i);
  await rejects(s.previewStockCountImport(db, owner, { ...base(), csv: 'x'.repeat(1024 * 1024 + 1) }), /large|1048576/i);
});

test('PP21 requires existing inventory/outlet/web permissions and honors BAR stream and retired items', async () => {
  const { sheet, ids } = await fixture('Sheet access');
  await rejects(s.stockCountSheet(db, { ...owner, role: 'WAITER' }, base()), /permission|access|allowed|role/i);
  await rejects(s.stockCountSheet(db, { ...owner, outletIds: [], role: 'MANAGER' }, base()), /outlet|access/i);
  await rejects(s.stockCountSheet(db, { ...owner, application: 'POS' }, base()), /web|application/i);
  const barId = (await s.addIngredient(db, owner, key(), { outletId, name: 'Sheet access liquor', unit: 'L', category: 'LIQUOR' })).id;
  const bar = { ...owner, role: 'BARTENDER' as const };
  const barSheet = await s.stockCountSheet(db, bar, { ...base(), search: 'Sheet access' });
  assert.deepEqual(barSheet.items.map(i => i.ingredientId), [barId]);
  assert.equal((await s.previewStockCountImport(db, bar, { ...base(), csv: fill(sheet.csv, ['1', null]) })).valid, false);
  await db.transaction(owner.restroId, tx => tx.query('UPDATE ingredients SET retired_at=now() WHERE id=$1', [ids[0]]));
  assert.equal((await s.previewStockCountImport(db, owner, { ...base(), csv: fill(sheet.csv, ['1', null]) })).valid, false);
});

test('PP21 safely round-trips quoted multiline spreadsheet names, BOM and CRLF', async () => {
  const name = '=Sheet "formula",\nline';
  const id = (await s.addIngredient(db, owner, key(), { outletId, name, unit: 'kg' })).id;
  const sheet = await s.stockCountSheet(db, owner, { ...base(), search: '=Sheet' });
  assert.ok(sheet.csv.includes("'=Sheet"));
  const csv = '\uFEFF' + sheet.csv.replace(/""$/, '"1.25"');
  const p = await s.previewStockCountImport(db, owner, { ...base(), csv });
  assert.equal(p.valid, true, JSON.stringify(p.errors));
  assert.equal(p.rows[0].ingredientId, id);
  assert.equal(p.rows[0].quantityMilli, 1250);
});

test('PP21 concurrent imports append exactly one observation set and platform inventory flags gate preview and commit', async () => {
  const { sheet } = await fixture('Sheet concurrent');
  const input = { ...base(), csv: fill(sheet.csv, ['1', '0']) };
  const p = await s.previewStockCountImport(db, owner, input);
  const outcomes = await Promise.allSettled([1, 2].map(() => s.importStockCountSheet(db, owner, key(), { ...input, previewToken: p.previewToken })));
  assert.equal(outcomes.filter(value => value.status === 'fulfilled').length, 1);
  assert.equal((await s.stockCountReport(db, owner, { outletId, search: 'Sheet concurrent' })).items.filter(item => item.opening?.version === 1).length, 2);
  const blocked = await fixture('Sheet disabled', 1), payload = { ...base(), csv: fill(blocked.sheet.csv, ['1']) };
  const prior = await s.previewStockCountImport(db, owner, payload);
  const flagId = key();
  await db.query("INSERT INTO platform_records(id,kind,name,tenant_id,data) VALUES($1,'FEATURE_CONTROL','Sheet test',$2,'{\"inventory\":false}'::jsonb)", [flagId, owner.restroId]);
  try {
    for (const operation of [() => s.stockCountSheet(db, owner, base()), () => s.previewStockCountImport(db, owner, payload), () => s.importStockCountSheet(db, owner, key(), { ...payload, previewToken: prior.previewToken })]) await assert.rejects(operation(), { code: 'FEATURE_DISABLED' });
  } finally { await db.query('DELETE FROM platform_records WHERE id=$1', [flagId]); }
  assert.equal((await s.stockCountReport(db, owner, { outletId, search: 'Sheet disabled' })).items[0].opening, null);
});

test('PP21 sheet search matches the count report literally for percent, underscore and backslash', async () => {
  for (const [needle, other] of [['Sheet literal%', 'Sheet literalOther'], ['Sheet underscore_', 'Sheet underscoreX'], ['Sheet slash\\path', 'Sheet slashpath']]) {
    await s.addIngredient(db, owner, key(), { outletId, name: needle, unit: 'kg' });
    await s.addIngredient(db, owner, key(), { outletId, name: other, unit: 'kg' });
    const report = await s.stockCountReport(db, owner, { outletId, search: needle });
    const sheet = await s.stockCountSheet(db, owner, { ...base(), search: needle });
    assert.deepEqual(sheet.items.map(i => i.ingredientId), report.items.map(i => i.id));
    assert.equal(sheet.items.length, 1);
  }
});
