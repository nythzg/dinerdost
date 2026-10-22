# Release verification · 0.4.19

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

---
# Release verification · 0.4.18

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

---
# Release verification · 0.4.17

## Production acceptance · 0.4.17

**Q79–Q83 are deployed and verified**, deployment **dpl_DeFdwVBUvF2kZ1YdNGP6KuUNpev2**, at https://dinerdost-app.vercel.app. Cancel/Reallocate now remain visible to managers between Review rewards and Clear all actions on an active accepted round. Paid orders show the unpaid-only eligibility reason; existing financial/cancellation/refund guards and actual-preparation requirements are unchanged. No paid-food reallocation was authorized or introduced.

Orders retains its compact filter tabs and table, with a separate dark-green rounded row of the eight actual counters above it. The row scrolls on phones; counts and filtering remain scoped. Explore has a subtle dot-grid floor fill, retaining geometry, fixture colours, dotted clipping boundaries, pan/pinch/zoom and lock behavior.

The web workspace has a right-side Calculator that stays open across navigation/reload until explicitly minimized. Its bounded arithmetic grammar never evaluates code; results are recomputed on the server. Calculations, optional notes, later note edits and explicit deletions use durable history scoped to the current employee/tenant, with pagination and no automatic expiry. Invalid arithmetic is not saved. The separate bottom-right Active orders panel shows authorized current table/type, actual kitchen stages and outstanding amounts, links to the actual order and minimizes on outside click. It polls while open and pages through active orders independently of the latest-200 workspace list; kitchen/accountant/native roles gain no order-page access.

Verification: **192 full backend tests**, **7 final targeted tests**, **7 hosted PostgreSQL cases in one disposable database**, **four local and one production browser workflows** at **1440px and 390px**. Checks cover account/tenant/outlet/waiter isolation, durable history/notes/deletion, safe arithmetic/idempotency, pagination, round-control visibility without paid mutation, counter filtering/contrast, outside-click/navigation behavior and unchanged saved floor geometry. Typecheck, optimized local/Vercel builds and **6 anonymous/CSRF checks** passed. Additive migration **044_calculator_history.sql** preserves all prior issued invoice snapshots, item costs and raw/prepared stock movements; forced RLS and the KOT authority gate remain. Production tests used one synthetic tenant with normal sign-in. Temporary fixture/auth/environment files and the hosted test database were removed.

All confirmed web requests through **Q83 / 22 October 2026, 7:45 am IST** are released. **Q65/Q66/Q73/Q74/Q76 remain awaiting later answers** in [PENDING_QUESTIONS.md](PENDING_QUESTIONS.md). Client recipe/native/Firebase/provider/package/offline-v2 deferrals remain. Checks continue every 15 minutes; no Discord messages were sent.

Evidence: [acceptance](../verification/production-0417-acceptance.json), [backend](../verification/web-0417-backend.log), [hosted](../verification/hosted-0417-tools-final.log), [local browser](../verification/web-0417-browser-final.log), [production browser](../verification/production-0417-browser.log), [migration preservation](../verification/production-migration-0417.json).

---
# Release verification · 0.4.16

## Production acceptance · 0.4.16

**Q75/Q77/Q78 are deployed and verified**, deployment **dpl_5xLxNYnsM6uQMsFFLjMN6kT2FVLp**, at https://dinerdost-app.vercel.app. **Clear table** now appears immediately beside Invoice in order details and uses the same server command and confirmation as Table billing. Embedded order details show one clearing control; empty visits retain the toolbar control. Every current bill must be settled/rejected/voided. The complete merged group, session ownership, role/outlet/tenant scope and exact visit snapshot are checked. A historical order never offers clearing for a later visit, and stale confirmations still fail. The action releases the visit for new customers while retaining its bills and financial history.

The actual table label appears prominently below Order details. It is read through the already-authorized order's session/table relationship, including closed historical visits; takeaways without a table show no invented number. Invoice snapshots remain unchanged. Mapped fixtures now have a slightly darker green fill, outline and text against the floor; saved positions, sizes, floor/table colours, dotted bounds, pan/pinch/zoom/lock and Arrange behavior are retained.

Verification: **185 full backend cases**, **11 hosted PostgreSQL cases in one disposable database**, **3 local browser workflows** and **one production workflow** at **1440px and 390px**. Coverage includes unpaid sibling-bill blocking, merged clearing, cancellation, stale/new-visit protection, concurrent entry, role/outlet/tenant/ownership, preserved order/invoice/payment/stock data, correct heading placement, no duplicate embedded control and unchanged saved floor geometry. Typecheck, optimized local/Vercel builds and **5 anonymous access checks** passed. **No schema migration** was needed; the KOT authority gate remains enabled and no temporary hosted databases remain. Production checks used one synthetic tenant, provisioned by the existing signup service and signed into through the normal UI; public authentication/rate limits were unchanged. Temporary fixture/auth/environment files were removed.

Latest source cutoff: **22 October 2026, 7:23 am IST**. Five messages and all five screenshots yielded six distinct requests Q73–Q78. **Q73 kitchen completion, Q74 loyalty-cap scope/authority and Q76 future bill-adjustment defaults remain awaiting later answers**, alongside Q65/Q66, in [PENDING_QUESTIONS.md](PENDING_QUESTIONS.md). No financial policy or kitchen-state bypass was guessed. Checks continue every 15 minutes; no Discord message was sent. Client recipe/native/Firebase/provider/package/offline-v2 deferrals remain.

Evidence: [acceptance](../verification/production-0416-acceptance.json), [backend](../verification/web-0416-backend.log), [hosted checks](../verification/hosted-0416-clear-table.log), [local browser](../verification/web-0416-browser.log), [production browser](../verification/production-0416-browser.log), [schema](../verification/production-schema-0416.json).

---
# Release verification · 0.4.15

## Production acceptance · 0.4.15

**Q71/Q72 are deployed and verified**, deployment **dpl_BM5YaZhcYMoTgxbQ5xRTK3oHtGWf**, at https://dinerdost-app.vercel.app. The Menu Sell by selector now includes **piece**, with whole-count inputs and server validation in staff/customer ordering. New order lines preserve the chosen unit, price and recipe usage. Existing menu units, weighted order snapshots, invoices, item costs and stock movements were preserved during migration **043_menu_piece_unit.sql**.

Web staff with Service/order access now open **Service → Ready to serve** from an Order ready notification. Clicking it marks the notification read, refreshes current workspace readiness, and navigates; it does not serve food or record payment. This prevents a newly ready ticket from being absent until the next poll. Staff still explicitly selects Mark as served, with all-station readiness, waiter ownership, role/outlet/tenant checks intact. The ready-to-serve table wraps only within its phone layout so that action remains fully inside its panel. Kitchen-only roles and native application destinations remain unchanged.

