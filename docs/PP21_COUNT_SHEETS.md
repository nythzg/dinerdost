# PP21 · web stock count sheets

27 October 2026 · Local implementation on `codex/pp21-count-sheets`, based on the user's exact `cce5086a45b90b259fa15e0344fe1094fdb16067` pin. **Not deployed.** This is separate Petpooja work, not a newly completed Q-series request.

## Using it

In **Inventory → Daily counts → Count sheets**, choose Opening or Closing. Download the complete authorized search result, including items beyond the 100-row screen page, or open the printable physical-count sheet. Each sheet is limited to 1,000 active items; narrow the search for larger inventories. The print view has blank physical-count/notes columns and a repeated table header.

Fill only the CSV's **Count** column in its listed base units. Keep outlet, India business date, phase, item identity, unit and version columns unchanged. Blank quantities are skipped; explicit `0` is recorded. Up to three decimals are supported for measured quantities. Previously recorded observations appear in the separate Recorded count column; the new Count column starts blank.

Upload the completed CSV, provide a reason when correcting an observation, and choose **Preview import**. Review the quantities and all row errors. **Confirm and record counts** appears only for a valid preview. Changing the file, phase or reason invalidates that preview. A saved import refreshes the displayed counts; use a fresh sheet for another observation/correction.

Only today's India business date can be imported. Previous dates and the Reports view offer sheets without an import control. Closing requires an opening observation; opening becomes locked after closing. Counts remain physical observations: importing does not adjust on-hand stock, carry forward missing counts, backdate, change FIFO/costs or rewrite financial history.

## Server safeguards

- Existing inventory permission, tenant/outlet and food/bar stream restrictions; explicit web-only application guard. Existing feature/plan restrictions apply to sheet reads, previews and writes. No new roles or native commands.
- Exact template headers, 1 MiB CSV / 1,000-item limit, bounded JSON request reader, strict quoted-CSV parsing, BOM/CRLF support, escaped spreadsheet text, stable item IDs and literal search matching.
- Malformed/foreign/retired/duplicate/wrong-unit rows, invalid quantities, stale versions, missing opening and locked opening are rejected. Blank is never coerced to zero. Invalid previews make no count/audit/idempotency writes.
- A preview fingerprint binds confirmation to its exact file/reason/proposed observations. Confirmation locks the outlet and affected ingredients, validates every row again, then appends all observations in one transaction. No automatic chunking or partial saves. Late conflict rolls back everything. The existing idempotency contract makes a retry safe.
- The original manual-count API keeps its 100-row limit and behavior. Both entry paths reuse the same snapshot/version/correction/audit writer. Existing variance export is unchanged. There is **no database migration**.

## Verification and boundaries

The exact pinned baseline passed fresh install, **418 backend tests**, build and typecheck in isolated QA. New service tests use an in-memory database regardless of inherited production environment variables; browser tests create only disposable synthetic tenants in a separate local database. They exercise zero/blank, pagination beyond 100 items, correction/phase rules, malformed input, literal special-character search, permissions/stream/native/retired guards, concurrent/stale import, feature controls, safe names and an actual paid invoice/consumed-stock preservation snapshot.

Four selected Edge browser workflows passed: desktop and phone download/print/error-preview/zero-confirm/history, stale atomic conflict plus HTTP auth/origin/payload limits, and the existing daily physical-count/manual correction/variance-export workflow. Screenshots were inspected at phone/desktop sizes. The adjacent unchanged Service browser case was also attempted and failed its expected ready-order row selector; no Service behavior or test was changed to make PP21 pass. This is not a claim that the entire legacy browser suite passes.

Final verification: **427/427 backend tests**, **19/19 affected service tests** (including nine new PP21 cases), **4/4 selected browser workflows**, production build and typecheck passed. Read-only review found one search-parity issue; a new failing regression reproduced it, then passed after literal escaping matched the existing report. See [local evidence](evidence/pp21-local-20261027.json). Local logs/screenshots remain under ignored `verification/pp21-*`. No hosted PostgreSQL concurrency or physical-printer acceptance is claimed; those remain release acceptance checks on an approved isolated environment/device.

## Integration and release

Git inspection found the supplied remote branch already has two later commits: `fbb7e92` (UI drafts/focus/navigation/fonts) and `5ff69c8719c4b744dfb7edcba522aaf70df7ba43` (recorded 0.4.32 production release). They were fetched/preserved, not overwritten. This branch deliberately starts at the requested pin; integrate PP21 onto the newer accepted source and repeat acceptance before any deployment. Do not deploy the pinned 0.4.31 tree over 0.4.32.

The original checkout remains on its original `main` commit; private `.data`, env files and existing deployment/database are not used or changed. Do not repeat signup/import/restore on a retained tenant, seed an existing database, resume procurement or invent answers for Q111. Native/providers/hardware/package/client-recipe deferrals remain unchanged. RELEASE.json retains its historical accepted release record; this document and the local evidence distinguish implementation from release.
