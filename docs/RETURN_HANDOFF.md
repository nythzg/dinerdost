# Diner Dost return handoff · 25 October 2026

Current web release: **0.4.32**, deployed after the approved UI preview on 25 October. Source commit `fbb7e92dd90d8b206684bff23be0c20744da78dc` is published on `prasadgourav/dinerdost`, branch `local-web-calculator`. See [UI release acceptance](LOCAL_UI_REVIEW_FIXES.md) and [evidence](evidence/ui-review-0432-release.json). Earlier 0.4.31 return tables remain historical. Production data, migrations through069 and the paused procurement branch are preserved.

## Start here

This document supersedes the earlier0.4.30 device-handoff baseline. Inspect the receiving checkout and preserve its changes BEFORE fetching or switching. This return handoff publishes source/context only: it does not reset, seed, migrate, restore or delete production data, change production variables, redeploy, transfer ownership or enable paid services.

| Item | Verified return state |
|---|---|
| Writable return fork | https://github.com/prasadgourav/dinerdost |
| Original upstream | https://github.com/nythzg/dinerdost |
| Continue branch | `local-web-calculator` |
| Exact production-source checkpoint | `968bbd9659c705b1a6337f3ec5d7aab63c3a7e4f` |
| Earlier PC checkpoint | `25d328572e4067f8c3fcce1f687a269912ce44e1`;51 unpublished local commits beyond the old upstream tip were retained as ancestors, not squashed/replaced |
| Upstream observed tip | `775355a8e7a94bd86d5623f02881c368930934d5` (`main`); do not force-push over it |
| Paused separate branch | `local-web-procurement`, exact WIP commit `242d64374f8cfcb7394e4fbdf20a7a769a42aa23`; NOT DEPLOYED, untested |
| Local package/web version | `0.4.31` (latest changes use a dated revision/source hash, no version bump) |
| Accepted deployment version | `0.4.31`, receiving project; not the old original-PC0.4.30 baseline |
| Public production | https://dinerdost-web.vercel.app |
| Team/project | `prem-2230/dinerdost-web`; project `prj_2ced94UWR8LFr61C47WjcS7gvZ0N` |
| Deployment | `dpl_DW2u9iuRG8WfmL3Dtx7FQGEYREAd`, READY; https://dinerdost-rjg5gao0v-prem-2230.vercel.app |
| Build configuration | Next.js; root `apps/web`; shared outside-root source; Node24.x; region`sin1` |
| Runtime source SHA256 | `8bc4d62a04496c75fb258b573e401ed66458900347509b43919858de5e83a280` |
| Applied production migrations |001-069; no pending migration for this source |
| Financial/product boundary | WEB APP ONLY; approved green UI; immutable issued documents/payments, recorded stock/cost/FIFO, tenant/outlet permissions and explicit current-day physical observations |

The return branch tip also includes this documentation-only handoff commit. Its exact final SHA is in the copy-ready completion message and `git rev-parse HEAD` after fetching the branch. The source SHA above is deliberately an immutable preceding checkpoint, not a self-referential claim about this document's own commit. Check branch-tip provenance and source-manifest equality before continuing.

Publication uses the explicitly authorized writable-fork option: GitHub connector access was `nythzg`, but the user's Git device sign-in authenticated`prasadgourav`, which received403 pushing upstream. The verified public fork is writable by that account. Upstream`main`, existing remote work and all branch history are preserved. The production Vercel project has no linked Git repository; publishing these branches does not initiate a Vercel deployment. Git-to-hosting auto-deployment was not added.

## What changed on this PC

The original nine policy answers are still answered; their original Discord links and historical checkpoints remain in CLIENT_FEEDBACK/PENDING_QUESTIONS. Do not ask them again. These are implemented code, not invented recipe/business values.

