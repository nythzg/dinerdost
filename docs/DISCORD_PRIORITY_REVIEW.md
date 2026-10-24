# Requested Discord range · 23 October 2026

> Current return handoff, 25 October 2026: see [RETURN_HANDOFF.md](RETURN_HANDOFF.md) and [UPCOMING_WORK.md](UPCOMING_WORK.md). The accepted app is 0.4.31 on prem-2230/dinerdost-web, migration001-069. Earlier local-only/original-PC paragraphs below are dated history, not instructions to roll back or create a new database. The handoff itself performs no database/deployment changes.

The receiving user prioritized the inclusive range [first message](https://discord.com/channels/@me/1491679750610096259/1562846350469627924) through [last message](https://discord.com/channels/@me/1491679750610096259/1562853027382042818) before further Petpooja work. The signed-in browser confirmed this DM's contact is `nihh` / `nihalkaman`, user ID `1486270666444636250`. All seven message entries in that range were read, and all five attached screenshots were inspected. No messages or reactions were sent.

The range matches existing Q114–Q119; no new Q IDs or duplicate implementation tasks were added.

| Request | Actual reference | Current local result |
|---|---|---|
| Q114 | Calculator.apk plus exact functions/properties request; subsequently narrowed by the receiving user to Standard only and their video | Implemented and verified locally: green standard calculator, relative percentages, video keypad/chaining, equals autosave, explicit optional notes, seven-day retention and right-edge tab. [Current scope and verification](LOCAL_STANDARD_CALCULATOR.md). Broader APK modes are excluded by the later direct user instruction; local changes remain unreleased. |
| Q115 | Rename `2 copy copy` to `3` reports an existing-name conflict | Numeric table ordering and collision guidance identify the existing table/floor. Actual active-name uniqueness remains enforced. |
| Q116 | Large centered order-action modal | Compact contrasting anchored dropdown on order detail and the active-order dock. |
| Q117 | Dark action bars with unreadable menu-card text | Explicit selected/unselected colors for staff/customer controls within the approved green theme. |
| Q118 | SweetAlert2 confirmation example | Existing confirmation prompts use the shared SweetAlert2 wrapper; Cancel focus, keyboard cancellation and visible stale errors are retained. |
| Q119 | Synthetic ready-food rows shown in Menu management | Customer QR/storefront catalogs and Menu management omit synthetic ready items. Staff POS availability, stock, costs and history remain. |

## Fresh verification

Source checkpoint `277bc15`:

- **15 affected backend tests passed**: `table-names.test.ts` and `prepared-food.test.ts`. Includes concurrent naming, stale writes, role/tenant boundaries, frozen identities/orders/invoices, staff stock availability, and rejected stale QR/storefront submissions without mutations.
- **Four browser workflows passed** on an isolated disposable embedded database, each exercising 1440px and 390px.
- **The same four browser workflows passed on the running localhost:5090 app**, using newly registered synthetic QA tenants, separate from original restaurant accounts/data.
- Phone dropdown/customer menu and desktop stale-confirmation renders were inspected. No new product code or database migration was needed for Q115–Q119 in this pass.

This review does not change production release status or Petpooja completion counts. PP06's unfinished local development remains separate and paused while the requested calculator extraction is handled. Q111 remains unanswered.

## Current complete range review · 23 October 2026

The user requested all other required improvements from the same bounded range. Its seven rendered messages were read again in the authorized signed-in DM, and all five original screenshots were inspected again. Their requests match Q114–Q119 above; no additional request or changed requirement was found. No other chat content was read and no message/reaction was sent.

At source checkpoint `db83e9a`, all six request groups are covered locally. Q115–Q119 were already implemented in the source and accepted in the earlier 0.4.24 release; they required no duplicate product changes. The later direct user calculator instructions supersede the original full-APK requirement, and Q114's local implementation is now complete for that scope.

Fresh verification on the current source:

- **15 affected backend cases passed** in isolated embedded databases (`table-names.test.ts`, `prepared-food.test.ts`). Includes concurrent naming, owner/outlet/tenant/native boundaries, retained table/QR identities and financial history, prepared-food FIFO/cost preservation and rejected stale customer ordering.
- **Six browser workflows passed** on localhost:5090 at 1440px/390px, in newly registered synthetic QA tenants. They cover sorting/conflict guidance, rename from both table views, compact detail/dock menus, selected/unselected staff/customer contrast, customer/management ready-food exclusion, explicit SweetAlert confirmation, cancellation, visible stale errors and right-edge tabs on bill pages.
- Outdated test expectations for the old Save calculation button and summary-aligned bottom toolbar were updated to the approved equals-autosave and side-tab behavior. Product code did not need changes in this review.
- Typecheck passed. Current dropdown, customer/staff menu and confirmation screenshots were inspected. The prior product build at `db83e9a` passed; no backend/schema/dependency/configuration change was introduced here.

There are no remaining implementation gaps within this message range under the receiving user's approved standard-only calculator scope. This is local acceptance, not a new deployment or a claim of full Android APK parity. Production release counts remain 100 on the receiving project; Q114 stays local/unreleased. Q111 remains unanswered and outside this range. Petpooja work remains separate and paused.

## Latest local Q114 decision and acceptance · 23 October 2026

The receiving user superseded the broad APK request with **Standard only**, no mode selector, the supplied video's keypad/live-result/chaining behavior, green theme and optional notes saved per calculation. Smaller 64px circular keys and a 320px panel retain the existing text sizes. Q114 is now verified locally and unreleased; Q111 alone remains unanswered. Historical APK/parity-pending paragraphs above describe the earlier checkpoint.

283 backend tests, ten isolated PostgreSQL cases, typecheck/build and four desktop/phone browser workflows passed. All four browser workflows passed again against localhost:5090 after final sizing; screenshots were inspected. Existing saved calculation results and financial history remain unchanged. See [local calculator scope and verification](LOCAL_STANDARD_CALCULATOR.md). Production/client released counts remain unchanged. The separate Petpooja queue remains 4 released complete / 2 partial / 21 pending; PP03/PP04 are local and unreleased, and PP06 remains paused. No push/deployment is authorized by this local checkpoint.