Verification: **184 full backend cases**, **4 hosted PostgreSQL cases in one disposable database**, **one local and one production browser workflow**, each covering **1440px and 390px**. The browser verifies actual Menu editing, POS whole-count input, fractional API rejection, notification navigation, explicit serving and unchanged payment/totals. Typecheck, optimized local/Vercel builds and **5 anonymous access checks** passed. Migration preservation includes all prior menu/order units and immutable financial/stock history. Temporary environment/auth files and the test database were removed. Production tests used one synthetic workspace.

All confirmed web requests through **Q72 / 22 October 2026, 6:59 am IST** are released. **Q65/Q66 remain unchecked pending the user's later answers** in [PENDING_QUESTIONS.md](PENDING_QUESTIONS.md). Checks continue every 15 minutes. No Discord messages sent; client recipe, native/Firebase, provider, package and full offline/native v2 dependencies remain deferred.

Evidence: [acceptance](../verification/production-0415-acceptance.json), [backend](../verification/web-0415-backend.log), [hosted database](../verification/hosted-0415-piece-service.log), [local browser](../verification/web-0415-browser-accepted.log), [production browser](../verification/production-0415-browser.log), [migration preservation](../verification/production-migration-0415.json).

---
# Release verification · 0.4.14

## Production acceptance · 0.4.14

**17 confirmed requests Q52–Q64 and Q67–Q70 are deployed and verified**, deployment **dpl_5MxXJatU4sKDxpbfMHU6Q3ouc8Z6**, at https://dinerdost-app.vercel.app. **Q65/Q66 remain unchecked pending the user's later answers in [PENDING_QUESTIONS.md](PENDING_QUESTIONS.md).** 17 confirmed requests Q52–Q64 and Q67–Q70: prepared-food reallocation, order counts/actions, separate settlement/invoice, visits/search, stock expiry/daily counts/charts, persistent alert dismissal, table icons/floor contrast, bulk kitchen forwarding, named charges, authorized Kitchen All view and floor camera lock. Q65/Q66 await answers.

Reallocated counts unique source orders with an audited cooked-food transfer; table moves do not count. Counts cover all authorized outlet orders while the list retains its latest-200 boundary. Reallocation is manager-authorized, version-checked and limited to wholly unpaid orders without unresolved payments/final invoices, with all stations ready and no served food. Original ingredient movements and recorded item costs remain; resale consumes prepared stock and its proportional cost without a second raw-ingredient deduction. Staff supplies the use-by deadline, which cannot extend an existing deadline. Cancellation during preparation records cooked waste without raw-stock restoration.

Clear all actions performs only selected eligible steps through ordinary checks, refreshing state between steps and stopping on failure with completed steps shown. Cash selection explicitly confirms the displayed receipt amount. Settlement stays on the order page; Invoice opens the issued document separately. Historical provisional documents remain viewable/printable without creating a new document. Bill summaries display saved charge names/amounts, with a legacy fallback; no historical financial value is rewritten.

Expired raw/prepared stock moves to audited current-time waste through scoped workspace/stock polling and menu/order requests. Held reservations are invalidated while their cached ingredient needs remain. This is event-driven expiry, not an always-running background worker. Daily counts sit below Inventory metrics; visits/search use actual settled outlet orders with masked list phones. The four report charts use real issued-invoice/received-payment data and existing report permissions/date filters.

Stock/Overview dismissals persist per employee/outlet across reload, navigation and sign-in, retaining source records; a changed stock episode resurfaces. Table cards retain their original actions as horizontal accessible icons. Floor fill has a slight approved-green contrast. The camera lock freezes zoom/Fit/wheel/pan/keyboard/touch movement until unlocked; actual floor editing and fixed dotted clipping boundaries remain. Kitchen All combines only authorized Food/Bar tickets; restricted roles remain isolated. Bulk selected/all forwarding uses batches of up to 20, sorted locks and ordinary audited transitions; a stale selection rolls back its entire batch and the UI reports completed batches on failure.

Verification: **180 full backend cases**, **44 hosted PostgreSQL cases across five disposable databases**, **7 local browser workflows** and **4 production browser workflows** covering desktop/390px layouts. Typecheck, optimized local/Vercel builds and **8 anonymous access checks** passed. Additive migrations **041/042** preserved all prior invoice snapshots, item costs and stock movements; tenant RLS, append-only grants and KOT authority were verified. No unanswered kitchen-policy migration was applied. Production browser tests used four synthetic workspaces. Temporary environment/auth files and hosted databases were removed.

Latest Discord cutoff: **22 October 2026, 6:43 am IST**. All relevant screenshots inspected, no Discord messages sent. Checks continue every **15 minutes**; unresolved questions remain in the linked notes. The superseded 0.4.13 table-move counter build was never accepted; this release replaces verified 0.4.12. Original Q11 client recipes/policy and native/Firebase/provider/package work remain deferred.

Evidence: [acceptance](../verification/production-0414-acceptance.json), [backend](../verification/web-0414-backend-latest.log), [latest hosted checks](../verification/hosted-0414-latest-batch.log), [local browser](../verification/web-0414-browser-confirmed.log), [production workflow](../verification/production-0414-latest-browser.log), [migration preservation](../verification/production-migration-0414.json).

---
# Release verification · 0.4.12

## Production acceptance · 0.4.12

**Q47–Q51 are deployed and verified**, deployment **dpl_7xXWPmHHZuHWx41srzikGaRYCnEh**. **Table billing → Clear table** closes the current visit after every bill is settled/rejected/voided and returns to Tables with Available status. Merged members clear in one transaction. A cancelled dialog does nothing; stale visit/group confirmations cannot clear a later customer’s visit. Existing owner/manager/staff ownership, tenant and outlet guards remain. Bills, payments, cost snapshots and stock history are retained.

**Stock alerts** has a close icon at its top-right. **Overview Alerts** has an individual close control at each row’s end. These dismiss the current view; reload restores the display, and changed stock conditions resurface. They never delete notifications/audit rows, alter stock or mark payments received. **Dine-in orders today** and **Takeaway orders today** use the same outlet and India-day scope as Orders today, count each order once and leave settled sales unchanged.

**Tables → Demerge tables** now immediately separates every member without a popup. Unlinking is atomic and audited, enforces ownership over every visit and rejects changed group snapshots. Each visit/order/bill/QR identity remains on its original table. The earlier individual demerge API remains available to its existing callers.

Verification: **159 full backend cases**, **11 targeted backend cases**, **7 hosted PostgreSQL cases in two disposable databases**, **3 local and 3 production browser workflows** at 1440px/390px, typecheck, optimized local/Vercel builds and **6 anonymous access checks**. QA used two isolated synthetic production workspaces; no client records changed. No schema/data migration was needed. Temporary environment/authentication files and isolated hosted databases were removed. No physical-phone acceptance or new production financial-hash audit is claimed.

Latest Discord cutoff: **22 October 2026, 5:07 am IST**. All five source screenshots were inspected. No Discord message was sent. Existing client-recipe, native/Firebase, provider and package deferrals remain.