| Scope / IDs | Result and primary files | Evidence |
|---|---|---|
| Q89 paid replacement | Linked replacement/payment credits, amount-floor comparison, immutable originals and no double refund/credit. `packages/services/src/web-replacements.ts`; migration051; `features/orders/paid-replacement.tsx` | Prior0.4.31 release evidence retained; current full backend regressions |
| PP03/PP04 | Size/add-on/channel recipes and packaging snapshots; costed FIFO semi-finished production/yield/loss. `recipe-profiles.ts`, `production.ts`; migrations052-053; recipe/production UI | Prior8+7 hosted cases and3 local desktop/phone flows; current418 backend and deployed-source membership |
| Q114, Q113 | User explicitly narrowed to Standard-only/video reference; relative percentages, chaining, equals autosave, optional per-result notes, seven-day retention; fixed-axis slide, unchanged proportional interface, visible resize handle and per-employee browser-persistent size. `features/workspace/standard-calculator.tsx`, `styles/workspace-side-tabs.css`, core calculator and services | Four Chromium/WebKit calculator/password workflows plus3 existing calculator math/retry/note regressions; full backend; production-source manifest |
| Q74/Q76/Q90 later direct web revisions | Owner/assigned manager outlet-wide future loyalty cap/name, coupons with capacity/expiry, fixed charges and nearest/up/down future rounding; web OTP/status UI removed without changing stored facts/native policy. Issued bill reward/coupon metadata frozen. `web-bill-settings.ts`, `web-bill-policy.ts`, `adjustments-editor.tsx`, migrations067-068 | Current guest/settings/financial tests; hosted guest/settings suites; LOCAL_BILL_ADJUSTMENTS and LOCAL_GUEST_CHECKOUT |
| Explore/tables | Zoom-aware snapping, eight-direction resize, outside-capable entry/table rules, fence/roundness/chair-linked icons,10px labels, floor rename at picker. Preserve geometry/identities/history. `features/tables/floor-plan.tsx`, `packages/core/src/floor-plan.ts`, floor migrations054-056 | Dated LOCAL_FLOOR/EXPLORE docs; current backend/manifest; no real restaurant geometry was rearranged for QA |
| Restaurant/Superadmin UI | Responsive green/white curved rails, smooth horizontal nav, darker centered brand/footer, subtle hover, corrected clipping/spacing; ordered top-bar controls and shared upload UI. `styles/curved-sidebar.css`, `responsive.css`, `topbar-theme.css`, `features/design-preview/*`, `sidebar-profile.tsx` | Dated responsive/browser evidence; current typecheck/build; working preview remains browser-local where documented |
| Superadmin A-G | Separate platform identities, lifecycle/quotas, supplied-tax immutable SaaS/manual-custody records, explicit scopes/brand grants, audited session-bound read-only/explicit editable owner troubleshooting, measured analytics and actual telemetry. `platform-*.ts`; migrations057-061 | LOCAL_SUPERADMIN_OPERATIONS is current A-G matrix; original LOCAL_SUPERADMIN remaining lists are historical |
| Manual controls/intake |38 server/tenant feature switches; server Off wins without granting roles/plans. Outlet On/Off rejects new intake while existing orders can pay/serve/settle. `platform-features.ts`, `outlet-order-intake.ts`; migrations062-063 | Hosted feature/intake suites and backend guards |
| Support | Persistent scoped chat/desk, claim/assign/solve/Superadmin close, contact links, owner troubleshooting, in-app5s alerts, corrected composers; authenticated WebRTC signalling. `support-chat.ts`, `features/support/*`, `support-notifications.tsx`; migrations065-066 |9 current hosted cases; earlier simulated bidirectional audio; no TURN/internet/hardware claim |
| Customer QR/POS | Server-priced coupon/recognized loyalty/tax/charge checkout; grouped courses and category assignment; actual KOT history; interactive animated step buttons above checkpoint bar, dark current step, compact gap; full-card arcade teaser and removed extra navigation strip. `guest-page.tsx`, `guest-checkout.ts`, `guest-journey.ts`, `category-manager.tsx`; migrations064/067/069 |6 current hosted checkout cases; earlier category/tracker browser/PostgreSQL cases; live imported QR smoke |
| Latest account/order fixes | Accessible Show/Hide password in restaurant signup/sign-in and Superadmin setup/sign-in/confirmation. Successful WEB settlement clears only that order's VIP pin once; failed/provisional bills and other VIPs untouched. `components/password-input.tsx`, shared Form, `platform-signin.tsx`, `billing.ts` |4 two-engine UI workflows;9 focused priority cases;1 current hosted VIP settlement case; full418 |

