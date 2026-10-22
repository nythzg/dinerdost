import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createPostgresDatabase } from "@dinerdost/database";
process.loadEnvFile(".env.production.local");
const db = createPostgresDatabase(
  process.env.DATABASE_MIGRATION_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL!,
);
const file = "verification/production-046-preservation.json";
try {
  const invoices = (
    await db.query(
      "SELECT id,md5(snapshot::text) AS digest FROM invoices ORDER BY id",
    )
  ).rows;
  const migrations = (
    await db.query("SELECT name FROM schema_migrations ORDER BY name")
  ).rows.map((r) => r.name);
  const gate = (
    await db.query(
      "SELECT tgenabled FROM pg_trigger WHERE tgname='enforce_kot_authority'",
    )
  ).rows[0];
  assert.equal(gate.tgenabled, "O");
  if (process.argv.includes("--before")) {
    await writeFile(
      file,
      JSON.stringify(
        {
          version: "0.4.6",
          before: new Date().toISOString(),
          invoices,
          migrations,
          noNewMigration: true,
          accepted: false,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      "Read-only release baseline recorded for " +
        invoices.length +
        " issued invoices.",
    );
  } else {
    const prior = JSON.parse(await readFile(file, "utf8"));
    const current = new Map(invoices.map((r) => [r.id, r.digest]));
    for (const invoice of prior.invoices)
      assert.equal(
        current.get(invoice.id),
        invoice.digest,
        "Previously issued invoice changed",
      );
    assert.deepEqual(migrations, prior.migrations);
    await writeFile(
      file,
      JSON.stringify(
        {
          ...prior,
          accepted: true,
          checkedAt: new Date().toISOString(),
          priorInvoicesPreserved: prior.invoices.length,
          kotAuthorityEnabled: true,
          schemaUnchanged: true,
        },
        null,
        2,
      ) + "\n",
    );
    console.log(
      "All " +
        prior.invoices.length +
        " prior invoice digests and the existing schema are unchanged; KOT authority remains enabled.",
    );
  }
} finally {
  await db.close();
}
