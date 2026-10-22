# Local web development · 23 October 2026

The receiving user asked **“make the updates locally”** after Q89 receiving Production acceptance. All subsequent PP work stays in the local checkout, branch `web-recipe-profiles`; it has not been pushed or deployed. The accepted receiving app remains **0.4.31**, and the original app remains **0.4.30**. Local migrations 052/053 are not applied to either production database.

## PP03 · recipe choices and packaging

Recipes → **Recipe choices & packaging** adds explicit staff-entered recipe overrides for an existing size and/or order channel, additive add-on recipes, and additive packaging quantities. Resolution order: exact size/channel, size/all-channel, default-size/channel, existing base recipe. Add-on and packaging entries use the selected channel or their all-channel fallback. Disabled choices fall back normally. Existing liquor peg recipes and ready-food listings keep their established behavior.

New web POS, QR, storefront and paid-replacement lines save their resolved quantities before stock reservation. Accepted and pending saved lines retain that snapshot through later recipe changes; explicitly editing a draft builds a new snapshot. Native orders retain base-recipe behavior. Old rows are left without reconstructed snapshots. Ingredient planning accepts the same sizes/add-ons/channels, and expiry review includes configured recipe-choice links. The order usage inspector shows saved components rather than reconstructing them from today's configuration.

No recipe, rate or packaging quantity is populated for a real restaurant. Unconfigured base recipes stay unknown and ordering stays allowed. Packaging alone does not imply a complete food cost. Recipe quantities remain behind web inventory/report permissions; cashier/native reads and invoices omit them. Original invoice/payment/cost rows are not rewritten.

Migration **052** adds forced-RLS `web_recipe_profiles` and a nullable order-item snapshot. Recipe edits lock the dish and check versions; stale/concurrent writes cannot overwrite a winner. Active recipe links prevent archiving their materials. Failed stock reservations roll back the entire order.

Verification: eight focused backend and eight isolated PostgreSQL cases passed; PP03 full baseline plus additions passed **272** cases, typecheck/build and a local 1440px/390px editor/planning/order workflow. Later combined verification is recorded below. PostgreSQL runner creates/drops only its exact disposable QA database; it does not use either production database.

## PP04 · semi-finished production

Inventory → Inventory tools → **Semi-finished production** creates a new explicitly named output material with a fixed base unit and a versioned reference-yield recipe. Owners configure food recipes; the existing bartender menu authority configures bar recipes. Inputs must be active, in the same outlet and stream. Recipe cycles and identity/unit changes are rejected. Saving a recipe does not move stock.

Authorized inventory staff select a recipe, planned output, actual measured output, batch reference, explicit output expiry, reason and confirmation. Production scales input quantities with integer arithmetic, excludes reserved/expired inputs, consumes FIFO atomically and transfers their recorded value to actual output. Successful yield loss stays within the output's cost; it is not expensed a second time. The output can be used by ordinary dish recipes or another semi-finished recipe.

A measured zero output creates no output stock or invented expiry. Consumed inputs become traced wastage, and the immutable batch cost is included once as a separately labelled production loss in financial operating expenses/exports. Repeated submissions and competing batches cannot duplicate a batch or overspend stock. Input allocations, source batch references, recipe version, measured yield and costs remain frozen in the production record. Explicit physical opening/closing observations are unchanged.

Migration **053** adds semi-finished metadata, forced-RLS production recipes, append-only production batches and movement links. Legacy raw stock with only a recorded unit rate gets its remaining recorded value frozen when production consumes it, so repeated fractional consumption preserves every paise. The stored historical unit rate and prior movements remain unchanged.

Verification in progress: focused local cases cover actual FIFO/value conservation, chained production, cycles/stale versions, simultaneous batches, reservations/expiry, scope/RLS/immutability, zero-output financial recognition and physical counts. Local editor/production/stock-cost/zero-output report screens passed at 1440px/390px and were inspected. Isolated PostgreSQL and final combined checks must finish before PP04 is called fully verified.

## Scope and acceptance

These additions do not change Q111/Q114, current-day physical-count policy, FIFO, original invoices/payment history, provider/native/package/offline/marketplace deferrals, or client data configuration. No hosted PP completion is claimed. `PETPOOJA_ADDITIONS.md` retains released counts separately from local implementation.

The newly supplied original database connection was checked with the baseline read-only utility: migrations 001–050, forced tenant RLS and KOT authority passed. No migrations or writes ran there. Credentials and the aggregate report stay in ignored private files, outside Git. Development and test databases remain separate.

## Final local verification and hosting

**279 full backend cases passed**, plus eight PP03 and seven PP04 PostgreSQL cases in exact disposable QA databases. All disposable QA databases are removed. Typecheck and optimized build passed. Three workflows (recipe choices/planning, production including zero-output loss, and Q89 regression) passed at 1440px/390px both in the ordinary isolated browser environment and on the running local-copy server. Rendered screens were inspected; production record/financial-note spacing was corrected and rechecked.

The user subsequently requested local hosting with original credentials and updates. The updated app is running at **http://localhost:5090**, bound to **127.0.0.1**, using a private local embedded database snapshot. All 63 source data tables matched source-column counts/checksums before use; 143 foreign keys were checked. Original account/password hashes were retained, without resetting credentials. New local migrations 051–053 are applied only to this copy. Current local browser verification uses separate synthetic QA tenants. No original source data is written, and local changes do not synchronize to either hosted database.

Local runtime configuration is the ignored `apps/web/.env.local`; it clears cloud DATABASE_URL/VERCEL values and selects `.data/original-local-20261023`. Keep the database directory, secret environment files and private checksum report out of Git. To restart, run `npm run dev --workspace=@dinerdost/web -- --hostname 127.0.0.1` from the repository root. Existing application email/password credentials work against the copied accounts. Do not use the database-owner password as an application login.

PP03/PP04 are now **locally verified, unreleased**. Released PP counts remain 4 complete/2 partial/21 pending; subsequent groups still need implementation. No native/provider/package/offline/marketplace or unanswered-Q behavior is claimed. [Local acceptance](../verification/local-web-pp03-pp04-acceptance.json).