Evidence: [acceptance](../verification/production-0412-acceptance.json), [full backend](../verification/web-0412-backend-full-final.log), [targeted](../verification/web-0412-new-backend.log), [hosted clear](../verification/hosted-0412-clear-table.log), [hosted demerge/counts](../verification/hosted-0412-new-requests.log), [local browser](../verification/web-0412-browser-final.log), [production browser](../verification/production-0412-browser.log), [Overview](../verification/overview-updates-1440.png), [Clear table](../verification/clear-table-settled-1440.png).

---
# Release verification · 0.4.11

Q45–Q46 deployed on the production alias, deployment **dpl_5B7iadJMK1fH5YRAEExCDNrnCjx1**. Daily opening/closing physical counts, immutable corrections, frozen variance/CSV reports and a nonblocking staff reminder are verified. Service can mark a ready round served inline with existing readiness and ownership checks.

151 full backend cases, 10 final targeted cases (including QR ordering with missing counts), nine isolated PostgreSQL cases, two local/two production desktop and phone workflows, typecheck/build and six anonymous checks passed. Migration 040 preserves all prior immutable invoice/cost/movement snapshots and keeps RLS/KOT gates. No client record was changed by QA; synthetic records remain isolated. Temporary authentication/environment files and isolated hosted databases removed. Recipe data and external/native/package configuration remain deferred. No physical-device acceptance claimed.

[Acceptance](../verification/production-0411-acceptance.json) · [Migration](../verification/production-migration-0411.json) · [Production browser](../verification/production-0411-browser.log) · [Daily counts screenshot](../verification/daily-counts-desktop.png)

---
# Release verification · 0.4.10

Q44 is deployed on the production alias, deployment **dpl_6jDe5iwP97zSNFeNcVLQ4Cr4jQrq**. POS category labels are larger, every category has a rounded box, and phone overflow stays inside the category strip. Only POS category CSS and selection accessibility changed.

One local and one production workflow passed at 1440px/390px, including size/contrast/label fit, horizontal reachability, keyboard activation, filtering, search and preserved cart contents. Typecheck, optimized local/Vercel builds and three anonymous smoke checks passed. Read-only client-browser inspection matched the screenshot. No backend/schema/client financial changes; no new invoice hash audit or physical-phone acceptance is claimed. QA authentication state removed. Deferred scopes remain separate.

Evidence: [acceptance](../verification/production-0410-acceptance.json), [local](../verification/web-0410-categories.log), [production](../verification/production-0410-categories.log), [desktop strip](../verification/pos-category-strip-1440.png), [phone](../verification/pos-category-boxes-390.png).

---
# Release verification · 0.4.9

Deployment **dpl_DNtqYSfuZreXsXiVEXcBF51ND8KN** is ready on the production alias. Q43 adds a stationary rounded clipping layer within Explore's dotted outer frame. No backend, schema, financial or saved-layout data change.

Both affected local browser cases passed, including 32 edge placements across desktop/phone, View/Arrange and normal/400% zoom, unchanged positions and pinch regression. Typecheck and optimized local/Vercel builds passed. Existing authorized live browser verification confirmed the clipping layer and 36 clear border samples after zoom/scroll. A separate synthetic-signup run timed out before a boundary check; it is not claimed as passing. Three anonymous smoke checks passed. Physical phone acceptance is separate.

Evidence: [acceptance](../verification/production-049-acceptance.json), [local](../verification/web-049-browser-acceptance.log), [build](../verification/web-049-build.log). Prior invoice hashes were checked for 0.4.8; that historical evidence is unchanged and was not rerun for this CSS/markup-only fix.

---
# Release verification · 0.4.8

Verified on **21 October 2026 (India time)**, deployment **dpl_7c2bKXkQLC2uCo3a3cDwAGgHYN6T** at https://dinerdost-app.vercel.app/. All 16 latest requests Q27–Q42 are released. This UI-only follow-up adds content pinch zoom and dotted viewport/layout bounds, and verifies Ingredient-button contrast on phone.

Four affected local and four production workflows passed, including real multi-touch event emulation, stable layout/selection, one-finger pan, saved geometry and readable phone controls. Typecheck, optimized local/Vercel builds and all 18 anonymous-access checks passed. No backend or schema change; all 30 prior invoice digests remain unchanged and KOT authority stays enabled. Physical device acceptance and earlier client/provider/native/package deferrals remain separate.

Evidence: [acceptance](../verification/production-048-acceptance.json), [local](../verification/web-048-final-acceptance.log), [live](../verification/production-048-browser.log), [public](../verification/production-public-048.json), [preservation](../verification/production-048-preservation.json), [cleanup](../verification/production-048-cleanup.json).

---
# Release verification · 0.4.7

Verified on **21 October 2026 (India time)** at https://dinerdost-app.vercel.app/, deployment **dpl_EX5DX3Pc5AnGEStoX9GH92YUFrEp**. Q37's single merged card/group bills and Q38's Menu contrast correction are released. Q27–Q36 were released in 0.4.6; all 12 latest requested web updates are now accepted.

| Check | Result |
| --- | --- |
| Backend | 12 affected cases passed, including financial preservation, separate and grouped bill reads, and waiter/outlet/tenant isolation. Previous 0.4.6 full baseline: 141 passed. |
| Local browser | Six affected workflows plus three final workflows passed, covering three-member grouping, original QR/capacity controls, all member bills, demerge/restore, desktop/mobile rendering and Menu contrast. Previous full baseline: 59 unique passed across main/fixture reruns. |
| Hosted PostgreSQL | New grouped-billing case passed on an isolated temporary database; earlier three merge/demerge cases passed for 0.4.6. |
| Production | All six live workflows and 18 anonymous-access checks passed. Synthetic QA workspaces only for workflow writes. |
| Preservation | No schema migration; all 28 previous invoice digests unchanged; KOT authority retained. Original table/session/QR/order/payment identities remain intact. |
| Build | Typecheck and optimized local/Vercel builds passed. |
| Limits | Client recipe data/blocking policy, Android/Firebase, providers, packages and remaining native/offline/full-v2 acceptance remain deferred. |

Evidence: [acceptance](../verification/production-047-acceptance.json), [local](../verification/web-047-browser-acceptance.log), [final local](../verification/web-047-browser-final.log), [backend](../verification/web-047-backend.log), [hosted](../verification/web-047-postgres.log), [live](../verification/production-047-browser.log), [access](../verification/production-public-047.json), [preservation](../verification/production-047-preservation.json), [merged control](../verification/grouped-tables-desktop.png), [Menu contrast](../verification/menu-contrast-390.png).

---
# Release verification · 0.4.5

Verified on **21 October 2026 (India time)** at https://dinerdost-app.vercel.app, deployment **dpl_HaLyEgWfafRDHtyNFwucHqsHP2Dr**. **Nine requests Q18–Q26 are deployed and verified.** Discord was reviewed through **3:48 am**. The newer **Q27** Receive stock screenshot only says “fix it”; the user has been asked to identify whether the issue is layout, saving or the displayed time. It remains unchecked, and this release does not claim it is fixed.

