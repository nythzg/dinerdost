# Questions to review later

Updated 22 October 2026. The user initially deferred these questions, then explicitly reported that the client had answered and requested review of those answers. The complete 9:31 am answer attachment has now been read and saved. Answers are requirements, not implementation/release claims. Preserve the historical questions below and track each implementation separately in CLIENT_FEEDBACK.md.

Latest receiving-user instruction · 23 October: remove phone verification from local web coupon/loyalty redemption and web phone-status badges. This supersedes earlier web OTP requirements; identity, balances/caps, coupon/payment/permission guards and stored historical facts remain. Native policy is deferred and unchanged. See LOCAL_BILL_ADJUSTMENTS.md. Q111 remains unanswered.

## Answers received · 22 October, 9:31 am IST

[Source message](https://discord.com/channels/@me/1491679750610096259/1562677243354808374) · [Exact answer attachment](../verification/client-answers-20261022-0931.txt). All nine original questions have answers; the rows below are pending implementation and verification unless explicitly released in the canonical checklist.

| ID | Confirmed decision | Boundaries / implementation dependencies |
|---|---|---|
| Q91 | Manual/offline record-only full or partial refunds; cumulative refund capped by actual paid amount. Link original payment and issued invoice; mode Cash/UPI/Card/Other and reason mandatory. Retain immutable invoice and linked credit/refund adjustment for net revenue. | Existing owner/manager roles may record; cashier needs manager approval. Do not invent Admin/PIN identities or trigger gateway reversals. |
| Q89 | Paid replacement allowed only when the replacement final payable, including tax/discount/charges, is at least the previous final amount. Credit original payment; collect only the extra difference. Equal amount stays Paid; higher amount Partially Paid. | Preserve original payment/invoice; create linked revised/supplementary records. This is a separate audited paid-replacement workflow, not a silent expansion of unpaid cancellation. |
| Q90 | Before full payment/final settlement, billing staff may adjust discounts, rounding and eligible charges at Released/Preparing/Ready/Served. Recalculate tax; never reduce payable below an already-collected partial payment. | Fully paid/settled bills use refund/replacement workflows. Do not alter stock/prepared logs or broaden owner-only tax/charge configuration permissions. |
| Q84 | Primary input is Hours:Minutes countdown from now, stored as an exact timestamp. | Preserve expiry/no-extension guards. A clock fallback, if provided, rolls past clock times to tomorrow; no fallback is required. |
| Q65 | When kitchen stages are disabled, newly authorized rounds bypass Released/Preparing/Ready preparation transitions but still require explicit staff Mark served. | Snapshot policy for new rounds; preserve existing rounds, stock triggers, payment and role guards. |
| Q66 | Count each round once across stations. Table requests = unresolved; Serve requests = Ready/unserved rounds. Awaiting = both; Completed = resolved requests + Served rounds within day/shift filter; Total = Awaiting + Completed. | Preserve outlet/table staff scope; unresolved requests remain visible regardless of completion-day filter. |
| Q73 | Selected kitchen steps may complete through Served only after explicit confirmation that food is actually prepared and served. | Existing permissions must cover kitchen/service progression. Client names Manager/Captain/Steward/Cashier/Kitchen Lead; no nonexistent role or broader global access is fabricated. |
| Q74 | ₹50 default maximum **per order/final bill**. Smaller rupee redemption allowed up to available balance, order cap and payable subtotal. Diner Dost Admins control per-restaurant/outlet cap and may raise/lower it. | Restaurant owner is not automatically a Diner Dost platform admin. Actual platform-admin account/authorization setup remains a distinct dependency; regular restaurant roles cannot edit the cap. |
| Q76 | Save only Round down to ₹1, never the per-bill discount. Default is outlet-wide, changeable by outlet manager/restaurant owner/admin. | Existing bills/snapshots stay unchanged; apply saved default only to subsequent transactions. |

## New question awaiting review

Later receiving-user decision · 23 October 2026: the current chat explicitly authorizes **restaurant owners and assigned outlet managers** to edit the **outlet-wide default maximum per bill** under Adjustments. This supersedes the earlier platform-admin-only Q74 boundary above for the local web app. It is not a current-bill override and does not rewrite existing discounts or financial records. Q111 below remains unanswered.

### Q111 — Queue a bill for the next visit

Prem requests next-visit bill queuing at 8:32 pm. Confirm: should only an unpaid outstanding balance be queued, or can a paid/settled bill be queued as a new charge? Who may authorize it; is the original receivable still outstanding; what happens when staff declines inclusion; and how should original tax/discounts, receipts, due balance and the new linked bill prevent double collection/revenue? Preserve issued invoices and original payments; no carry-forward or debt is inferred. [Source](https://discord.com/channels/@me/1491679750610096259/1562843644787036265) · [Checklist](CLIENT_FEEDBACK.md). **Awaiting answer; dependent implementation not started.**

### Q114 — Calculator scope confirmed by the receiving user

The original APK request was investigated statically without installing/running it. The receiving user then explicitly requested **Standard only**, removed the mode selector and supplied a video establishing the interface and calculation sequence. The standard calculator, percentages, optional notes/history, equals autosave, seven-day retention and side tab are now implemented and verified locally. Q114 is no longer awaiting clarification; it remains unreleased. Scientific/conversion/currency/mortgage/native modes are outside that later approved scope. [Original source](https://discord.com/channels/@me/1491679750610096259/1562846352743071805) · [Current local scope](LOCAL_STANDARD_CALCULATOR.md) · [Range acceptance](DISCORD_PRIORITY_REVIEW.md). Do not reopen the broader APK question without a new instruction. Q111 remains the unanswered question.

## Receiving-device investigation · 23 October 2026

The user requested downloading and extracting the Q114 APK. Manifest, operation resources, physical conversion tables and calculation code were inspected locally. The supplied app is ColorOS Calculator **16.4.2**. [Extracted functionality and limits](CALCULATOR_APK_REFERENCE.md) document scientific/base/unit modes, code-derived formulas and the enabled relative-percentage path. The APK was not installed/run. Implementation/parity were pending at that extraction checkpoint; the later Standard-only decision and local acceptance above supersede that broader question. Currency/mortgage defaults, provider/native features and Q111 are not inferred.

## Original questions and historical status notes

The status paragraphs below describe the earlier checkpoint before the 9:31 answer attachment and are superseded by the confirmed decisions above. They are retained for traceability.

### Q91 — Meaning of Refund taken

**Question:** Should “Refund taken” only record a refund staff has already given, or initiate an actual refund? Should full and partial refunds both be supported, who may record/approve them, and how should the amount/method link to the original payment and issued bill?

**Why it matters:** The new order-menu request names a reason but does not define payment reversal, amount, permission or invoice treatment. No financial operation, refund status or settlement change is inferred from a menu label.

**Status:** Awaiting the user's answer. The confirmed VIP pin/menu UI work is tracked separately as Q92. Actual gateway integration remains deferred.

[Source — 22 October, 9:03 am IST](https://discord.com/channels/@me/1491679750610096259/1562670081240989739) · [Checklist](CLIENT_FEEDBACK.md)

### Q89 — Paid-order replacement and the earlier unpaid-only instruction

**Question:** May the earlier direct instruction “Unpaid orders only for now” now be expanded to paid orders? The client requests replacement items costing at least the previous amount. If approved, is the comparison the round's final amount including tax/discount/charges, and how should the original payment, any extra collection and issued invoice be linked to the replacement?

**Why it matters:** This is a different financial workflow from retaining prepared food on an unpaid cancelled order. No original payment or issued invoice may silently be reassigned or rewritten, and no refund rule is inferred.

**Status:** Awaiting later direct user answer. Current unpaid-only guard remains. The new client request is recorded, not treated as authority to override the user's narrower policy.

[Source — 22 October, 8:50 am, edited 8:52 am IST](https://discord.com/channels/@me/1491679750610096259/1562667009962156034) · [Checklist](CLIENT_FEEDBACK.md)

### Q90 — Which bill edits are allowed at each stage

**Question:** Does “editable in all scenarios” mean bill adjustments before settlement, even after kitchen release, or also changing already-paid/settled/issued bills? Which adjustments should remain eligible when tax, discounts, payments or food preparation have already been recorded?

**Why it matters:** The two screenshots compare an unpaid ready round without Adjustments to another bill with the control. Making the control visible is distinct from authorizing changes to paid amounts, stock usage or issued documents.

**Status:** Awaiting later answer on financial eligibility; preserve issued documents and existing payment/tax permissions. Do not silently make every historical bill mutable.

[Source — 22 October, 8:55 am IST](https://discord.com/channels/@me/1491679750610096259/1562668286653767701) · [Checklist](CLIENT_FEEDBACK.md)

### Q84 — Prepared-food timer meaning

**Question:** Should “modern timer” mean a countdown entered as hours/minutes from now, or a clock-time picker? If clock time, which date applies when the chosen time is already past or crosses midnight?

**Why it matters:** The pictured field determines the actual prepared-food use-by timestamp. Hiding its date without a rule could accidentally extend or shorten the deadline. Any new control must retain the existing no-extension and expiry safeguards.

**Status:** Awaiting later answer. Existing explicit use-by entry stays in place; no duration/date is guessed.

[Source — 22 October, 8:33 am IST](https://discord.com/channels/@me/1491679750610096259/1562662555300921355) · [Checklist](CLIENT_FEEDBACK.md)

### Q65 — Service when kitchen stages are switched off

**Question:** When an outlet disables Released → Preparing → Ready, should staff still explicitly mark each order round served before settlement, or should service complete automatically?

**Why the answer matters:** It determines service, settlement and prepared-food eligibility for new rounds in that outlet. Existing rounds, payment checks, stock consumption and permissions must retain their established behavior.

**Status:** Awaiting the user's later answer. Kitchen-stage switch and dependent behavior remain unreleased. Existing kitchen/service workflow stays in use.

[Client source — 22 October, 6:04 am IST](https://discord.com/channels/@me/1491679750610096259/1562625059359690754) · [Working checklist](CLIENT_FEEDBACK.md)

### Q66 — Definitions for the new Service counters

**Question:** Should Total services, Table requests, Serve requests, Completed services and Awaiting services combine table requests with ready/served order rounds, counting each round once even when it has several kitchen tickets? Please confirm which records and states belong in each counter.

**Why the answer matters:** Multi-station kitchen tickets must not inflate totals. The counter definitions must match the client's intended service workflow and each staff member's authorized scope.

**Status:** Awaiting the user's later answer. New Service counters remain unreleased; existing Service behavior stays in use.

[Client source — 22 October, 6:08 am IST](https://discord.com/channels/@me/1491679750610096259/1562626147227934870) · [Working checklist](CLIENT_FEEDBACK.md)

### Q73 — What Clear all actions should do to kitchen stages

**Question:** Should the selected action advance only the currently eligible kitchen stage, or may it complete Released → Preparing → Ready → Served after staff explicitly confirms that food is prepared and has actually been served? Which staff roles may confirm this?

**Why the answer matters:** The earlier instruction limits this button to selected eligible steps. This new request also overlaps Q65's unanswered kitchen/service policy; do not infer completed physical preparation or service.

**Status:** Awaiting the user's later answer; existing selected-action checks remain.

**22 October, 9:07 am follow-up:** Client repeats that Clear all actions should include Released, Preparing and Ready to serve. This confirms those stages are in scope, but still does not specify whether to advance one eligible stage or complete all stages and service, or who confirms actual preparation/service. [Follow-up source](https://discord.com/channels/@me/1491679750610096259/1562671115942363308). Deduplicated into Q73; no separate completion claim.

[Client source — 22 October, 7:14 am IST](https://discord.com/channels/@me/1491679750610096259/1562642850548818023) · [Working checklist](CLIENT_FEEDBACK.md)

### Q74 — Loyalty claim limit and who controls it

**Question:** Is ₹50 the default maximum discount per order, per round, or per customer/day? Does “set by us” mean Diner Dost administrators or each restaurant owner, and may that person raise the cap above ₹50? Should staff be able to choose a smaller rupee redemption up to the customer's available rewards and the configured cap?

**Why the answer matters:** This controls reward balances and payable amounts. Confirm the scope and authority before changing redemption or granting new configuration access.

**Status:** Awaiting the user's later answer. No redemption limits, balances or historical bills changed.

[Client source — 22 October, 7:14 am IST](https://discord.com/channels/@me/1491679750610096259/1562642850548818023) · [Working checklist](CLIENT_FEEDBACK.md)

### Q76 — Which bill-adjustment settings become future defaults

**Question:** Should saving the pictured form remember only **Round down to ₹1**, or also the entered **Discount (₹)** for future transactions? Should that default apply to the selected outlet, the whole restaurant, or only the staff account, and who may set it?

**Why the answer matters:** The screenshot contains both rounding and a per-round discount. Automatically applying a saved discount to later customers would change their payable amounts. Existing orders and issued documents must retain their saved adjustments.

**Status:** Awaiting the user's later answer; per-round adjustments stay as they are.

**22 October, 8:47 am follow-up:** The client explicitly identifies **Round down to ₹1**, saved until changed. This resolves the pictured field: do not carry the per-customer Discount forward. The remaining question is who may save that default and whether its scope is outlet, restaurant or staff account. [Follow-up source](https://discord.com/channels/@me/1491679750610096259/1562666166206337046).

[Client source — 22 October, 7:19 am IST](https://discord.com/channels/@me/1491679750610096259/1562644147716751440) · [Working checklist](CLIENT_FEEDBACK.md)

## Previously deferred setup and configuration

These are already deferred by the user; do not ask them again on every check or claim live completion.

- Client ingredient recipes and the policy for ordering items with missing recipes: client will add later; do not invent quantities or block existing ordering.
- Android and Firebase configuration and physical-device acceptance: deferred during the current web-only work.
- Payment, WhatsApp/SMS, aggregator and other external integrations: provider/account access and live acceptance remain pending.
- Trial/Bronze/Silver/Gold/Platinum prices, trial duration and entitlements: configure later; prepared panel remains informational.
- Offline/LAN host and printer/biometric/NFC hardware selection and testing: pending for the separate v2/native scope.

## Confirmed decisions — do not reopen without a new instruction

- Reallocated means prepared-food reallocation, for wholly unpaid orders only; table moves do not count.
- Clear all actions performs the selected eligible steps through the existing guarded workflows.
- Missing daily opening stock counts allow ordering with a reminder.
- Staff languages are English and Hindi.
- Explore's resizable header means its floor/edit controls panel.
- Inventory purchase rate is per kg/unit; editing current stock value uses an audited current adjustment and preserves past sales/costs.
- Table activation supports the requested automatic/staff mode switch.
- Floor content stays clipped inside the fixed outer dotted frame, with a visible box around the actual layout and scroll/pan/pinch navigation.

Track implementation and acceptance in [CLIENT_FEEDBACK.md](CLIENT_FEEDBACK.md) and broader dependencies in [V2_CHECKLIST.md](V2_CHECKLIST.md). This note does not mark any feature complete.

## Latest local Q114 decision and acceptance · 23 October 2026

The receiving user superseded the broad APK request with **Standard only**, no mode selector, the supplied video's keypad/live-result/chaining behavior, green theme and optional notes saved per calculation. Smaller 64px circular keys and a 320px panel retain the existing text sizes. Q114 is now verified locally and unreleased; Q111 alone remains unanswered. Historical APK/parity-pending paragraphs above describe the earlier checkpoint.

283 backend tests, ten isolated PostgreSQL cases, typecheck/build and four desktop/phone browser workflows passed. All four browser workflows passed again against localhost:5090 after final sizing; screenshots were inspected. Existing saved calculation results and financial history remain unchanged. See [local calculator scope and verification](LOCAL_STANDARD_CALCULATOR.md). Production/client released counts remain unchanged. The separate Petpooja queue remains 4 released complete / 2 partial / 21 pending; PP03/PP04 are local and unreleased, and PP06 remains paused. No push/deployment is authorized by this local checkpoint.
