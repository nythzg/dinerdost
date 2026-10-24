# Local payment history filter and sorting dropdowns

24 October 2026. Local, uncommitted web change; no push or deployment.

The Payments toolbar now has compact Filter and Sort icons with labelled dropdowns. The former method tabs and permanently expanded filter row are replaced by these controls. Refund requests and Payment methods still open their original, role-guarded interfaces. Order links, pending-receipt Resolve actions, pagination and every table column remain.

Filter contains the existing All dates/Daily/Weekly/Monthly/Custom period choices, custom start/end dates, minimum/maximum rupee amount and order-number/reference search. The method selector includes All and every existing payment method. A separate payment-state selector now exposes Received (stored VERIFIED), Awaiting verification, Unknown, Initiated, Rejected and Failed. The former generic Status selector actually represented methods; the two meanings are now labelled explicitly.

Filter changes are applied together with Apply. Reset clears filters while preserving the selected sorting. The badge counts nonempty applied filter properties. Sorting has Created date, Amount, Order number, Payment method, Payment state and Reference properties with both directions; direction labels reflect the selected property. Reset sorting restores newest first while preserving filters. A dot indicates nondefault sorting.

Sorting and combined filters run on the server across the complete authorized matching history before the existing 100-row page limit. The default date ordering is unchanged. Every ordering has stable timestamp/ID tie breakers; blank references stay last, and state sorting uses the displayed Received name. Enum-validated sort keys select only fixed SQL expressions. State/sort properties are restricted to payment activity; other activity screens retain their existing filter behavior and ordering.

Native details/summary controls support keyboard use. Escape closes the open dropdown and returns focus; outside interaction closes it, and opening one closes the other. Dropdowns align with their own triggers, stay inside the panel/viewport and recalculate on resize, with an internal scroll fallback on short screens. Labels, icons and Apply/Reset have explicit green/neutral contrast, including overrides for inherited panel-heading styles. Screen-only styles leave print media unchanged.

No payment recording, verification, refund, reconciliation, bill, tax or stock calculation changed. Existing tenant/outlet, role/application, version and financial-history guards remain. No schema migration, dependency or provider configuration was added. Agent QA writes use only the isolated disposable app on5091; retained Nythz Coooks / Nihal kaman / N1 remains outside agent QA.

Verification:

- Full embedded backend suite: **395 passed**. The two new cases exercise205 payments across three pages, all twelve sort directions, combined date/amount/search/method/state filters, default-order compatibility, invalid inputs, role/outlet/tenant isolation and unchanged financial/stock history.
- The two payment-activity cases also passed on real isolated PostgreSQL. The verifier removed its exact temporary database; final inventory was empty.
- The focused browser workflow verifies real filtered/sorted receipts, empty results, reset behavior, original settings/refund actions, unchanged saved orders, keyboard dismissal, contrast and popup bounds in current/preview appearances at1440×1000,390×844,320×568 and844×390. A final replay also checks control/data parity on all28 Restaurant routes.
- Typecheck and optimized build results and the source-matched QA hash are recorded in RELEASE.json. Screens were inspected. Earlier broader browser evidence remains checkpoint-specific; legacy full browser suites were not rerun for this change.

Private fixtures, credentials, logs and screenshots remain in the ignored parent work folder. Q111, procurement pause, released production/client/Petpooja counts and provider/hardware/native deferrals remain unchanged.
