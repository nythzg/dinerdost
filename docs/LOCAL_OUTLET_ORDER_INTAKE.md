# Local outlet intake and current layout completion

24 October 2026. Local uncommitted review draft only; no push or deployment.

The user explicitly chose the selected outlet (N1), rather than all outlets of Nythz Coooks. The top-bar switch follows the outlet picker. Green On accepts new orders; red Off pauses new order intake for that outlet. Owners and assigned outlet managers can change it in the web workspace. Other roles and read-only support cannot. The server checks scope, strict input, independent optimistic version, idempotency and an audited reason. No other outlet or QR policy is changed.

The shared service gate covers new POS/waiter/shared native-service rounds, drafts, Add More, draft edits/submission, QR new and extra rounds, D2C checkout and paid replacement creation. Existing orders can still be read, paid, served and settled. Menu/history viewing remains available; public QR/storefront surfaces show the paused state. Unconfigured external provider integrations have not been activated or claimed tested.

Order creation takes a shared outlet lock; the switch takes an exclusive outlet lock. D2C takes the outlet lock before customer/device locks, matching the other intake paths. Requests already serialized before a pause can complete; requests serialized after it fail with OUTLET_ORDERING_PAUSED. Reopening restores intake without revoking guest grants, changing QR preferences or rewriting existing orders, payments, invoices, stock or FIFO history.

Migration 063 adds order_intake_enabled (default true) and its independent version. It was applied to the retained local database only after a cold backup. Fingerprints of every prior column/row across all 99 pre-existing tables were unchanged. Migration replay was verified idempotent. No demo data was seeded into retained N1.

## Verification

- Full backend run: 388 passed, including six new intake cases covering scopes, roles, application/read-only support boundaries, versions, idempotency, cross-outlet isolation, unchanged business records, POS/waiter/drafts/QR/D2C/paid replacement and concurrent state changes.
- Real PostgreSQL: all six new cases passed in a verifier-owned disposable database. After the D2C lock-order refinement, its checkout case passed again. All verifier databases were confirmed removed. An additional embedded replay explicitly records payment after pausing, then serves and settles the existing order.
- After that lock-order refinement, all nine intake/storefront embedded cases passed.
- Browser evidence across this batch covers 29 distinct workflows: current layout (5), header/profile (5), Superadmin (5), selected refinements (7), working preview (4), calculator (3). Earlier 28-route control/data parity is retained; final targeted replays cover order metadata/customer actions, table billing, outlet pause/reopen, neutral popup fitting, branding, calculator overlap and current alerts. These are checkpoint-specific runs, not a claim that every suite reran after each small CSS change.
- Typecheck and optimized build passed. Isolated QA source matched 400 files. Desktop/phone screenshots were inspected. QA mutations use disposable accounts on 5091, never retained N1 on 5090.

The local server listens on 5090 and was verified through localhost and the current Wi-Fi address. The Wi-Fi address can change with the network. Production version/metadata, released client/Petpooja counts, Q111, paused procurement and hardware/provider/native delivery deferrals remain unchanged.
