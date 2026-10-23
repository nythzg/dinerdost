# Local upload UI kit adaptation · 23 October 2026

## Authorized scope

Adapt the supplied Upload file ui kit.fig across every existing web upload control in the approved Diner Dost green theme. Source inspected locally: the archive contains canvas.fig, thumbnail.png, metadata and one image. Its decoded document has 1,302 nodes, including Upload, Upload_when drop file, Upload_after drop file(s), Upload_uploading after submit, Upload_one file failed to upload and Upload_all are uploaded. The reference card is 540px wide with 20px main text and 14px helper text; responsive controls fit the existing forms and phone screens.

The reference determines visual structure, not business rules. Its medical sample filenames, 90MB example, archive wording and designer contact panel are source content, not project instructions or app data. Preserve actual single-file constraints, existing upload timing/save controls, API validation, private downloads, original assets/history, permissions and tenant/outlet scope. Web only; no native/providers/hardware/packages/configuration/deployment changes.

## Implementation steps

- [x] Add a shared UploadField using the native file input, green paper illustration/drop area, Browse, file name/type/size, selected/uploading/uploaded/error states and clear/retry controls where meaningful. Keep actual progress indeterminate until success; no illustrative percentage. Honor disabled fieldsets, keyboard labels/focus, drop validation and reduced motion. One file per existing control.
- [x] Adapt existing automatic FileUpload for menu images, staff photos/documents and bill logos. Preserve onChange/onBusy contracts, actual saved-view links, save gating and existing detach behavior; failed replacements retain the current saved asset. Abort pending browser transport when unmounted, without claiming server rollback.
- [x] Apply the same field to manual KYC, parent-brand logo and case-evidence forms, keeping named file FormData, reasons/target selection, explicit submission and private-file checks. Surface failure and success honestly.
- [x] Verify real upload workflows and error/retry/disabled/multiple-file cases in a separate guarded QA database, including desktop/phone rendering, keyboard Browse, actual image/logo/private document persistence, cross-tenant/role denial and unchanged issued history. Run affected existing regressions, typecheck/build and focused upload/receipt backend cases. Actual results are recorded below.

The Figma connector accepts cloud file keys and cannot open this local attachment; inspection used the archive preview and an offline schema/data decoder based on the [primary Kiwi format reference](https://github.com/evanw/kiwi), with no design-file upload to an external service. No parser package is added to the application.

## Coverage and retained upload contracts

| Purpose | Accepted content / existing maximum | Commit timing and access |
| --- | --- | --- |
| Menu photo | JPG, PNG, WebP / 3,500,000 bytes | Upload on selection; menu form Save attaches it; existing public image endpoint |
| Staff photo | JPG, PNG, WebP / 3,500,000 bytes | Upload on selection; staff Save attaches it; private staff-file endpoint |
| Staff document | Images / 3,500,000 bytes; PDF / 2,000,000 bytes | Upload on selection; staff Save attaches it; server retains the tighter PDF limit and private access |
| Receipt logo | JPG, PNG, WebP / 3,500,000 bytes | Upload on selection; Save bill details changes the outlet default; issued snapshots retained |
| KYC evidence | PDF, JPG, PNG / 2 MiB | Selection/drop stages native multipart data; Save private document submits with reason and existing permission/idempotency checks |
| Parent-brand logo | JPG, PNG / 2 MiB | Explicit Upload with selected brand/reason; existing branding/publication controls retained |
| Case evidence | PDF, JPG, PNG / 2 MiB | Explicit Upload with selected tenant/ticket/reason; private download restrictions retained |

Only the shared UploadField renders a native file input now. Existing field captions remain accessible input labels. Browse uses a keyboard-operable button, drop and selection share validation, and manual forms receive the actual File via FormData. Removal changes the current draft; it does not delete an existing stored asset or rewrite history. Transfer progress is indeterminate, and Uploaded means the API succeeded, not that the enclosing menu/staff/bill form was saved.

## Verified locally

- **16 distinct browser workflows passed:** 8 new upload-kit cases, 6 existing platform-operations regressions, and 2 existing afternoon menu/private-staff regressions. Real Chromium/Edge, isolated guarded port 5091 databases only.
- New cases cover keyboard Browse, actual menu persistence, failed replacement/retry and disabled save while pending, unsupported/oversized/multiple-file rejection, manual KYC staging/clearing/required submission/private download, explicit brand upload, receipt-logo save timing, and long filenames at **1440px and 375px**. Both final rendered screens were inspected with the actual uploader scrolled into view; no page overflow or browser page errors.
- Existing operations cases cover brand publication, case attachments and role/tenant restrictions, owner-support boundaries and preservation of issued financial records. Existing afternoon cases cover menu Half/Full POS pricing and private staff photo/PDF save/reload with cashier denial.
- **4 focused backend cases passed** (0 failed/skipped): menu-photo validation/scope, private staff details/files, versioned owner-only receipt settings, and immutable thermal-bill snapshots. Full backend and PostgreSQL suites were not rerun for this UI-only change; earlier 373-test/PostgreSQL evidence belongs to its earlier checkpoint.
- **Typecheck and optimized build passed.** No backend/API/schema, migration, package, configuration or working restaurant data change. QA used separate fixtures; no QA rows were added to Nythz Coooks / Nihal kaman / N1.

During verification, test fixtures were corrected to select the intended outlet, use a genuinely decodable PNG, and identify exact file-input labels rather than the newly accessible group/Browse labels. A repeated QA login hit the existing rate limiter; the final run used a fresh isolated fixture without relaxing it. Final operations 6/6, upload-kit 8/8 and legacy 2/2 runs passed. Early screenshots that showed the form top were replaced by the inspected uploader views.

Local only; no push/deployment. Production metadata and client/Petpooja released counts remain unchanged. Q111 remains unanswered, procurement paused, and providers/hardware/native work deferred.