| Check | Result |
| --- | --- |
| Backend | **138 cases passed** in the final clean full run. The final reward/clock affected run passed all 25 cases. |
| Local browser | **54 unique workflows passed** across the full regression and affected runs. The main run passed 51; draft-editor and partial-payment expectations were corrected for the new staff kitchen flow, and the zero-total workflow was added. All eight new workflows passed; final draft/payment/zero-total rerun passed all three. |
| Hosted PostgreSQL | **17 unique selected cases passed**: nine original review cases, four floor controls, three procurement/report cases and the added zero-total reward case. The affected deferred flow was rechecked. Reservation expiry uses the database clock after the hosted check exposed local/server clock skew. |
| Production browser | **All 10 passed:** staff POS/payment adjustments; occupied tint/click-away/Voided removal; deleted T13 recreation and QR revocation; Explore resizing; inventory valuation/waste/archive; both QR modes; four-row tables; POS variants/quantity controls; zero-total authorization/settlement; thermal invoice/PDF. Two labelled synthetic demo workspaces. |
| Public access | **All 16 passed.** Public sign-in/sample routes work; private APIs and both new inventory commands require authentication; no anonymous staff session issued. KOT retains same-origin framing; other pages retain DENY. |
| Migration | **037–039 applied.** Counts and payable/paid totals, all **23 prior invoice digests**, stock balances/receipt costs/expiry, recipes, old rounding/payment policy, table identities, ingredient details and issued per-item costs are preserved. Existing rounds keep LEGACY gates; no retroactive revaluation or payment classification. KOT authority remains enabled. |
| Build | Typecheck and optimized local/Vercel builds passed; source workspace versions are 0.4.5. |
| Cleanup | Zero temporary hosted test databases. Downloaded production environment and temporary QA authentication state removed. |
| Limits | Q27 awaits clarification. Client recipes/blocking policy, external providers, Android/Firebase, packages and offline/full-v2 acceptance remain deferred/incomplete. QR payment mode does not connect a gateway. Physical printer delivery is not claimed. |

Evidence: [acceptance](../verification/production-045-acceptance.json), [backend](../verification/web-045-backend-release.log), [affected financial checks](../verification/web-045-backend-reward-clock.log), [browser full](../verification/web-045-browser-verified.log), [browser affected](../verification/web-045-browser-acceptance.log), [final browser rerun](../verification/web-045-browser-final-rerun.log), [hosted](../verification/web-045-postgres.log), [final hosted zero-total check](../verification/web-045-postgres-zero-rerun.log), [live workflows](../verification/production-045-browser.log), [anonymous access](../verification/production-public-045.json), [migration](../verification/production-migration-045.json), [cleanup](../verification/production-045-cleanup.json), [build](../verification/web-045-build-final.log), [POS](../verification/review-pos-controls.png), [mobile POS](../verification/review-pos-controls-mobile.png), [green headers](../verification/review-four-row-table.png).

---
# Release verification · 0.4.4

Verified on **21 October 2026 (India time)** at https://dinerdost-app.vercel.app, deployment **dpl_DekayYPgKjbembrQmHhazVyUt847**. Discord was reviewed through **2:43 am**; the latest client feature was at 2:22 am, followed by the user’s upload-only request. **16 later requests are released. Q11’s editor and usage reports are prepared; client recipes and missing-recipe enforcement remain user-deferred.** Approved green theme, permissions and historical finances are retained.

| Check | Result |
| --- | --- |
| Backend | **128 cases passed** across full/affected runs; final application/print scope rerun passed. |
| Local browser | **46 unique workflows passed** across full and affected runs, including all six new workflows and upload-only food/liquor edits. Old menu/Save/version assertions and a browser response-cache test issue were corrected. |
| Hosted PostgreSQL | **22 selected cases passed** across three isolated suites; final KOT print-scope recheck passed. |
| Production browser | **Nine passed:** upload-only image persistence and portions; stock/rates/recipes/reports/alerts; shared table actions; KOT modes/printing; downward rounding/descriptions; private QR/storefront identities; Half/Full layout; thermal invoice/PDF; prepaid kitchen-to-final-invoice. Three labelled synthetic demo workspaces. |
| Public access | **14 passed:** public auth/sample routes accessible; private stock/dish/customer-finance/staff APIs deny anonymous reads, preview denied, no anonymous session cookie. KOT allows same-origin framing only, other pages retain DENY. |
| Migration | **034–036 applied.** Counts/totals, all **19 pre-existing invoice digests**, stock quantities/FIFO costs/expiry, recipes, old rounding and payment policy unchanged; KOT gate remains enabled. |
| Build | TypeScript, optimized local build and final Vercel build passed. |
| Cleanup | Zero temporary hosted verification databases; production environment download and temporary QA session files removed. |
| Scope limits | Client recipe quantities/blocking policy deferred. KOT uses an active web terminal and normal browser print dialog; physical delivery/offline LAN not claimed. Android, Firebase, external providers, package configuration and full v2 remain deferred/incomplete. |

Evidence: [acceptance](../verification/production-044-acceptance.json), [migration](../verification/production-migration-044.json), [live browser](../verification/production-044-browser.log), [public checks](../verification/production-public-044.json), [backend full](../verification/web-044-backend.log), [backend affected](../verification/web-044-backend-rerun.log), [final scope](../verification/web-044-final-scope.log), [browser full](../verification/web-044-browser-full.log), [browser affected](../verification/web-044-browser-final.log), [Half/Full final](../verification/web-044-portions-final.log), [upload rerun](../verification/web-044-upload-rerun.log), [hosted](../verification/hosted-044.log), [hosted print scope](../verification/hosted-044-kot-scope.log), [mobile stock](../verification/late-stock-alerts-mobile.png), [table controls](../verification/late-table-actions.png), [Half/Full mobile](../verification/late-half-full-mobile.png), [upload-only editor](../verification/afternoon-menu-editor.png).

---

# Release verification · 0.4.3

Verified on **21 October 2026 (India time)**. The original **17 evening/overnight web features**, through the 12:37 am client cutoff, plus the thermal receipt layout are deployed at https://dinerdost-app.vercel.app/. The approved green theme and large navigation are retained. Ten later requests through 1:23 am are separately pending in [CLIENT_FEEDBACK.md](CLIENT_FEEDBACK.md); this release is not a claim that all newer requests or full v2 are complete.

