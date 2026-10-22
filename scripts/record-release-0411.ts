import assert from "node:assert/strict";
import { readFile, writeFile, rm } from "node:fs/promises";
const read = (path: string) => readFile(path, "utf8");
const json = (path: string, value: unknown) => writeFile(path, JSON.stringify(value, null, 2) + "\n");
const inspected = JSON.parse(await read("verification/vercel-0411-ready.json"));
const deployment = {...inspected, url:"https://"+inspected.url, productionUrl:"https://dinerdost-app.vercel.app"};
assert.equal(deployment.readyState, "READY");
assert.match(await read("verification/vercel-0411-inspect.log"), /https:\/\/dinerdost-app\.vercel\.app/);
for (const path of ["verification/web-0411-browser-final.log", "verification/production-0411-browser.log"])
  assert.match(await read(path), /2 passed/);
assert.match(await read("verification/web-0411-backend-full.log"), /pass 151/);
assert.match(await read("verification/web-0411-stock-counts-final.log"), /pass 10/);
assert.match(await read("verification/hosted-0411-stock-counts.log"), /pass 9/);
assert.doesNotMatch(await read("verification/web-0411-typecheck-final.log"), /error TS/);
assert.match(await read("verification/web-0411-build.log"), /Compiled successfully/);
const migration = JSON.parse(await read("verification/production-migration-0411.json"));
assert(migration.applied && migration.tenantRlsEnforced && migration.countsAppendOnly && migration.kotGateEnabled);
assert.equal(migration.isolatedVerificationDatabases, 0);
for (const item of Object.values(migration.immutableHistory) as {preserved: boolean}[]) assert(item.preserved);
const publicChecks = [];
for (const [path, status] of [["/signin",200],["/api/workspace",401],["/api/stock-counts",401],["/preview",404]] as const) {
  const response = await fetch(deployment.productionUrl + path, {redirect:"manual"});
  assert.equal(response.status,status,path);
  assert.ok(!(response.headers.get("set-cookie")??"").includes("dd_session="));
  publicChecks.push({path,status:response.status}); await response.arrayBuffer();
}
for (const action of ["stockCounts","serve"]) {
  const response = await fetch(deployment.productionUrl + "/api/commands",{
    method:"POST",headers:{"Content-Type":"application/json",Origin:deployment.productionUrl,"Idempotency-Key":crypto.randomUUID()},body:JSON.stringify({action,input:{}})
  });
  assert.equal(response.status,401,action);
  publicChecks.push({path:"/api/commands#"+action,status:response.status}); await response.arrayBuffer();
}
await rm("verification/.qa-production-0411.json",{force:true});
await rm(".env.production.local",{force:true});
const verifiedAt = new Date().toISOString(), readThrough = "2026-10-21T21:28:00+05:30";
await json("verification/production-0411-acceptance.json",{
  version:"0.4.11",deploymentId:deployment.id,productionUrl:deployment.productionUrl,accepted:true,verifiedAt,requests:["Q45","Q46"],readThrough,
  fullBackendPassed:151,finalTargetedBackendPassed:10,additionalQrNonblockingCasePassed:true,hostedPostgresPassed:9,localBrowserPassed:2,productionBrowserPassed:2,publicChecks,
  typecheckPassed:true,optimizedBuildPassed:true,productionMigration:migration,
  coverage:"1440px/390px physical opening/closing counts, zero entries, corrections, frozen variance and CSV, read-only history, reminder navigation, staff and QR nonblocking checks, direct Service serving with all-station readiness, existing permissions and unchanged order totals",
  existingClientReadOnlyBrowserCheck:true,clientRecordsChanged:false,
  productionTestScope:"One isolated synthetic QA workspace; count observations, stock receipts/waste and unbilled test orders remain separate from client records. No live client count, serve, payment or invoice action performed.",
  temporaryQaAuthenticationRemoved:true,temporaryEnvironmentRemoved:true,physicalPhoneAcceptance:false,
  limitations:["Client recipe data remains deferred; incomplete coverage is flagged without inventing usage", "Stock variances require review and are not proof of theft", "Android/Firebase/provider/package work remains deferred"]
});
const release = JSON.parse(await read("docs/RELEASE.json"));
Object.assign(release,{
  version:"0.4.11",productionVersion:"0.4.11",deploymentId:deployment.id,deploymentUrl:deployment.url,
  previousProductionVersion:"0.4.10",previousProductionDeploymentId:"dpl_6jDe5iwP97zSNFeNcVLQ4Cr4jQrq",verifiedAt,
  featureUpdate:"Q45–Q46 released: daily physical stock counts with audited corrections and frozen variance/CSV reporting, a nonblocking opening-count reminder, and direct Mark as served in Service with existing readiness/access guards.",
  feedbackReadThrough:readThrough,latestWebQueueItemCount:20,latestWebQueueImplemented:20,
  latestReviewQueue:{...release.latestReviewQueue,requests:29,implemented:29,ids:"Q18-Q46",latestBatch:"Q27-Q46",readThrough,status:"Deployed and verified through Q46"},
  localVerification:{...release.localVerification,currentFullBackendPassed:151,currentTargetedBackendPassed:10,additionalQrNonblockingCasePassed:true,currentReleaseBrowserWorkflowsPassed:2},
  hostedIntegrationTestsPassed:9,currentReleaseHostedCasesPassed:9,productionBrowserWorkflowsPassed:2,productionPublicChecksPassed:publicChecks.length,
  appliedReleaseMigrations:[...new Set([...release.appliedReleaseMigrations,"040_daily_stock_counts.sql"])],pendingMigrations:[],
  productionVerificationMethod:"Synthetic QA desktop/phone workflows, isolated PostgreSQL suite, immutable pre/post migration comparison and read-only client browser inspection",
  hostedVerificationScope:"New physical-count observations and direct serving under existing tenant/outlet/role rules; migration does not update stock balances or financial rows",
  temporaryCredentialsRemoved:true,temporaryCredentialFilesRemoved:true,temporaryHostedDatabasesRemaining:0,
  acceptanceEvidence:"verification/production-0411-acceptance.json"
});
await json("docs/RELEASE.json",release);
let checklist = await read("docs/CLIENT_FEEDBACK.md");
checklist = checklist.replace(/\*\*Latest review: 21 October 2026, through 12:37 am IST\.\*\*[^\n]+/,"**Latest review: 21 October 2026, through 9:28 pm IST.** Q45–Q46 are deployed and verified in **0.4.11**. All 29 later web requests Q18–Q46 are released; Q01–Q17 has 16 released items plus Q11 prepared with client recipe data/blocking policy explicitly deferred. The original 17-item batch is complete. Android/Firebase, external providers and package configuration remain deferred. Older counts below describe their dated batches.");
checklist = checklist.replace("- [ ] **Q45","- [x] **Q45").replace("- [ ] **Q46","- [x] **Q46");
checklist = checklist.replace("Physical count/report preparation and Service-list serving are in progress.","Physical count/report entry and Service-list serving are deployed and verified in 0.4.11.");
checklist += `\n\n## Production acceptance · 0.4.11\n\n**Q45–Q46 are deployed and verified**, deployment **${deployment.id}**. Inventory → **Daily counts** records physical opening/closing quantities, including zero. Reports → **Stock variance** provides dated/searchable results and a full matching CSV export. Expected closing uses frozen opening/closing movement snapshots for receipts, actual configured-recipe consumption and waste. Later movements/recipe edits do not rewrite a closed report. Corrections append an audited version and keep the original movement window; opening is locked after closing. Past days are read-only. Counts do not alter stock balances, costs, reservations or financial documents. Missing recipe data is flagged, not invented; a variance is a review signal, not proof of theft.\n\nAs directly clarified by the user, **missing opening counts never block staff or customer QR ordering**. Staff receive a compact POS reminder linking directly to Daily counts. **Service → Ready to serve** now includes **Mark as served** beside View order. It uses the existing audited round workflow, enforces all-station readiness and tenant/outlet/waiter access, refreshes the list and leaves order/payment values unchanged.\n\nVerification: **151 full backend cases**, **10 final targeted cases** including explicit nonblocking QR submission, **9 isolated hosted PostgreSQL cases**, **2 local and 2 production desktop/phone browser workflows**, typecheck and optimized local/Vercel builds, plus **6 anonymous access checks**. Migration **040** adds only the append-only observation table/index/policy/grants/trigger. All **30 prior invoice snapshots, 40 recorded item costs and 15 stock movements** matched before/after migration; tenant RLS and the existing KOT authority gate were verified. Isolated PostgreSQL test databases were removed. Live workflows used one synthetic QA workspace; client records were inspected read-only. Temporary QA authentication and the downloaded environment file were removed. No physical-phone acceptance is claimed.\n\nLatest Discord cutoff: **21 October 2026, 9:28 pm IST**. No newer messages were present at the final review, and no Discord message was sent. Client recipe data and the earlier missing-recipe blocking decision, Android/Firebase, external providers and package configuration remain deferred.\n\nEvidence: [acceptance](../verification/production-0411-acceptance.json), [full backend](../verification/web-0411-backend-full.log), [final targeted](../verification/web-0411-stock-counts-final.log), [PostgreSQL](../verification/hosted-0411-stock-counts.log), [local browser](../verification/web-0411-browser-final.log), [production browser](../verification/production-0411-browser.log), [migration](../verification/production-migration-0411.json), [daily counts](../verification/daily-counts-desktop.png), [Service phone](../verification/service-inline-served-phone.png).\n`;
await writeFile("docs/CLIENT_FEEDBACK.md",checklist);
let v2=await read("docs/V2_CHECKLIST.md");
v2=v2.replace(/\*\*New requests under implementation:\*\* Q45[^\n]+\n\n/,"")
 .replace("18 latest requests Q27–Q44","20 latest requests Q27–Q46").replace("0.4.6–0.4.10","0.4.6–0.4.11")
 .replace("larger rounded POS category controls.","larger rounded POS category controls, daily physical stock counts/variance reports with a nonblocking reminder, and direct guarded Service-list serving.")
 .replace("Latest Discord cutoff: **21 October 2026, 8:36 pm IST**","Latest Discord cutoff: **21 October 2026, 9:28 pm IST**");
