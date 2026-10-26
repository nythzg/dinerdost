# Petpooja comparison additions

**27 October local PP21 checkpoint:** printable/downloadable count sheets and previewed atomic current-day CSV import are implemented and verified separately on `codex/pp21-count-sheets`. See [PP21_COUNT_SHEETS.md](PP21_COUNT_SHEETS.md) and its local evidence. **Unreleased**: the accepted-release counts below remain unchanged, and no Q-series item is counted by this work. Integration must retain newer remote 0.4.32 fixes.

Current25 October return checkpoint: **6 complete /2 partial /19 pending** of27. PP01/PP03/PP04/PP05/PP18/PP23 are complete for the documented web scope; PP02/PP20 remain partial. PP03/PP04 were already verified locally and on15 isolated PostgreSQL cases; their code and migrations052-053 are now included in the accepted receiving deployment through069, with418 current backend passes. See [public release evidence](evidence/production-20261025-acceptance.json) and [source manifest](evidence/deployed-source-20261025.json). This updates their release status, not broader Petpooja/native parity. **PP06 remains paused, unfinished and untested on a separate branch; its draft054 conflicts with deployed054.** See UPCOMING_WORK. Q114 is explicitly answered/released Standard-only; Q111 remains unanswered. Earlier counts below are dated historical checkpoints.

The user authorized adding the missing comparison features to the **web app**, keeping them simple and documenting each addition, on **22 October 2026**. This turns the comparative audit into implementation work; unchecked rows are not completion claims.

Sources: [saved comparison](../output/pdf/DinerDost_Petpooja_Inventory_Gap_Review.html), [PDF](../output/pdf/DinerDost_Petpooja_66_Video_Inventory_Gap_Review.pdf), [66-video evidence matrix](../verification/petpooja-playlist-20261022/review.json). That audit reviewed all 66 transcripts against 0.4.11. It describes tutorial workflows, not current commercial entitlements. Recheck each gap against current source before editing; overlapping tutorials below are one capability.

## Simple interface

Keep the existing navigation and green palette. Put material setup/planning/production under Inventory, recipe choices under Recipes, supplier workflows under Purchases/Vendors, and report drill-downs under Reports. Show advanced fields only within the relevant task. Preserve permissions, tenant/outlet scope, immutable financial/stock history and actual client data.

## Added and verified

Version **0.4.20** completes outlet expiry review/export: **PP01/PP05/PP18/PP23 complete, PP02/PP20 partial; 21 groups pending**. The release table below documents each actual addition and its limits. Q79–Q83 was the separate 0.4.17 client-feedback release.

## Implementation checklist

Numbers refer to videos in the evidence matrix. `[ ]` means pending; completion requires implementation, backend/browser checks and release evidence.

