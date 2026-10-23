# Open Diner Dost on the receiving device

This transfers the source and saved project context. It does not transfer authenticated sessions, production data or ownership of any cloud account. Read `../HANDOFF.md` first. Current source/accepted production: **0.4.30**.

## 1. Extract and open

Copy the handoff ZIP to the receiving computer, extract it into a normal writable directory and open the extracted `dinerdost` folder as a local Codex project. Avoid running inside the ZIP, a temporary browser download preview or a cloud-only folder. Paste `CONTINUE_IN_CODEX.txt` as the first message. The root `AGENTS.md` also points Codex to the saved context, following the [OpenAI project-context workflow](https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex).

The original source had no Git history. The user subsequently requested GitHub and public access; clone [nythzg/dinerdost](https://github.com/nythzg/dinerdost) without a read invitation, then open the clone in Codex. Writing to the original repo still needs owner-granted access, or the receiving operator can use their own fork. The ZIP omits `.git` and earlier Vercel releases have no historical commits. See GITHUB_HANDOFF.md. Do not copy the source computer's entire `.codex` directory or authentication files into someone else's account.

## 2. Reproduce the baseline

Install Node.js **24.x** and npm. In the extracted project root:

```powershell
node --version
npm ci --include=dev --workspaces --include-workspace-root
npm run build
npm run typecheck
npm test
npm run dev
```

Build first on a clean extraction to regenerate Next route types and `next-env.d.ts`; generated source-machine paths were intentionally omitted. No production database credentials are needed for the build/backend baseline. Local development without DATABASE_URL uses PGlite under `.data/postgres` and applies the schema automatically. Open http://localhost:5090 and create a fresh synthetic demo workspace. It will not contain real restaurant data.

Playwright tests run an isolated local app at 5091. On Windows with Edge installed, the existing default works. Otherwise install Chromium via `npx playwright install chromium`, set `$env:PLAYWRIGHT_CHANNEL='chromium'` in PowerShell (or the equivalent shell environment), then run the relevant browser suite. The latest refund suite is `npx playwright test tests/browser/web-refunds.spec.ts --workers=1`. Test rendered 1440px/390px screens and inspect screenshots. Do not point local browser/write tests at the real production database.

## 3. Use the receiving operator's Vercel

The bundle intentionally has **no `.vercel` directory**. From the project root:

```powershell
npx --yes vercel login
npx --yes vercel whoami
npx --yes vercel link
```

Interactively choose the receiving operator's actual team/account and intended project. Do not select `nythz` by copying old commands. For a new project choose a fresh available name. Confirm these settings before deployment:

| Setting | Value |
|---|---|
| Framework | Next.js |
| Root directory | `apps/web` |
| Include source outside root | Enabled (shared `packages` and root lockfile are needed) |
| Node | 24.x |
| Function region | `sin1` (also in `vercel.json`) |
| Install | `npm ci --include=dev --workspaces --include-workspace-root` |
| Build | `next build` from the configured web root/default Next preset |
| Output | Default Next output; no static export |

Invoke CLI from the monorepo root. See [Vercel link](https://vercel.com/docs/cli/link) and [monorepo source configuration](https://vercel.com/docs/monorepos/monorepo-faq). The original static design-preview project is different; never overwrite it.

## 4. Database and environment variables

For the existing-data hosting handoff, follow [VERCEL_DATABASE_HANDOFF.md](VERCEL_DATABASE_HANDOFF.md). It supersedes generic new-database setup: reuse the existing production DB, add only the required Production variables, do not migrate/seed/reset, and verify read-only counts/checksums before cutover. Actual credentials stay private.

Configure actual values privately in the destination Vercel environment settings. They were deliberately excluded from the ZIP. Use the variable-name template `HANDOFF_ENV.example`; it contains no credentials.

- **DATABASE_URL:** runtime PostgreSQL connection. Existing production database is the dedicated Neon database, with migrations 001–050 already applied. The application enforces its tenant RLS/restricted `dinerdost_app` role inside transactions. Use an owner-authorized connection compatible with that existing role setup; do not silently substitute an unrelated empty database if real data is expected.
- **DATABASE_MIGRATION_URL:** privileged migration connection, kept separate and used only for explicit schema migrations. The runtime code selects DATABASE_URL, not this variable. New schema changes require review/verification; don't rerun one-shot historical migration-verification scripts.
- **APP_ORIGIN:** the new actual deployment/custom-domain origin. Update for the chosen destination; never copy localhost or assume the old alias belongs to the receiving account. CSRF origin checks must remain enabled.
- **DD_PLATFORM_ADMIN_USER_IDS:** optional explicit approved platform UUIDs only. Leave blank unless the platform operator has provisioned authorized identities. Restaurant owners/managers are not automatically platform admins.
- Other provider/Firebase/push secrets are optional/deferred. Leaving these integrations unconfigured is the approved state; do not fabricate keys or claim live delivery.

The ZIP is not a database backup. If the receiving operator should continue using real records, the owner must securely grant access to that existing Neon resource (or separately arrange a verified backup/restore and cutover). Existing uploads/assets stored in that database move only with the database, not source files. Connecting the same database preserves records; it also makes the new deployment a live writer, so use a separate branch/database for testing.

For this same-data handoff, do not create an empty production database or run migration/seed commands just to host 0.4.30 elsewhere. Migrations 001–050 are already applied. Use the read-only connection checker instead:

```powershell
npx tsx scripts/check-handoff-database.ts --env=.env.production.local --out=verification/handoff-db-check.json
```

Keep secret environment files local and ignored. Never send private keys/passwords in chat or include them in Git/handoff bundles.

## 5. Deploy and verify

After baseline/affected tests, environment configuration and explicit project selection:

```powershell
npx --yes vercel deploy --prod --local-config vercel.json
```

Confirm the CLI-selected destination team/project. Inspect READY status; then verify the real public sign-in page, auth/CSRF guards and an isolated synthetic tenant's workflow on desktop/phone. Record the new URL, deployment ID, tested scope and any newly applied migrations in the release docs. A successful build is not UI acceptance. Do not run old `accept-web-release.ts` manifests against a newly named destination: that utility pins the original alias/version and must be adapted deliberately for the new target.

## 6. Original URL versus new Vercel account

A fresh Vercel project receives its own URL; this bundle does not hand over `dinerdost-app.vercel.app`. To retain the existing project's deployments/aliases/settings, the owners can instead arrange an explicit [Vercel project transfer](https://vercel.com/docs/projects/transferring-projects), subject to team membership/access. Review the transfer screen before confirming. Integration ownership/Neon access is a separate concern; do not assume an integration or its database owner moved. **No project/domain/database ownership transfer has been performed here.**

Do not delete the original project or stop its database as part of setup. First establish that the new app works and agree the actual cutover. No paid hosting upgrade was requested.

## 7. Browser and monitor setup

Sign into the authorized Prem DM on the new device if reviewing new feedback. Saved cutoff is 22 October 9:09 pm IST; check for newer messages rather than assuming this is still latest. The user permits reading/requirement extraction only, with no messages/reactions. The old automation is paused and not copied; see MONITOR_HANDOFF.md if the user requests monitoring on the new chat.

## Selected receiving setup · 23 October 2026

For this run, the receiving user explicitly overrode the existing-data handoff by requesting a new database. `prem-2230/dinerdost-web` now uses its own new Production resource, with a separate QA resource and migrations 001–051. Original restaurant data stays in `nythz/dinerdost-app`; it was not transferred. The same-data instructions above apply only to a later explicitly requested existing-data connection. Receiving 0.4.31 is verified at https://dinerdost-web.vercel.app.


### Current local single-restaurant data

On 23 October the receiving user explicitly selected Nythz Coooks / Nihal kaman / N1 as the only restaurant in the working local app. Read the ignored `apps/web/.env.local` and `.data/single-restaurant-switch-plan.json` to locate the active database. The earlier original-local database and stopped-server backup are recovery sources, not the active app dataset. Keep both credentials and databases out of Git. Never run QA signup/fixture workflows against port 5090 or the LAN URL: use memory databases or guarded separate QA fixtures on 5091. See LOCAL_SUPERADMIN.md for verified retained counts, identity preservation and operator-only logical-copy safeguards. The new working copy preserves original logins and history; no new password or demo-flag reclassification was introduced.


### Local platform operations through migration060

The working local copy has additive migrations059–060. Before applying these on another device, stop its exact local server, cold-back up the selected database and run preservation QA on a separate copy first. Never overwrite the current database or reuse its path for fixtures. The existing restaurant and platform sign-ins persist; no account is auto-promoted. Read [LOCAL_SUPERADMIN_OPERATIONS.md](LOCAL_SUPERADMIN_OPERATIONS.md) for configured billing/IRN restrictions, read-only owner grants, scopes, seven-day telemetry retention and local-only processing. No production worker or provider connection is implied. A dev worker starts after an instrumented request; manual Run local processing is also available. Required business issuer/recipient/rates must be supplied explicitly through the panel. Tests use only isolated port5091 fixtures or disposable PostgreSQL databases; generated credentials, environment files and all database directories remain ignored.


Local support now requires migration061_platform_editable_support.sql. Stop and cold-back up the exact selected local database before migrating; test on a separate copy first. Existing grants stay read-only. Editable owner support requires fresh Superadmin membership, password, reason and explicit real-data confirmation; preserve normal app safeguards and the15-minute grant. Read LOCAL_SUPERADMIN_OPERATIONS.md before using it. Do not test edits on the working restaurant; use isolated5091 fixtures.
