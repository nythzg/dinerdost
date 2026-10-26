// Dedicated real-PostgreSQL QA. Never accepts a remote host or a retained database.
// Start a disposable local PostgreSQL server on 127.0.0.1:55439, then:
// npx tsx --test scripts/verify-pp21-postgres.ts
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createPostgresDatabase, type Database } from '@dinerdost/database';
import { businessDate, type Actor } from '@dinerdost/core';
import * as s from '@dinerdost/services';

const server = new URL(process.env.PP21_QA_SERVER_URL ?? 'postgresql://pp21_qa@127.0.0.1:55439/postgres');
assert.equal(server.protocol, 'postgresql:');
assert.equal(server.hostname, '127.0.0.1', 'Only an isolated loopback QA server is permitted.');
assert.equal(server.port, '55439');
assert.equal(server.pathname, '/postgres');
const databaseName = 'dd_pp21_' + Date.now() + '_' + randomUUID().slice(0, 8);
const admin = new Pool({ connectionString: server.href, max: 1 });
const connection = new URL(server); connection.pathname = '/' + databaseName;
let db: Database, owner: Actor, outletId: string;
const key = () => randomUUID();
const context = () => ({ outletId, date: businessDate(), phase: 'OPENING' as const });
before(async () => {
  assert.match(databaseName, /^dd_pp21_\d+_[a-f0-9]{8}$/);
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  db = createPostgresDatabase(connection.href);
  await db.migrate();
  const auth = await s.signup(db, { name: 'PostgreSQL sheet QA', email: 'pg-sheets@example.test', password: 'synthetic-pg-counts-password', restaurant: 'Isolated PG counts', outlet: 'QA only', qrEnabled: true, demo: false }, 'pg-counts');
  owner = await s.authenticate(db, auth.token);
  outletId = (await s.workspace(db, owner)).outletId;
});
// Keep the generated QA database for inspection. The caller stops its disposable
// server/cluster afterwards; this script never drops or touches a retained database.
after(async () => { await db?.close(); await admin.end(); });

async function sheet(tag: string, size = 2) {
  for (let n = 0; n < size; n++) await s.addIngredient(db, owner, key(), { outletId, name: tag + ' ' + String(n).padStart(3, '0'), unit: 'kg' });
  return s.stockCountSheet(db, owner, { ...context(), search: tag });
}
function fill(csv: string, amount = '1') {
  return csv.split('\r\n').map((row, n) => n ? row.replace(/""$/, `"${amount}"`) : row).join('\r\n');
}
async function prepare(tag: string, size = 2) {
  const template = await sheet(tag, size), input = { ...context(), csv: fill(template.csv), note: '' };
  const preview = await s.previewStockCountImport(db, owner, input);
  assert.equal(preview.valid, true, JSON.stringify(preview.errors));
  return { template, input: { ...input, previewToken: preview.previewToken } };
}
async function counts(ids: string[]) {
  return (await db.transaction(owner.restroId, tx => tx.query('SELECT ingredient_id,version,quantity_milli FROM daily_stock_counts WHERE ingredient_id=ANY($1::uuid[]) ORDER BY ingredient_id,version', [ids]))).rows;
}

test('PG PP21 concurrent 101-row imports serialize and commit one complete observation set', async () => {
  const { template, input } = await prepare('PG bulk', 101);
  const outcomes = await Promise.allSettled([s.importStockCountSheet(db, owner, key(), input), s.importStockCountSheet(db, owner, key(), input)]);
  assert.equal(outcomes.filter(value => value.status === 'fulfilled').length, 1);
  const rejected = outcomes.find(value => value.status === 'rejected') as PromiseRejectedResult;
  assert.equal(rejected.reason.code, 'COUNT_SHEET_CHANGED');
  const rows = await counts(template.items.map(item => item.ingredientId));
  assert.equal(rows.length, 101);
  assert(rows.every(row => Number(row.version) === 1 && Number(row.quantity_milli) === 1000));
});