await writeFile("docs/V2_CHECKLIST.md",v2);
let readme=await read("README.md");
readme=readme.replace("version **0.4.10**","version **0.4.11**").replace("18 latest web requests Q27–Q44","20 latest web requests Q27–Q46")
 .replace("larger rounded POS category buttons.","larger rounded POS category buttons; daily opening/closing stock counts and frozen variance/CSV reports with a nonblocking staff reminder; and direct Service-list serving.");
await writeFile("README.md",readme);
await writeFile("docs/VERIFICATION.md",`# Release verification · 0.4.11\n\nQ45–Q46 deployed on the production alias, deployment **${deployment.id}**. Daily opening/closing physical counts, immutable corrections, frozen variance/CSV reports and a nonblocking staff reminder are verified. Service can mark a ready round served inline with existing readiness and ownership checks.\n\n151 full backend cases, 10 final targeted cases (including QR ordering with missing counts), nine isolated PostgreSQL cases, two local/two production desktop and phone workflows, typecheck/build and six anonymous checks passed. Migration 040 preserves all prior immutable invoice/cost/movement snapshots and keeps RLS/KOT gates. No client record was changed by QA; synthetic records remain isolated. Temporary authentication/environment files and isolated hosted databases removed. Recipe data and external/native/package configuration remain deferred. No physical-device acceptance claimed.\n\n[Acceptance](../verification/production-0411-acceptance.json) · [Migration](../verification/production-migration-0411.json) · [Production browser](../verification/production-0411-browser.log) · [Daily counts screenshot](../verification/daily-counts-desktop.png)\n\n---\n`+await read("docs/VERIFICATION.md"));
await json("verification/discord-monitor-latest.json",{
  checkedAt:verifiedAt,conversation:"https://discord.com/channels/@me/1491679750610096259",latestReviewedMessageAt:readThrough,newRequirements:2,
  method:"Authorized browser read; Q45/Q46 sources/screenshots reviewed; no newer messages at final review",currentProductionVersion:"0.4.11",currentChecklistThrough:"Q46",implementationPending:0,
  deferred:["Client recipe data and missing-recipe blocking policy","Android and Firebase","External providers","Package configuration"],checklistCrossReferenceCurrent:true,discordMessagesSent:0,deploymentNeeded:false
});
console.log("0.4.11 accepted; Q45/Q46 checked and release evidence updated; temporary credentials removed.");
