# Requested Discord range · 23 October 2026

The receiving user prioritized the inclusive range [first message](https://discord.com/channels/@me/1491679750610096259/1562846350469627924) through [last message](https://discord.com/channels/@me/1491679750610096259/1562853027382042818) before further Petpooja work. The signed-in browser confirmed this DM's contact is `nihh` / `nihalkaman`, user ID `1486270666444636250`. All seven message entries in that range were read, and all five attached screenshots were inspected. No messages or reactions were sent.

The range matches existing Q114–Q119; no new Q IDs or duplicate implementation tasks were added.

| Request | Actual reference | Current local result |
|---|---|---|
| Q114 | Calculator.apk plus exact functions/properties request, retaining Diner Dost theme, notes and history | User-requested local APK extraction completed. [Function inventory](CALCULATOR_APK_REFERENCE.md) identifies ColorOS Calculator 16.4.2, recovered algorithms and 115 unit entries. Implementation/exact parity remain pending. |
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
