import assert from "node:assert/strict";
import { readFile, writeFile, rm } from "node:fs/promises";
const read = (path: string) => readFile(path, "utf8");
const json = (path: string, value: unknown) => writeFile(path, JSON.stringify(value, null, 2) + "\n");
const deployment = JSON.parse(await read("verification/vercel-0412-ready.json"));
assert.equal(deployment.readyState, "READY");
assert.match(await read("verification/vercel-0412-inspect.log"), /dinerdost-app\.vercel\.app/);
const backend = Number((await read("verification/web-0412-backend-full-final.log")).match(/pass (\d+)/)?.[1]);
assert(backend >= 159);
assert.match(await read("verification/web-0412-browser-final.log"), /3 passed/);
assert.match(await read("verification/production-0412-browser.log"), /2 passed/);
assert.match(await read("verification/production-0412-browser.log"), /1 passed/);
assert.match(await read("verification/hosted-0412-clear-table.log"), /pass 5/);
assert.match(await read("verification/hosted-0412-new-requests.log"), /pass 2/);
assert.doesNotMatch(await read("verification/web-0412-typecheck-final.log"), /error TS/);
assert.match(await read("verification/web-0412-build-final.log"), /Compiled successfully/);
const productionUrl = "https://dinerdost-app.vercel.app", publicChecks = [];
for (const [path, status] of [["/signin",200],["/api/workspace",401],["/api/tables/"+crypto.randomUUID()+"/billing?merged=1",401],["/preview",404]] as const) {
  const response = await fetch(productionUrl + path, {redirect:"manual"});
  assert.equal(response.status,status,path);
  assert.ok(!(response.headers.get("set-cookie")??"").includes("dd_session="));
  publicChecks.push({path,status:response.status}); await response.arrayBuffer();
}
for (const action of ["closeTable","demerge"]) {
  const response = await fetch(productionUrl + "/api/commands", {
    method:"POST",headers:{"Content-Type":"application/json",Origin:productionUrl,"Idempotency-Key":crypto.randomUUID()},body:JSON.stringify({action,input:{}}),
  });
  assert.equal(response.status,401,action);publicChecks.push({path:"/api/commands#"+action,status:response.status});await response.arrayBuffer();
}
await rm("verification/.qa-production-0412.json",{force:true});
await rm(".env.production.local",{force:true});
const verifiedAt = new Date().toISOString(), readThrough = "2026-10-22T05:07:00+05:30";
const featureUpdate = "Q47–Q51 released: guarded Clear table on billing, close controls for Stock/Overview alerts, India-day dine-in/takeaway counts, and atomic one-click whole-group demerge without popups.";
await json("verification/production-0412-acceptance.json", {
  version:"0.4.12",deploymentId:deployment.id,productionUrl,accepted:true,verifiedAt,requests:["Q47","Q48","Q49","Q50","Q51"],readThrough,
  fullBackendPassed:backend,targetedBackendPassed:11,hostedPostgresPassed:7,hostedPostgresRuns:2,localBrowserPassed:3,productionBrowserPassed:3,publicChecks,
  typecheckPassed:true,optimizedBuildPassed:true,schemaChanged:false,migrationsRequired:false,
  coverage:"1440px/390px settled-table clearing, merged all-or-nothing closure, stale/cancel confirmations, preserved orders/bills, current-view stock/alert dismissal and reload restoration, India-day counters, three-member immediate demerge preserving visits/QR/bills; backend role/tenant/outlet/ownership, concurrency and immutable financial snapshots",
  productionTestScope:"Two isolated synthetic QA workspaces. Test counts, bills/payments and visits were created only in those workspaces. No client table, order, bill, stock or payment was changed.",
  historicalPreservation:"Local and isolated PostgreSQL tests compare complete orders/rounds/items/payments/invoices/stock movements/item costs before/after clear and demerge. No production financial hash re-audit or data migration performed.",
  clientRecordsChanged:false,temporaryQaAuthenticationRemoved:true,temporaryEnvironmentRemoved:true,temporaryHostedDatabasesRemaining:0,physicalPhoneAcceptance:false,
  limitations:["Closing alerts dismisses the current view; underlying stock conditions, notifications and audit history remain. Reload restores alerts; a changed stock-alert condition resurfaces.","Client recipes and missing-recipe policy, Android/Firebase, external providers and package configuration remain deferred."],
});
const release = JSON.parse(await read("docs/RELEASE.json"));
Object.assign(release, {
  version:"0.4.12",productionVersion:"0.4.12",deploymentId:deployment.id,deploymentUrl:"https://"+deployment.url,
  previousProductionVersion:"0.4.11",previousProductionDeploymentId:"dpl_5B7iadJMK1fH5YRAEExCDNrnCjx1",verifiedAt,updatedAt:"2026-10-22",featureUpdate,feedbackReadThrough:readThrough,
  latestWebQueueItemCount:25,latestWebQueueImplemented:25,
  latestReviewQueue:{...release.latestReviewQueue,requests:34,implemented:34,ids:"Q18-Q51",latestBatch:"Q27-Q51",readThrough,status:"Deployed and verified through Q51"},
  localVerification:{...release.localVerification,currentFullBackendPassed:backend,currentTargetedBackendPassed:11,currentReleaseBrowserWorkflowsPassed:3},
  hostedIntegrationTestsPassed:7,currentReleaseHostedCasesPassed:7,productionBrowserWorkflowsPassed:3,productionPublicChecksPassed:publicChecks.length,
  productionVerificationMethod:"Synthetic QA desktop/phone workflows and isolated PostgreSQL tests; no client-record mutation or schema migration",
  hostedVerificationScope:"Seven focused cases in two disposable PostgreSQL databases verify guarded table closure, whole-group demerge, financial preservation and India-day order counters",
  temporaryCredentialsRemoved:true,temporaryCredentialFilesRemoved:true,temporaryHostedDatabasesRemaining:0,
  acceptanceEvidence:"verification/production-0412-acceptance.json",pendingMigrations:[],
});
await json("docs/RELEASE.json",release);
let checklist = await read("docs/CLIENT_FEEDBACK.md");
for (const id of [47,48,49,50,51]) checklist=checklist.replace("- [ ] **Q"+id,"- [x] **Q"+id);
checklist=checklist.replace(/\*\*Latest review: 21 October 2026, through 9:28 pm IST\.\*\*[^\n]+/,"**Latest review: 22 October 2026, through 5:07 am IST.** Q47–Q51 are deployed and verified in **0.4.12**. All 34 later web requests Q18–Q51 are released; Q01–Q17 has 16 released items plus Q11 prepared with client recipe data/blocking policy explicitly deferred. The original 17-item batch is complete. Android/Firebase, external providers and package configuration remain deferred. Older counts below describe their dated batches.");
checklist=checklist.replace("Implementation and verification in progress.","Deployed and verified in 0.4.12.").replace("Q47–Q51 are under implementation/verification.","Q47–Q51 are deployed and verified in 0.4.12.");
const acceptance = `## Production acceptance · 0.4.12\n\n**Q47–Q51 are deployed and verified**, deployment **${deployment.id}**. **Table billing → Clear table** closes the current visit after every bill is settled/rejected/voided and returns to Tables with Available status. Merged members clear in one transaction. A cancelled dialog does nothing; stale visit/group confirmations cannot clear a later customer’s visit. Existing owner/manager/staff ownership, tenant and outlet guards remain. Bills, payments, cost snapshots and stock history are retained.\n\n**Stock alerts** has a close icon at its top-right. **Overview Alerts** has an individual close control at each row’s end. These dismiss the current view; reload restores the display, and changed stock conditions resurface. They never delete notifications/audit rows, alter stock or mark payments received. **Dine-in orders today** and **Takeaway orders today** use the same outlet and India-day scope as Orders today, count each order once and leave settled sales unchanged.\n\n**Tables → Demerge tables** now immediately separates every member without a popup. Unlinking is atomic and audited, enforces ownership over every visit and rejects changed group snapshots. Each visit/order/bill/QR identity remains on its original table. The earlier individual demerge API remains available to its existing callers.\n\nVerification: **${backend} full backend cases**, **11 targeted backend cases**, **7 hosted PostgreSQL cases in two disposable databases**, **3 local and 3 production browser workflows** at 1440px/390px, typecheck, optimized local/Vercel builds and **${publicChecks.length} anonymous access checks**. QA used two isolated synthetic production workspaces; no client records changed. No schema/data migration was needed. Temporary environment/authentication files and isolated hosted databases were removed. No physical-phone acceptance or new production financial-hash audit is claimed.\n\nLatest Discord cutoff: **22 October 2026, 5:07 am IST**. All five source screenshots were inspected. No Discord message was sent. Existing client-recipe, native/Firebase, provider and package deferrals remain.\n\nEvidence: [acceptance](../verification/production-0412-acceptance.json), [full backend](../verification/web-0412-backend-full-final.log), [targeted](../verification/web-0412-new-backend.log), [hosted clear](../verification/hosted-0412-clear-table.log), [hosted demerge/counts](../verification/hosted-0412-new-requests.log), [local browser](../verification/web-0412-browser-final.log), [production browser](../verification/production-0412-browser.log), [Overview](../verification/overview-updates-1440.png), [Clear table](../verification/clear-table-settled-1440.png).\n`;
assert(!checklist.includes("## Production acceptance · 0.4.12"),"Release already recorded");
await writeFile("docs/CLIENT_FEEDBACK.md",checklist+"\n\n"+acceptance);
let v2=await read("docs/V2_CHECKLIST.md");
v2=v2.replace(/\*\*New requests under implementation:\*\* Q?\[Q47–Q51\][^\n]+\n\n/,"")
 .replace("20 latest requests Q27–Q46","25 latest requests Q27–Q51").replace("0.4.6–0.4.11","0.4.6–0.4.12")
 .replace("direct guarded Service-list serving.","direct guarded Service-list serving, Clear table on billing, dismissible alert panels/rows, dine-in/takeaway counts, and immediate whole-group demerge.")
 .replace("Latest Discord cutoff: **21 October 2026, 9:28 pm IST**","Latest Discord cutoff: **22 October 2026, 5:07 am IST**");
