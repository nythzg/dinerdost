import assert from 'node:assert/strict';
import {readFile,writeFile,rm} from 'node:fs/promises';
const read=(path:string)=>readFile(path,'utf8');
const save=(path:string,value:unknown)=>writeFile(path,JSON.stringify(value,null,2)+'\n');
const ids=Array.from({length:19},(_,i)=>52+i).filter(id=>![65,66].includes(id));
const requests=ids.map(id=>'Q'+id),deferred=['Q65','Q66'];
const deployment=JSON.parse(await read('verification/vercel-0414-ready.json'));
assert.equal(deployment.readyState,'READY');
assert.match(await read('verification/vercel-0414-inspect.log'),/dinerdost-app\.vercel\.app/);
const backendLog=await read('verification/web-0414-backend-latest.log');
assert.match(backendLog,/fail 0/);const backend=Number(backendLog.match(/pass (\d+)/)?.[1]);assert.equal(backend,180);
const hosted=await read('verification/hosted-0414-integration.log');assert.doesNotMatch(hosted,/fail [1-9]|PostgreSQL suite failed/);assert.equal((hosted.match(/PostgreSQL suite passed:/g)??[]).length,3);
const extra=await read('verification/hosted-0414-prepared-guard.log');assert.match(extra,/pass 1/);assert.doesNotMatch(extra,/fail [1-9]/);
const latest=await read('verification/hosted-0414-latest-batch.log');assert.match(latest,/pass 8/);assert.match(latest,/PostgreSQL suite passed:/);assert.doesNotMatch(latest,/fail [1-9]|PostgreSQL suite failed/);
const hostedPassed=[...hosted.matchAll(/pass (\d+)/g)].reduce((sum,m)=>sum+Number(m[1]),9);assert.equal(hostedPassed,44);
assert.match(await read('verification/web-0414-browser-clear.log'),/2 passed/);
assert.match(await read('verification/web-0414-browser-confirmed.log'),/5 passed/);
for(const name of ['prepared','counters','latest','clear'])assert.match(await read(`verification/production-0414-${name}-browser.log`),/1 passed/);
assert.doesNotMatch(await read('verification/web-0414-typecheck-release.log'),/error TS/);
assert.match(await read('verification/web-0414-build-latest.log'),/Compiled successfully/);
const migration=JSON.parse(await read('verification/production-migration-0414.json'));
assert(migration.applied&&migration.preparedMovementsAppendOnly&&migration.preferenceTenantRlsEnforced);
for(const record of Object.values(migration.immutableHistory) as any[])assert(record.preserved);
assert.equal(migration.isolatedVerificationDatabases,0);
const productionUrl='https://dinerdost-app.vercel.app',publicChecks=[];
for(const [path,status] of [['/signin',200],['/api/workspace',401],['/api/customers?outlet='+crypto.randomUUID(),401],['/preview',404]] as const){
 const response=await fetch(productionUrl+path,{redirect:'manual'});assert.equal(response.status,status,path);publicChecks.push({path,status:response.status});await response.arrayBuffer();
}
for(const action of ['cancelPrepared','recordPrint','dismissAlert','kitchenBulk']){
 const response=await fetch(productionUrl+'/api/commands',{method:'POST',headers:{'Content-Type':'application/json',Origin:productionUrl,'Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({action,input:{}})});
 assert.equal(response.status,401,action);publicChecks.push({path:'/api/commands#'+action,status:response.status});await response.arrayBuffer();
}
for(const path of ['.env.production.local',...['prepared','counters','latest','clear'].map(name=>'verification/.qa-production-0414-'+name+'.json')])await rm(path,{force:true});
const verifiedAt=new Date().toISOString(),readThrough='2026-10-22T06:43:00+05:30';
const latestReviewed='2026-10-22T06:59:00+05:30';
const featureUpdate='17 confirmed requests Q52–Q64 and Q67–Q70: prepared-food reallocation, order counts/actions, separate settlement/invoice, visits/search, stock expiry/daily counts/charts, persistent alert dismissal, table icons/floor contrast, bulk kitchen forwarding, named charges, authorized Kitchen All view and floor camera lock. Q65/Q66 await answers.';
const limitations=[
 'Q65 kitchen-stage switch and Q66 Service counter definitions remain unreleased pending the user answers saved in docs/PENDING_QUESTIONS.md; no kitchen-policy migration applied.',
 'Prepared-food reallocation applies to wholly unpaid orders and ready, unserved rounds; staff supplies the actual future use-by. Existing deadlines and historical units are not guessed.',
 'Expired stock is written off through tenant-scoped workspace/stock polling and menu/order requests; no always-running background scheduler or physical-device acceptance is claimed.',
 'Client recipe configuration/policy, Android/Firebase, external providers, package configuration and the broader native/offline v2 scope remain deferred.'
];
await save('verification/production-0414-acceptance.json',{
 version:'0.4.14',accepted:true,productionUrl,deploymentId:deployment.id,verifiedAt,requests,deferredRequests:deferred,readThrough,
 fullBackendPassed:backend,hostedPostgresPassed:hostedPassed,hostedDatabases:5,localBrowserPassed:7,productionBrowserPassed:4,publicChecks,
 typecheckPassed:true,optimizedBuildPassed:true,migrations:migration.migrations,historicalPreservation:migration.immutableHistory,
 temporaryAuthAndEnvironmentRemoved:true,temporaryHostedDatabasesRemaining:0,
 productionTestScope:'Four synthetic QA workspaces; no manual client order, stock, bill, payment or table edits. Automatic expiry runs only when an authorized application request reaches its outlet.',
 limitations,discordMessagesSent:0
});
const release=JSON.parse(await read('docs/RELEASE.json'));
Object.assign(release,{
 version:'0.4.14',productionVersion:'0.4.14',deploymentId:deployment.id,deploymentUrl:'https://'+deployment.url,deploymentStatus:'production-ready-verified',
 previousProductionVersion:'0.4.12',previousProductionDeploymentId:'dpl_7xXWPmHHZuHWx41srzikGaRYCnEh',featureUpdate,verifiedAt,updatedAt:'2026-10-22',feedbackReadThrough:readThrough,
 latestWebQueueItemCount:46,latestWebQueueImplemented:42,
 latestReviewQueue:{...release.latestReviewQueue,requests:55,implemented:51,pendingImplementation:2,pendingClarification:2,pendingClarificationIds:deferred,ids:'Q18-Q72',latestBatch:'Q52-Q70',readThrough:latestReviewed,status:'17 confirmed current-batch requests released; Q71/Q72 captured during release; Q65/Q66 awaiting answers'},
 localVerification:{...release.localVerification,currentFullBackendPassed:backend,currentTargetedBackendPassed:8,currentReleaseBrowserWorkflowsPassed:7,typecheckPassed:true,optimizedBuildPassed:true},
 hostedIntegrationTestsPassed:hostedPassed,currentReleaseHostedCasesPassed:hostedPassed,productionBrowserWorkflowsPassed:4,productionPublicChecksPassed:publicChecks.length,
 acceptanceEvidence:'verification/production-0414-acceptance.json',pendingMigrations:[],appliedReleaseMigrations:[...new Set([...release.appliedReleaseMigrations,...migration.migrations])],
 temporaryCredentialsRemoved:true,temporaryCredentialFilesRemoved:true,temporaryHostedDatabasesRemaining:0,
 discordMonitoring:{...release.discordMonitoring,intervalMinutes:15,questionsNote:'docs/PENDING_QUESTIONS.md'},
 productionVerificationMethod:'Synthetic QA desktop/phone workflows, isolated PostgreSQL cases, immutable-history migration comparison and anonymous authorization checks.'
});
await save('docs/RELEASE.json',release);
const acceptance=`## Production acceptance · 0.4.14

**17 confirmed requests Q52–Q64 and Q67–Q70 are deployed and verified**, deployment **${deployment.id}**, at ${productionUrl}. **Q65/Q66 remain unchecked pending the user's later answers in [PENDING_QUESTIONS.md](PENDING_QUESTIONS.md).** ${featureUpdate}

Reallocated counts unique source orders with an audited cooked-food transfer; table moves do not count. Counts cover all authorized outlet orders while the list retains its latest-200 boundary. Reallocation is manager-authorized, version-checked and limited to wholly unpaid orders without unresolved payments/final invoices, with all stations ready and no served food. Original ingredient movements and recorded item costs remain; resale consumes prepared stock and its proportional cost without a second raw-ingredient deduction. Staff supplies the use-by deadline, which cannot extend an existing deadline. Cancellation during preparation records cooked waste without raw-stock restoration.

Clear all actions performs only selected eligible steps through ordinary checks, refreshing state between steps and stopping on failure with completed steps shown. Cash selection explicitly confirms the displayed receipt amount. Settlement stays on the order page; Invoice opens the issued document separately. Historical provisional documents remain viewable/printable without creating a new document. Bill summaries display saved charge names/amounts, with a legacy fallback; no historical financial value is rewritten.

Expired raw/prepared stock moves to audited current-time waste through scoped workspace/stock polling and menu/order requests. Held reservations are invalidated while their cached ingredient needs remain. This is event-driven expiry, not an always-running background worker. Daily counts sit below Inventory metrics; visits/search use actual settled outlet orders with masked list phones. The four report charts use real issued-invoice/received-payment data and existing report permissions/date filters.

Stock/Overview dismissals persist per employee/outlet across reload, navigation and sign-in, retaining source records; a changed stock episode resurfaces. Table cards retain their original actions as horizontal accessible icons. Floor fill has a slight approved-green contrast. The camera lock freezes zoom/Fit/wheel/pan/keyboard/touch movement until unlocked; actual floor editing and fixed dotted clipping boundaries remain. Kitchen All combines only authorized Food/Bar tickets; restricted roles remain isolated. Bulk selected/all forwarding uses batches of up to 20, sorted locks and ordinary audited transitions; a stale selection rolls back its entire batch and the UI reports completed batches on failure.

Verification: **180 full backend cases**, **44 hosted PostgreSQL cases across five disposable databases**, **7 local browser workflows** and **4 production browser workflows** covering desktop/390px layouts. Typecheck, optimized local/Vercel builds and **${publicChecks.length} anonymous access checks** passed. Additive migrations **041/042** preserved all prior invoice snapshots, item costs and stock movements; tenant RLS, append-only grants and KOT authority were verified. No unanswered kitchen-policy migration was applied. Production browser tests used four synthetic workspaces. Temporary environment/auth files and hosted databases were removed.

Latest Discord cutoff: **22 October 2026, 6:43 am IST**. All relevant screenshots inspected, no Discord messages sent. Checks continue every **15 minutes**; unresolved questions remain in the linked notes. The superseded 0.4.13 table-move counter build was never accepted; this release replaces verified 0.4.12. Original Q11 client recipes/policy and native/Firebase/provider/package work remain deferred.

Evidence: [acceptance](../verification/production-0414-acceptance.json), [backend](../verification/web-0414-backend-latest.log), [latest hosted checks](../verification/hosted-0414-latest-batch.log), [local browser](../verification/web-0414-browser-confirmed.log), [production workflow](../verification/production-0414-latest-browser.log), [migration preservation](../verification/production-migration-0414.json).
`;
let checklist=await read('docs/CLIENT_FEEDBACK.md');assert(!checklist.includes('## Production acceptance · 0.4.14'));
for(const id of ids)checklist=checklist.replace('- [ ] **Q'+id+' ·','- [x] **Q'+id+' ·');
assert(checklist.includes('- [ ] **Q65 ·')&&checklist.includes('- [ ] **Q66 ·'));
await writeFile('docs/CLIENT_FEEDBACK.md',checklist+'\n\n'+acceptance);
await writeFile('docs/VERIFICATION.md','# Release verification · 0.4.14\n\n'+acceptance+'\n---\n'+await read('docs/VERIFICATION.md'));
await writeFile('docs/V2_CHECKLIST.md',await read('docs/V2_CHECKLIST.md')+'\n**Web production checkpoint 0.4.14:** 17 confirmed requests Q52–Q64 and Q67–Q70 are released through 22 October 2026, 6:43 am IST. Q65/Q66 remain awaiting later answers. See CLIENT_FEEDBACK.md, PENDING_QUESTIONS.md and VERIFICATION.md. This does not complete native/provider/offline v2 work.\n');
await writeFile('README.md',(await read('README.md')).replace('version **0.4.12**','version **0.4.14**')+'\nLatest web release **0.4.14**: '+featureUpdate+' [Acceptance](verification/production-0414-acceptance.json).\n');
await save('verification/discord-monitor-latest.json',{
 checkedAt:verifiedAt,conversation:'https://discord.com/channels/@me/1491679750610096259',latestReviewedMessageAt:latestReviewed,
 newRequirements:2,currentProductionVersion:'0.4.14',currentChecklistThrough:'Q72',implementationPending:2,
 pendingClarifications:deferred,questionsNote:'docs/PENDING_QUESTIONS.md',monitorIntervalMinutes:15,
 checklistCrossReferenceCurrent:true,discordMessagesSent:0,deploymentNeeded:true,
 method:'Source screenshots reviewed/deduplicated; 17 confirmed requests verified locally, on hosted PostgreSQL and in production; Q65/Q66 deferred for later answers.',deferred:limitations
});
console.log(`0.4.14 accepted: ${backend} backend / ${hostedPassed} hosted cases, 7 local / 4 production browser workflows. 17 confirmed requests checked; Q65/Q66 pending.`);
