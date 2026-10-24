# Diner Dost

Current return handoff ·25 October2026: **[RETURN_HANDOFF](docs/RETURN_HANDOFF.md)** and **[UPCOMING_WORK](docs/UPCOMING_WORK.md)** are authoritative. Continue branch`local-web-calculator` at [prasadgourav/dinerdost](https://github.com/prasadgourav/dinerdost); original upstream remains[nythzg/dinerdost](https://github.com/nythzg/dinerdost). Inspect local changes before syncing.

The receiving production app is**0.4.31**, https://dinerdost-web.vercel.app, project`prem-2230/dinerdost-web`, deployment`dpl_DW2u9iuRG8WfmL3Dtx7FQGEYREAd`, migrations001-069. Accepted:418 backend/55 hosted PostgreSQL cases, focused desktop/phone browser checks, typecheck/build. Current Q-series:101 released/Q111 unanswered; Q114 is answered and released Standard-only. Separate Petpooja:6 complete/2 partial/19 pending. WEB ONLY; no full V2/native/provider claim.

The source handoff does not change production/database ownership or copy private data/credentials. Keep the existing Neon resource and deployment; do not reset/seed/migrate/restore or repeat the completed restaurant import. The old monitor remains PAUSED. See[release evidence](docs/evidence/production-20261025-acceptance.json); old0.4.30 paragraphs below are historical.

## Historical original-PC baseline

For hosting on another Vercel account while keeping existing data, follow [the database/environment handoff](docs/VERCEL_DATABASE_HANDOFF.md). Reuse the existing production Neon DB; actual credentials are never in this public repository.

Working web application, version **0.4.30**, deployed and verified at https://dinerdost-app.vercel.app/. Built from DinerDost PRD v2.0 and the approved green layout with large navigation. Read [HANDOFF.md](HANDOFF.md) and [new-device setup](docs/NEW_DEVICE_SETUP.md) when moving this project. Paste [CONTINUE_IN_CODEX.txt](CONTINUE_IN_CODEX.txt) into the receiving Codex chat.

Current Q18–Q119 state is **99 released, Q89 paid replacement pending, Q111/Q114 unanswered**. The latest requested ten-update batch has nine deployed. The separate Petpooja queue has **4 complete, 2 partial, 21 pending** groups. See [RELEASE.json](docs/RELEASE.json), [pending questions](docs/PENDING_QUESTIONS.md), [client checklist](docs/CLIENT_FEEDBACK.md) and [Petpooja additions](docs/PETPOOJA_ADDITIONS.md). The earlier 15-minute monitor is **PAUSED** and not automatically transferred. Recipe/native/Firebase/provider/package/offline-v2 setup remains deferred.

Latest 0.4.30 verification: **254 backend tests**, five isolated hosted PostgreSQL cases, local/production desktop/phone refund workflows, typecheck/build and eight auth/CSRF checks passed. [Acceptance](verification/production-0430-acceptance.json). The original source had no Git history; the user's later request creates the initial import at [nythzg/dinerdost](https://github.com/nythzg/dinerdost), now public at their request and documented in [GitHub handoff](docs/GITHUB_HANDOFF.md). Vercel deployment is not itself a Git push. After a clean extraction/clone run `npm ci --include=dev --workspaces --include-workspace-root`, then `npm run build` to generate Next types, then `npm run typecheck` and `npm test`. Local dev is `npm run dev` at localhost:5090 with isolated PGlite when DATABASE_URL is absent.

In **Team**, the owner can invite staff using a seven-day link. Each employee chooses their own password and signs in to a separate account. The owner can change their role, assigned outlets and enabled status; existing sessions immediately use the updated access. Invitation links are shared manually.

Android is separate under [apps/android](apps/android/README.md). The 0.2.0 native preview replaces the rejected 0.1.0 browser wrapper and adds a bell with a persistent per-account inbox. [Android setup](docs/ANDROID.md) records Firebase configuration, server dispatch and phone checks that are still required before background push can be claimed operational.

## Historical release notes

The paragraphs below retain earlier checkpoints. Current status is above and in RELEASE.json; earlier pending counts/answers have been superseded.

Latest web release **0.4.14**: 17 confirmed requests Q52–Q64 and Q67–Q70: prepared-food reallocation, order counts/actions, separate settlement/invoice, visits/search, stock expiry/daily counts/charts, persistent alert dismissal, table icons/floor contrast, bulk kitchen forwarding, named charges, authorized Kitchen All view and floor camera lock. Q65/Q66 await answers. [Acceptance](verification/production-0414-acceptance.json).

Latest web release **0.4.15**: Q71/Q72: whole-count piece menu selling unit and web Order ready notification navigation to Service. Existing units/history, explicit service action, readiness, ownership and native application destinations preserved. [Acceptance](verification/production-0415-acceptance.json).

Latest web release **0.4.16**: Q75/Q77/Q78: guarded Clear table beside Invoice, a prominent actual table label below Order details, and stronger approved-green floor-fixture contrast. Five policy/configuration questions remain pending. [Acceptance](verification/production-0416-acceptance.json).

Latest web release **0.4.17**: Q79-Q83: visible guarded Cancel/Reallocate controls, separate dark-green order counters/filter tabs, Explore dot grid, durable personal calculator history/notes and current active-orders dock. [Acceptance](verification/production-0417-acceptance.json).

The user also authorized the missing Petpooja comparison capabilities. The separate [additions checklist](docs/PETPOOJA_ADDITIONS.md) records 27 groups (3 complete, 3 partial, 21 pending) and preserves the deferred external/policy dependencies; these are not included in the Q-series completion count.

Latest release **0.4.18**: First Petpooja additions: base-recipe ingredient planning/shortfalls, recorded order ingredient/cost inspector and expiry-to-dishes view, with complete CSV exports for these tools. The broader comparison queue remains in progress. [What was added and remains pending](docs/PETPOOJA_ADDITIONS.md).

Latest release **0.4.19**: Material categories/codes/HSN and filters; exact buying-pack receipts with frozen conversion/cost snapshots; optional measured-yield reference. Q85 Ready-to-serve contrast and Q86 25% floor tint. New Q87/Q88 work remains queued; policy questions saved. [Additions and remaining work](docs/PETPOOJA_ADDITIONS.md).
