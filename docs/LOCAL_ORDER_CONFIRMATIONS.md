# Local SweetAlert2 order confirmation · 23 October 2026

Implemented and verified locally; no push or deployment. The receiving user narrowed the initial detailed summary to **only table/takeaway, order number, customer, rounds with items/prices, and grand total**. That later instruction is authoritative.

## Current behavior

The existing SweetAlert2 dependency displays a shared green Order placed popup after successful staff POS takeaway/delivery/table orders, added rounds, submitting a saved draft, customer QR orders and public storefront takeaway submissions. The popup contains only table/order type, order number, customer name, each round's items with quantities and selling prices, and grand total. A missing customer name is shown as Not provided. Staff-managed delivery retains its actual Delivery type.

The popup remains until dismissed, with scrollable content and a reachable Done button on phones. Draft-only saves, edits to already submitted rounds, rejected submissions, reloads and polling do not show a new order confirmation. A failed follow-up refresh preserves a successful submission. Existing customer pages retain their acceptance status beneath the popup.

Selling prices and quantities come from saved snapshots. Line extensions use the core fixed-point roundRatio function, including the 0.145 kg × ₹1.00 = ₹0.15 boundary. Grand total uses saved payable amounts from active rounds, matching the existing bill. Older cached responses omit unavailable prices instead of inventing them.

## Safeguards

The helper builds DOM nodes using textContent. Item text is never interpreted as HTML. The confirmation performs no payment, invoice, stock, FIFO or service transition.

Public projections add only the saved selling price/unit and, for storefront rounds, round number within the existing visit/device scope. Previously available public fields remain unchanged. Recipes, stock costs, payment-attempt logs and unrelated identities remain excluded. No migration, dependency, provider or package configuration change.

## Verification

The final simplified implementation passed 11 affected backend cases in billing-updates.test.ts and storefronts.test.ts, two comprehensive browser workflows on localhost:5090 at 1440×1000 and 390×844, typecheck and optimized build. Browser checks cover all submission paths, no success on rejected/draft-only saves, refresh failure after success, rapid double click without duplicate orders, added-round history, literal HTML-like preparation notes excluded from the popup, visit privacy, fixed-point selling prices, exact grand total, keyboard dismissal and viewport bounds. Desktop/phone screenshots were inspected.

Before simplification, the full 287-test embedded backend suite and six existing ordering regressions passed, including payment/kitchen/final-invoice history, QR ordering, draft edits and store booking/ordering. One initial store regression hit the loopback signup rate limit; its helper now assigns separate synthetic local clients, and the rerun passed. Hosted rate-limit behavior remains unchanged. PostgreSQL was not rerun for these SELECT-projection additions.

Final evidence: parent-task work/order-placed-minimal-backend.log, work/order-placed-minimal-browser.log, work/order-placed-typecheck.log and work/order-placed-build.log. Earlier regression evidence: work/order-placed-backend.log, work/order-placed-regression.log and work/order-placed-final-browser.log. Screenshots: verification/local-order-placed-KIND[-totals]-WIDTH.png.

Local/unreleased; original/receiving Production, client/Petpooja release counts, the procurement pause and unanswered Q111 remain unchanged.