| Check | Result |
| --- | --- |
| Backend | Final full run: **113 passed**, zero failures |
| Browser, local | **40 workflows passed** across the main run, corrected affected reruns and the added unassigned-waiter inbox/service case |
| Hosted PostgreSQL | **65 selected cases passed** across eight suites, plus final stock-stream and financial-audit rechecks, each on an isolated temporary database |
| Floor/table controls | Saved 15° rotation, rotated-boundary guards, pointer/keyboard resize, save/cancel and atomic deletion; guarded three-dot merge/swap/delete, stroke/walls, viewport canvas, Fit/pan/zoom and phone containment |
| Stock and language | Opening/movement/closing reconcile at India midnight with food/bar and inventory access scope; English/Hindi interface preference persists per account without rewriting entered data |
| Staff/customer distinction | Web staff submissions accept once with stock reservations; customer rounds still need staff acceptance. Payment/KOT gates, editable held staff rounds, native API behavior and assigned-order access retained |
| Notifications | Two actual waiter accounts receive the ready event once; browser click leads to the table/station service view while private unassigned-order reads remain denied |
| Discounts/rounding | Server integer-paise quotes reconcile with tax, charges, rewards, cash, KDS service and final invoices. Charge/reward audit impacts match rounded payable differences; uncertain/received payments and issued documents remain locked |
| Other requested UI | Remembered Kitchen segment, direct guarded web postpaid action, approved/completed checklist editing, loyalty periods, Half/Full price cards, optional POS descriptions and removal of Void round |
| Thermal bill | Owner branding/contact/footer configuration, frozen snapshots, 80mm content-length PDF, provisional/final and phone layouts; live upload/print/PDF workflow passed. Physical printer output is not claimed |
| Migration | 032–033 applied. Restaurant/order/invoice/payment/customer/table counts and round payable/paid totals match before/after. All **17 pre-existing invoice digests** match; KOT authority trigger remains enabled |
| TypeScript/build | Root typecheck, optimized local build and Vercel production build passed |
| Live browser | All **8** passed: Explore; table actions; Kitchen preference; POS/acceptance/bill adjustments/payment; checklist/loyalty/stock/Hindi; customer QR/postpaid; unassigned waiter ready alert; thermal receipt |
| Public access | All **11** passed. Sign-in/sign-up/sample image 200; protected workspace/inbox/loyalty/stock/activity/staff/logo APIs 401; local preview 404. No anonymous session cookie |
| Cleanup | Zero temporary hosted verification databases remain. Downloaded production connection file and temporary browser session removed; source and client data preserved |
| Deployment | Ready: **dpl_4BffFWXdep5EBqskTk6rJxfZeTFG**, production alias https://dinerdost-app.vercel.app/, source version **0.4.3** |

Hosted selection note: the unchanged full pagination case passed in the 113-case local regression. Its long hosted execution was deliberately stopped; its test database was dropped by the parent runner. The two affected inbox access cases then passed in a focused hosted run. The logs retain those operator interruptions rather than representing them as successful full-suite runs.

Production browser checks used **two labelled synthetic demo workspaces and one synthetic waiter account**. Evidence: [acceptance](../verification/production-043-acceptance.json), [migration](../verification/production-migration-043.json), [live browser log](../verification/production-043-browser.log), [public checks](../verification/production-public-043.json), [backend](../verification/web-043-backend-final.log), [hosted remaining cases](../verification/web-043-hosted-remaining.log), [focused inbox](../verification/web-043-inbox-postgres.log), [Explore phone](../verification/overnight-explore-mobile.png), [Hindi](../verification/overnight-hindi.png), [thermal PDF](../verification/thermal-receipt.pdf).

Android/Firebase, live providers, package configuration and the larger v2 platform remain outside this web release. Discord monitoring is configured every 30 minutes; later requests receive separate checklist and acceptance records.

---

# Thermal bill layout · local verification history (released in 0.4.3)

Checked on 20 October 2026 (India time), against the user's two receipt photographs and Prem's receipt messages through 5:56 pm. At that earlier check the receipt was local and production was 0.4.2. The release acceptance above supersedes that status; migration 032 and the other 17 requested web features are now deployed.

| Check | Result |
| --- | --- |
| Receipt layout | Centered branding, customer and bill metadata, four item columns, quantity/subtotal/taxes, Grand Total and FSSAI/contact/thank-you footer; actual outlet details replace reference identity |
| Owner setup | Outlets → Bill details supports logo upload, phone, FSSAI, feedback email and footer text; existing Manage outlet controls the name/address/GSTIN |
| Snapshot safety | Receipt settings, cashier and table/type frozen at issue; settings changes do not alter issued snapshots or financial totals; legacy snapshots tolerate missing optional fields |
| Permissions/files | Owner-only settings, versions/idempotency, tenant and outlet checks; private staff files cannot become bill logos; anonymous logo reads denied |
| Backend | All 31 relevant cases passed: 2 new receipt cases, 8 billing cases and 21 restaurant cases |
| Browser | New receipt workflow and 2 affected existing invoice/packaging workflows passed across the affected run and receipt rerun |
| Printing | Fonts/logo awaited before print; paper length follows content. One-page PDF is 227.04 × 618 pt (80mm paper class); Poppler rendering inspected without clipped headings, totals or footer. Physical printer not tested |
| Build | Root typecheck and final optimized Next.js build passed |
| Boundaries | No new discount/round-off calculation, other pending feature, Android/provider setup, hosted migration or production deployment included |

Evidence: [acceptance](../verification/thermal-layout-acceptance.json), [receipt PDF](../verification/thermal-receipt.pdf), [rendered PDF](../verification/thermal-receipt-rendered.png), [mobile](../verification/thermal-mobile.png), [provisional](../verification/thermal-provisional.png).

---

# Release verification · 0.4.2

Checked on 20 October 2026 (India time). All 18 afternoon web requests, including messages through 4:35 pm, are implemented. This release is web-only. Package pricing, trial duration and entitlements remain pending by explicit user choice. Full v2, Android/Firebase and external providers remain deferred.

| Check | Result |
| --- | --- |
| Backend | 96 passed across the full and affected/targeted runs |
| Hosted database | All 11 new cases and five affected existing cases passed on isolated Neon PostgreSQL databases; temporary databases removed |
| Browser | All 32 local workflows passed across the main run and corrected/affected reruns |
| Floor editor | Circle preset, pointer/keyboard edge dragging and table/fixture resize handles; compact external labels; outline containment, save/reload and desktop/mobile inspection |
| Menu | Upload/save/reload and public delivery, Half/Full actual prices in POS, liquor labels, invalid SVG rejection; new web saves require a picture |
| Records | Server filters for day/week/month/custom India dates, amount/quantity where relevant, search/status and pagination; older records beyond recent limits covered |
| Identity and files | Reservation autocomplete/account binding and name/phone conflict rejection; private staff files and details denied to cashier/manager/other tenant and omitted from workspace models |
| Notifications and loyalty | Scoped persistent inbox/read state; header Search/bell/Demo order; actual customer balance ranking excludes pending earnings |
| Migration | 029–031 applied. Core record counts, round payable/paid totals, invoice snapshots unchanged. One older approved purchase gained its missing expense; missing count is now zero. Source purchase unchanged; repeat backfill does not duplicate |
| TypeScript/build | Root typecheck and optimized Next.js build passed |
| Deployment | Ready and verified: dpl_EUkNpYeoA3MbwLGv8evm3kr4yrqi, https://dinerdost-app.vercel.app; function region sin1 |
| Production browser | All seven afternoon workflows passed in one isolated synthetic demo workspace; no signup-limit bypass |
| Public access | Sign-in/sample image 200; anonymous workspace/inbox/loyalty/activity/staff-file reads 401; local preview 404; no anonymous session cookie |
| Cleanup | Temporary hosted databases, downloaded production environment and synthetic browser authentication state removed; client/source data retained |

