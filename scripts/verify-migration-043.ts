import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { createPostgresDatabase } from "@dinerdost/database";

process.loadEnvFile(".env.production.local");
const connection =
  process.env.DATABASE_MIGRATION_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL;
assert(connection, "A production connection is required.");
const db = createPostgresDatabase(connection);
async function state() {
  return (
    await db.query(`SELECT
    (SELECT count(*) FROM restaurants) AS restaurants,
    (SELECT count(*) FROM orders) AS orders,
    (SELECT count(*) FROM invoices) AS invoices,
    (SELECT count(*) FROM payment_attempts) AS payments,
    (SELECT count(*) FROM customers) AS customers,
    (SELECT count(*) FROM dining_tables) AS tables,
    (SELECT coalesce(sum(payable),0) FROM order_rounds) AS round_payable,
    (SELECT coalesce(sum(paid),0) FROM order_rounds) AS round_paid`)
  ).rows[0];
}
try {
  const before = await state();
  const snapshotsBefore = (
    await db.query(
      "SELECT id,md5(snapshot::text) AS digest FROM invoices ORDER BY id",
    )
  ).rows;
  await db.migrate();
  const after = await state();
  const snapshotsAfter = (
    await db.query(
      "SELECT id,md5(snapshot::text) AS digest FROM invoices ORDER BY id",
    )
  ).rows;
  const totalsPreserved = JSON.stringify(before) === JSON.stringify(after);
  const snapshotsPreserved =
    JSON.stringify(snapshotsBefore) === JSON.stringify(snapshotsAfter);
  const migrations = (
    await db.query("SELECT name FROM schema_migrations ORDER BY name")
  ).rows.map((row) => row.name);
  const guard = (
    await db.query(
      "SELECT tgenabled FROM pg_trigger WHERE tgname='enforce_kot_authority'",
    )
  ).rows;
  const result = {
    before,
    after,
    migrations,
    financialTotalsPreserved: totalsPreserved,
    issuedDocumentsUnchanged: snapshotsPreserved,
    issuedDocumentCount: snapshotsBefore.length,
    kotGateEnabled: guard.length === 1 && guard[0].tgenabled === "O",
    checkedAt: new Date().toISOString(),
  };
  await writeFile(
    "verification/production-migration-043.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  assert(
    totalsPreserved,
    "Counts or totals changed during migration; inspect concurrent activity before release.",
  );
  assert(
    snapshotsPreserved,
    "Issued document digests changed during migration.",
  );
  assert(
    migrations.includes("032_receipt_layout.sql") &&
      migrations.includes("033_web_feedback.sql"),
  );
  assert(result.kotGateEnabled, "Kitchen authority gate must remain enabled.");
  console.log(
    "Migrations 032–033 applied; counts, financial totals and issued document digests preserved.",
  );
} finally {
  await db.close();
}