The final source commit preserves193 previously uncommitted files, source/tests/migrations/docs/artwork and selected sanitized release evidence. Existing package lock is included unchanged at its current tracked version. No dependency upgrade, native binary, private upload or database export was added for this handoff. The unfinished procurement tree is deliberately separate, not silently merged into the deployed source.

## Completed / pending accounting

- Q18-Q119:102 requests; **101 released on the receiving project**, **Q111 alone unanswered**, no confirmed unimplemented Q-series item after the latest scope reconciliation. Q114 was answered later explicitly; only Standard-only/video scope is complete. Full ColorOS/scientific/conversion/currency/mortgage/native parity is excluded.
- Petpooja:27 groups; **6 complete /2 partial /19 pending**. Complete:PP01/PP03/PP04/PP05/PP18/PP23. Partial:PP02/PP20. PP03/PP04 were locally verified before this deployment and are now released as part of its actual source/migrations. Earlier4/2/21 paragraphs are history. PP06 is paused unfinished WIP.
- V2:52 unchecked whole-requirement rows remain in its checklist; existing web portions do not certify complete cross-app/native/provider parity. UPCOMING_WORK carries every one separately. Do not add Q and PP or V2 counts together.
- No new Discord review was performed during this handoff. The exact previously reviewed DM/range/cutoff and source links remain in DISCORD_PRIORITY_REVIEW/CLIENT_FEEDBACK. The old monitor stays PAUSED; no messages/reactions were sent.

## Decisions received since the old handoff

1. Q114 is Standard only, matching the supplied video, green theme, optional notes/history; no extra modes. Chosen size now persists in the current browser until changed (clearing site data removes it); smaller screens fit temporarily without overwriting that preference.
2. Only the successfully settled VIP order returns to normal. Other open VIP orders retain their status. Do not globally clear pins.
3. The later UI references specify horizontal expansion, curved selection, centered darker brand/footer without clipping, subtle dark-theme hover, connected tool panels, floor edit inside picker and green animated customer checkpoint tracking below step buttons.
4. Category allocation uses Starter/Main course/Drinks/Dessert; existing dishes preserve fallback grouping until explicitly assigned.
5. Live Superadmin account email was supplied privately, then the user completed setup. Do not reset or re-enroll it. Ordinary restaurant owners are not auto-promoted.
6. The receiving user explicitly authorized copying Nythz Coooks and existing login/history online. That one-time copy is complete, not permission to repeat/overwrite it. Owner password hashes were preserved; support authors were mapped only to the same approved live email identity.
7. The initial new-database choice was explicit; the later local-restaurant copy was separately authorized. Both decisions supersede the original same-database-only handoff assumptions. Keep the CURRENT receiving Neon resource and deployment intact.
8. Q74 future-cap authority now includes owner/assigned outlet manager; web OTP removal and future settings changes do not relax identity, stock, payment, coupon or native guards. Procurement remains paused.

## Data / access / configuration

Prior accepted release, not this handoff: migrations052-069 followed a private backup/rehearsal; all264 prior rows across65 original tables/columns were preserved. Nythz Coooks imported2,858 selected rows across50 tables atomically:2 outlets,29 tables,47 orders,50 rounds,16 invoices at import verification. Original owner credential and financial/audit records were preserved; auth sessions and editable support grants were not copied. Approved live platform setup is active. Current operational counts can grow normally; those are historical import counts, not values to restore.

Local and cloud databases are independent after the copy; neither automatically synchronizes. Never overwrite live data with an older local snapshot. OriginalPC/other aliases are historical and were not revalidated as current products here. Application passwords are not database-owner passwords.

No credentials/data are in Git. This PC's ignored`apps/web/.env.local`,`.data` trees, parent`work` backups/dumps/QA credentials, deployment environment and consumed setup/bypass metadata stay here. Temporary credential-file deletion was blocked by automatic approval review in the prior deployment turn; this handoff does not bypass that block or publish those files. The receiving PC must get necessary account access privately; no automatic transfer of private databases, uploads, sessions, provider keys or Git/Vercel/Neon ownership occurs.

