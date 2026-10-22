# Architecture

The web application is a Next.js App Router application. Its browser interface calls same-origin route handlers. Route handlers authenticate a server-side session, validate origin and input, and dispatch to service functions. UI fields do not set order prices, financial state or kitchen authorization.

## Transaction boundary

Every authenticated write carries a UUID idempotency key. The service records its actor and input fingerprint, locks the relevant rows, validates the expected record version, applies state changes, and writes an audit event and outbox event inside the same database transaction. A repeated key returns its recorded result; a reused key with different input is rejected.

Prices are snapshots in integer paise. Quantities use thousandths. Discounts use largest-remainder allocation across lines, preserving the exact discount without negative taxable lines. FIFO stock uses locked batches and distinct reserve/consume/release operations.

The first release uses India business time consistently for reservation input, business-day reports and stock expiry. Supporting configurable outlet time zones is a separate extension.

Order status, round acceptance, payment attempts, KOT state, document type and final settlement remain distinct. An unverified receipt cannot release a kitchen ticket. A provisional document cannot settle an order. Additional rounds do not change accepted item snapshots.

## Storage and isolation

Production uses PostgreSQL. Local development and the fast test suite use PGlite with the same SQL schema and policies. Hosted PostgreSQL tests run against a temporary, isolated database and remove only that test database afterwards.

Tenant operations set `app.restro_id` transaction-locally and assume the `dinerdost_app` role. Forced row-level policies apply to tenant tables. Staff outlet access and waiter session ownership are additional service checks. Authentication and account bootstrap use the privileged server connection intentionally; its credentials must never be exposed to the browser. The hosting connection must be able to assume the application role. Migrations grant that membership explicitly.

Owner and manager audit views differ. Managers cannot read owner events, payroll/tax/employee audit entities or owner alert payloads. Kitchen read models omit orders, customers, payments, invoices, employee records and audits. Revoked staff access invalidates the next authenticated request, including existing sessions.

## Sessions and QR

Session tokens are random, hashed in the database, and sent in HttpOnly, SameSite cookies. Passwords use salted scrypt. Sign-in and sensitive confirmations are rate limited.

When QR ordering is enabled, opening a permanent table link makes an explicit connection request. The outlet activation switch determines whether an idle table requires a customer request followed by staff approval, or opens automatically on scan. An active table can issue a random, device-bound two-hour visit grant in an HttpOnly cookie scoped to its API path. Repeated scans reuse the physical session. Reservations and ambiguous split sessions prevent automatic activation while still allowing Call waiter. Catalog polling never creates or reopens a session. Existing single-use paired grants remain compatible.

Each device can read only its own order; another device scanning the same card never inherits customer identity, order history or totals. Table closure or QR pause revokes access, including unbound visits when an outlet is paused. Outlet, device, table, session and grant locks serialize writes. Ambiguous split sessions require staff help. The public link is shareable and does not prove physical presence: guest requests are rate limited and always pending until staff acceptance. Customers cannot verify payments or release KOTs.

Owners and managers can temporarily ban the browser linked to a customer QR order at its outlet for 15 minutes, 1 hour, 4 hours or 24 hours. The stable device cookie is HttpOnly and persists beyond the two-hour table visit. A device row lock serializes bans with connection, pairing, orders and service requests; expired bans stop matching automatically. Early lifting and all ban decisions are audited. Order-device bindings persist even after a visit ends, without exposing device hashes in staff or guest read models. A database trigger also captures bindings from the prior app version during rollout. Existing orders and payments remain intact.

This is a browser-cookie restriction, not hardware identification. Clearing site data, private browsing or a different browser can produce a different identity; shared Wi-Fi users are not blocked as a group.

Tables expire after ten minutes without actual activity, provided all splits are idle and no unsettled orders remain. Server reads/writes check expiry, close sessions, revoke visit grants and audit the closure. Trusted input on the customer or selected table page refreshes activity; automatic polling does not. With no requests, cleanup occurs on the next request.

## Owner bill and staff controls

Only owners can change a bill's tax percentage or add/edit/remove named fixed charges such as packaging fees. The services validate current versions and payment/kitchen state, reset reward calculations and audit the changes. Charges are added after item tax and included in immutable bill snapshots. Manual cash/digital receipts are recorded as received in one transaction; they do not need a separate verification action or an additional cashier password. Historical uncertain receipts retain explicit resolution.

Owners create seven-day, single-use staff invitations and share the resulting links. The invitation table stores token hashes; the owner-only idempotency response retains the original link for safe retries. Staff choose their own passwords. Role, outlet and enabled-status changes are versioned and checked against current employee data on each authenticated request, including existing sessions. Owners cannot remove their own access or grant another owner role through staff invitations.

The web app accepts authenticated staff submissions in the same transaction as item validation and stock reservation; customer submissions remain pending. Acceptance does not authorize payment or kitchen release. Accepted staff items may be edited while unpaid and held, with previous reservations released before recalculation. Native application contracts retain their prior flow.

Manual bill discounts and nearest-rupee rounding use integer paise and server quotes, replacing coupon/points reservations rather than stacking with them. Payment, uncertain-receipt and kitchen locks protect adjustments. Issued snapshots remain immutable.

## Audits

Audit entries capture actor, role, authentication, action, entity, before/after, reason, financial impact, outlet/table, device/IP and device/server timestamps. A locked per-tenant head serializes the SHA-256 chain. Application permissions and database triggers block mutation of issued documents, audit rows, stock movements and posted loyalty entries.

This protects against normal application mutation, not a hostile database administrator who can alter schema or disable triggers. Signed offline device logs, hardware attestation, immutable external retention and native biometric approval are outside this release.

## External delivery

The native staff inbox reads safe summaries from immutable business audit events. `notification_reads` stores per-employee acknowledgements. Every read and acknowledgement recalculates current restaurant, outlet and role scope. Ready events are visible to all authorized outlet waiters; their service view shows order/table/station without widening assigned-order access. Other events retain their existing ownership rules; raw audit payloads are not returned. Cursor pagination preserves history. This inbox is separate from external WhatsApp delivery and works without Firebase.

Android uses Kotlin/Android Views and JSON API calls, with encrypted session storage and role-scoped native navigation. No WebView, browser cookie bridge or HTML rendering remains in the Android application. See `apps/android/README.md` for native module boundaries and acceptance limits.

Notification rows are stored as `NOT_CONFIGURED`; they are not reported as delivered. Outbox entries persist transactional intent. No delivery worker, gateway webhook processor, OCR processor or aggregator adapter is enabled. The interface reflects this state.
