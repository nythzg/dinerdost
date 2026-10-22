# Deployment and operations

The approved static preview and the working app are different projects. Deploying the app must not overwrite `dinerdost-design-preview`.

| Setting             | Value                                                      |
| ------------------- | ---------------------------------------------------------- |
| Vercel team         | nythz                                                      |
| Application project | dinerdost-app                                              |
| Project root        | apps/web                                                   |
| Node                | 24.x                                                       |
| Function region     | sin1                                                       |
| Install command     | npm ci --include=dev --workspaces --include-workspace-root |
| Database            | Dedicated Neon `dinerdost-production`, Free plan           |

Version 0.3.5 was deployed on 20 October 2026 after the user's deployment instruction. Migrations 011–013 were applied after all 55 backend tests passed on isolated Neon databases; those test databases were removed afterward. Before/after core record counts matched. All six production browser workflows passed. The active deployment is `dpl_AcxdTz85M1bMLERecoxXSYdvCoNz` at https://dinerdost-app.vercel.app/.

Version 0.3.7 is deployed and production verified on 20 October 2026. It includes staff-approved QR activation, the native notification/invoice API, member name/salary editing and editable completed vendors. Migration 014 is applied; before/after restaurant, order, invoice and payment counts matched. All 62 local backend cases, 27 affected hosted database cases and five production browser workflows passed. Deployment: `dpl_Do1o2K3kXS76CnDCRm26Wqi5Kr5K`, alias https://dinerdost-app.vercel.app/.
Version **0.4.3** is deployed and verified on 21 October 2026: `dpl_4BffFWXdep5EBqskTk6rJxfZeTFG`, https://dinerdost-app.vercel.app/. Migrations 032–033 preserve counts, financial totals and existing issued document digests. All 113 local backend cases, 40 local browser workflows, 65 selected hosted cases and eight production browser workflows passed. Ten newer requests remain separately queued. Release evidence: [VERIFICATION.md](VERIFICATION.md).

## Deploy

From the codebase root, authenticate the Vercel CLI and link `dinerdost-app` under team `nythz`. The project already stores database variables from its Neon integration.

```sh
vercel env pull .env.production.local --environment=production --scope nythz
node --import tsx scripts/database.ts migrate --env=.env.production.local
npm run typecheck
npm test
npm run build
vercel deploy --prod --yes --scope nythz --local-config vercel.json
```

Delete downloaded environment files after use. Never commit or archive their values. Use the provider dashboard to recover or rotate credentials.

For future preview branches, connect a separate database or Neon branch before testing writes. The initial marketplace connection populated production, preview and development variables with the same resource; do not run arbitrary preview test data against it. The supplied PostgreSQL verification script creates and drops its own temporary database instead of modifying application tenants.

## Verify a release

Open the production URL without a Vercel account. The sign-in and setup pages should load. Restaurant data requires an application account. Create an isolated demo workspace for QA and verify a full cash order, one-step manual receipts, kitchen state changes, service, invoice, and a second browser's code-free QR ordering flow. Check customer activation requests and staff approval, dark occupied cards, direct billing, Floor plan, owner bill controls, and staff invitation/role access. Inspect desktop and phone widths and check runtime errors. Verify Ctrl K / Cmd K page search, permanently full-size navigation, filtered table QR selection and clean print output. The local-only `/preview` entry must return 404 without issuing a session cookie on production.

```sh
node --import tsx scripts/verify-postgres.ts
```

This command requires a locally pulled production environment file. For each of the five backend suites it creates a separate random `dd_verify_` database, applies the schema, runs that suite, and drops that exact test database in `finally`. It does not drop, truncate or seed the application database. Android sources/builds are excluded from Vercel uploads; they are maintained under `apps/android` separately.

## Operational prerequisites

Before real restaurant operation, configure the restaurant's menu, tax treatment, invoice identifiers, roles, stock and opening balances. Complete fiscal review, backup/restore exercises, monitoring and account recovery. The release has no email verification, password-reset delivery, production gateway receipts, device printing, tax filing or LAN failover implementation.

The Free hosting/database limits remain those of the provider plans. No paid-plan upgrade has been requested or made.
