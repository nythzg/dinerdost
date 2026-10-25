# Changelog

## 0.4.32 — 2026-10-25

- Keep keyboard focus inside dialogs and retain search cursor position during updates.
- Warn before discarding unsaved restaurant bill settings or Superadmin feature controls.
- Preserve Superadmin sections, restaurant filters and customer QR navigation in the URL, including Back, Forward and refresh.
- Keep large tables responsive with pages of up to 50 records.
- Add a persistent customer animation pause/resume control and serve the existing fonts locally.
- Preserve curved sidebar styling for Superadmin navigation links in expanded and compact views.

Validation: 418 backend tests, 20 new desktop/phone browser checks, four existing browser regressions, TypeScript and optimized build passed. Physical devices were not retested. No database migration is required.
