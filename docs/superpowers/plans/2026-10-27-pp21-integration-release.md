# PP21 integration and Service regression release plan

> **For agentic workers:** Use superpowers:executing-plans inline. Preserve both source histories and existing production data.

**Goal:** Integrate verified PP21 with the newer accepted 0.4.32 source, repair the stale Service browser regression, verify the combined web app, push it and deploy to the existing receiving project.

**Architecture:** Merge `5ff69c8719c4b744dfb7edcba522aaf70df7ba43` into isolated `codex/pp21-count-sheets` after confirming a clean checkout. Keep all 0.4.32 focus/draft/navigation/font changes and PP21. Investigate the Service test against the current per-round API/UI rather than changing approved workflow to match an obsolete assertion. No schema migration or operational data writes.

**Tech stack:** Existing Next 16/React 19/TypeScript/PGlite/PostgreSQL/Playwright/Vercel setup. Existing migration001-069 remains unchanged.

**Spec:** User's 27 October integration, Service-test, full verification, GitHub push and deployment request; PP21_COUNT_SHEETS.md and LOCAL_UI_REVIEW_FIXES.md define the two accepted source slices.

## Constraints

- Preserve original main checkout, untracked/ignored private env/databases and both parent commits. No reset, clean, force-push, seed, restore, account setup or data import.
- Existing receiving production is `prem-2230/dinerdost-web`; do not substitute the old original deployment/database. Verify real project/environment/source before staging/promotion; leave env values unchanged.
- Procurement paused; Q111 and other unanswered/deferred native/provider/hardware/package/client-data work unchanged.
- Push only reviewed application/tests/release records, never local QA databases, credentials, env files or browser sessions.
- Hold cloud access/deployment while the user handles the requested Vercel grant. GitHub connection currently has read-only access to the receiving fork; use existing authorized write access when available, otherwise preserve a ready local release and report the exact missing permission.

## Review focus

Merged modal focus and file-upload/preview state must survive parent refresh; CSV identity/version/unit/permission safeguards remain atomic; Service counts each fully ready round once; font/navigation changes remain intact; deployment uses existing production env/database and no migration.

## Tasks

- [x] Inspect clean branch/history/remotes; fetch and confirm newer remote tip. Check existing project/repository access without exposing secrets.
- [x] Merge 0.4.32 into PP21; resolve only documentation overlap while retaining both histories. Inspect changed dependency lock before install.
- [x] Reproduce Service failure in isolated local QA; trace UI → service-board API → kitchen tickets, then correct only the stale test contract (or a demonstrated application bug). Test incomplete readiness, one fully ready round, serve action, unchanged financial/stock state and authorization guards.
- [x] Run full backend, affected PP21/Service browser checks, 0.4.32 UI regression suite and relevant existing regressions at desktop/phone sizes; build/typecheck and review diff. Keep synthetic fixtures private and separate from production.
- [x] Prepare source/evidence/release documentation and obtain read-only code review; fix verified findings. Keep the integrated source and commit history ready for publication.
- [ ] Verify intended existing Vercel project/environment/DB identity and migration state read-only; stage reviewed source with unchanged existing environment, smoke-test without financial writes, promote the same build, confirm canonical URL/source/data preservation and publish accurate release evidence.

**Result before publication:** Merge7ea6bd5 preserves both parents.427 backend,33 selected browser and5 real PostgreSQL cases pass, plus the final Service recheck, build/typecheck and diff checks. Review had no P1/P2 blocker. A shared synthetic KYC filename collision was corrected with a UUID filename in the test; no documents were deleted or product behavior changed. The PostgreSQL server has been stopped and its generated QA data retained under ignored verification. Git dry-run confirms the existing local credentials can push the feature branch despite the connector's narrower read permission. Publish only `codex/pp21-count-sheets` and verify its remote SHA; keep the production-connected branch unchanged while Vercel access is held.

**Deployment hold:** Intended Vercel team access returned403. The user replied “wait” to its authorization link. Do not retry deployment/promotion or substitute another target until the user is ready and the existing-team grant is available. Accepted RELEASE.json remains0.4.32. No production env/database access, migrations, seed/import or operational writes occurred. See docs/evidence/pp21-integration-20261027.json.