| Required dependency | Variable names / handling only |
|---|---|
| Runtime hosting | `DATABASE_URL`, `APP_ORIGIN`; obtain approved existing Production access privately. No `NEXT_PUBLIC_` database secret. |
| QA hosted verification | `DATABASE_URL_UNPOOLED` or `POSTGRES_URL_NON_POOLING`/`DATABASE_URL` in a private QA env; privileged disposable-DB creation only when explicitly running QA. `TEST_DATABASE_URL` is injected by verifier. |
| Future controlled migrations | `DATABASE_MIGRATION_URL`; not needed for this handoff and never run automatically to silence a mismatch |
| Isolated local dev | `LOCAL_DATABASE_PATH`, `DD_NEXT_DIST_DIR`, optional explicit`DD_LAN_HOST`; do not inherit Production`DATABASE_URL`/`VERCEL` |
| Browser QA | `QA_BASE_URL`, generated ignored`../work/platform-browser-fixture.json`; optional`QA_AUTH_STATE_FILE` for tests requiring saved QA cookies |
| Existing platform access | Approved existing app login; `DD_PLATFORM_ADMIN_USER_IDS` only for separately authorized legacy configuration. Do not rerun initial invitation/bootstrap scripts. |
| Git publish | Authorized`prasadgourav` fork credentials; source read is public. Never paste PATs/session tokens into chat/source. |
| Provider/native keys | Deferred; no value or integration is invented. No paid upgrade, subscription or auto-top-up authorized. |

## Receiving-PC setup (PowerShell, from repo root)

### Inspect first; never reset an existing checkout

```powershell
git status --short
git branch -vv
git remote -v
git log -5 --oneline
```

If anything is modified/untracked, preserve it safely on its own branch/commit or private backup and review differences first. Do not reset/clean/force-pull or overwrite local databases. Use a separate clone when unsure.

Fresh clone:

```powershell
git clone --branch local-web-calculator https://github.com/prasadgourav/dinerdost.git
cd dinerdost
git rev-parse HEAD
git show 968bbd9659c705b1a6337f3ec5d7aab63c3a7e4f --stat
git fetch origin local-web-procurement
```

For an existing clean clone, inspect any existing`diner-return` remote before adding it:

```powershell
git remote add diner-return https://github.com/prasadgourav/dinerdost.git
git fetch diner-return local-web-calculator local-web-procurement
git switch --create return-diner-dost --track diner-return/local-web-calculator
```

Fetch the exact FINAL HANDOFF SHA from the completion message; verify it matches the expected branch tip and contains 968bbd9659c705b1a6337f3ec5d7aab63c3a7e4f as an ancestor. Do not switch the main working source to the paused procurement branch merely to continue ordinary UI work.

### Install / reproduce baseline

Use Node24.x and the existing lockfile. Inspect privately inherited env files first; clear Production database variables before running local servers/tests. Do not install/enable provider/native packages as part of this setup.

```powershell
node --version
npm ci --include=dev --workspaces --include-workspace-root
npm run build
npm run typecheck
npm test
```

Build before typecheck on a fresh clone to regenerate ignored Next route types. The accepted source passed418 backend cases. Tests explicitly create isolated embedded databases or use the verifier's disposable DB; do not set`TEST_DATABASE_URL` to production. A passing build alone is not UI acceptance.

### Isolated browser QA, not live sales

Windows Edge must be installed for the current Chromium project; install the pinned Playwright WebKit runtime if absent. Run this only on the return source, in a new QA database (not a retained real-restaurant directory):

```powershell
New-Item -ItemType Directory -Force ../work | Out-Null
npx tsx scripts/platform-qa-fixture.ts
npx playwright install webkit
$fixture = Get-Content ../work/platform-browser-fixture.json | ConvertFrom-Json
$env:DATABASE_URL = ''
$env:VERCEL = ''
$env:LOCAL_DATABASE_PATH = (Resolve-Path $fixture.path).Path
$env:DD_NEXT_DIST_DIR = '.next-return-qa'
Push-Location apps/web
npx next dev --webpack --hostname localhost --port 5091
Pop-Location
```

In another terminal at the repo root:

```powershell
$env:QA_BASE_URL = 'http://localhost:5091'
npx playwright test --config playwright.responsive.config.ts --grep 'password visibility|calculator slides on one'
```

