# PP21 · web stock count sheets

27 October 2026 · **Integrated 0.4.33 release candidate, not deployed.** Branch `codex/pp21-count-sheets` preserves the original `cce5086` pin, PP21 commit `282dbc3` and accepted 0.4.32 tip `5ff69c8` through merge `7ea6bd5`. This is separate Petpooja work, not a newly completed Q-series request. See [integration acceptance](evidence/pp21-integration-20261027.json).

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

The initial four selected Edge workflows passed: desktop and phone download/print/error-preview/zero-confirm/history, stale atomic conflict plus HTTP auth/origin/payload limits, and the existing daily physical-count/manual correction/variance-export workflow. Screenshots were inspected at phone/desktop sizes. The initial Service failure was traced to obsolete per-ticket expectations. Its corrected test now proves partial readiness is absent and rejected with HTTP409, the fully ready round appears once with both stations, and serving preserves totals/stock movements. No Service application behavior changed.

Integrated verification: **427/427 backend tests**, **5/5 affected browser workflows**, **20/20 0.4.32 UI checks**, **8/8 existing calculator/password/overview/KYC regressions**, **5/5 real PostgreSQL cases**, optimized build and typecheck passed. The initial PP21 checkpoint separately passed 19 affected service tests and fixed a reviewed literal-search issue RED-to-GREEN; its [historical local evidence](evidence/pp21-local-20261027.json) is preserved. The broader regression run's duplicate synthetic KYC filename was fixed in the test only, using a UUID filename and the exact uploaded link. Independent integration review found no P1/P2 blocker; its two QA nits were resolved by scoping readiness and documenting disposable-cluster ownership.

Real PostgreSQL17 QA used a newly initialized server listening only at 127.0.0.1:55439. `scripts/verify-pp21-postgres.ts` rejects remote hosts/other ports, creates only a uniquely named `dd_pp21_*` database, and covers concurrent101-row imports, exact simultaneous retries, stale atomic rollback, changed units and preservation of an actual synthetic paid invoice/payment/consumed stock. It closes its pools and retains the generated QA database for inspection; the caller stops the disposable server afterwards. No production Neon environment is loaded. All QA files/binaries/databases/session state remain ignored under `verification/`. Hosted Neon and physical-printer acceptance are not claimed. This is not a claim that every historical browser spec was rerun.

## Integration and release

Both newer commits are integrated without rewriting their history. The only merge conflict was documentation; both PP21 and0.4.32 records were retained. Shared modal/focus/draft/navigation/font code matches the accepted0.4.32 source. Package metadata is0.4.33; dependencies and migration001-069 are unchanged.

The intended existing project is `prem-2230/dinerdost-web`. Its connector returned403 for missing team authorization, and the user replied **wait** to the consent request. Deployment/promotion remains held; no alternate project/database or environment changes are substituted. The Git dry run against `prasadgourav/dinerdost` succeeded, but the actual push was rejected with permission denied. The user then explicitly authorized publishing the same feature branch to **nythzg/dinerdost**. Publish only `codex/pp21-count-sheets`, without force or changing main; keep the accepted production record unchanged until actual staged acceptance/promotion is authorized and possible. Choosing this repository does not change the Vercel target or database.

The original checkout remains on its original `main` commit; private `.data`, env files and existing deployment/database are not used or changed. Do not repeat signup/import/restore on a retained tenant, seed an existing database, resume procurement or invent answers for Q111. Native/providers/hardware/package/client-recipe deferrals remain unchanged. RELEASE.json retains its historical accepted release record; this document and the local evidence distinguish implementation from release.