The full browser run initially had stale assertions for intentionally changed labels, normalized phone numbers and the removed Refresh control. Those assertions were corrected and affected workflows rerun. The QR test now waits for navigation before reloading. Pointer testing also verified that circular outlines remain circular after fractional pointer movement.

Migration evidence: [production-migration-042.json](../verification/production-migration-042.json). Canonical checklist: [CLIENT_FEEDBACK.md](CLIENT_FEEDBACK.md). Broader pending work: [V2_CHECKLIST.md](V2_CHECKLIST.md). Screenshots are in verification/afternoon-*.png. Private-file tests use synthetic staff details and dummy documents only. No real identity document was collected for testing.

---

# Release verification · 0.4.1

Checked on 20 October 2026 (India time). The 13-item current web queue is implemented and deployed; full v2 remains incomplete. Android/Firebase and external provider setup remain deferred.

| Check | Result |
| --- | --- |
| Backend | All 85 cases passed locally and on isolated Neon PostgreSQL databases across the full run and affected reruns |
| Browser | All 25 local workflows passed across the full run and corrected/affected reruns |
| Production browser | Five passed: custom floors/visual outline/activation; POS quantities/customer profiles; mixed food/bar cash/payment/KDS/final invoice; saved named taxes/manual digital receipts; owner-only named charges and staff permission guards |
| Simplified editor | No X/Y entry; rectangle/L/U presets, drag corners, rotate, add/remove; visual table/fixture movement, keyboard access, save/cancel/reload and desktop/mobile checked |
| Activation | Explicit outlet switch; OFF requires staff approval, ON opens available tables on scan. Reservations, split visits, idle closure, ordering pause, bans and existing sessions retain their guards |
| Custom floors | Add/rename empty floors, assign new/existing tables, preserve QR/session IDs, remove obsolete placements; reject crossing outlines/out-of-bound objects and stale saves |
| Customer and billing | Prefix lookup by name/phone, management contact corrections, individual points account, immutable prior invoices; owner saved named taxes snapshot into future orders; Bill summary read-only, owner charge edits in header |
| Menu and displays | Demo sample images/custom photo URLs, responsive picture cards and POS quantity badges; food/bar displays and direct-write stream guards, including legacy ticket routing |
| TypeScript/build | Root typecheck and optimized Next.js build passed; Vercel build passed for 0.4.1 |
| Migration | 015–028 applied. Restaurant/order/invoice/payment/customer/table counts and round payable/paid totals unchanged. Every issued invoice snapshot digest unchanged; KOT authority trigger enabled afterward |
| Public access | Sign-in 200; workspace/inbox 401; local preview 404; sample WebP 200. Anonymous reads issue no session cookie |
| Deployment | Ready: dpl_FAxtDK6vhh7FD1wUVb1tbfnqK3hR, https://dinerdost-app.vercel.app/, function region sin1 |
| Cleanup | All isolated Neon verification databases and the temporary downloaded production environment file removed; source/client databases retained |

Production browser checks used separate demo workspaces with synthetic customer details. The earlier 0.4.0 deployment was superseded by 0.4.1 to incorporate the user's request to remove coordinates. No new Android APK or live provider delivery is claimed.

Checklist: [CLIENT_FEEDBACK.md](CLIENT_FEEDBACK.md). Larger pending scope: [V2_CHECKLIST.md](V2_CHECKLIST.md). Migration evidence: [production-migration-040.json](../verification/production-migration-040.json). Built-in image_gen produced six labelled demo images in apps/web/public/images/menu/samples; exact prompts and saved source/output mappings are in [menu-photo-assets.json](../verification/menu-photo-assets.json).

---

# Release verification · 0.3.7

Checked on 20 October 2026 (India time). Web version 0.3.7 is deployed and verified on the public alias. Native Android preview 0.2.0 replaces the rejected browser wrapper; final device-build evidence is recorded separately.

| Check | Result |
| --- | --- |
| Backend | All 62 local PGlite cases passed |
| Hosted database | All 27 affected table, feedback, inbox and member/vendor cases passed on isolated Neon databases; temporary databases removed |
| Browser | 19 local workflows passed across the full run and targeted rechecks; all five selected production workflows passed |
| TypeScript and build | Root typecheck and optimized Next.js build passed locally; Vercel build passed |
| Staff activation | Scanning does not activate; request/retry/deduplication, staff approval/rejection, reservations, role/outlet guards and code-free ordering tested |
| Inbox API | Per-account read state, pagination, safe summaries, CSRF, unauthenticated denial, tenant/role/outlet/waiter isolation tested |
| Native production emulator | HTTPS sign-in/inbox against live Vercel, OS notification display/tap and bundled sound-channel URI passed; physical audible sound/background FCM remain unverified |
| Native local emulator | Full order/payment/kitchen/invoice flow, activation approval, inbox/read state, member/vendor edits and separate cashier/waiter/chef sign-ins passed as one instrumented workflow |
| Member data | Owner/staff name and monthly salary edits, self-profile, existing sign-in, stale writes and permissions tested |
| Vendors | Draft/Approved/Completed editing, prefilled fields, saved values, unchanged status/purchases and audit integrity tested |
| Migration | 014 applied; restaurant, order, invoice and payment counts matched before/after |
| Production access | Sign-in 200; workspace/inbox APIs 401 without sign-in; local preview 404; no anonymous session cookie |
| Deployment | Ready: `dpl_Do1o2K3kXS76CnDCRm26Wqi5Kr5K`, https://dinerdost-app.vercel.app/ |

Production browser checks used separate labelled demo workspaces. The native inbox is independent of Firebase. Full native parity, physical-device acceptance and background FCM delivery are not claimed; see [ANDROID.md](ANDROID.md).

---
# Release verification · 0.3.5

Checked on 20 October 2026 (India time). Version 0.3.5 is deployed on Vercel and verified on the public alias.

| Check                          | Result                                                                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend                        | All 55 cases passed on PGlite and isolated Neon PostgreSQL databases; temporary hosted databases removed afterward                                                                    |
| TypeScript                     | Passed                                                                                                                                                                                |
| QR activation and idle closure | Scan opens/reuses one session; no activation button; reserved/unavailable tables remain guarded; real input extends activity; polling does not; unsettled orders prevent closure      |
| Tables and Floor plan          | Dark occupied cards, direct separate-bill access, small Move/swap icon, actual tables, all four fixtures, drag/keyboard positioning, saved edits and phone containment checked        |
| Owner bill controls            | Tax/custom-menu rates and named charges add/edit/remove tested; manager/cashier controls absent and direct writes denied with 403; charges appear on immutable bill snapshots         |
| Payment recording              | Cash/digital receipts recorded in one step, no extra cashier password; partial/duplicate receipts and final settlement tested                                                         |
| Staff accounts                 | Independent cashier/waiter/chef sign-ins, owner-only one-use invitations, expiry/revocation, role and outlet editing, immediate access changes and tenant isolation checked           |
| Visual inspection              | Customer welcome, Floor plan, occupied cards, mobile billing, tax editor, charge editor, payment form, bill with packaging fee and staff invitation inspected                         |
| Final regression/build         | All 17 local browser workflows and optimized Next.js production build passed                                                                                                          |
| Hosted checks for this batch   | All six production browser workflows passed: full cash/payment/kitchen/invoice, QR ordering/privacy/bans, preview denial, Floor plan, owner tax/charges and staff invites/role access |