| ID | Addition | Videos | Required safeguards / dependencies |
|---|---|---|---|
| [x] PP01 | Material categories, internal codes, HSN metadata and search/filter tools | 5,17,52 | Preserve base-unit identity and old records; no invented data. |
| [ ] PP02 (partial) | Custom buying packs, explicit base-unit conversion and measured yield | 3–5,7 | Exact kg/L/unit conversions and rounding; preserve historical units. |
| [x] PP03 | Size/add-on/channel recipes and packaging snapshots | 3,7,43 | Resolve before reservation; preserve old order needs and unconfigured base recipes. |
| [x] PP04 | Semi-finished recipes and costed production batches with yield/loss | 6,14,57,66 | Atomic FIFO consumption/output; reservation/expiry guards; no double cost. |
| [x] PP05 | Planned dishes/servings → ingredient needs, usable stock and purchase shortfalls | 9,14 | Preview only; missing recipes unknown; no automatic ordering. |
| [ ] PP06 | Ordered purchase lines, delivery schedules, partial receipts and quantity variance | 8,11,12,54,56 | Preserve legacy purchases; no duplicate expenses/receipts; concurrency checks. |
| [ ] PP07 | Supplier invoices, attachments and actual tax/amount breakdown | 12,18,45 | Owner-only tax retained; no rewriting old approved amounts. |
| [ ] PP08 | Supplier payables, due balances, partial payments, allocations and statements | 17,18,46,65 | Separate supplier/customer ledgers; opening obligations explicit, never inferred. |
| [ ] PP09 | Purchase returns and supplier credits/debit notes | 13,18,46 | Return actual unreserved stock; trace original receipt/cost. |
| [ ] PP10 | Linked inter-outlet requisition, approval, dispatch, transit receipt and returns | 10,11,16,28,30,40,41,47,54,56 | Authorize both outlets; balanced stock/cost; no silent financial obligations. |
| [ ] PP11 | Supplier/outlet material rate cards, effective dates and material mapping | 15,17 | Staff-entered commercial data; old rates preserved. |
| [ ] PP12 | Raw-material sales/challans, receivables and linked returns | 26,27,29,50 | Separate B2B records and traced stock costs. |
| [ ] PP13 | Consolidated central-kitchen demand and direct/PO-linked production | 14,47,66 | Depends on PP04/PP06/PP10; use actual approved demand. |
| [ ] PP14 | Route master, outlet assignments, dispatch/picking matrices and summaries | 44,51,59,60 | Depends on linked dispatch; separate from floor navigation. |
| [ ] PP15 | Inventory dashboard: purchases, waste, consumption/COGS, approvals and observed stock runway | 2,61,62 | Missing/insufficient data remains unknown; no auto purchase/reorder. |
| [ ] PP16 | Unified stock movement bridge with ingredient drill-down | 26,40–42,53 | Reconcile recorded events; extend as transfer/production/return modules land. |
| [ ] PP17 | Multi-day opening/closing comparison and frozen monetary variance | 33,48,49 | Missing counts/cost unknown; current observations separate from balance correction. |
| [x] PP18 | Order → ingredient quantities/cost inspector and food-cost/usage exports | 42,43,55 | Stored needs/FIFO costs; no recalculation using today's recipes. |
| [ ] PP19 | Purchase-rate analysis, supplier invoice drill-down and lifecycle/variance reports | 45,46,54,56 | Depend on actual receipts and PP06–PP10 for newer ledger/dispatch values. |
| [ ] PP20 (partial) | Complete stock, usage, waste, period-comparison and financial exports | 32,42,43,48–53 | Complete authorized rows, not screen pagination; safe spreadsheet text cells. |
| [ ] PP21 (implemented locally; unreleased) | Printable/downloadable count sheets and validated current-day count import | 33,48,64 | [Local implementation and verification](PP21_COUNT_SHEETS.md). Preview first; zero valid, missing unknown; stale conflicts atomic. Release acceptance still required. |
| [ ] PP22 | Validated material/recipe/vendor imports and safe branch copy | 5,7,17 | Preview errors; no invented recipes/units; scope both outlets and retain destination history. |
| [x] PP23 | Affected-dish expiry lookup, eligible bulk expiry handling and exports | 31 | Retain automatic event-driven expiry; no duplicate waste; invalidate reservations normally. |
| [ ] PP24 | Dish-level recipe wastage, reasons/categories and cost trace | 32,55 | FIFO/reservation guards; distinguish raw from already-consumed cooked food. |
| [ ] PP25 | Material barcodes, printable labels and scanner-assisted receiving/dispatch | 5,63 | Keyboard-wedge browser input; physical device acceptance remains separate. |
| [ ] PP26 | Procurement document/email templates, preview and attachments | 35 | Web print/export first; actual sending awaits authorized provider setup. |
| [ ] PP27 | Outlet operation types, purchase-manager assignment and inventory policies | 36–39,65 | Preserve eligible roles/default approval; save new access/financial-policy questions before dependent work. |

## Deliberate differences and deferred dependencies

| ID | Reference | Status |
|---|---|---|
| PD01 | Supplier marketplace, discovery, enquiries/offers/samples and external price discovery (19–25) | Deferred external ecosystem: needs real suppliers, feeds/logistics and an agreed operating model. No fake catalogue. |
| PD02 | Offline/LAN stock hosting and synchronization (34) | Existing native/offline deferral remains. |
| PD03 | Moving-average costing | Preserve approved FIFO and historical costs; policy difference, not a migration instruction. |
| PD04 | Backdated stock edits/automatic closing→opening carry-forward (64) | Preserve current-day observations, read-only past days and unknown missing days. |
| PD05 | Reorder thresholds/automatic purchasing | Client removed the reorder UI. PP05 is an explicit planning preview. |
| PD06 | Karnataka excise stock register (58) | Conditional: applicable jurisdiction/licence/output needs confirmation. |
| PD07 | Client recipes/rates, native/Firebase, providers and packages | Existing deferrals remain; capability must not fabricate operational data. |

