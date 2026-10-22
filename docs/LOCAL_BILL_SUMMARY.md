# Local bill summary and loyalty cap · 23 October 2026

The receiving user requested aligned bill-summary text, removal of the managed-by-Diner-Dost loyalty footer, and a cap editor under Adjustments. They explicitly confirmed that **restaurant owners and assigned outlet managers** may edit the **outlet-wide default maximum per bill**, rather than an individual bill override. This supersedes the earlier platform-admin-only Q74 restriction locally.

## Implementation

Bill summary now places its title and tax edit icon on one row, its text actions below, and all amount labels/values in consistent left/right columns. The old loyalty-cap footer and separate platform-configure button are removed.

Bill adjustments includes a separate Loyalty cap per bill (₹) section for owners, assigned managers and previously provisioned platform administrators. Save loyalty cap changes only that outlet's default for subsequent loyalty claims, including claims on existing eligible bills. It preserves earlier discounts. It does not save an unsaved bill discount, change rounding, recalculate issued invoices or touch payment/stock history. Cashiers and other unprovisioned staff do not receive the editor and cannot call the command directly. Native application sessions remain excluded.

The existing outlet version and row lock serialize edits; stale writes fail visibly instead of overwriting another setting. Exact retries retain one audit event. Repeated successful saves use the returned outlet version. Values remain integer paise from ₹0 through the existing ₹10,000,000 maximum, with at most two decimal places. No schema, dependency, provider or environment configuration change.

## Verified locally, unreleased

- **288 full backend tests passed**, including five affected loyalty cases: owner/manager authorization, other roles, native/tenant/outlet isolation, future claim limits, earlier claim preservation, invalid amounts, stale/concurrent cap updates, exact retries and audit integrity.
- **Three browser workflows passed** on localhost:5090: desktop 1440px/phone 390px alignment, cap persistence, independent unsaved discounts, stale settings edits, real assigned-manager and cashier sessions, direct cashier API denial, and printed/part-paid bill history preservation. Final screenshots inspected: verification/local-bill-summary-aligned-WIDTH.png and verification/local-loyalty-cap-adjustments-WIDTH.png.
- Typecheck and optimized build passed. **Two affected PostgreSQL cases passed** in an exact disposable QA database: owner/manager authorization, staff/native/tenant/outlet rejection, preserved previous claims/future cap enforcement, and serialized edits/exact retries/audit integrity. The runner completed successfully and removed that database.

The initial broader PostgreSQL run was intentionally stopped after its unchanged baseline case passed. Its disposable database removal was checked before starting the targeted run. No test assertion failure or live-database write was involved in this narrowing.

Private task logs: work/bill-cap-backend-full.log, work/bill-cap-final-browser.log, work/bill-cap-typecheck.log, work/bill-cap-build.log and work/bill-cap-postgres-targeted.log in the parent task directory. work/bill-cap-postgres.log records the intentionally stopped broader run.

Local only; no push, deployment or Production/client/Petpooja release-count change. Q111 remains unanswered and procurement remains paused.
