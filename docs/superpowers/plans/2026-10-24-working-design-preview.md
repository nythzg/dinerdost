# Working Design Preview Implementation Plan

> **For agentic workers:** Execute inline in this existing local feature checkout; no delegation or new worktree. Preserve the running local workspace and uncommitted visual draft.

**Goal:** Make the approved dark-green design a fully working, opt-in appearance of the existing app, preserving every existing route, permission, field, action and data contract.

**Architecture:** /design-preview enables a browser-local appearance preference and opens canonical /app routes. A root appearance provider applies screen-only CSS and optional icon artwork; existing restaurant, platform and customer components continue fetching and writing through their unchanged APIs. Existing independent sign-ins remain mandatory. The prior synthetic prototype is retained at /design-preview/reference, explicitly a reference rather than the working model.

**Tech Stack:** Installed Next.js App Router, React context, scoped CSS, existing SVG/Icon and SweetAlert2, existing Playwright/PGlite fixtures. No packages, providers, hardware or backend/schema changes.

**Spec:** Direct 24 October request plus docs/LOCAL_ECOSYSTEM_DESIGN_PREVIEW.md. The request authorizes a working preview; final release/deployment remains deferred.

## Global Constraints

- All existing content, properties, functionality, role/tenant/outlet checks, financial/stock history and approved floor geometry remain unchanged.
- Preserve Nythz Coooks / Nihal kaman / N1 and both original sign-ins; QA mutations only in guarded isolated databases on 5091.
- The visible preview bar must state local working data, since actions now save normally. It changes appearance only and cannot grant access.
- Do not restyle printed documents. Exclude document routes and restore original icon artwork in print media.
- Keep every restaurant navigation item and Manage behavior. Improve scrolling through a stable narrow scrollbar, contained scrolling, fixed identity/footer and keyboard-accessible links; add an optional desktop collapse control.
- No production/Q/PP completion count change; Q111 and procurement/provider/hardware/native deferrals remain.

## Review Focus

1. Theme persists through canonical links, redirects and reloads; exit restores baseline appearance without changing sign-ins/data.
2. Expanded/collapsed/phone navigation retains all permitted destinations; long management lists, footer and focus remain reachable.
3. Original fields, options, enabled/disabled states, filters, saving, uploads, calculators and floor editing remain intact.
4. Staff/QR/storefront ordering, saved bills/rewards and support read-only/edit restrictions use actual server results.
5. Print routes/media and the disabled theme retain original presentation; no authentication bypass or fake business data.

## Tasks

- [x] Write guarded working-preview browser checks for canonical entry, screen/control parity, real save/order/reload, navigation scrolling/collapse, role denial, theme exit and responsive screens. Observe the initial failure at canonical entry.
- [x] Add the provider, canonical entry and scoped skin/icon artwork. Root layout adds composition only; Workspace adds appearance attributes/collapse control only. Keep business handlers/navigation definitions unchanged.
- [x] Apply the same appearance to existing Superadmin/customer/auth screens and existing alerts/uploads; retain the synthetic reference separately and adjust its existing tests to that explicit route.
- [x] Run isolated screen-parity and workflow checks, affected existing regression suites with opt-in preference, typecheck/build, desktop/phone inspection and original business-source/schema diff review. Record limitations honestly rather than claim exhaustive 100% acceptance.
- [x] Update local checkpoint documentation, keep the model reviewable locally and reopen /design-preview. No push/deployment or permanent default-theme switch before review.

## Execution notes

The existing local feature branch already owns the active uncommitted prototype and server; reusing it avoids losing that review state. Appearance is opt-in per browser, not a new business implementation. Full legacy capability coverage comes from reusing every original screen and handler rather than copying them into a second app. Verification will distinguish architectural parity, tested workflows and deferred providers.

Final verification: 35 distinct working browser workflows, four focused backend cases, typecheck/build. Initial entry check failed against the sample page as expected. QA setup/reload issues were resolved with a separate source-identical snapshot; no production embedded-storage bypass. All original business handlers remain unchanged; only root appearance composition/Icon artwork/optional sidebar-collapse metadata were added. User subsequently emphasized a new modern interactive layout; the responsive dashboard/table/tab presentation and browser-local density choice satisfy that direction without replacing controls. Source review and exact 28-route control/property comparisons completed inline. Final preview remains uncommitted for review.