test('PG PP21 simultaneous exact retries return the same result and append once', async () => {
  const { template, input } = await prepare('PG retry'), requestKey = key();
  const [first, second] = await Promise.all([s.importStockCountSheet(db, owner, requestKey, input), s.importStockCountSheet(db, owner, requestKey, input)]);
  assert.deepEqual(first, second);
  assert.equal((await counts(template.items.map(item => item.ingredientId))).length, 2);
});

test('PG PP21 late stale row rejects the whole file with no partial observation or audit', async () => {
  const { template, input } = await prepare('PG stale');
  await s.recordStockCounts(db, owner, key(), { ...context(), counts: [{ ingredientId: template.items[1].ingredientId, quantityMilli: 0, version: 0 }] });
  const before = (await db.query('SELECT id FROM audit_events ORDER BY id')).rows;
  await assert.rejects(s.importStockCountSheet(db, owner, key(), input), { code: 'COUNT_SHEET_CHANGED' });
  const rows = await counts(template.items.map(item => item.ingredientId));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ingredient_id, template.items[1].ingredientId);
  assert.deepEqual((await db.query('SELECT id FROM audit_events ORDER BY id')).rows, before);
});

test('PG PP21 confirmation revalidates an item changed by another database connection', async () => {
  const { template, input } = await prepare('PG unit', 1);
  const writer = new Pool({ connectionString: connection.href, max: 1 }), client = await writer.connect();
  try {
    await client.query('BEGIN');
    await client.query("UPDATE ingredients SET unit='unit' WHERE id=$1", [template.items[0].ingredientId]);
    const attempt = s.importStockCountSheet(db, owner, key(), input);
    const rejected = assert.rejects(attempt, { code: 'COUNT_SHEET_CHANGED' });
    await client.query('COMMIT');
    await rejected;
    assert.equal((await counts([template.items[0].ingredientId])).length, 0);
  } finally { await client.query('ROLLBACK'); client.release(); await writer.end(); }
});

test('PG PP21 observed zero preserves real consumed stock, issued invoice and verified payment', async () => {
  const template = await sheet('PG history', 1), ingredientId = template.items[0].ingredientId;
  await s.receiveStock(db, owner, key(), { ingredientId, batchNumber: key(), quantityMilli: 10000, unitCost: 500, reference: 'Synthetic PG receipt', expiresAt: new Date(Date.now() + 172800000).toISOString() }, true);
  const item = (await s.saveMenu(db, owner, key(), { outletId, name: 'PG history dish', category: 'Food', price: 10000, taxBps: 0, station: 'QA kitchen', recipe: [{ id: ingredientId, quantityMilli: 1000 }] })).id;
  let order = await s.createRound(db, owner, key(), { outletId, type: 'TAKEAWAY', items: [{ itemId: item, quantity: 1 }], customer: { name: 'Synthetic PG guest', phone: '9123456711' } }, true);
  order = (await s.recordPayment(db, owner, key(), order.id, order.rounds[0].id, { version: order.rounds[0].version, method: 'CASH', amount: Number(order.rounds[0].payable) }, true)).order;
  await s.completePreparedService(db, owner, key(), order.id, order.rounds[0].id, { version: order.rounds[0].version, confirmedPreparedAndServed: true });
  await s.generateBill(db, owner, key(), order.id, { final: true });
  const snapshot = () => db.transaction(owner.restroId, async tx => {
    const result: Record<string, unknown> = {};
    for (const table of ['stock_batches', 'stock_movements', 'invoices', 'payment_attempts', 'loyalty_ledger']) result[table] = (await tx.query(`SELECT * FROM ${table} ORDER BY id`)).rows;
    return result;
  });
  const before = await snapshot(), input = { ...context(), csv: fill(template.csv, '0') };
  const preview = await s.previewStockCountImport(db, owner, input);
  await s.importStockCountSheet(db, owner, key(), { ...input, previewToken: preview.previewToken });
  assert.deepEqual(await snapshot(), before);
  assert.equal(Number((await counts([ingredientId]))[0].quantity_milli), 0);
});
