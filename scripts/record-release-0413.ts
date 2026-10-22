import assert from "node:assert/strict";
import { readFile, writeFile, rm } from "node:fs/promises";
const read=(p:string)=>readFile(p,"utf8");
const json=(p:string,v:unknown)=>writeFile(p,JSON.stringify(v,null,2)+"\n");
const d=JSON.parse(await read("verification/vercel-0413-ready.json"));
assert.equal(d.readyState,"READY");
assert.match(await read("verification/vercel-0413-inspect.log"),/dinerdost-app\.vercel\.app/);
const backend=Number((await read("verification/web-0413-backend-full.log")).match(/pass (\d+)/)?.[1]);
assert(backend>=162);
for(const p of ["verification/web-0413-order-counts-browser.log","verification/production-0413-browser.log"])assert.match(await read(p),/1 passed/);
assert.match(await read("verification/hosted-0413-order-counts.log"),/pass 3/);
assert.doesNotMatch(await read("verification/web-0413-typecheck-final.log"),/error TS/);
assert.match(await read("verification/web-0413-build.log"),/Compiled successfully/);
const productionUrl="https://dinerdost-app.vercel.app",publicChecks=[];
for(const [path,status] of [["/signin",200],["/api/workspace",401],["/preview",404]] as const){
  const r=await fetch(productionUrl+path,{redirect:"manual"});assert.equal(r.status,status,path);publicChecks.push({path,status:r.status});await r.arrayBuffer();
}
const r=await fetch(productionUrl+"/api/commands",{method:"POST",headers:{Origin:productionUrl,"Content-Type":"application/json","Idempotency-Key":crypto.randomUUID()},body:JSON.stringify({action:"exchangeTables",input:{}})});
assert.equal(r.status,401);publicChecks.push({path:"/api/commands#exchangeTables",status:r.status});await r.arrayBuffer();
await rm("verification/.qa-production-0413.json",{force:true});await rm(".env.production.local",{force:true});
const verifiedAt=new Date().toISOString(),readThrough="2026-10-22T05:17:00+05:30";
const featureUpdate="Q52 released: eight rounded Orders count/filter boxes with complete authorized counts and audited table-movement reallocation, including swaps and legacy moves.";
await json("verification/production-0413-acceptance.json",{
  version:"0.4.13",deploymentId:d.id,productionUrl,accepted:true,verifiedAt,request:"Q52",readThrough,
  source:"https://discord.com/channels/@me/1491679750610096259/1562613341644394506",clarification:"Reallocated means orders moved between tables",
  fullBackendPassed:backend,targetedBackendPassed:10,hostedPostgresPassed:3,localBrowserPassed:1,productionBrowserPassed:1,publicChecks,
  typecheckPassed:true,optimizedBuildPassed:true,schemaChanged:false,migrationsRequired:false,
  coverage:"Eight rounded count/filter controls at 1440px and 390px; cancelled/voided mapping, moved-order filtering, distinct repeat moves, exclusion of later orders, search, keyboard/Hindi, unchanged order detail; counts beyond latest 200 and waiter/tenant/outlet isolation",
  historicalPreservation:"Local and disposable PostgreSQL cases compare financial rows around table moves; no production financial hash re-audit or backfill was needed",
  productionTestScope:"One isolated synthetic QA workspace; unpaid test orders, a voided draft and guest-table moves only. No client record was changed.",
  clientRecordsChanged:false,temporaryQaAuthenticationRemoved:true,temporaryEnvironmentRemoved:true,temporaryHostedDatabasesRemaining:0,physicalPhoneAcceptance:false,
  limitations:["Counters cover the complete authorized outlet order history; the table continues to list the latest 200 orders", "Unrecorded historical moves cannot be inferred", "Recipe/native/Firebase/provider/package deferrals remain unchanged"],
});
const release=JSON.parse(await read("docs/RELEASE.json"));Object.assign(release,{
  version:"0.4.13",productionVersion:"0.4.13",deploymentId:d.id,deploymentUrl:"https://"+d.url,
  previousProductionVersion:"0.4.12",previousProductionDeploymentId:"dpl_7xXWPmHHZuHWx41srzikGaRYCnEh",verifiedAt,updatedAt:"2026-10-22",featureUpdate,feedbackReadThrough:readThrough,
  latestWebQueueItemCount:26,latestWebQueueImplemented:26,
  latestReviewQueue:{...release.latestReviewQueue,requests:35,implemented:35,ids:"Q18-Q52",latestBatch:"Q27-Q52",readThrough,status:"Deployed and verified through Q52"},
  localVerification:{...release.localVerification,currentFullBackendPassed:backend,currentTargetedBackendPassed:10,currentReleaseBrowserWorkflowsPassed:1},
  hostedIntegrationTestsPassed:3,currentReleaseHostedCasesPassed:3,productionBrowserWorkflowsPassed:1,productionPublicChecksPassed:publicChecks.length,
  productionVerificationMethod:"Synthetic desktop/phone count/filter workflow and isolated PostgreSQL tests; no client-record mutation or migration",
  hostedVerificationScope:"Complete status counts, exact/legacy audited table moves, unchanged financial snapshots and tenant/outlet/waiter guards",
  temporaryCredentialsRemoved:true,temporaryCredentialFilesRemoved:true,temporaryHostedDatabasesRemaining:0,
  pendingMigrations:[],acceptanceEvidence:"verification/production-0413-acceptance.json",
});await json("docs/RELEASE.json",release);
let checklist=await read("docs/CLIENT_FEEDBACK.md");
assert(!checklist.includes("## Production acceptance · 0.4.13"),"Release already recorded");
checklist=checklist.replace("- [ ] **Q52","- [x] **Q52").replace("Q52 is the next web update.","Q52 is deployed and verified in 0.4.13.").replace("Preserve existing financial records and staff scope. In progress.","Preserve existing financial records and staff scope. Deployed and verified in 0.4.13.");
checklist=checklist.replace(/\*\*Latest review: 22 October 2026, through 5:07 am IST\.\*\*[^\n]+/,"**Latest review: 22 October 2026, through 5:17 am IST.** Q47–Q52 are deployed and verified in **0.4.12–0.4.13**. All 35 later web requests Q18–Q52 are released; Q01–Q17 has 16 released items plus Q11 prepared with client recipe data/blocking policy explicitly deferred. The original 17-item batch is complete. Android/Firebase, external providers and package configuration remain deferred. Older counts below describe their dated batches.");
const acceptance=`## Production acceptance · 0.4.13\n\n**Q52 is deployed and verified**, deployment **${d.id}**. Orders now has eight rounded numeric filter boxes: **Active, Accepted, Pending, Cancelled, Rejected, Settled, Reallocated and All orders**. Counts cover the complete authorized outlet history, while the table retains its latest-200 boundary and existing search. Cancelled includes voided orders. Controls work by keyboard, retain the approved green palette, adapt to two columns on phones and support the existing English/Hindi interface.\n\nThe user clarified **Reallocated = orders moved between tables**. Counts include swaps, count each order once and exclude orders placed after a move. New movement audits snapshot the exact existing order IDs. Earlier audited moves are read using their session IDs and movement time, with no historical backfill. A move that was never recorded cannot be inferred. No bill/payment/stock row is rewritten. Existing tenant/outlet/waiter assignment gates apply to both totals and movement flags.\n\nVerification: **${backend} full backend cases**, **10 targeted cases**, **3 disposable PostgreSQL cases**, one local and one production browser workflow covering **1440px/390px**, typecheck, optimized local/Vercel builds and **${publicChecks.length} anonymous access checks**. Tests include more than 200 orders, cancelled mapping, repeat and legacy moves, later-order exclusion, role/scope, phone layout, filter/search/keyboard/Hindi and financial-row preservation. Production QA used one isolated synthetic workspace with unpaid orders and a voided draft; no client record changed. Temporary credentials/environment and hosted test database were removed. No schema migration, physical-phone acceptance or new production financial hash audit is claimed.\n\nLatest Discord cutoff: **22 October 2026, 5:17 am IST**. No message sent by the agent. The previous five updates remain released in 0.4.12; native/Firebase/provider/package/client-recipe deferrals remain.\n\nEvidence: [acceptance](../verification/production-0413-acceptance.json), [backend](../verification/web-0413-backend-full.log), [targeted](../verification/web-0413-order-counts-backend.log), [PostgreSQL](../verification/hosted-0413-order-counts.log), [local browser](../verification/web-0413-order-counts-browser.log), [production browser](../verification/production-0413-browser.log), [desktop](../verification/order-count-boxes-1440.png), [phone](../verification/order-count-boxes-390.png).\n`;
await writeFile("docs/CLIENT_FEEDBACK.md",checklist+"\n\n"+acceptance);
let v2=await read("docs/V2_CHECKLIST.md");v2=v2.replace(/\*\*New request under implementation:\*\* \[Q52\][^\n]+\n\n/,"").replace("25 latest requests Q27–Q51","26 latest requests Q27–Q52").replace("0.4.6–0.4.12","0.4.6–0.4.13").replace("immediate whole-group demerge.","immediate whole-group demerge, and complete Orders count boxes with audited table-movement filtering.").replace("Latest Discord cutoff: **22 October 2026, 5:07 am IST**","Latest Discord cutoff: **22 October 2026, 5:17 am IST**");await writeFile("docs/V2_CHECKLIST.md",v2);
let readme=await read("README.md");readme=readme.replace("version **0.4.12**","version **0.4.13**").replace("25 latest web requests Q27–Q51","26 latest web requests Q27–Q52").replace("one-click whole-group demerge.","one-click whole-group demerge; and eight Orders count/filter boxes including audited table moves.");await writeFile("README.md",readme);
await writeFile("docs/VERIFICATION.md","# Release verification · 0.4.13\n\n"+acceptance+"\n---\n"+await read("docs/VERIFICATION.md"));
await json("verification/discord-monitor-latest.json",{checkedAt:verifiedAt,conversation:"https://discord.com/channels/@me/1491679750610096259",latestReviewedMessageAt:readThrough,newRequirements:6,newMessagesAfterCutoff:9,
  method:"Authorized Discord browser review; six web requirements Q47–Q52 sourced/screenshots inspected and released in 0.4.12–0.4.13",currentProductionVersion:"0.4.13",currentChecklistThrough:"Q52",implementationPending:0,
  deferred:["Client recipe data and missing-recipe blocking policy","Android and Firebase","External providers","Package configuration"],checklistCrossReferenceCurrent:true,discordMessagesSent:0,deploymentNeeded:false});
console.log(`0.4.13 accepted; Q52 checked. ${backend} backend cases, three hosted cases and local/production desktop-phone workflows passed.`);