Overview videos 1/61/62 summarize other modules and are not extra missing features. Core-present topics retain their existing behavior; only their named advanced gaps are added. The original nine Q-series decisions have been answered; Q111/Q114 remain in [PENDING_QUESTIONS.md](PENDING_QUESTIONS.md) for later review. Their deferred behavior is excluded from this implementation run.

## Change log

- **23 October 2026 · local-only continuation:** PP03 recipe choices/packaging is implemented and locally verified, including eight isolated PostgreSQL cases. PP04 semi-finished production is implemented and undergoing final PostgreSQL acceptance. The receiving user requested local updates, so neither is pushed/deployed and released counts remain **4 complete / 2 partial / 21 pending**. See [local additions and safeguards](LOCAL_WEB_ADDITIONS.md). The Q89 release belongs to the separate client checklist.

- **22 October 2026:** Recovered the comparison and all 66 rows; deduplicated into PP01–PP27 and seven explicit policy/dependency records. This is planning, not completed app functionality.


## Released additions · 0.4.18

**Released and production-verified at https://dinerdost-app.vercel.app, deployment dpl_2HrTUnBq2CG2J6TJW3jx1YtEAQe9.**

| Group | Where to use it | What was added | Limits / remaining work |
|---|---|---|---|
| PP05 — complete for current base recipes | Inventory → Inventory tools → Plan ingredients | Select dishes/quantities, calculate aggregated ingredient needs, usable unreserved stock and purchase shortfalls, export the whole plan. Whole-unit validation and missing-recipe warnings are explicit. | A planning preview; no stock reservation or automatic purchase. Size/add-on/channel recipe selection remains PP03. Actual client recipes must be entered by staff. |
| PP18 — complete for saved records | Order details → Ingredient usage (owner/manager/accountant API; button follows existing order-page access) | Inspect saved per-line ingredient needs, actual per-round ingredient consumption/cost and recorded item costs. Export complete ingredient-needs and consumption CSVs. | Missing historical needs/cost remain unknown. Ingredient consumption costs are shown at their recorded round/material level, not invented per-line ingredient allocations. Today's recipe changes never recalculate past usage. Future production component trace belongs to PP04. |
| PP23 — partial | Inventory → Inventory tools → Expiry & affected dishes | Choose an ingredient, inspect current affected dishes, remaining batch quantities/reservations/expiry and export the complete selected-ingredient batch result. Refresh runs the established workspace expiry handling. | Existing audited automatic expiry remains exactly-once; a dedicated whole-outlet bulk-expiry review/export is still pending. |
| PP20 — partial | Export buttons in the three new tools | Complete plan, selected-ingredient batch and order-needs/consumption exports, including formula-safe text cells. | Broader current-stock, multi-period and supplier/financial exports remain pending. |

**Verification:** 198 full backend tests; six hosted PostgreSQL tests in one disposable database; one local and one production workflow at 1440px/390px; typecheck, optimized local/Vercel builds and 6 anonymous/CSRF checks. Tests cover actual usable stock excluding reservations/expiry, aggregated quantities, incomplete recipe warnings, whole units, historical snapshot stability after recipe edits, exactly-once existing expiry, unknown costs and role/stream/outlet/tenant/native isolation. Browser checks exercise all three tools and CSV download, with unchanged order JSON. No schema migration or historical financial/stock data change was needed. Production checks used one synthetic tenant; temporary credentials/environment/test database were removed.

**Remaining comparison scope:** 27 groups total — **2 complete, 2 partial, 23 pending**. This is not a full Petpooja parity claim. The separate five Q-series decisions, approved FIFO/current-day observations and external/native/provider/package/client-data deferrals remain. Daily screens retain the existing green layout; optional Inventory tools keeps the new workflows out of the main entry form.

