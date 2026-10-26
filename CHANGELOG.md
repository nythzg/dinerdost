# Changelog

## 0.4.33 — release candidate, 2026-10-27

- Integrate PP21 printable/downloadable stock count sheets and previewed, validated atomic current-day CSV import with all accepted 0.4.32 UI fixes.
- Correct the Service browser regression to assert one fully ready round across stations, reject premature serving and preserve totals/stock. Service application behavior is unchanged.
- Give synthetic KYC uploads unique test filenames so desktop and phone regressions can share isolated QA data without ambiguous document links.

Validation: 427 backend tests, 5 affected browser workflows, 20 UI checks and 8 existing regressions across desktop Edge/phone WebKit, 5 isolated real PostgreSQL cases, typecheck and optimized build passed. No schema migration or production-data import. Deployment is pending existing Vercel team access and the user's hold; accepted production release records remain 0.4.32.

## 0.4.32 — 2026-10-25

- Keep keyboard focus inside dialogs and retain search cursor position during updates.
- Warn before discarding unsaved restaurant bill settings or Superadmin feature controls.
- Preserve Superadmin sections, restaurant filters and customer QR navigation in the URL, including Back, Forward and refresh.
- Keep large tables responsive with pages of up to 50 records.
- Add a persistent customer animation pause/resume control and serve the existing fonts locally.
- Preserve curved sidebar styling for Superadmin navigation links in expanded and compact views.

Validation: 418 backend tests, 20 new desktop/phone browser checks, four existing browser regressions, TypeScript and optimized build passed. Physical devices were not retested. No database migration is required.
