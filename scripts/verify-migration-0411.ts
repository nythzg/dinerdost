import assert from "node:assert/strict";
import { readdir, writeFile } from "node:fs/promises";
import { createPostgresDatabase } from "@dinerdost/database";
process.loadEnvFile(".env.production.local");
const connection = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
assert(connection, "Production migration connection required.");
const db = createPostgresDatabase(connection);
const migration = "040_daily_stock_counts.sql";
async function frozen() {
  const result: Record<string, { id: string; digest: string }[]> = {};
  for (const [name, sql] of [
    ["invoices", "SELECT id::text AS id,md5(snapshot::text) AS digest FROM invoices"],
    ["itemCosts", "SELECT order_item_id::text AS id,md5(row_to_json(c)::text) AS digest FROM order_item_costs c"],
    ["stockMovements", "SELECT id::text AS id,md5(row_to_json(m)::text) AS digest FROM stock_movements m"],
  ]) result[name] = (await db.query<{id: string; digest: string}>(sql)).rows;
  return result;
}
try {
  const applied = (await db.query("SELECT name FROM schema_migrations")).rows.map(r => String(r.name));
  const pending = (await readdir("packages/database/migrations")).filter(f => f.endsWith(".sql") && !applied.includes(f));
  assert.deepEqual(pending, applied.includes(migration) ? [] : [migration], "Only the reviewed additive migration may run.");
  const before = await frozen();
  await db.migrate();
  const after = await frozen();
  const preserved: Record<string, { priorCount: number; preserved: boolean }> = {};
  for (const name of Object.keys(before)) {
    const current = new Map(after[name].map(r => [r.id,r.digest]));
    preserved[name] = {priorCount: before[name].length, preserved: before[name].every(r => current.get(r.id) === r.digest)};
    assert(preserved[name].preserved, "Prior immutable data changed: " + name);
  }
  const schema = (await db.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='daily_stock_counts'::regclass")).rows[0];
  assert(schema.relrowsecurity && schema.relforcerowsecurity);
  const immutable = (await db.query("SELECT tgenabled FROM pg_trigger WHERE tgname='immutable_daily_stock_counts'")).rows;
  const gate = (await db.query("SELECT tgenabled FROM pg_trigger WHERE tgname='enforce_kot_authority'")).rows;
  assert(immutable.length === 1 && immutable[0].tgenabled === "O");
  assert(gate.length === 1 && gate[0].tgenabled === "O");
  const grants = (await db.query("SELECT privilege_type FROM information_schema.role_table_grants WHERE grantee='dinerdost_app' AND table_name='daily_stock_counts' ORDER BY privilege_type")).rows.map(r => r.privilege_type);
  assert.deepEqual(grants, ["INSERT","SELECT"]);
  const isolatedDatabases = (await db.query("SELECT count(*)::int AS count FROM pg_database WHERE datname LIKE 'dd_verify_%'")).rows[0].count;
  await writeFile("verification/production-migration-0411.json", JSON.stringify({
    checkedAt: new Date().toISOString(), migration, pendingBefore: pending, applied: true,
    immutableHistory: preserved, tenantRlsEnforced: true, countsAppendOnly: true,
    kotGateEnabled: true, grants, isolatedVerificationDatabases: isolatedDatabases,
    migrationScope: "New observation table, index, policy, grants and immutable trigger only; no existing stock or financial rows updated.",
  },null,2)+"\n");
  console.log("040 applied: prior invoices, costs and movements preserved; tenant RLS and append-only grants verified.");
} finally { await db.close(); }
