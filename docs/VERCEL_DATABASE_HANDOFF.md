# His Vercel account, the existing Diner Dost data

> Current return handoff, 25 October 2026: see [RETURN_HANDOFF.md](RETURN_HANDOFF.md) and [UPCOMING_WORK.md](UPCOMING_WORK.md). The accepted app is 0.4.31 on prem-2230/dinerdost-web, migration001-069. Earlier local-only/original-PC paragraphs below are dated history, not instructions to roll back or create a new database. The handoff itself performs no database/deployment changes.

Updated **23 October 2026 IST**. Follow this procedure for the current **0.4.30** source with migrations **001–050**. This is a hosting connection handoff, not a database move. Neither database ownership nor the original Vercel URL is transferred by cloning GitHub.

## Required outcome

Connect the receiving operator's Vercel Production deployment to the **same existing Neon production branch AND database** used by the original app. Retain the original Neon project, branch, database, roles and credentials. No export/import, schema reset, seeding, new restaurant signup or migration is needed just to host this exact release elsewhere.

Existing records remain in place: restaurant/outlet/staff accounts and password hashes, customers, menu/recipes, floors/tables/QR keys, orders/rounds, original payment/invoice history, refunds, stock/FIFO/costs, physical counts, loyalty, uploads and audit history. `uploaded_assets.content` stores uploaded images/documents in PostgreSQL. This app does not need a new Vercel Blob bucket for those existing uploads.