await writeFile("docs/V2_CHECKLIST.md",v2);
let readme=await read("README.md");
readme=readme.replace("version **0.4.11**","version **0.4.12**").replace("20 latest web requests Q27–Q46","25 latest web requests Q27–Q51")
 .replace("direct Service-list serving.","direct Service-list serving; Clear table on billing; dismissible Overview/stock alerts; dine-in/takeaway counts; and one-click whole-group demerge.");
await writeFile("README.md",readme);
await writeFile("docs/VERIFICATION.md","# Release verification · 0.4.12\n\n"+acceptance+"\n---\n"+await read("docs/VERIFICATION.md"));
await json("verification/discord-monitor-latest.json",{
  checkedAt:verifiedAt,conversation:"https://discord.com/channels/@me/1491679750610096259",latestReviewedMessageAt:readThrough,newRequirements:5,newMessagesAfterCutoff:5,
  method:"Authorized Discord browser review; Q47–Q51 source screenshots inspected and five web requests released/tested through the recorded cutoff",currentProductionVersion:"0.4.12",currentChecklistThrough:"Q51",implementationPending:0,
  deferred:["Client recipe data and missing-recipe blocking policy","Android and Firebase","External providers","Package configuration"],checklistCrossReferenceCurrent:true,discordMessagesSent:0,deploymentNeeded:false,
});
console.log(`0.4.12 accepted: ${backend} backend cases, 7 hosted cases, 3 local/3 production browser workflows; Q47–Q51 checked.`);
