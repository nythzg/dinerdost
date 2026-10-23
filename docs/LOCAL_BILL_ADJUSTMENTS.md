# Local future bill adjustments · 23 October 2026

Latest user direction: web coupon and loyalty redemption no longer requires phone verification. Verification help text and customer phone-status badges are removed. Historical OTP requirements below describe the preceding checkpoint; customer identity, balances/caps and coupon/payment/permission guards remain. Stored verification facts and native policy are unchanged.

The receiving user's latest request replaces the separate Future rounding action and current-bill Discount form with one outlet settings form. This supersedes those earlier local UI instructions; the previous verification in LOCAL_BILL_SUMMARY.md remains historical evidence.

## Interface and behavior

Adjustments is the leftmost Bill summary action. Restaurant owners and assigned outlet managers can open it even on paid or settled orders because this form changes future settings, not that order.

The form contains, in order:

1. Generate discount coupon, with an automatically suggested editable code, fixed rupee discount, valid-through date, and total uses. Amount, date and uses require explicit input; no business values are invented. Each new or saved coupon has a trash icon. Removing a saved coupon is staged, with Undo removal; closing the form discards unsaved edits.
2. Loyalty cap per bill, as the outlet-wide default for subsequent eligible loyalty claims. Previous claims remain unchanged.
3. Round up to ₹1 and Round down to ₹1 checkboxes. Selecting one clears the other; neither selected means no default rounding. Whole-rupee totals remain unchanged in either direction.
4. One bottom Save adjustment button. It commits all new coupons, removals, cap and direction atomically. Any invalid, stale or unauthorized change rolls back the entire save.

There is no separate Future rounding action, current-bill Discount input, rounding preview or Save loyalty cap button. The approved green styling remains. Existing per-bill APIs and the paid-replacement form's explicit rounding choice retain their previous contracts and guards.

## Coupon terms and history

Codes are case-insensitive within an outlet. New codes use letters, digits, hyphens or underscores and cannot reuse an existing or previously removed definition's code. Coupons are explicitly applied by code through the existing Coupon action; merely saving settings never discounts the current bill.

The selected expiry date is inclusive through the end of that day in Asia/Kolkata. Total uses are shared across bills, rather than per customer. Current reservations, locked authorizations and completed redemptions count toward capacity; released or expired reservations free capacity. Existing customer identity, OTP, stacking, minimum-subtotal, payment/version and reward-authorization rules remain enforced. Discounts cannot exceed the eligible subtotal.

Each claim uses an ordinary coupon token with the existing reservation → lock → redemption lifecycle. Definition row locks prevent concurrent oversubscription. Coupon switches lock old and new definitions in ID order before touching tokens, matching the definition-before-token order used during payment authorization. Exact retries retain one use and one command response.

Trash deactivates a definition when Save adjustment succeeds. It does not delete its claims or redemption history. Removal/expiry blocks new claims and still-reserved authorizations. A previously locked payment remains valid and can finish its original invoice; issued documents, receipt logs and historical public coupon codes remain intact. Refunds do not manufacture additional coupon capacity.

## Scope and storage

The settings read and combined command require web/MASTER application context, bill permission, owner/assigned-manager role, tenant and outlet access. Cashiers and other roles cannot read or write this configuration. Legacy provisioned platform-admin loyalty-cap access remains on its existing separate API; it does not grant the new coupon settings permission. Internal use-token IDs cannot bypass web-only coupon enforcement or appear in native reward pickers.

Migration 055_web_bill_settings.sql adds tenant-scoped coupon definitions and a nullable web rounding direction. NULL preserves the earlier boolean default until an explicit save. The old boolean remains synchronized for compatibility. Round constraints now admit UP with a 0–99 paise adjustment; existing DOWN/NEAREST values remain unchanged. Tenant RLS and composite foreign keys enforce definition/token scope. New future web rounds snapshot the selected direction; native behavior is unchanged.

Before applying migration 055, the local server was stopped and the private local database was cold-copied to an ignored backup. Counts and full-row fingerprints for orders, rounds, invoices, payment attempts, stock batches and stock movements matched before/after migration. Original accounts and business records were retained. The server resumed on http://localhost:5090. No live database, provider configuration, package configuration or hosted deployment was changed.

Client requests and Petpooja additions remain separate. This is a direct local UI/billing follow-up, not a new PP completion. Q111 remains unanswered and procurement remains paused.