Evidence: [acceptance](../verification/production-0418-acceptance.json), [backend](../verification/web-0418-backend.log), [hosted](../verification/hosted-0418-inventory-tools.log), [local browser](../verification/web-0418-browser.log), [production browser](../verification/production-0418-browser.log), [schema](../verification/production-schema-0418.json).


## Released additions · 0.4.19

**Production-verified at https://dinerdost-app.vercel.app, deployment dpl_Ht5Q2gLdLM86ctX1oPTxeubkveXL.**

| Group | Where to use it | Added | Limits / remaining work |
|---|---|---|---|
| PP01 — complete | Inventory → Ingredients/Liquor → Setup | Optional category, internal material code and HSN metadata; search by name/code/HSN/category and filter categories. Unique nonblank codes within an outlet. | No client codes, HSN values or tax rates invented. Existing units, rates and stock history remain unchanged. |
| PP02 — partial | Material Setup → Buying packs; Receive stock → Buying unit | Define Bag = 5 kg, Case = 12 units, etc.; receive explicit pack count and actual pack price. Preview converted quantity and total. Receipt snapshots freeze pack/version/conversion/count/price/base quantity/actual cost. FIFO preserves every paise even when a base-unit reference rate rounds. Stale or foreign pack definitions reject atomically. | Base-unit receipt remains the default. Optional measured usable yield is **reference only**; no automatic wastage, recipe change or reduced receipt quantity. Costed production/yield/loss remains PP04; advanced recipe choices remain PP03. |

Q85's selected customer Ready-to-serve badge has dark-green text on a pale badge; price/quantity/expiry/body contrast remain intact. Q86 applies **25% only to the floor green tint**, retaining dots, fixture/table opacity, geometry and camera/bounds behavior.

**Verification:** 205 full backend tests; seven focused hosted PostgreSQL tests in one disposable database; two local and two production workflows at 1440px/390px; typecheck, optimized local/Vercel build and six anonymous/CSRF checks. Covers exact costs/quantities/FIFO, unknown yield, stale/version/duplicate-code/precision/overflow rollback, immutable receipt snapshots, role/outlet/stream/tenant/native isolation and phone readability. Additive migration 045 preserves all pre-existing invoice snapshots (51), item-cost records (77), raw stock movements (28), prepared movements (6), ingredient units/rates (18), batch rows (17) and prepared-food rows/deadlines (5), checked by before/after digests. Forced RLS and KOT authority remain; no disposable hosted databases or temporary credentials remain.

**Comparison progress:** 27 groups — **3 complete, 3 partial, 21 pending**. Q-series source reviewed through **22 October, 8:55 am IST**: Q85/Q86 released; Q87/Q88 queued; eight saved decisions await later answers. New feedback does not silently change paid-order, bill-edit, default-scope or food-expiry policy.

Evidence: [acceptance](../verification/production-0419-acceptance.json), [backend](../verification/web-0419-backend.log), [hosted](../verification/hosted-0419-material-setup.log), [local browser](../verification/web-0419-browser.log), [production browser](../verification/production-0419-browser.log), [migration preservation](../verification/production-migration-0419.json).

### 0.4.20 — PP23 outlet expiry review

Complete authorized remaining raw-ingredient batches, recorded automatic-expiry write-offs, affected current dishes and safe exports. Unknown dates remain unknown. Refresh retains exactly-once expiry/reservation handling. Three hosted expiry cases and local/production desktop/phone UI workflows passed. [Acceptance](../verification/production-0420-acceptance.json). Prepared-food production and broader exports remain pending. All nine client policy questions were answered at 9:31; implementation remains in the Q queue.

### Local acceptance · 23 October 2026

PP03 and PP04 are locally implemented and verified; not pushed or deployed. Combined: 279 backend cases, 8 PP03 + 7 PP04 isolated PostgreSQL cases, typecheck/build and three local desktop/phone workflows passed. The user requested hosting locally with the original accounts/data; a verified private snapshot now runs at http://localhost:5090 with migrations through 053. Original hosted databases are unchanged. See [local additions](LOCAL_WEB_ADDITIONS.md) and [acceptance](../verification/local-web-pp03-pp04-acceptance.json). Released counts remain 4 complete / 2 partial / 21 pending; local acceptance does not change production completion claims.
