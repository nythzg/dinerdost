import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { createPostgresDatabase } from "@dinerdost/database";
process.loadEnvFile(".env.production.local");
const connection =
  process.env.DATABASE_MIGRATION_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL;
assert(connection, "A production migration connection is required.");
const db = createPostgresDatabase(connection);
async function state() {
  return (
    await db.query(`SELECT
 (SELECT count(*) FROM restaurants) AS restaurants,(SELECT count(*) FROM orders) AS orders,
 (SELECT count(*) FROM invoices) AS invoices,(SELECT count(*) FROM payment_attempts) AS payments,
 (SELECT count(*) FROM customers) AS customers,(SELECT count(*) FROM dining_tables) AS tables,
 (SELECT coalesce(sum(payable),0) FROM order_rounds) AS payable,(SELECT coalesce(sum(paid),0) FROM order_rounds) AS paid,
 (SELECT count(*) FROM stock_batches) AS batches,(SELECT count(*) FROM stock_movements) AS movements,
 (SELECT coalesce(sum(on_hand),0) FROM stock_batches) AS on_hand,(SELECT coalesce(sum(reserved),0) FROM stock_batches) AS reserved`)
  ).rows[0];
}
async function immutable() {
  return {
    invoices: (
      await db.query(
        "SELECT id,md5(snapshot::text) AS digest FROM invoices ORDER BY id",
      )
    ).rows,
    stock: (
      await db.query(
        "SELECT id,ingredient_id,on_hand,reserved,unit_cost,expires_on,expires_at,received_at FROM stock_batches ORDER BY id",
      )
    ).rows,
    recipes: (
      await db.query(
        "SELECT item_id,ingredient_id,quantity_milli FROM recipes ORDER BY item_id,ingredient_id",
      )
    ).rows,
    rounds: (
      await db.query(
        "SELECT id,payable,paid,round_off,rounding_enabled,manual_discount FROM order_rounds ORDER BY id",
      )
    ).rows,
    policy: (
      await db.query("SELECT id,payment_policy FROM outlets ORDER BY id")
    ).rows,
    tables: (
      await db.query(
        "SELECT id,outlet_id,label,public_key,retired_at FROM dining_tables ORDER BY id",
      )
    ).rows,
    ingredients: (
      await db.query(
        "SELECT id,outlet_id,name,unit,purchase_rate,version FROM ingredients ORDER BY id",
      )
    ).rows,
    costs: (
      await db.query("SELECT * FROM order_item_costs ORDER BY order_item_id")
    ).rows,
  };
}
try {
  const before = await state(),
    frozen = await immutable();
  await db.migrate();
  const after = await state(),
    next = await immutable();
  const migrations = (
    await db.query("SELECT name FROM schema_migrations ORDER BY name")
  ).rows.map((r) => r.name);
  const gate = (
    await db.query(
      "SELECT tgenabled FROM pg_trigger WHERE tgname='enforce_kot_authority'",
    )
  ).rows;
  const defaults = (
    await db.query(
      "SELECT (SELECT count(*) FROM stock_batches WHERE remaining_value IS NOT NULL) AS revalued,(SELECT count(*) FROM ingredients WHERE retired_at IS NOT NULL) AS archived,(SELECT count(*) FROM order_rounds WHERE payment_gate<>'LEGACY') AS reclassified,(SELECT count(*) FROM stock_value_adjustments) AS adjustments",
    )
  ).rows[0];
  const result = {
    before,
    after,
    financialTotalsPreserved: JSON.stringify(before) === JSON.stringify(after),
    issuedDocumentsPreserved:
      JSON.stringify(frozen.invoices) === JSON.stringify(next.invoices),
    issuedDocumentCount: frozen.invoices.length,
    stockAndExpiryPreserved:
      JSON.stringify(frozen.stock) === JSON.stringify(next.stock),
    recipesPreserved:
      JSON.stringify(frozen.recipes) === JSON.stringify(next.recipes),
    existingRoundingPreserved:
      JSON.stringify(frozen.rounds) === JSON.stringify(next.rounds),
    paymentPoliciesPreserved:
      JSON.stringify(frozen.policy) === JSON.stringify(next.policy),
    tableIdentitiesPreserved:
      JSON.stringify(frozen.tables) === JSON.stringify(next.tables),
    ingredientDetailsPreserved:
      JSON.stringify(frozen.ingredients) === JSON.stringify(next.ingredients),
    issuedItemCostsPreserved:
      JSON.stringify(frozen.costs) === JSON.stringify(next.costs),
    noRetrospectiveRevaluationOrPaymentChanges: Object.values(defaults).every(
      (value) => Number(value) === 0,
    ),
    kotGateEnabled: gate.length === 1 && gate[0].tgenabled === "O",
    migrations,
    checkedAt: new Date().toISOString(),
  };
  await writeFile(
    "verification/production-migration-045.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  for (const key of [
    "financialTotalsPreserved",
    "issuedDocumentsPreserved",
    "stockAndExpiryPreserved",
    "recipesPreserved",
    "existingRoundingPreserved",
    "paymentPoliciesPreserved",
    "tableIdentitiesPreserved",
    "ingredientDetailsPreserved",
    "issuedItemCostsPreserved",
    "noRetrospectiveRevaluationOrPaymentChanges",
    "kotGateEnabled",
  ] as const)
    assert(result[key], "Production migration invariant failed: " + key);
  for (const migration of [
    "037_active_table_labels.sql",
    "038_inventory_value_and_archive.sql",
    "039_web_order_payment_flow.sql",
  ])
    assert(migrations.includes(migration), "Missing migration " + migration);
  console.log(
    "Migrations 037–039 applied; financial totals, issued documents, stock, recipes, prior rounding and payment policies preserved.",
  );
} finally {
  await db.close();
}