## Verification

- **319 full backend tests passed**, with no failures or skips. This includes nine new settings/coupon cases plus the previous bill-policy and loyalty suites: amount/date/use validation, inclusive expiry, atomic rollback, stale writes, exact retries/audits, owner/assigned-manager scope, foreign tenant/outlet/native rejection, concurrent use limits, concurrent coupon switches, released/expired capacity, removed-coupon authorization and preserved locked/issued history.
- **Nine affected browser workflows passed** against localhost:5090. The eight-workflow combined run plus the separate bill-policy workflow cover 1440px desktop and 390px phone layouts, generated/editable codes, real coupon application/exhaustion, staged trash/cancel/save, exclusive rounding, cap persistence/stale errors, real manager/cashier sessions and direct API denials, partial/full cash payment, printed financial history, zero-total authorization/settlement without fake receipts, POS portions and optional loyalty/VIP flows. Existing browser checks were updated for the intentionally replaced UI; per-bill legacy API coverage remains.
- **Nine new cases passed on real PostgreSQL** in an exact disposable QA database, including the final concurrent-switch regression. The runner exited successfully after removing only that database. The application and live databases were not used for these tests. Log: parent work/bill-settings-postgres-final.log.
- Typecheck and optimized production build passed. React review covered abortable settings loading, stable keyed drafts, labeled fields/buttons, checkbox exclusivity, disabled saving state, surfaced failures and unchanged financial logic outside the requested extension. No new dependencies.
- Rendered desktop/phone screenshots were inspected: verification/local-future-adjustments-coupon-WIDTH.png and verification/local-future-adjustments-bottom-WIDTH.png. The modal retains its accessible scroll container, small-screen bounds and approved green style.

Private parent-task logs: work/bill-settings-full-backend-final.log, work/bill-settings-browser-verified.log, work/bill-settings-history-browser-final.log, work/bill-settings-typecheck-final.log, work/bill-settings-build-final.log and work/bill-settings-local-migration.log. Earlier work/bill-settings-targeted.log records 17 affected cases before the final coupon-switch regression was added; the final full suite includes that ninth new case.

Local only, unreleased. No push, hosted deployment or production/client/Petpooja release-count change.

## Applied coupon removal follow-up

Local applied-coupon removal: Bill summary now places a compact trash icon beside each applied coupon code. Eligible unpaid rounds use the existing versioned web reward-reset command; removal clears only that round's discount, recalculates totals with its saved rounding, and releases its reserved coupon use. It does not delete the reusable coupon definition or change another bill. Paid/closed or active-payment rounds retain their code/history without the removal control; permissions, stale-write and payment guards remain on the server. Eighteen affected backend tests and two desktop/phone browser workflows passed, plus typecheck and optimized build. Browser checks include removal/reload, freed capacity, unaffected other claims, reapplication, paid/issued history and inspected 1440px/390px screenshots: verification/local-remove-applied-coupon-WIDTH.png. UI-only product change; no backend/schema change or new PostgreSQL run. The previous 319-test full run and nine PostgreSQL cases belong to the combined-adjustments checkpoint. See docs/LOCAL_BILL_ADJUSTMENTS.md. Local/unreleased; production/client/Petpooja counts unchanged, Q111 unanswered and procurement paused.

Private parent logs: work/remove-applied-coupon-backend.log, work/remove-applied-coupon-browser.log, work/remove-applied-coupon-typecheck.log and work/remove-applied-coupon-build.log.

## Phone verification removal follow-up

Local removal of customer phone verification: web coupon redemption, including discounts above the old OTP threshold, and loyalty redemption no longer require otp_verified. The Claim loyalty help text and customer-list/profile Phone status badges are removed. Required customer identity/phone validation, balance/cap/subtotal limits, coupon capacity/expiry, authorization, stale/idempotent/concurrent requests, payment locks, immutable receipts/invoices and stock history remain. Existing verification flags are not changed or fabricated; deferred native application OTP policy is unchanged. Verified: 320 full backend tests, 19 affected cases, one targeted real-PostgreSQL case in an exact disposable QA database (removed after successful completion), six desktop/phone browser workflows, typecheck and optimized build passed. Browser evidence includes real completed-order loyalty earnings followed by an unverified customer's successful loyalty claim and ₹300 generated coupon, unchanged verification facts, customer screens without phone status, coupon removal/cap/manager-cashier regressions and inspected 1440px/390px screens. See docs/LOCAL_BILL_ADJUSTMENTS.md. No schema/dependency/provider/environment changes, push or deployment; client/Petpooja released counts unchanged, Q111 unanswered and procurement paused.

