# Local Superadmin redesign · 23 October 2026

Local UI refresh for the existing platform console. Open http://localhost:5090/superadmin (or the existing LAN host). The user requested a professional, interactive design in Diner Dost's green theme. This changes presentation and navigation, not backend contracts, schema or business rules.

## Design and interactions

- Evergreen grouped navigation (Workspace, Management, Governance), white/ivory work surfaces, compact headings, sage statuses and consistent spacing. Existing loaded DM Sans/Manrope fonts and shared Logo/Icon/Modal components are reused.
- Desktop navigation collapses to an icon rail and remembers only that visual preference. Phone navigation uses a drawer with Escape, focus containment/return and background scroll locking. Skip-to-content, visible keyboard focus and reduced-motion styling are included.
- Search console opens with Ctrl/Cmd+K, supports arrow keys/Enter/Escape and offers only permitted pages and already scoped restaurant settings. Empty queries/results have explicit feedback. Search cannot stack over the console's active edit form.
- Overview groups actual database counts, recorded subscription metrics, accessible operational priorities and actual current/previous-week order comparisons. No synthetic trends or estimated revenue are introduced; unavailable business measurements stay “Not recorded.” Priority counts explicitly cover listed records, not an unlimited global backlog.
- Financial performance, Restaurant adoption and System monitoring have separate view controls. Existing local-processing and configuration actions remain available with their original guards.
- Restaurant directory keeps server filtering/pagination, adds restaurant/order sorting for the current page (explicitly disclosed), identity/status styling and phone horizontal-scroll guidance. Data source/demo-flag explanations remain available under About these counts.
- Definition categories gain search and All/Current/Archived visibility controls. Existing management forms, password/reason requirements, support entry, editable troubleshooting, audit actions and validation are retained. Success feedback can be dismissed; errors remain visible.

## Tools and implementation limits

Applied frontend-design, frontend UI engineering, ponytail and React review guidance. Consulted shadcn MCP sidebar/command-dialog examples and its audit checklist for interaction patterns; no registry components, packages or configuration were installed. The 21st inspiration/catalog MCP calls failed with “catalog search failed”; no returned design/code is claimed. No Figma document was supplied. Existing code-native SVG icons suit this administration interface; no generated raster assets are needed.

The active confirmed restaurant is still Nythz Coooks / Nihal kaman / N1. No fixture, schema migration, database rewrite, credential change or business-data mutation was performed against it for this redesign. All browser mutations used guarded disposable platform QA databases on port5091. Production version/migrations, original invoices/payment logs/FIFO, scopes and support permissions are unchanged. Providers/hardware remain deferred. Q111 is unanswered; procurement remains paused. Client and Petpooja completion/release counts remain separate and unchanged.

## Verification

31 final passing Chromium workflows:

| Suite | Passed | Coverage |
| --- | ---: | --- |
| Existing platform console | 12 | Provisioning, records, lifecycle, access/quotas, audit, broadcasts and module enforcement |
| Editable impersonation | 3 | Default read-only, explicit authorized writes, exit/original sign-in, stale grant rejection |
| New design | 5 | Keyboard search, compact navigation preference, actual overview/views, phone drawer/forms/sorting, restricted search |
| Restaurant data | 5 | Dataset reconciliation, real order/payment/document drilldown, outlet isolation, denied roles, desktop/phone rendering |
| Operational workflows | 6 | Supplied billing configuration/immutable invoice export/payment/credit, actual templates/tags, branding/report grants, owner workspace, evidence/escalations, scoped phone accounts |

Typecheck and optimized build passed. Desktop1440px and phone390px screenshots were inspected, including the phone management form. Browser checks cover page overflow, accessible labels/focus and selected page errors; this is not a claim of exhaustive WCAG/device certification.

An initial combined run hit the existing login rate limit because tests repeatedly logged in. Tests now reuse authenticated sessions per role; application rate limits were not weakened. One old restaurant-data assertion was updated from the previous scope-help wording to the new visible dataset heading; API/data assertions remain. Final reruns passed.

No backend or PostgreSQL suites were rerun for this UI-only change. The previous371backend/3editable-PostgreSQL results remain historical evidence, not new runs. No push/deployment occurred.
