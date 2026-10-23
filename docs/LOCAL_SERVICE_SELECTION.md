# Local Service round selection

Local Service round-selection refinement: ready-round checkboxes are hidden by default. Select rounds enters an explicit mode with every row unchecked; Select all chooses only eligible rounds in one click, manual selection remains available, and Serve selected is disabled until a selection exists. Clear selection keeps the mode open; Cancel selection clears and hides it. Successful bulk serving exits selection mode; outlet/day/shift changes clear it. Existing per-round actions, eligibility/assigned-waiter rules, confirmation, stale/version guards and server batch behavior remain. Five affected service backend tests and one comprehensive browser workflow at 1440px/390px passed, including station deduplication, hidden/unchecked initial states, manual and all selection, clear/cancel/reopen, cancelled confirmation with no serving, confirmed selected serving and count reconciliation. Typecheck/build passed; desktop/phone screens inspected. UI-only product change; no backend/schema/provider/dependency change or PostgreSQL rerun. The prior 320 full backend tests are historical checkpoint evidence. Local/unreleased; no push/deployment or client/Petpooja release-count change. Q111 unanswered and procurement paused. See docs/LOCAL_SERVICE_SELECTION.md.

## Behavior

- Select rounds reveals checkboxes with no preselection.
- Select all includes only currently eligible rounds; unassigned/ineligible rows cannot be submitted.
- Clear selection deselects without hiding the controls. Cancel selection clears and closes the mode.
- Serve selected is disabled at zero selected and while busy/loading. Its existing explicit served-food confirmation remains. Cancelling that confirmation preserves the selection.
- Successful bulk serving returns to the initial hidden-checkbox state; partial failures retain the remaining selection and existing status message.
- Individual Mark as served and View order actions retain their prior behavior.

## Verification

The affected browser workflow passed twice against localhost:5090 with desktop and phone loops. Five service backend cases cover authorization/assigned waiter/outlet/tenant/native scope, all-station readiness, atomicity, versions, exact retries, unchanged totals and service counts. React review confirmed separate mode/selected state, scope reset, current eligibility filtering and accessible checkbox/action labels. Added the Hindi Cancel selection label to the existing dictionary.

Screens inspected: verification/local-service-selection-hidden-WIDTH.png and verification/local-service-selection-empty-WIDTH.png. Parent work logs: service-selection-browser-final.log, service-selection-backend.log, service-selection-typecheck.log and service-selection-build.log.
