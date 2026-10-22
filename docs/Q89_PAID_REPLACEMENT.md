# Q89 paid replacement — receiving-device implementation

Implementation version: **0.4.31**. Release acceptance is recorded separately; this document is not proof of deployment.

## Using the web workflow

Owner/manager → Orders → order actions → **Paid replacement**. All active rounds on the original bill must be fully paid. Select replacement dishes, quantities, available portions/add-ons, an optional discount and rounding. Named charges remain owner-only. The final amount after tax, discount, charges and rounding must be at least the original bill's final payable; the server checks the displayed quote again before saving.

The original order's unallocated actual receipts become credit on a new linked order. Equal amounts remain Paid; higher amounts are Partially Paid and collect only the difference. Prior manual refunds reduce available credit, so even an equal replacement needs any refunded amount collected again. No payment attempt is copied or fabricated. Replacing the same original twice is blocked; a later replacement of its successor carries the same receipt IDs forward.

New food goes through ordinary ingredient reservation/FIFO consumption, KOT authorization, kitchen stages and explicit service. Paid never means prepared or served. Original consumed stock and item costs remain unchanged. Staff must confirm that original unserved food is discarded before its service tickets are cancelled; the workflow records cooked wastage without restoring ingredients or publishing ready food. Held reservations can be released. Already-served food is not recorded again as waste.

A replacement may use the same still-open table visit. When that visit has closed, staff can explicitly choose Takeaway. A historical bill cannot attach itself to a later guest's visit. Ordinary outlet/tenant scope and existing manager authorization remain.

## Records and reports

- Migration **051** adds only append-only, tenant-scoped `web_replacements`. Original invoice snapshots, receipt rows, round money, item costs and raw stock history are retained.
- Every credit has an immutable record, the original order/bill/receipt references and a replacement-order link. The new final invoice freezes its replacement reference, original credit and supplementary amount. Printing a replacement record does not increment an original invoice's print counter.
- Refunds and replacements share receipt availability. Both serialize on the source order. Pending cashier refund requests must recheck the remaining balance on manager approval. A credited original receipt cannot also be refunded on its old order.
- An already-recognized original sale receives a separate negative credit adjustment when replacement is recorded. New sale revenue is recognized through the replacement's eventual final invoice. Pre-invoice originals have no recognized revenue to reverse; their recorded food costs are expensed once. Gross receipt-method records remain actual collections; credit is never a second collection.
- Refund components plus the remaining replacement credit reconcile every paise of original sales/tax/charges/round-off. Credits are not gateway refunds.
- Existing posted reward history stays immutable. The new estimate excludes points already earned on the ancestor bills; prior locked redemptions are posted once against the replacement's actual final settlement. No platform identity or reward rate is invented.
- Dish reports retain gross original settled item history and explicitly direct users to the financial report for refund/replacement adjustments. Daily physical counts remain observations; this workflow does not edit them.

## Verification

`tests/web-replacements.test.ts` covers equal/higher totals, original documents/receipts/costs, actual credit allocation, idempotency, stale quotes, tax/discount/charges, owner-only charges, original-payable floor, partial refunds, financial reports, reward earnings, competing refunds/replacements, insufficient stock rollback, role/outlet/tenant/native boundaries, replacement chains, odd-paise reconciliation, closed visits and forced RLS.

`tests/browser/web-replacements.spec.ts` covers lower-total rejection, explicit confirmation, equal/higher replacements, original-document preservation, only-extra collection, explicit serving, linked invoice/credit documents and rendered 1440px/390px layouts. Use one Playwright process at a time. The new-device PostgreSQL runner accepts `--env=.env.qa.local` and creates/drops only exact random `dd_verify_*` databases.

## Receiving account

New project: `prem-2230/dinerdost-web`. The new QA resource is isolated. After reviewing the upstream same-data handoff update, the user explicitly chose **“make a new data base”** in the receiving chat on 23 October. The receiving deployment therefore uses a fresh, separately provisioned production resource; no original restaurant records have been transferred. `VERCEL_DATABASE_HANDOFF.md` remains the procedure for a later explicitly requested existing-data connection, not the selected setup here. The existing `nythz/dinerdost-app` deployment and its live database have not been modified, replaced or deleted. Secrets, `.vercel`, environment files and temporary QA credentials remain outside Git.

Q111/Q114 remain unanswered. Petpooja PP01–PP27 progress is tracked separately in `PETPOOJA_ADDITIONS.md`; Q89 does not complete a PP group. Android, Firebase, providers, packages, offline hosting, marketplace and client recipe/rate configuration remain deferred.

## Hosted acceptance

Receiving Production 0.4.31 passed the full desktop/phone workflow on 23 October 2026. All 264 backend cases, ten Q89 PostgreSQL cases and five refund PostgreSQL cases passed; eight public/auth/CSRF checks passed. [Acceptance](../verification/production-0431-acceptance.json). Original app/database are unchanged; new receiving Production has no transferred restaurant data.