New backend coverage tests unverified loyalty and above-threshold coupons, exact retry, insufficient balance, preserved native OTP denial, paid-bill rejection, unchanged verification facts, stock and audit history. Existing loyalty cap/concurrency cases now use unverified web customers by default. React review confirmed matched customer table headers/cells, preserved profile identity fields and unchanged accessible form controls. Screens: verification/local-no-phone-loyalty-WIDTH.png, local-no-phone-coupon-WIDTH.png and local-no-phone-profile-WIDTH.png.

Private parent logs: work/no-phone-verification-full-backend.log, work/no-phone-verification-targeted-final.log, work/no-phone-verification-postgres.log, work/no-phone-verification-browser.log, work/no-phone-verification-typecheck.log and work/no-phone-verification-build.log.

## Round total display follow-up

Local Round total display correction: each round now sums its own displayed item Amount values (recorded unit price × quantity, rounded to paise per line). Discounts, tax, charges, receipts and rounding remain in the actual payable/Bill summary calculations; no financial value is rewritten. Example: ₹220 + ₹160 displays ₹380 even when that round's adjusted payable is lower. Three affected browser workflows passed, including new 1440px/390px multi-round checks, fractional quantity/paise rounding, discounts, partial payment, correct Bill summary payable and unchanged full order/payment/invoice API snapshots. Typecheck and optimized build passed; rendered screens inspected (verification/local-round-items-total-WIDTH-ROUND.png). Display-only product change; no backend/schema/provider change or backend/PostgreSQL rerun. The prior 320 full backend tests belong to the phone-verification checkpoint. Local/unreleased; no push/deployment or client/Petpooja release-count change. Q111 unanswered and procurement paused.

Private parent logs: work/round-item-total-browser.log, work/round-item-total-typecheck.log and work/round-item-total-build.log.

## Coupon and loyalty success alerts

Local SweetAlert2 reward confirmations: successful coupon application now shows Coupon applied, and successful loyalty redemption shows Loyalty points claimed. Both use the existing green theme, show the server's total bill discount, strike through the prior payable and emphasize the new discounted payable, with Done/keyboard dismissal. Comparison uses the returned complete order plus the validated prior target-round amount, so another round changed while the form was open is included correctly. Tax/rounding effects remain in server payable values; no savings or rates are invented. Success appears only after the command succeeds; rejected/exhausted coupons keep their inline error and show no success alert. The entry form is synchronously unmounted before SweetAlert2 opens to preserve keyboard focus; other RewardEntry users retain their existing notifications. Seven affected desktop/phone browser workflows passed, including a multi-round bill changed while the coupon form was open, tax/rounding, existing loyalty replaced by a large coupon, zero totals, failures/exhaustion, keyboard focus/Enter, removal/cap/role regressions and unchanged order/payment/invoice snapshots after dismissal. Four positive workflows passed again with animations disabled for final screenshot inspection. Typecheck and optimized build passed. UI-only product change; no backend/schema/dependency/provider change or backend/PostgreSQL rerun. The previous 320 full backend tests remain the phone-verification checkpoint. Local/unreleased; no push/deployment or client/Petpooja release-count change. Q111 unanswered and procurement paused. See docs/LOCAL_BILL_ADJUSTMENTS.md.

The total discount is the same server bill discount shown in Bill summary; it can differ from the payable difference because of tax, rounding or an earlier reward being replaced. Old/new totals compare the full bill, not just one round. Amounts use DOM text nodes rather than interpolated HTML. React review covered the optional post-save callback, unchanged validation/busy handling, limited external-dialog flushSync boundary, focus restoration and server-response values.

Inspected screens: verification/local-coupon-applied-WIDTH-ORDER.png and verification/local-loyalty-applied-WIDTH.png at 1440px and 390px. Private parent logs: work/reward-applied-alert-browser.log, work/reward-applied-alert-screens-browser.log, work/reward-applied-alert-typecheck.log and work/reward-applied-alert-build.log.
