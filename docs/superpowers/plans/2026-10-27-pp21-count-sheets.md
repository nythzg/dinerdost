# PP21 count sheets · 27 October 2026

**Goal:** Finish the confirmed printable/downloadable count sheet and previewed current-day CSV import in the web inventory count panel. The user explicitly authorized PP21 after reproducing the pinned `cce5086` baseline. No migration, stock adjustment, procurement, native application or provider work.

**Design:** One Count sheets dialog beside the existing manual entry/export controls. Choose Opening/Closing, download the complete authorized search result (up to 1,000 active items), or print a blank physical observation sheet. A CSV retains outlet/date/phase/item ID/base unit/version and has a separate initially blank Count column. Blank means not observed; zero is an observation. Import previews all validation errors and proposed observations, then explicitly records the whole eligible file once. No silent chunking or partial success. A reason is required for corrections. Versions and eligibility are checked again inside the existing count transaction; a preview fingerprint binds confirmation to the preview. No stock, cost, invoice, payment or historical count mutation.

**Boundaries:** Current India business date for import; existing inventory permission, role stream, restaurant/outlet, feature/plan and web-only guards. Retired/foreign/wrong-unit/duplicate rows, stale versions, invalid numbers, closing without opening and opening after closing are rejected. Limit CSV to 1 MiB and 1,000 rows. Existing manual 100-row API remains unchanged. Exported spreadsheet text is formula-safe; quantities accept at most three decimals in base units. Existing variance export remains unchanged. Read-only Reports may print/download but cannot import. Existing support-view protections are retained.

**Implementation order (inline, shared state):**

- [x] Inspect original checkout/private data, fetch without sync, preserve newer `0.4.32` refs; isolate the exact pinned commit on `codex/pp21-count-sheets`.
- [x] Reproduce baseline install, 418 backend tests, build and typecheck. Browser baseline recorded separately.
- [x] Add failing real service tests for sheet completeness, preview/confirm, zero/blank, stale atomic rollback/idempotency, permissions/streams, date/units/malformed CSV and preservation of stock/financial history.
- [x] Add bounded CSV parser/serializer and sheet services. Reuse the existing transactional count writer without expanding the manual API. Add a narrowly scoped web route with CSRF, payload bounds and plan/feature gates.
- [x] Add dialog, downloadable sheet, printable rendering and file preview/confirmation. Cover desktop/phone, invalid files, stale conflicts, download/print and refresh in isolated browser QA.
- [x] Run affected tests, full backend suite, typecheck/build, review the final diff and update PP/V2/continuation documentation with honest local/release status.

**Result:** 427 full backend passes, 19 affected service passes, four selected desktop/phone browser workflows, final build/typecheck and whitespace checks passed. Independent read-only review's search-parity P2 was reproduced RED and fixed GREEN. Screenshots inspected. See docs/PP21_COUNT_SHEETS.md and docs/evidence/pp21-local-20261027.json for the separate unchanged Service-spec failure and hosted/printer/release limits. No migration or deployment.

**Review focus:** atomicity under late conflicts; blank vs zero; preview invalidation; no shared production env/database access; no native role expansion; formula-safe output; print readability and phone overflow; unchanged original checkout and financial/stock snapshots. No claim of hosted PostgreSQL or physical-printer acceptance without that evidence.

**Release handling:** Local feature branch only. Remote has two newer commits beyond the user's pin, including the recorded 0.4.32 release. Do not deploy this pinned baseline over that release or rewrite either branch. Any integration must retain the newer fixes. Keep RELEASE.json's accepted deployment record unchanged until an actual authorized release.
