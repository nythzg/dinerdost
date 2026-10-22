import assert from "node:assert/strict";
import { readdir, writeFile } from "node:fs/promises";
import { createPostgresDatabase } from "@dinerdost/database";
process.loadEnvFile(".env.production.local");
const connection = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
assert(connection, "Production migration connection required.");
const db = createPostgresDatabase(connection);
const migrations = ["041_prepared_food.sql", "042_alert_dismissals.sql"];
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
  assert.deepEqual(pending.sort(), migrations.filter(name=>!applied.includes(name)), "Only the two reviewed additive migrations may run.");
  const before = await frozen();
  await db.migrate();
  const after = await frozen();
  const preserved: Record<string, { priorCount: number; preserved: boolean }> = {};
  for (const name of Object.keys(before)) {
    const current = new Map(after[name].map(r => [r.id,r.digest]));
    preserved[name] = {priorCount: before[name].length, preserved: before[name].every(r => current.get(r.id) === r.digest)};
    assert(preserved[name].preserved, "Prior immutable data changed: " + name);
  }
  const schema = (await db.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='prepared_food_movements'::regclass")).rows[0];
  assert(schema.relrowsecurity && schema.relforcerowsecurity);
  const immutable = (await db.query("SELECT tgenabled FROM pg_trigger WHERE tgname='immutable_prepared_food_movements'")).rows;
  const gate = (await db.query("SELECT tgenabled FROM pg_trigger WHERE tgname='enforce_kot_authority'")).rows;
  assert(immutable.length === 1 && immutable[0].tgenabled === "O");
  assert(gate.length === 1 && gate[0].tgenabled === "O");
  const grants = (await db.query("SELECT privilege_type FROM information_schema.role_table_grants WHERE grantee='dinerdost_app' AND table_name='prepared_food_movements' ORDER BY privilege_type")).rows.map(r => r.privilege_type);
  assert.deepEqual(grants, ["INSERT","SELECT"]);
  const preferences = (await db.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='ui_alert_dismissals'::regclass")).rows[0];
  assert(preferences.relrowsecurity && preferences.relforcerowsecurity);
  const preferenceGrants = (await db.query("SELECT privilege_type FROM information_schema.role_table_grants WHERE grantee='dinerdost_app' AND table_name='ui_alert_dismissals' ORDER BY privilege_type")).rows.map(r=>r.privilege_type);
  assert.deepEqual(preferenceGrants,["INSERT","SELECT"]);
  const isolatedDatabases = (await db.query("SELECT count(*)::int AS count FROM pg_database WHERE datname LIKE 'dd_verify_%'")).rows[0].count;
  await writeFile("verification/production-migration-0414.json", JSON.stringify({
    checkedAt: new Date().toISOString(), migrations, pendingBefore: pending, applied: true,
    immutableHistory: preserved, tenantRlsEnforced: true, preparedMovementsAppendOnly: true,
    kotGateEnabled: true, grants, preferenceGrants, preferenceTenantRlsEnforced:true, isolatedVerificationDatabases: isolatedDatabases,
    migrationScope: "Additive prepared-food tables, menu linkage, keys, indexes, tenant policies, grants, immutable movement trigger and account/outlet alert-dismissal preferences; no existing stock or financial rows updated. No unanswered kitchen-policy migration applied.",
  },null,2)+"\n");
  console.log("041/042 applied: prior invoices, costs and movements preserved; tenant RLS and append-only movement/preference grants verified.");
} finally { await db.close(); }
