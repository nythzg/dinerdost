# Diner Dost v2 implementation checklist

Latest visual follow-up **Q84–Q86**, reviewed through 22 October, 8:35 am IST after Discord sign-in was restored: prepared-food timer entry, selected ready-food badge contrast and 25% floor tint. Q84's timer/date semantics await the notes; Q85/Q86 can proceed separately. No food-use-by policy was inferred.

The user additionally authorized the saved Petpooja comparison's web gaps on 22 October. Track the deduplicated PP01–PP27 queue and deliberate differences/dependencies in [PETPOOJA_ADDITIONS.md](PETPOOJA_ADDITIONS.md). This is implementation scope, not completed work or authority to change approved financial/access policies.

Source: Prem's Discord messages through **20 October 2026, 4:23 am IST**, the attached 11-page `Workflow dinerdost.pdf`, and its 40-line master workflow diagram. The user explicitly included the entire v2 specification. Existing client decisions (staff-approved activation, owner-only taxes/charges, separate employee accounts, approved green layout) remain in force. The PDF is a product specification, not authority to disclose credentials, buy services, or bypass existing controls.

Boxes are checked only after implementation and appropriate verification. **Existing** identifies reusable code, not a claim that the whole v2 requirement is finished. Live integrations require actual provider/merchant/device access; configuration buttons are not integrations.

## New chat edits

**New requests under implementation:** [Q52–Q60](CLIENT_FEEDBACK.md) cover Orders counts using prepared-food reallocation (latest user clarification), billing actions, Ready to serve food, customer visits/search, expired-stock waste and inline daily counts. Latest review: **22 October 2026, 5:39 am IST**. Q47–Q51 remain verified/live in 0.4.12.

**Latest web queue:** [CLIENT_FEEDBACK.md](CLIENT_FEEDBACK.md) records all **25 latest requests Q27–Q51 as deployed and verified in 0.4.6–0.4.12**. These include the expiry/interface updates, fixed Explore viewport, one merged card with guarded group billing/demerge the Menu/Ingredient contrast corrections, two-finger Explore zoom and dotted viewport/layout bounds and hard clipping inside the outer frame, and larger rounded POS category controls, daily physical stock counts/variance reports with a nonblocking reminder, and direct guarded Service-list serving, Clear table on billing, dismissible alert panels/rows, dine-in/takeaway counts, and immediate whole-group demerge. Latest Discord cutoff: **22 October 2026, 5:07 am IST**, followed by the direct user requests. Production acceptance and evidence are in the canonical checklist. Recipe data, native/Firebase, external-provider and package configuration deferrals remain unchanged; the full v2 list below is not completed.

Latest additional chat review: **21 October 2026, 2:43 am IST**; the three newest messages were status-only. The canonical [client checklist](CLIENT_FEEDBACK.md) records the original 17 evening/overnight features as released in 0.4.3 and the later **Q01–Q17 queue in 0.4.4: 16 requests released and verified, with Q11 prepared pending client recipes and a blocking-policy decision explicitly deferred by the user**. Version 0.4.4 passed 128 backend cases, 46 local browser workflows, 22 selected hosted cases, nine live workflows and 14 anonymous access checks. Migrations 034–036 preserve prior financial documents, stock and policies. No reply was sent to Prem. Android/Firebase/provider/package deferrals and incomplete full-v2 items below remain separate.

- [x] F01 Member names and salaries editable, including owner profile — deployed 0.3.7.
- [x] F02 Existing vendors editable, including Completed — deployed 0.3.7.
- [x] F03 Editable floor area width/height, persistent per outlet/floor — backend and desktop/mobile browser checks passed; native resize/copy/save passed on the API36 emulator.
- [x] F04 Copy/paste floor objects with Ctrl+C / Ctrl+V and touch controls; no duplicated table identity or inherited bills — backend transaction/idempotency and browser save/cancel checks passed.
- [x] F05 Smoking room, liquor room, walls, entry, exit, kitchen, reception, washroom and stairs; editable position/size/label — backend and browser checks passed; room backgrounds retain visible tables.
- [x] F06 Existing table seating capacity editable, including 3/8/10 seats; preserves QR identity/current guests/reservations. Version/permission and capacity guards passed backend checks; edit/save/reload passed in the browser.
- [x] F07 Selected POS menu cards show total cart quantity beside the existing dark state. Browser checks covered repeated selection and quantity edits; variants aggregate under the same item.
- [x] F08 Named owner tax settings, customer autocomplete/contact edits, account-bound points, read-only bill summary, split food/bar displays and picture menu cards — implemented and locally verified; release evidence is maintained in the web queue.
- [x] F09 Outlet switch selects staff-approved or automatic QR activation. New scans honor the policy; existing sessions, reservations, idle expiry, ordering pause and bans retain their guards.
- [x] F10 Custom named floors plus rectangle/L/U/editable polygon outlines. Add/rename, table-floor assignment, unchanged QR/session identity, boundary validation, save/reload and mobile containment verified.
- [x] F11 Simplify the floor editor: coordinate fields removed; shape presets, Rotate, drag corners and Add/Remove replace technical entry. Table/fixture positioning uses drag-and-drop; selected fixtures can be dragged above overlapping tables while arranging. Desktop/mobile and live production checks passed.