The new deployment becomes another writer to that live database. Development/testing must use a separate database/Neon branch. A branch copy is isolated and does not continuously synchronize later production writes; never substitute a test branch for the live production database. [Neon branching](https://neon.com/docs/introduction/branching).

## 1. Owner: identify and protect the existing database

1. Open the **existing** Diner Dost Neon resource through the current owner's Neon account or existing Vercel integration. Its saved friendly project/resource name is `dinerdost-production`; identify it using the old app's actual connection, not the name alone.
2. Record the exact production project, branch and database privately. In Neon's **Connect** dialog, select that same branch, compute, database and existing working role. Copy the full connection string, retaining TLS/query parameters. The simplest option is to reuse the old app's exact working `DATABASE_URL`; do not assemble it from guesses. [Neon connection instructions](https://neon.com/docs/connect/connect-from-any-app).
3. Keep the current production password working. Do not reset/rotate a shared role password merely to obtain a new URL: that can break the existing app. Recover the owner-authorized connection details privately, or configure a separately authorized credential with the required permissions as a deliberate separate task.
4. Before cutover, the owner should verify the project's actual recovery/retention settings and take or confirm an owner-managed backup/recovery point appropriate to the current plan. This guide does **not** create or verify a restorable backup. A checksum report is not a backup. [Neon backup/restore](https://neon.com/docs/postgres/backup-restore/backups).
5. Keep the old Vercel app and Neon integration/resource intact. Do not delete/disconnect the storage integration, delete the old branch, restore/reset production, run `DROP`/`TRUNCATE`, overwrite invoices, or import demo data.

The owner can enter the DB secret directly into the receiving Vercel project, or use an agreed secure credential-sharing mechanism. Do not put it into GitHub (this repository is public), screenshots, this document, Codex prompts or ordinary chat. GitHub read access alone does not grant database access.

## 2. Receiving operator: create the Vercel project

Import `https://github.com/nythzg/dinerdost` (or an authorized writable fork) into **his Vercel team/account**. Confirm:

| Setting | Value |
|---|---|
| Framework | Next.js |
| Root directory | `apps/web` |
| Source outside root | Include shared files outside the root directory |
| Node.js | `24.x` |
| Install command | `npm ci --include=dev --workspaces --include-workspace-root` |
| Build command | `next build` from the configured app root/default Next preset |
| Output | Default Next output, no static export |
| Function region | `sin1`, retained in `vercel.json` |

Do not create a new empty database through Vercel Marketplace as a replacement for the current data. The original `dinerdost-design-preview` project is a separate static preview and must not be overwritten.

If using the CLI, invoke it from the monorepo root, authenticate with his own account and explicitly select his team/project. The source `.vercel` binding was excluded. Vercel account ownership, Neon ownership and GitHub write permission are separate.

## 3. Exact environment variables

In **his Vercel project → Settings → Environment Variables**, configure these for **Production**:

| Variable | Value / source | Type and scope |
|---|---|---|
| `DATABASE_URL` | The **existing app's working Neon production connection string**, same project/branch/database and a role compatible with the app | **Secret**, Production only |
| `APP_ORIGIN` | His actual canonical app origin, e.g. `https://his-chosen-project.vercel.app`; no path or trailing slash | **Config**, Production |
| `DD_PLATFORM_ADMIN_USER_IDS` | Optional comma-separated explicitly provisioned platform-user UUIDs; leave unset if none is approved | Server-only configuration; do not invent or auto-grant identities |

The current Vercel UI calls protected values **Secret**; older UI/CLI may call them **Sensitive**. Environment changes apply to a new deployment, so redeploy after saving. [Vercel variable types](https://vercel.com/changelog/environment-variables-now-use-config-and-secret-types), [environment scope and deployments](https://vercel.com/docs/environment-variables).

Do **not** prefix the database variable with `NEXT_PUBLIC_`. The app reads the server-side `DATABASE_URL` directly. No `AUTH_SECRET`, `NEXTAUTH_SECRET` or separate session-signing key is required by the current implementation: authentication/password/session records are in the existing database. Staff still sign in on the new hostname; cookies do not automatically move between domains.

These variables are **not required for the initial same-database hosting handoff**:

| Variable | Treatment |
|---|---|
| `DATABASE_MIGRATION_URL` | Keep privileged migration credentials in a controlled private migration workflow. No migration is required for initial 0.4.30 reconnection, and this variable is not selected by the runtime. Do not add it to his deployment just to make existing data appear. |
| `DATABASE_URL_UNPOOLED`, `POSTGRES_URL_NON_POOLING` | Legacy/tooling alternatives; the runtime still requires `DATABASE_URL`. Do not copy every integration variable indiscriminately. |
| `LOCAL_DATABASE_PATH` | Local development only; omit on Vercel. A local PGlite directory is not the production database. |
| Firebase/push, gateway, WhatsApp/SMS and other provider keys | Remain deferred/unconfigured. No keys are invented or required to preserve stored records. |
| `DD_NEXT_DIST_DIR` | Build/test override; omit for a normal Vercel deployment. |

Preview/Development must use **different isolated DB credentials**, or remain unconfigured until those environments are ready. Do not select all environments for the live Production URL. Integration defaults in the old project previously shared the same resource across environments; that is not proof of isolation.

## 4. Verify connection identity and existing data, without writes

The repository now includes `scripts/check-handoff-database.ts`. It requires an explicit `DATABASE_URL` and does not fall back to PGlite. It opens a **READ ONLY, REPEATABLE READ** transaction; checks applied migrations against this checkout; records aggregate row counts/checksums; checks required forced tenant RLS and the KOT authority trigger; and confirms the existing connection can `SET LOCAL ROLE dinerdost_app` with no tenantless invoice access. It does not run migrations, seed, create roles or export row contents/passwords/files.

The existing migration grants the database connection role membership in `dinerdost_app`. Use the already-working connection/permissions. Do not disable RLS or use a new arbitrary role if the checker fails. Sign-in/setup also use existing global database access patterns; a newly invented restricted login is not a drop-in replacement without a separate compatibility review.

On an owner-controlled machine, put only the necessary connection value into a private ignored environment file; never commit or print it. After dependencies are installed, capture a baseline using the original connection:

```powershell
npx tsx scripts/check-handoff-database.ts --env=.env.production.local --out=verification/original-db-baseline.json
```

Then check the exact connection intended for his Vercel, stored privately as `.env.destination.local`:

```powershell
npx tsx scripts/check-handoff-database.ts --env=.env.destination.local --out=verification/destination-db-check.json --compare=verification/original-db-baseline.json
```

Run these **before opening the new app for normal use**, during a quiet interval. Expected: same endpoint fingerprint (pooled/direct host suffix is normalized), matching table counts/checksums, 50 migrations for this exact release, enforced RLS and enabled KOT gate. Reports are saved only under ignored `verification/`, refuse overwrite, and contain aggregate hashes rather than raw data. Share the reports privately if required; they are not committed.

Exit code `2` means endpoint/table data differ. Concurrent legitimate writes, logins, rate limits or notifications can change a checksum, so investigate against actual activity. Never "fix" differences by deleting rows, reseeding or restoring over production. The endpoint fingerprint is a consistency check for the copied connection, not a substitute for selecting the correct Neon project/branch/database in the owner's console. Stop if the role/RLS/migration checks fail or the intended branch is unclear.

If using a different clone/version later, compare its migrations deliberately. Do not run automatic migrations merely to silence a mismatch. Migration 050 is already applied to the current production DB; a new host running 0.4.30 does not need it applied again.

## 5. Deploy and validate the existing account

After saving the variables, deploy/redeploy **0.4.30 first** in his Vercel project. Do not combine the first hosting connection with untested Q89/PP schema changes. Inspect READY status, then:

1. Sign in with an **existing restaurant/staff account**, select its original outlet, and verify historical orders, issued invoice totals, recorded payments, stock/costs, customers/loyalty, menu photos and staff files permitted for that role. Do not create a new restaurant and expect it to show another tenant's data.
2. Check desktop/phone pages and authorization/CSRF behaviour. No live sales/refunds/stock adjustments should be entered just to test hosting. Run write tests separately with synthetic data in an isolated environment.
3. Retain the old app until the owner accepts the new deployment and an explicit cutover is agreed. Both apps connected to the same DB see normal ongoing updates; neither should be reset.
4. Existing printed QR codes and bookmarked links still contain their **old domain**. Same DB preserves the QR keys, but does not rewrite printed URLs. Keep the old URL available or plan an explicit domain/QR cutover. New-domain cookies/device visits require normal re-authentication; stored records remain in the database.
5. Record the new Vercel URL, commit, environment scope, privately verified database identity, checks and any limitations. This guide does not claim his account/project has already been configured or tested.

Rollback of a hosting problem means sending traffic back to the unchanged old app/configuration. It does not mean restoring an older database over newer live transactions. If future schema work is required, use isolated testing, an owner-approved recovery point and reviewed additive migrations preserving issued financial/stock history.

## What was actually checked here

Before publishing these instructions, the original connection was inspected with the read-only checker. The current database has 64 public tables and migrations 001–050; the required RLS, application role switch and KOT authority checks passed. A before/after aggregate checksum comparison is kept privately in the source operator's ignored verification directory. No database writes/migrations, password changes, cloud-resource deletions, account transfer, backup creation or destination Vercel setup are performed by writing this guide. The destination still needs its owner's actual environment configuration and acceptance checks.
