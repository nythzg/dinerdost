# UI review fixes — 25 October 2026

Status: preview approved by the user on 25 October 2026. Web patch 0.4.32 is prepared for the explicitly authorized production deployment and GitHub sync. Deployment acceptance will be recorded after live verification.

The user authorized fixing the Web Interface Guidelines review findings across restaurant, Superadmin and customer QR, testing them, and showing a preview before deployment.

## Changes

- Shared dialogs select visible, enabled focus targets, keep focus inside, restore the prior keyboard target and retain the latest close handler without restarting focus setup on parent updates.
- Bill-adjustment drafts warn before closing or leaving. Feature controls include reason-only changes in the unsaved guard. Cancel preserves edits; successful saves do not prompt to discard.
- Superadmin sections, record filters and restaurant directory search, sorting, pagination and selected restaurant use URL state. Navigation entries are real links, preserving modified-click behavior and the curved rail in expanded/compact layouts.
- Customer QR views, course, category and dish search use URL state, supporting refresh, Back and Forward without resetting location. Order/payment APIs are unchanged.
- Large shared tables render at most 50 records per page, keeping the existing four-row scroller and access to all remaining records.
- Customer animations have a visible, persistent pause/resume control. Paused SVGs use a still variant; reduced-motion support remains active.
- Existing DM Sans/Manrope fonts and subsets are served locally, with swap display, Latin preloads and included OFL licenses.

## Verification

- `npm test`: 418 passed, zero failures or skips.
- `npm run typecheck`: passed.
- Optimized build using an isolated `.next-ui-review-build` directory: passed.
- `playwright.ui-review.config.ts`: 20 new checks passed across desktop Edge (1440px) and mobile WebKit (390px), including focus/caret, keyboard trapping/restoration, cancelled close/navigation/reload/Back, successful saves, bookmark/refresh/history behavior, animation pause/reduced motion, local fonts, 121-row pagination and both rails.
- Four existing browser regressions passed: calculator slide/resize/persistence, password visibility, Superadmin overview and private KYC upload/download.
- Browser assertions used a newly created synthetic `.data/platform-qa-*` database on localhost:5091. No retained restaurant or production database was seeded or changed.
- `git diff --check`: passed. Existing navigation test helpers/selectors were updated for links.

The local screenshot gallery at http://127.0.0.1:5093 contains restaurant, Superadmin and customer QR desktop/phone captures, plus live local entry links. Gallery assets and QA credentials stay outside tracked source under the existing private work directory. These local URLs require this computer's preview servers to remain running.

Physical phones, assistive-technology hardware and hosted PostgreSQL were not retested. There are no database, service, permission, billing-formula or migration changes. This acceptance does not update production status, Q/PP completion counts or deferred procurement/native/provider work.