## Web 1: customer QR and D2C

- [x] W01 Public brand storefront and customer menu, without exposing internal staff data — explicit owner publication; public read model and browser privacy checks passed locally.
- [x] W02 Customer floor plan with actual saved fixtures/tables, seats and occupancy — desktop/mobile browser checked locally.
- [x] W03 Customer table reservations: table/date/arrival/duration, identity, conflict checks and staff visibility — backend and browser checks passed; visitors can cancel only their own unseated booking.
- [x] W04 QR ordering and D2C ordering; permanent QR and device-bound visit isolation — D2C uses server prices, remains pending/held for staff, does not create a KOT before authorization, obeys device bans and passed two-browser privacy/idempotency checks locally.
- [ ] W05 Customer service: waiter, water, cleaning, bill, help; staff acknowledgement/resolution and notifications.
- [ ] W06 Pre-payment name and normalized phone, points/coupons and eligible payment methods. Existing identity/loyalty services require v2 native/customer coverage.
- [ ] W07 Live UPI/QR/online payment and WhatsApp PDF invoice/wallet, SMS fallback within the requested five seconds. Requires merchant/messaging setup and live acceptance.
- [ ] W08 Brand domain `dinerdost.store/{brand}`, edge menu caching and measured sub-20ms target. Domain/edge account configuration and realistic load measurements required.

## Web 2: owner master console

- [ ] O01 Preserve all 24 master modules and owner control over chain/menu/recipes/food/liquor/finance/HR/campaigns/connections/audits; verify new cross-app behavior.
- [ ] O02 Owner chain-wide overview and sales/expenses/channel/settlement reports.
- [ ] O03 Seven-dimension audit (who/what/before-after/why/where/amount/when), hash chain, zero-delete enforcement and risk notifications. Existing audit core; all new commands must join it.
- [ ] O04 Owner WhatsApp red flags for post-provisional edits/reprints; live messaging setup required.
- [ ] O05 Pricing zones, franchise royalty calculation and virtual-brand shared stock; existing record scaffolds need operational behavior.
- [ ] O06 Staff role/language binding, attendance and payroll; existing roles/invites/manual attendance/payroll must be audited against v2.
- [ ] O07 RFM segmentation, campaign rule builder and WhatsApp/DLT SMS sending; provider/sender/templates/consent setup required.
- [ ] O08 Tally Prime/Zoho Books synchronization, OCR-to-procurement and accounting reconciliation; provider/account access required.
- [ ] O09 Connections for gateways/EDC, Swiggy/Zomato/ONDC, reservation feeds and 3PL; official merchant/API access required.

## App 1: POS and Billing

- [ ] A01 Separately installable native POS app with appropriate role/outlet access and notifications.
- [ ] A02 Overview, Tables, Floor plan, Orders, Cashier POS, Reservations, Payments, Bills/invoices, Customers.
- [ ] A03 Table split/merge continuity and separate bills; existing sessions must retain every order/payment on moves and splits.
- [ ] A04 Menu/modifiers/costing, thermal printer routing and cash drawer; physical printer/drawer acceptance required.
- [ ] A05 Cash/UPI/dynamic QR/phone/card/online settlement with identity gate and uncertain-payment reconciliation.
- [ ] A06 Provisional reprints, immutable final tax invoices and credit notes; never treat provisional printing as payment.
- [ ] A07 Local LAN offline host using SQLite WAL, discovery, secure WebSockets/mTLS, device registration, Ed25519 signing, reconciliation and measured <3s failover.
- [ ] A08 Windows/Linux/Android POS hardware acceptance; current platform is Android first as requested.

## App 2: Captain and Service

