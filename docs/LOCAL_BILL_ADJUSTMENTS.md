# Local future bill adjustments · 23 October 2026

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
