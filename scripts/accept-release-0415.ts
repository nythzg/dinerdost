import assert from 'node:assert/strict';
import {readFile,writeFile,rm} from 'node:fs/promises';
const read=(path:string)=>readFile(path,'utf8');
const save=(path:string,value:unknown)=>writeFile(path,JSON.stringify(value,null,2)+'\n');
const deployment=JSON.parse(await read('verification/vercel-0415-ready.json'));
assert.equal(deployment.readyState,'READY');assert.match(await read('verification/vercel-0415-inspect.log'),/dinerdost-app\.vercel\.app/);
const backendLog=await read('verification/web-0415-backend.log');assert.match(backendLog,/pass 184/);assert.match(backendLog,/fail 0/);
const hosted=await read('verification/hosted-0415-piece-service.log');assert.match(hosted,/pass 4/);assert.match(hosted,/PostgreSQL suite passed:/);assert.doesNotMatch(hosted,/fail [1-9]|PostgreSQL suite failed/);
assert.match(await read('verification/web-0415-browser-accepted.log'),/1 passed/);assert.match(await read('verification/production-0415-browser.log'),/1 passed/);
assert.doesNotMatch(await read('verification/web-0415-typecheck-release.log'),/error TS/);assert.match(await read('verification/web-0415-build.log'),/Compiled successfully/);
const migration=JSON.parse(await read('verification/production-migration-0415.json'));assert(migration.applied&&migration.menuUnitsExpanded);assert.equal(migration.isolatedVerificationDatabases,0);
for(const history of Object.values(migration.immutableHistory) as any[])assert(history.preserved);
const productionUrl='https://dinerdost-app.vercel.app',publicChecks=[];
for(const [path,status] of [['/signin',200],['/api/workspace',401],['/api/notifications?outlet='+crypto.randomUUID(),401]] as const){const response=await fetch(productionUrl+path,{redirect:'manual'});assert.equal(response.status,status,path);publicChecks.push({path,status:response.status});await response.arrayBuffer()}
for(const action of ['createRound','kitchen']){const response=await fetch(productionUrl+'/api/commands',{method:'POST',headers:{'Content-Type':'application/json',Origin:productionUrl,'Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({action,input:{}})});assert.equal(response.status,401,action);publicChecks.push({path:'/api/commands#'+action,status:response.status});await response.arrayBuffer()}
await rm('.env.production.local',{force:true});await rm('verification/.qa-production-0415.json',{force:true});
const verifiedAt=new Date().toISOString(),readThrough='2026-10-22T06:59:00+05:30',requests=['Q71','Q72'];
const featureUpdate='Q71/Q72: whole-count piece menu selling unit and web Order ready notification navigation to Service. Existing units/history, explicit service action, readiness, ownership and native application destinations preserved.';
await save('verification/production-0415-acceptance.json',{
 version:'0.4.15',accepted:true,productionUrl,deploymentId:deployment.id,verifiedAt,readThrough,requests,deferredRequests:['Q65','Q66'],
 fullBackendPassed:184,hostedPostgresPassed:4,hostedDatabases:1,localBrowserPassed:1,productionBrowserPassed:1,browserViewports:[1440,390],
 typecheckPassed:true,optimizedBuildPassed:true,publicChecks,migrations:migration.migrations,historicalPreservation:migration.immutableHistory,
 temporaryAuthAndEnvironmentRemoved:true,temporaryHostedDatabasesRemaining:0,productionTestScope:'One synthetic QA workspace; no client records edited.',discordMessagesSent:0
});
const release=JSON.parse(await read('docs/RELEASE.json'));assert.equal(release.productionVersion,'0.4.14');
Object.assign(release,{
 version:'0.4.15',productionVersion:'0.4.15',deploymentId:deployment.id,deploymentUrl:'https://'+deployment.url,deploymentStatus:'production-ready-verified',previousProductionVersion:'0.4.14',previousProductionDeploymentId:release.deploymentId,
 featureUpdate,verifiedAt,updatedAt:'2026-10-22',feedbackReadThrough:readThrough,latestWebQueueItemCount:46,latestWebQueueImplemented:44,
 latestReviewQueue:{...release.latestReviewQueue,requests:55,implemented:53,pendingImplementation:0,pendingClarification:2,pendingClarificationIds:['Q65','Q66'],ids:'Q18-Q72',latestBatch:'Q71-Q72',readThrough,status:'All confirmed requests through Q72 released; Q65/Q66 awaiting answers'},
 localVerification:{...release.localVerification,currentFullBackendPassed:184,currentTargetedBackendPassed:4,currentReleaseBrowserWorkflowsPassed:1,typecheckPassed:true,optimizedBuildPassed:true},
 hostedIntegrationTestsPassed:4,currentReleaseHostedCasesPassed:4,productionBrowserWorkflowsPassed:1,productionPublicChecksPassed:publicChecks.length,pendingMigrations:[],
 appliedReleaseMigrations:[...new Set([...release.appliedReleaseMigrations,...migration.migrations])],acceptanceEvidence:'verification/production-0415-acceptance.json',
 temporaryCredentialsRemoved:true,temporaryCredentialFilesRemoved:true,temporaryHostedDatabasesRemaining:0,
 discordMonitoring:{...release.discordMonitoring,intervalMinutes:15,questionsNote:'docs/PENDING_QUESTIONS.md'}
});
await save('docs/RELEASE.json',release);
const acceptance=`## Production acceptance · 0.4.15

**Q71/Q72 are deployed and verified**, deployment **${deployment.id}**, at ${productionUrl}. The Menu Sell by selector now includes **piece**, with whole-count inputs and server validation in staff/customer ordering. New order lines preserve the chosen unit, price and recipe usage. Existing menu units, weighted order snapshots, invoices, item costs and stock movements were preserved during migration **043_menu_piece_unit.sql**.

Web staff with Service/order access now open **Service → Ready to serve** from an Order ready notification. Clicking it marks the notification read, refreshes current workspace readiness, and navigates; it does not serve food or record payment. This prevents a newly ready ticket from being absent until the next poll. Staff still explicitly selects Mark as served, with all-station readiness, waiter ownership, role/outlet/tenant checks intact. The ready-to-serve table wraps only within its phone layout so that action remains fully inside its panel. Kitchen-only roles and native application destinations remain unchanged.

Verification: **184 full backend cases**, **4 hosted PostgreSQL cases in one disposable database**, **one local and one production browser workflow**, each covering **1440px and 390px**. The browser verifies actual Menu editing, POS whole-count input, fractional API rejection, notification navigation, explicit serving and unchanged payment/totals. Typecheck, optimized local/Vercel builds and **${publicChecks.length} anonymous access checks** passed. Migration preservation includes all prior menu/order units and immutable financial/stock history. Temporary environment/auth files and the test database were removed. Production tests used one synthetic workspace.

All confirmed web requests through **Q72 / 22 October 2026, 6:59 am IST** are released. **Q65/Q66 remain unchecked pending the user's later answers** in [PENDING_QUESTIONS.md](PENDING_QUESTIONS.md). Checks continue every 15 minutes. No Discord messages sent; client recipe, native/Firebase, provider, package and full offline/native v2 dependencies remain deferred.

Evidence: [acceptance](../verification/production-0415-acceptance.json), [backend](../verification/web-0415-backend.log), [hosted database](../verification/hosted-0415-piece-service.log), [local browser](../verification/web-0415-browser-accepted.log), [production browser](../verification/production-0415-browser.log), [migration preservation](../verification/production-migration-0415.json).
`;
let checklist=await read('docs/CLIENT_FEEDBACK.md');assert(!checklist.includes('## Production acceptance · 0.4.15'));
for(const id of requests)checklist=checklist.replace('- [ ] **'+id+' ·','- [x] **'+id+' ·');assert(checklist.includes('- [ ] **Q65 ·')&&checklist.includes('- [ ] **Q66 ·'));
checklist=checklist.replace(/\*\*Latest review: 22 October 2026, through 5:07 am IST\.\*\*[^\n]+/,'**Latest review: 22 October 2026, through 6:59 am IST.** All confirmed web requests through Q72 are released and verified in **0.4.15**: 53 of 55 later requests Q18–Q72, with Q65/Q66 explicitly awaiting later answers in PENDING_QUESTIONS.md. Q01–Q17 retains 16 released items plus Q11 client recipe configuration/policy deferred. The original 17-item batch is complete. Checks run every 15 minutes; Android/Firebase, providers, packages and native/offline v2 dependencies remain deferred. Older counts below describe their dated batches.');
await writeFile('docs/CLIENT_FEEDBACK.md',checklist+'\n\n'+acceptance);await writeFile('docs/VERIFICATION.md','# Release verification · 0.4.15\n\n'+acceptance+'\n---\n'+await read('docs/VERIFICATION.md'));
await writeFile('docs/V2_CHECKLIST.md',await read('docs/V2_CHECKLIST.md')+'\n**Web production checkpoint 0.4.15:** Q71/Q72 released through 22 October 2026, 6:59 am IST. All confirmed web requests through Q72 are accepted; Q65/Q66 await answers in PENDING_QUESTIONS.md. Earlier native/provider/offline dependencies remain deferred.\n');
let readme=(await read('README.md')).replace('version **0.4.14**','version **0.4.15**');
readme=readme.replace(/^All \*\*25 latest web requests Q27–Q51\*\*[^\n]+/m,'Confirmed web requests are released through **Q72 / 22 October 2026, 6:59 am IST**. The latest 19 confirmed updates include prepared-food reallocation, order/service controls, scoped customer visits/search, expiry/count/report features, persistent dismissals, table icons and floor camera lock, bulk kitchen forwarding, named charges, the piece selling unit and ready-notification navigation. **Q65/Q66 await answers** in [pending questions](docs/PENDING_QUESTIONS.md). Historical units, financial/stock records and permissions are preserved. Checks run every 15 minutes. Client recipes/policy, Android/Firebase, providers, packages and the full native/offline platform remain deferred. See the [client checklist](docs/CLIENT_FEEDBACK.md) and [verification](docs/VERIFICATION.md).');
await writeFile('README.md',readme+'\nLatest web release **0.4.15**: '+featureUpdate+' [Acceptance](verification/production-0415-acceptance.json).\n');
await save('verification/discord-monitor-latest.json',{
 checkedAt:verifiedAt,conversation:'https://discord.com/channels/@me/1491679750610096259',latestReviewedMessageAt:readThrough,newRequirements:2,currentProductionVersion:'0.4.15',currentChecklistThrough:'Q72',implementationPending:0,pendingClarifications:['Q65','Q66'],questionsNote:'docs/PENDING_QUESTIONS.md',monitorIntervalMinutes:15,checklistCrossReferenceCurrent:true,discordMessagesSent:0,deploymentNeeded:false,
 method:'All confirmed requests through Q72 verified and released; Q65/Q66 await user answers. Source screenshots reviewed; no client chat messages sent.',deferred:['Q65/Q66 answers','Client recipe configuration/policy','Android/Firebase','External providers','Package configuration','Offline/native v2 dependencies']
});
console.log('0.4.15 accepted: Q71/Q72 released; 184 backend, 4 hosted cases, local/production desktop+phone workflow passed. Q65/Q66 pending.');