- [ ] B01 Separately installable native Captain app with current account/outlet/table assignment enforcement.
- [ ] B02 Service, Tables, Floor plan, Orders, assigned Checklists and own Attendance.
- [ ] B03 Voice-to-cart, course pacing and weighed fractional quantities; whole portions/whole pegs remain integer.
- [ ] B04 Bluetooth provisional printing and certified SoftPOS NFC; printer/payment provider SDK and hardware required.
- [ ] B05 Live watermarked camera checklist evidence and safe media retention.
- [ ] B06 Liveness facial biometrics with GPS geofence and payroll integration; consent, device testing and actual anti-spoof provider required. Manual attendance is not biometric verification.

## App 3: Kitchen and Stock

- [ ] C01 Separately installable native Kitchen app with narrowly scoped food operations.
- [ ] C02 Food KDS, locked food recipes, food inventory/FIFO/reorder/movements/central-kitchen indents, vendors, purchases, kitchen expenses and prep checklists.
- [ ] C03 Station routing, preparing/ready transitions, prep timers, bump-bar and 18+ language translation. Translation provider and bump-bar acceptance required.
- [ ] C04 Vision OCR ingestion and reviewed GRN/FIFO creation; no inferred stock/financial writes from unreviewed OCR.
- [ ] C05 Predictive daily prep sheets and margin alerts based on actual historic data; do not invent predictions or accuracy metrics.

## App 4: Liquor and Bar OS

- [ ] D01 Separately installable native Bar app with bartender/bar manager access.
- [ ] D02 Bar-only KDS, liquor/peg/cocktail menu and recipes, liquor FIFO inventory, vendors and purchases; no cross-stream ticket leakage.
- [ ] D03 30/60/90ml, nip/half/full bottle pricing and exact stock movements; whole peg counts and fractional volume remain distinct.
- [ ] D04 Sealed godown/open-counter stock and transfers, stock value, reorder levels and distributor permit references.
- [ ] D05 Mixed orders split to food/bar stations; FIFO reserves/consumption remain exact and transactional.

## App 5: Command, Legal and Audit

- [ ] E01 Separately installable native Command app with owner/manager/accountant permissions.
- [ ] E02 Activity log, Overview, Reports, Bills/invoices, Outlets, Virtual brands, Team, Attendance, Campaign drafts, Connections, Expenses.
- [ ] E03 Seven-dimension audit viewer, provisional/final/credit note tax register and aggregator UTR reconciliation.
- [ ] E04 Chain reports, franchise/zone configuration, HR/payroll, RFM/campaigns and integration management, with owner-only tax/charge/access controls.

## Shared backend and transport

- [ ] S01 Independent order/round, payment, KOT, provisional/final document and settlement state machines; preserve existing core guards.
- [ ] S02 Versioned `/v2` API contracts shared by all apps; authenticated HTTPS and bounded, validated inputs.
- [ ] S03 Role/app/outlet/tenant enforcement on every read/write and notification, including revoked existing sessions.
- [ ] S04 WebSocket real-time delivery with durable cursors, reconnection, deduplication and app/table scope; current foreground polling is not WebSockets.
- [ ] S05 Cloudflare/Envoy gateway, JWT/mTLS, device binding, HMAC webhook verification and measured <15ms target. No client-secret or private key distribution.
- [ ] S06 PostgreSQL16+ RLS, immutable ledgers, partition strategy and additive migrations without altering issued records.
- [ ] S07 Durable outbox workers, signed provider webhooks, idempotent retries and reconciled uncertain outcomes. Never blindly retry a payment.
- [ ] S08 Offline device signing, monotonic sequences, replay/tamper rejection, exact stock/payment reconciliation and no silent overbooking.
- [ ] S09 Android foreground/background notifications, native bell/history, token registration, invalid-device cleanup and FCM live delivery acceptance.
- [ ] S10 Aggregator orders create orders/KOT/KDS only once; official Swiggy/Zomato/ONDC feed and <2s stock-out propagation measured with real sandbox access.
- [ ] S11 End-to-end tests for all six workflow sequences: reservation/seating; food/bar ordering; service dispatch; procurement/expense; identity/payment/invoice; audit/HR/governance.

## Setup and acceptance dependencies

Previous web release checkpoint: version **0.4.1** is deployed on Vercel. All **85 backend cases passed locally and on isolated Neon databases**; all temporary verification databases were removed. All **25 local browser workflows** passed across the main run and affected reruns, including delivery/report receiving and the simplified floor editor. TypeScript and optimized local/Vercel builds passed. All **five selected production browser workflows** passed. Migration 015–028 preserved core counts, round monetary totals and issued invoice snapshots. See [VERIFICATION.md](VERIFICATION.md).

