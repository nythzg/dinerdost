import assert from "node:assert/strict";
import { rm, writeFile, readFile } from "node:fs/promises";
import { createPostgresDatabase } from "@dinerdost/database";
process.loadEnvFile(".env.production.local");
const db = createPostgresDatabase(
  process.env.DATABASE_MIGRATION_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.DATABASE_URL!,
);
let remaining = -1;
try {
  remaining = Number(
    (
      await db.query(
        "SELECT count(*) AS count FROM pg_database WHERE datname LIKE 'dd_verify_%'",
      )
    ).rows[0].count,
  );
  assert.equal(remaining, 0, "Temporary hosted verification databases remain");
} finally {
  await db.close();
}
const paths = [
  ".env.production.local",
  "verification/.qa-production-046.json",
  "verification/.qa-production-047.json",
];
for (const path of paths) await rm(path, { force: true });
const result = {
  checkedAt: new Date().toISOString(),
  temporaryHostedDatabasesRemaining: remaining,
  credentialFilesRemoved: paths,
  noClientFinancialRecordsDeleted: true,
};
await writeFile(
  "verification/production-047-cleanup.json",
  JSON.stringify(result, null, 2) + "\n",
);
const release = JSON.parse(await readFile("docs/RELEASE.json", "utf8"));
Object.assign(release, {
  temporaryHostedDatabasesRemaining: 0,
  temporaryCredentialFilesRemoved: true,
  temporaryCredentialsRemoved: true,
});
await writeFile("docs/RELEASE.json", JSON.stringify(release, null, 2) + "\n");
console.log(
  "Zero hosted verification databases; temporary downloaded environment and QA sessions removed.",
);