Migration 011 adds saved floor plans, server-side idle activity and audited table closure. Migration 012 adds bill tax overrides and named round charges. Migration 013 adds staff invitations and employee update versions. All three are applied to production; before/after restaurant, order, invoice and payment counts matched. Expiry is enforced on server requests: active views refresh about every 15 seconds; without any requests, cleanup runs on the next request. The timer does not override unsettled-order protections. Named charges are fixed amounts added after item tax and scoped to a selected round.

The [feedback checklist](CLIENT_FEEDBACK.md) preserves the previous release evidence and tracks all 16 new/revised items. Four external integrations remain user-deferred. Deployment is Ready at https://dinerdost-app.vercel.app/, ID `dpl_AcxdTz85M1bMLERecoxXSYdvCoNz`. Anonymous sign-in returns 200, workspace returns 401 and local preview returns 404 without issuing a session cookie. Android work follows this verified web release.

---

# Release verification · 0.3.4

Checked on 19 October 2026 (India time).

| Check                        | Result                                                                                                                                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source scope                 | Table QR is hidden from the desktop and mobile sidebar; its utility page and permissions remain available from Tables                                                                                                                                   |
| Table card design            | Metadata stays at the top, with full-width Seat guests and pale Table QR actions stacked at the bottom; occupied table sessions retain their controls                                                                                                   |
| TypeScript                   | Passed                                                                                                                                                                                                                                                  |
| Temporary browser bans       | Owner/manager controls, outlet isolation, expiry, early lifting, audit/idempotency and denial of QR orders/service requests tested                                                                                                                      |
| Local integration suite      | All 34 cases passed on PGlite, including round edits, activation, table swaps, categories, methods, reservations, identity, expenses, attendance, peg stock and service before table activation                                                         |
| Local browser workflows      | All 11 passed across the full run and the affected purchase-form rerun: original seven flows plus table move/swap/closure and service rejection, order/payment filters, recipe/liquor/purchase/checklist forms, reservation reminders and setup buttons |
| Hosted integration suite     | All 34 passed on isolated Neon PostgreSQL databases; both temporary verification databases were dropped afterward                                                                                                                                       |
| Production build             | Optimized Next.js build passed locally and on Vercel                                                                                                                                                                                                    |
| Production browser workflows | All three passed on the public alias: full cash/payment/kitchen/final invoice, QR ordering/isolation/device bans, and production denial of local preview                                                                                                |
| Table QR popup               | Renamed button opens the correct table QR and download control; local desktop/mobile checks passed                                                                                                                                                      |
| Customer navigation          | Customer menu URL and separate QR printing page remain accessible from the Tables page                                                                                                                                                                  |
| Customer reference           | Welcome, large Call waiter/Menu tiles and Water/Bill bar follow the supplied sketch in the approved green theme; mobile/desktop screenshots inspected, menu/cart/order flow and service actions tested                                                  |
| Service before activation    | Waiter/water/bill requests do not open an empty dining session; active duplicate requests are reused; staff ownership and outlet scope tested                                                                                                           |
| Deferred integrations        | All six Connections buttons, fingerprint button and Campaigns provider/order-token buttons open their required setup details; live connections remain deferred by user                                                                                  |
| Layout                       | Table cards checked at 1440px and 390px without page overflow or browser errors                                                                                                                                                                         |
| Deployment                   | Version 0.3.4 is Ready on Vercel, deployment `dpl_AZULmdndDkRSHkZRJ9eytAUh26vm`; public alias resolves to this deployment                                                                                                                               |
| Production access            | Anonymous sign-in returns 200; workspace API returns 401 without authentication; `/preview` returns 404 without a session cookie                                                                                                                        |

Live URL: https://dinerdost-app.vercel.app/.

Migrations 007–010 are applied to production after passing both backend suites on isolated Neon databases. Before/after migration counts of restaurants, orders, invoices and payment attempts matched. Production browser checks then used two isolated, labelled demo workspaces. Customer welcome and QR screens were visually inspected from the production tests at phone widths; the customer welcome also passed desktop capture. The downloaded production environment file was removed. The [feedback checklist](CLIENT_FEEDBACK.md) records 36 deployed items and four user-deferred live integrations. Review artifacts stay outside the source archive. Full PRD coverage remains documented in [COVERAGE.md](COVERAGE.md).


## 0.4.20

216 backend, 11 hosted cases in two disposable PostgreSQL databases, eight local and five production workflows passed (1440/390px). Final typecheck/build and seven public auth/CSRF checks passed. Migration 046 preserves historical records and KOT authorization. See verification/production-0420-acceptance.json. VIP View-label contrast follow-up identified visually for immediate correction. Synthetic tenant only.

## 0.4.21

219 backend tests, three hosted table-name cases (one disposable DB), eight distinct local workflows and five production workflows passed at 1440/390px. Full local run had six passing workflows plus two failures corrected in final three-workflow rerun; final union eight. Production had three passing workflows followed by successful VIP/base-item and fresh-table fixture reruns; final union five. Source UI and control hit targets visually inspected. Typecheck/optimized build and seven public checks passed. No migration; QR/session/order identities retained. See verification/production-0421-acceptance.json and related logs.

## 0.4.22

224 full backend, five hosted Service cases in one disposable DB, six local workflows plus affected two-workflow final rerun, three production workflows at 1440/390px. Service row deduplication, actual ready timestamps, complete >100-row counts, date/overnight shifts, waiter/outlet/tenant/native boundaries, atomic confirmed serving and payment invariance checked. Typecheck/build and eight public auth/CSRF checks passed; no schema changes. [Evidence](../verification/production-0422-acceptance.json).

## Production checkpoint 0.4.23

Q65/Q73 released: new-round kitchen-stage switch, explicit prepared/served completion and preserved waiter coordination with assignment-scoped serving. Existing rounds retain their previous policy. 230 backend, 26 targeted regressions, seven hosted cases in three disposable PostgreSQL databases, eight distinct local and four production browser workflows passed at 1440/390px. Typecheck/build and eight public auth/CSRF checks passed. Migration 047 preserves financial/stock history and KOT authority. [Acceptance](../verification/production-0423-acceptance.json). Q18–Q119: **81 released, 19 confirmed pending, Q111/Q114 awaiting details**. PP remains four complete/two partial/21 pending. No native/provider work or Discord messages.

## Production checkpoint 0.4.24