Earlier Android checkpoint, retained as historical evidence: all six build variants, master JVM tests/lint and six app binding/navigation checks passed on the emulator. Android was not rebuilt or released in this web-only batch; this evidence does not establish complete native parity or physical device acceptance.

Firebase project `diner-dost` now has the existing master Android app plus POS, Captain, Kitchen, Bar and Command registrations. FID-based registration, scoped inbox fetch, lease-based durable dispatch, retry/invalid-device handling and Android background workers are implemented locally. `google-services.json`, server sender credentials, a running dispatcher and live phone delivery remain pending. No live push-delivery claim is made.

The earlier disk-full interruption is resolved. Automatic approval review rejected recursive cache deletion; no blocked deletion was attempted through another mechanism. Selected generated caches were compressed while preserving files, and sufficient disk space is now available. Source/client databases were preserved. The empty credit-note migration was removed; credit notes remain unimplemented. This checkpoint does not claim that the complete v2 specification is finished.

Latest user clarification: payment/messaging/aggregator provider setup **will be done later**. Keep those connections deferred. The full v2 implementation remains in scope; no live provider delivery, payment, stock-out propagation or timing target is implied by local tests. Hardware/edge-host selection is still awaiting the user's reply.

Keep existing live services operational. Do not downgrade Next.js or move hosting merely because the diagram names an older framework. Vercel remains the authorized web host; a long-lived WebSocket/LAN service needs its own deployable runtime. The client's production merchant/payment, messaging, aggregator, ERP, translation/OCR, biometric and hardware configurations are not present. These remain explicit dependencies, not fabricated successes. Physical phone, printer, NFC, biometric and LAN-disconnection acceptance is required before claiming those workflows ready for restaurant use.

Afternoon web checkpoint **0.4.2**: all 18 requested web changes implemented, 96 local backend cases and 32 local browser workflows passed across full/targeted runs. Sixteen affected backend cases passed on isolated Neon databases. Migrations 029–031 applied, including one missing legacy purchase expense; order/payment totals and issued invoice snapshots are unchanged. Deployment acceptance is tracked in VERIFICATION.md. The latest owner tax correction request supersedes the earlier read-only summary for tax editing only. Package pricing/trial duration/entitlements remain pending by explicit user choice. This checkpoint does not complete the open native, external-provider or offline-platform work.

Production acceptance for **0.4.2** completed: all seven afternoon browser workflows passed; public endpoint checks and private-file denials passed. Deployment `dpl_EUkNpYeoA3MbwLGv8evm3kr4yrqi` is ready at https://dinerdost-app.vercel.app. All 18 afternoon web requests are checked in CLIENT_FEEDBACK.md. Native/provider/full-v2 gaps and package pricing remain open as stated above.

Latest web continuation: **Q52–Q61** in CLIENT_FEEDBACK.md covers unpaid prepared-food reallocation, selected eligible order actions, separate settlement/invoice controls, customer visits/search, automatic stock expiry, inline daily counts and recorded-data report charts. Native/provider/package work remains deferred. This cross-reference is not completion evidence; release verification is recorded separately.
New continuation **Q62–Q67**, source screenshots reviewed through 22 October 2026, 6:16 am IST: persistent dismissals, compact table-card icons, floor contrast, outlet kitchen-stage policy, service counters and bulk kitchen forwarding. Track completion in CLIENT_FEEDBACK.md. **Q65/Q66 remain deferred until the user answers the saved questions in [PENDING_QUESTIONS.md](PENDING_QUESTIONS.md); dependent code is outside deployable source and no kitchen-policy migration has been applied.** Continue the confirmed web items separately. Discord follow-up now runs every 15 minutes, saving new unresolved questions in that note. Earlier native/provider/package deferrals remain.

Latest continuation **Q68–Q70**, reviewed through 22 October 2026, 6:43 am IST: actual charge names in bill summaries, authorized Food/Bar All kitchen view, and a floor-map scale/position lock. These are web-only requests with screenshot sources in CLIENT_FEEDBACK.md; implementation/testing/release status is recorded there separately.

Follow-up **Q71/Q72**, received during the 0.4.14 build and reviewed through 22 October 2026, 6:59 am IST: whole-count piece menu unit and ready-notification navigation to Service. Track and verify separately from the 0.4.14 acceptance. Q65/Q66 remain in PENDING_QUESTIONS.md.