The generated fixture credentials stay ignored outside the repo. Other browser specs need their named synthetic fixtures/auth files; read the spec before invoking them. Avoid blindly running the entire historical browser directory against a retained/live tenant. Do not QA mutate Nythz Coooks.

### Hosted/read-only checks when authorized

Owner-granted Vercel access is separate from GitHub. Do not create a new project/database or redeploy while simply receiving this source.

```powershell
vercel --scope prem-2230 project inspect dinerdost-web
vercel --scope prem-2230 inspect https://dinerdost-web.vercel.app --json
```

Optional existing-database verification uses the reviewed READ ONLY utility and a privately supplied env file; it asserts current069 migrations, roles/RLS and KOT authority. No migration follows a failed check:

```powershell
npx tsx scripts/check-handoff-database.ts --env=.env.production.local --out=verification/return-readonly-db-check.json
```

Only for separately chosen isolated hosted QA with an authorized admin connection:

```powershell
npx tsx scripts/verify-postgres.ts --env=.env.qa.local --suites=tests/priority-qr-updates.test.ts 'settling one VIP'
```

The verifier creates/drops only its own exact disposable database. Never point ordinary dev/fixture tooling at the production database. No migration/seed/restore/import/deploy command is required for this handoff.

## Verification and concrete limits

Public evidence: [production acceptance](evidence/production-20261025-acceptance.json), [deployed file manifest](evidence/deployed-source-20261025.json), [commands/results](evidence/RETURN_VERIFICATION.md). Historical release records and original source links remain; private logs/backups were not copied to Git.

- 418/418 backend cases; typecheck; Vercel optimized build READY. Current source files match the uploaded deployment manifest for430 runtime/config files. The final handoff modifies documentation only plus removes an extra EOF blank line in one test.
- 55 isolated real PostgreSQL cases: platform19, guest checkout6, support9, intake6, manual controls4, bill settings10, scoped VIP settlement1. A connection reset caused an initial manual-controls setup failure; the final exact scoped replay passed. All exact disposable verification/rehearsal databases were confirmed absent. Do not report the failed attempt as a passing test.
- Four final Chromium/WebKit calculator/password workflows and three existing calculator retry/math/note workflows passed. Staged and actual public sign-in/password/QR pages rendered at1440/390px without overflow/page errors. Anonymous APIs401; invalid-origin login403.
- Production browser verification was a render/password-toggle/actual QR smoke, not a real-money sales/refund or authenticated employee mutation run. Calculator/VIP write workflows used disposable synthetic QA, never user business orders.
- Physical iOS/Android devices, real keyboards/microphones/printers, TURN/NAT internet calls, external providers, native APKs, production scheduled workers and full v2 parity are not accepted. Games still show Coming soon; the teaser/navigation exists, actual games do not.
- Existing support/browser/module caps and private fixture dependencies are described in local scope docs. Wider rollout/accessibility/performance tests are not implied by the latest focused run. No broad new feature work was started for this handoff.

## Next action

Read UPCOMING_WORK and inspect the paused draft without applying it. First reproduce the clean return baseline on isolated QA. PP21 is the first prior-authorized unblocked non-procurement web candidate after checking the existing code. Continue the first confirmed unblocked WEB task only; keep procurement paused unless the user resumes it. Q111 and optional loyalty broadening require answers before dependent changes. Providers/native/hardware/packages/offline/marketplace/client recipes remain deferred. If no confirmed task is unblocked, ask only for the needed resumption/answer; do not invent new scope or reset data.

## Verified publication checkpoint

The content handoff commit`c1460e4ce3aea13240b724e459964d5f07a9e5c4` and paused-work commit`242d64374f8cfcb7394e4fbdf20a7a769a42aa23` were pushed and verified by public branch refs and byte-identical public file reads. RETURN_HANDOFF, UPCOMING_WORK, CONTINUE_IN_CODEX, production acceptance and the WIP note all matched their Git blobs. A following documentation-only commit records[publication evidence](evidence/RETURN_PUBLICATION.json); its final branch-tip SHA is supplied in the completion message. This avoids pretending a commit can embed its own hash. Upstream/fork main remain preserved; no force push or production change.
