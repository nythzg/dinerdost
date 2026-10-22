import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
process.loadEnvFile(".env.production.local");
const url = new URL(
  process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL!,
);
url.searchParams.set("sslmode", "verify-full");
const admin = new Pool({ connectionString: url.toString(), max: 1 });
const availableSuites = [
  "tests/web-refunds.test.ts",
  "tests/web-loyalty.test.ts",
  "tests/web-bill-policy.test.ts",
  "tests/kitchen-policy.test.ts",
  "tests/service-board.test.ts",
  "tests/table-names.test.ts",
  "tests/outlet-expiry-review.test.ts",
  "tests/priority-qr-updates.test.ts",
  "tests/material-setup.test.ts",
  "tests/inventory-tools.test.ts",
  "tests/workspace-tools.test.ts",
  "tests/piece-service.test.ts",
  "tests/latest-client-batch.test.ts",
  "tests/prepared-food.test.ts",
  "tests/clear-table.test.ts",
  "tests/daily-stock-counts.test.ts",
  "tests/merge-demerge.test.ts",
  "tests/post-release-feedback.test.ts",
  "tests/late-web-updates.test.ts",
  "tests/overnight-updates.test.ts",
  "tests/receipt-layout.test.ts",
  "tests/afternoon-updates.test.ts",
  "tests/restaurant.test.ts",
  "tests/client-feedback.test.ts",
  "tests/tables.test.ts",
  "tests/billing-updates.test.ts",
  "tests/team.test.ts",
  "tests/inbox.test.ts",
  "tests/profile-vendor.test.ts",
  "tests/applications.test.ts",
  "tests/floor-plan.test.ts",
  "tests/floor-controls.test.ts",
  "tests/storefronts.test.ts",
  "tests/procurement-reports.test.ts",
  "tests/push.test.ts",
  "tests/web-updates.test.ts",
];
const requested = process.argv
  .find((arg) => arg.startsWith("--suites="))
  ?.slice(9)
  .split(",");
if (requested?.some((suite) => !availableSuites.includes(suite)))
  throw new Error("Choose only the declared PostgreSQL verification suites.");
const suites = requested ?? availableSuites;
const pattern = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
async function verifySuite(suite: string) {
  const databaseName = "dd_verify_" + randomBytes(6).toString("hex");
  let created = false;
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    created = true;
    const testUrl = new URL(url);
    testUrl.pathname = "/" + databaseName;
    const child = spawn(
      process.execPath,
      [
        "node_modules/tsx/dist/cli.mjs",
        "--test",
        "--test-concurrency=1",
        ...(pattern ? ["--test-name-pattern", pattern] : []),
        suite,
      ],
      {
        env: { ...process.env, TEST_DATABASE_URL: testUrl.toString() },
        stdio: "inherit",
      },
    );
    const code = await new Promise<number>((resolve, reject) => {
      child.on("error", reject);
      child.on("exit", (code) => resolve(code ?? 1));
    });
    if (code !== 0) throw new Error(`PostgreSQL suite failed: ${suite}`);
    console.log(`PostgreSQL suite passed: ${suite}`);
  } finally {
    if (created)
      await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
  }
}
try {
  await admin.query("SELECT 1");
  // Each suite gets an empty, isolated database; no application tenants are used.
  if (process.argv.includes("--parallel")) {
    const results = await Promise.allSettled(suites.map(verifySuite));
    for (const result of results)
      if (result.status === "rejected") {
        console.error(result.reason.message);
        process.exitCode = 1;
      }
  } else {
    for (const suite of suites) await verifySuite(suite);
  }
} finally {
  await admin.end();
}