**Web production checkpoint 0.4.14:** 17 confirmed requests Q52–Q64 and Q67–Q70 are released through 22 October 2026, 6:43 am IST. Q65/Q66 remain awaiting later answers. See CLIENT_FEEDBACK.md, PENDING_QUESTIONS.md and VERIFICATION.md. This does not complete native/provider/offline v2 work.

**Web production checkpoint 0.4.15:** Q71/Q72 released through 22 October 2026, 6:59 am IST. All confirmed web requests through Q72 are accepted; Q65/Q66 await answers in PENDING_QUESTIONS.md. Earlier native/provider/offline dependencies remain deferred.

New web batch **Q73–Q78**, reviewed through 22 October 2026, 7:23 am IST: kitchen action completion, configurable loyalty cap, order-header Clear table, future bill-adjustment defaults, prominent table labels and fixture contrast. **Q73/Q74/Q76 await the saved questions in PENDING_QUESTIONS.md** alongside Q65/Q66. Implement and verify Q75/Q77/Q78 separately; no native/provider/package changes.

Follow-up **Q79–Q83**, reviewed through 22 October 2026, 7:45 am IST: visible eligible round controls, separate dark-green Orders counter row/filter tabs, Explore dot grid, saved-history calculator and active-orders dock. Track implementation separately from 0.4.16 in CLIENT_FEEDBACK.md. The existing unpaid-only policy and five pending decisions remain; native/provider/package work remains deferred.

**Web production checkpoint 0.4.16:** Q75/Q77/Q78 released and verified through 22 October 2026, 7:23 am IST. Five decisions Q65/Q66/Q73/Q74/Q76 remain in PENDING_QUESTIONS.md for later answers. Existing native/provider/package/offline-v2 dependencies remain deferred.

**Web production checkpoint 0.4.17:** Q79–Q83 released through 22 October 2026, 7:45 am IST. Five decisions remain in PENDING_QUESTIONS.md; prior native/provider/package/offline-v2 dependencies remain deferred.

**Comparison checkpoint 0.4.18:** PP05/PP18 released for current base recipes/stored usage; PP20/PP23 partially delivered. Twenty-three other groups remain pending in PETPOOJA_ADDITIONS.md. No native/provider/policy dependency was silently completed.

**Latest source review 22 October, 8:55 am IST:** Q84–Q86 add the timer question and two visual fixes; Q87–Q90 add calculator simplification, QR acceptance policy, paid replacement and bill-edit eligibility. Q76's follow-up identifies only Round down to ₹1 for persistence; default scope/authority remains unanswered. Canonical sources and screenshot review are in CLIENT_FEEDBACK.md. Eight decisions Q65/Q66/Q73/Q74/Q76/Q84/Q89/Q90 remain in PENDING_QUESTIONS.md. Q85/Q86 are the verified 0.4.19 batch; later rows are not release claims.

**Production checkpoint 0.4.19:** Q85/Q86 released; PP01 complete, PP02 partial (exact pack receiving and reference-only yield). Comparison totals 3 complete/3 partial/21 pending. Q87/Q88 and eight saved questions remain separate; native/provider/offline/client-data deferrals are unchanged.

**Source review 22 October, 9:08 am IST:** Q91 Refund taken requires a saved financial-workflow answer; Q92 order-menu/VIP pinning and Q93 read-only Review loyalty are confirmed queued work. The repeated kitchen Clear all actions request is deduplicated into Q73. Nine questions are in PENDING_QUESTIONS.md, linked to their messages/checklist. Production 0.4.19 and comparison counts are unchanged; Q18–Q93 totals 63 released, four queued and nine decisions.

**9:13 am clarification / current 0.4.20 batch:** Q93's 9:12 edited message supersedes its original read-only instruction: Review loyalty is optional and may use the existing claim workflow. Q94 renames Choose reward to Claim loyalty points and increases its text size. Q87/Q88/Q92/Q93/Q94 and the PP23 outlet expiry review are in verification. Nine decisions remain explicitly deferred; native/provider/configuration work remains unchanged. Discord requires sign-in again, so newer messages remain unverified.