Q115–Q119 released: numeric table-card ordering with inline collision guidance, compact anchored order menus, explicit menu-control contrast, SweetAlert2 native/confirmation-only prompts with Cancel focus and visible stale errors, and staff-only reallocated-food availability. Customer QR/storefront catalogs omit synthetic ready items and stale submissions are rejected; staff POS, FIFO/prepared stock, immutable history and native/default-false catalog behavior remain. **232 backend, two hosted cases in two disposable PostgreSQL databases, 12 distinct local and six production workflows passed** at 1440/390px. Final affected local run: six passed; earlier fixture/portal/type issues corrected and retained in logs. Typecheck/build and eight anonymous auth/CSRF checks passed. No migration. [Acceptance](../verification/production-0424-acceptance.json). Q18–Q119: **86 released, 14 confirmed pending, Q111/Q114 awaiting details**. PP remains four complete/two partial/21 pending. No native/provider work or Discord messages.

## Production checkpoint 0.4.25

Q106/Q107 released: rotated walls reach the actual edge; pointer/keyboard resizing holds the opposite world corner/edge and enforces actual geometry. Selection freezes auto-fit during the gesture. Map labels omit auxiliary seat/status/copy descriptions while retaining accessible details; fixed dotted-frame clipping and current outline/role safeguards remain. **Ten affected backend cases, one hosted PostgreSQL case, three distinct local workflows and one production workflow with six angle/viewport scenarios passed** (15°, 90°, 345°; 1440/390px). Latest complete backend baseline is 232 passes from 0.4.24; this floor-only batch uses affected verification. Typecheck/build and eight anonymous auth/CSRF checks passed. No migration. [Acceptance](../verification/production-0425-acceptance.json). Q18–Q119: **88 released, 12 confirmed pending, Q111/Q114 awaiting details**. PP remains four complete/two partial/21 pending.

## Production checkpoint 0.4.26

Q105/Q108 released: the fixture selector offers Table and Private room. New tables remain draft placements until an authorized atomic layout save creates an independent empty table and QR identity; cancel, label conflicts and stale/unauthorized saves create nothing. Entry/Exit use gate symbols, drag along usable floor boundaries and retain rotation and actual outline bounds. Small-target pointer routing distinguishes the visible resize knob from body dragging. **Thirteen affected backend cases, one isolated hosted PostgreSQL case, three local and three production browser workflows passed**, including fixture/gate checks at 1440/390px and six rotated-geometry regression scenarios. The latest complete backend baseline remains 232 passes from 0.4.24. Typecheck/build and eight anonymous auth/CSRF checks passed. No migration. [Acceptance](../verification/production-0426-acceptance.json). Q18–Q119: **90 released, 10 confirmed pending, Q111/Q114 awaiting details**. PP remains four complete/two partial/21 pending.

## Production checkpoint 0.4.27

Q109/Q110/Q112 released: bounded draft undo/redo (buttons and Ctrl+Z/Ctrl+Shift+Z), one history entry per pointer gesture, text editing excluded, and separately saved table renames retained. Ctrl-click or Select multiple works on desktop/touch; one common constrained movement preserves selected identities/relative geometry and non-selected objects. Selected floor plus zoom/pan/lock are stored per account/outlet/floor, validated on restore, with explicit unlock and removed-floor fallback. Seven pure backend geometry/storage cases, four local and four production workflows passed at 1440/390px, including fixture/gate/rotation regressions. Typecheck/build and eight anonymous auth/CSRF checks passed. No migration or client financial/stock data changes. Latest full backend baseline remains 232 passes from 0.4.24.

[Acceptance](../verification/production-0427-acceptance.json). Client queue: **93 released, 7 confirmed pending, Q111/Q114 awaiting details**. Petpooja is tracked separately.

## Production checkpoint 0.4.28

Q76/Q90 released: owner/manager can save outlet-wide Round down to ₹1 for future web staff/QR/D2C rounds only; no discount default and no existing-round recalculation. Billing staff can change eligible discounts/rounding at any kitchen stage before full payment/final settlement; named charge editing stays owner-only. Verified partial receipts remain immutable, unresolved receipts block edits, and the new total cannot fall below money already received. Quotes/estimated earn and actual payment status refresh after a valid change; stock history is preserved. Fully paid/issued bills require separate refund/replacement. 245 full backend tests, 12 focused tests, four hosted PostgreSQL cases, and local/production desktop/phone workflows passed, along with typecheck/build and eight anonymous auth/CSRF checks. Migration 048 adds only a future preference defaulting false; before/after digests preserved all existing invoices, receipts, costs, stock, rounds and outlet policies.

[Acceptance](../verification/production-0428-acceptance.json). Client queue: **95 released, 5 confirmed pending, Q111/Q114 awaiting details**. Petpooja is tracked separately.

## Production checkpoint 0.4.29

Q74/Q95/Q96 released: a default ₹50 cap is shared by all web loyalty claims on one order/final bill. Smaller rupee claims respect actual balance, existing eligibility and point-value increments; concurrent separate-round claims cannot multiply the cap. Coupon code entry is separate below Received, replaces loyalty on that round, and shows the saved code in the summary. Invalid rewards stay in the new dialogs with inline validation. Only an explicitly provisioned platform identity may configure an outlet cap; ordinary restaurant roles cannot grant themselves that access. Actual platform-account provisioning remains an operator setup dependency in PLATFORM_LOYALTY_SETUP.md and no human account was auto-granted access. Thirty-three affected local backend cases, four hosted PostgreSQL cases and local/production desktop/phone workflows passed; typecheck/build and eight auth/CSRF checks passed. Browser workflow covers the zero-balance claim and invalid-code path; positive claims, valid coupons, concurrency and configuration are covered by real backend/PostgreSQL tests. Migration 049 adds only a future-web-claim cap; prior financial/stock rows remain unchanged. Latest complete backend baseline is 245 passes from 0.4.28.

[Acceptance](../verification/production-0429-acceptance.json). Client queue: **98 released, 2 confirmed pending, Q111/Q114 awaiting details**. Petpooja is tracked separately.

## Production checkpoint 0.4.30

Q91 released: owner/manager may record an already-returned manual full or partial refund; a cashier can request a scoped manager approval with no financial effect until approval. Amounts are capped by remaining actual verified receipts and the chosen issued bill; concurrent/duplicate/stale requests cannot create excess refunds. Reason, mode, original invoice/receipt links and explicit confirmation are required. Immutable refund documents retain allocation and credit-component snapshots; original invoices, receipts, round amounts, stock costs and reward history stay unchanged. Reports show original gross collections and separate refunds with net receipts/sales; a provisional-bill refund is recognized once when the final sale is issued. No gateway reversal is triggered. Eight affected cases, all 254 backend cases, five isolated hosted PostgreSQL cases and desktop/phone local/production refund workflows passed, alongside typecheck/build and eight anonymous/CSRF checks. Migration 050 adds only new refund/request tables and preserves prior financial, loyalty, stock, outlet and KOT records. Q89 paid replacement remains pending; Q111/Q114 remain unanswered. Petpooja counts are unchanged.

[Acceptance](../verification/production-0430-acceptance.json). Client queue: **99 released, 1 confirmed pending, Q111/Q114 awaiting details**. Petpooja is tracked separately.