**Latest review through 22 October, 10:12 am IST:** User restored sign-in and explicitly requested review of the client's answers. All nine Q65/Q66/Q73/Q74/Q76/Q84/Q89/Q90/Q91 decisions have answers in the saved 9:31 source attachment and PENDING_QUESTIONS.md; implementation remains pending. Q95–Q101 cover separate loyalty/coupon entry, dock alignment, reversed ready-badge contrast, distinct split icon, ready elapsed/bulk service and ready-card subtext removal. All seven screenshots inspected. The earlier sign-in/unanswered checkpoints are superseded; no new policy is marked released merely because it was answered. Current frozen release 0.4.20 remains Q87/Q88/Q92/Q93/Q94 + PP23.

**Production 0.4.20 / source through 10:12 am:** Q87/Q88/Q92/Q93/Q94 and PP23 released. Q18–Q101: 68 released, 16 confirmed pending, all nine decisions answered. PP: four complete/two partial/21 pending. Historical checkpoints above retained; answers alone do not count as implementation.

**Evening review through 7:57 pm IST:** Q102 serial names, Q103 rename in Tables/Explore, Q104 uncovered bottom floor controls added; four screenshots inspected. Canonical Q queue: 87 requests, 68 released, 19 pending.

**Production 0.4.21:** Eight timer/presentation/table requests Q84/Q97/Q98/Q99/Q101/Q102/Q103/Q104 released. Q18–Q104: 76 released/11 pending; all nine original questions answered. Canonical acceptance in CLIENT_FEEDBACK.md. PP counts unchanged.

**Source review through 8:39 pm IST:** Q105–Q113 added for fixture choices, rotated geometry, map labels, gates, undo/redo, view persistence, bill queuing, multi-select and calculator equals. Eight screenshots inspected; repeated wall/resize requests deduplicated. 96 Q-series requests: 76 released, 19 confirmed pending, Q111 awaiting billing rules. Service Q66/Q100 in progress.

**Production 0.4.22:** Q66/Q100/Q113 released with per-round Service counts, ready timers, selected service and calculator equals. 96 Q requests: 79 released/16 confirmed pending/Q111 awaiting rules. Later floor/policy items remain pending; PP queue unchanged.

**Latest source through 9:09 pm IST:** Q114–Q119 add APK calculator reference, rename collision, compact order menu, action contrast, SweetAlert2 and removal of synthetic ready food from customer/management menus. Five screenshots inspected. Q119 supersedes earlier customer publication. 102 Q requests: 79 released/21 confirmed pending/Q111+Q114 reference questions.

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

## Receiving-device continuation — 23 October 2026

Web Q89 is implemented and locally verified on the 0.4.31 feature branch, with nine isolated PostgreSQL cases passed. Release remains pending; see CLIENT_FEEDBACK.md and Q89_PAID_REPLACEMENT.md. The original 0.4.30 app/data remain intact. The user explicitly chose a new database for the receiving deployment; original restaurant records are not transferred. PP counts remain four complete/two partial/21 pending; Q111/Q114 and the existing deferrals remain unchanged.


## Receiving Production checkpoint 0.4.31 · 23 October 2026

Q89 is released and verified at **https://dinerdost-web.vercel.app**, project `prem-2230/dinerdost-web`, deployment `dpl_9retnKdF5JAiY4Pqq7TnJojgJSqj`, source commit `10d892d0ab59c881e8ac0b18837dc3cd1f62bd75`. Original 0.4.30 remains at its original URL and database. The receiving user explicitly chose a new database; no original restaurant records were transferred. Only synthetic acceptance tenants have been created in this new resource.

Baseline: 254 backend cases, build/typecheck and desktop/phone refund workflow reproduced. Release: **264 backend cases**, ten Q89 plus five refund regression cases in isolated PostgreSQL databases, local and hosted Q89 workflow at **1440px/390px**, typecheck/optimized builds and eight public/auth/CSRF checks passed. The hosted test normalizes PostgreSQL bigint strings in its assertion; application behavior did not change. Rendered replacement, invoice and linked record screens were inspected. Migrations 001–051 are applied only to the new receiving/QA resources; no disposable QA databases remain.

Q89 credit is traced to actual receipts without copying collections; old invoices, money and FIFO costs stay preserved. New food requires ordinary stock/KOT and explicit service; unserved originals require explicit discard. Lower final totals, duplicate/concurrent allocations, stale quotes, cross-role/outlet/tenant/native access and stock failures are guarded. [Implementation](Q89_PAID_REPLACEMENT.md) · [Acceptance](../verification/production-0431-acceptance.json).

Client queue: **100 released on the receiving project; Q111/Q114 unanswered**. Separate Petpooja queue: **4 complete / 2 partial / 21 pending**. No Petpooja group or deferred native/provider/package/client-data behavior is completed by this release.
