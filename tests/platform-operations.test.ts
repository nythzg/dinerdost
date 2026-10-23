import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createEmbeddedDatabase,createPostgresDatabase,type Database} from '@dinerdost/database';
import {businessDate,type Actor} from '@dinerdost/core';
import * as s from '@dinerdost/services';

let db:Database,admin:Actor,owner:Actor,other:Actor,regional:Actor,w:any,ow:any,brand:string,tax:string,tag:string,roleTemplate:string,contract:string,invoiceOrder:any;
const key=()=>randomUUID(),password='isolated-operations-password-123',today=businessDate(),reason='Isolated operational verification';
const record=(kind:string,name:string,data:any,tenantId?:string)=>s.savePlatformRecord(db,admin,key(),{kind,name,data,tenantId,version:0,reason});
const policy=async(actor:Actor,extra:any={})=>{const before=(await db.query<any>('SELECT version FROM platform_tenant_policies WHERE restro_id=$1',[actor.restroId])).rows[0];return s.savePlatformTenant(db,admin,key(),{tenantId:actor.restroId,version:before?.version??0,status:'ACTIVE',kyc:'VERIFIED',brandId:brand??null,planId:null,businessType:'RESTAURANT',gstin:'',license:'',notes:'Synthetic QA only',reason,...extra});};
async function finalOrder(actor=owner,source?:string){const workspace=await s.workspace(db,actor);let o=await s.createRound(db,actor,key(),{outletId:workspace.outletId,type:'TAKEAWAY',items:[{itemId:workspace.menu[0].id,quantity:1}],customer:{name:'Synthetic operations diner',phone:'9187654321'}},true);if(source)await db.query('UPDATE orders SET source=$2 WHERE id=$1',[o.id,source]);o=(await s.recordPayment(db,actor,key(),o.id,o.rounds[0].id,{version:o.rounds[0].version,method:'CASH',amount:Number(o.rounds[0].payable)},true)).order;for(const ticket of (await s.workspace(db,actor)).tickets.filter((t:any)=>t.order_id===o.id)){await s.kitchenDecision(db,actor,key(),ticket.id,{state:'PREPARING'});await s.kitchenDecision(db,actor,key(),ticket.id,{state:'READY'});}await s.serveRound(db,actor,key(),o.id,o.rounds[0].id);await s.generateBill(db,actor,key(),o.id,{final:true});return s.getOrder(db,actor,o.id);}
before(async()=>{db=process.env.TEST_DATABASE_URL?createPostgresDatabase(process.env.TEST_DATABASE_URL):await createEmbeddedDatabase();await db.migrate();const actors=[];for(let i=0;i<4;i++){const auth=await s.signup(db,{name:'Operations owner '+i,email:'operations-'+i+'@example.test',password,restaurant:'Operations restaurant '+i,outlet:'QA Main',demo:true,qrEnabled:true},'operations-'+i);actors.push(await s.authenticate(db,auth.token));}[admin,owner,other,regional]=actors;await s.bootstrapPlatformAdmin(db,'operations-0@example.test');w=await s.workspace(db,owner);ow=await s.workspace(db,other);});
beforeEach(async()=>{await db.query('DELETE FROM rate_limits')});
after(async()=>db?.close());

test('operational configuration is private, versioned and never supplies invented issuer details or rates',async()=>{
 await assert.rejects(s.savePlatformConfiguration(db,owner,key(),{key:'risk',version:0,data:{enabled:true,baselineOrders:5,dropPercent:50,inactiveDays:7,createTasks:true},reason}),{code:'PLATFORM_FORBIDDEN'});
 await assert.rejects(s.savePlatformConfiguration(db,admin,key(),{key:'issuer',version:0,data:{name:'Missing fields'},reason}));
 for(const table of ['platform_operational_config','platform_saas_documents','platform_saas_payments','platform_brand_access','platform_http_samples'])await assert.rejects(db.transaction(owner.restroId,tx=>tx.query('SELECT * FROM '+table)),/permission denied/);
 const input={key:'risk',version:0,data:{enabled:true,baselineOrders:2,dropPercent:50,inactiveDays:7,createTasks:true},reason},request=key();const results=await Promise.all([s.savePlatformConfiguration(db,admin,request,input),s.savePlatformConfiguration(db,admin,request,input)]);assert.deepEqual(results[0],results[1]);await assert.rejects(s.savePlatformConfiguration(db,admin,key(),input),{code:'VERSION_CONFLICT'});
});
test('applied tax/tag/role defaults affect future setup while issued diner invoices, payments, FIFO and counts remain identical',async()=>{
 invoiceOrder=await finalOrder();const before=await s.getOrder(db,owner,invoiceOrder.id),history=(await db.query('SELECT * FROM stock_batches ORDER BY id')).rows;
 tax=(await record('TAX_TEMPLATE','Synthetic 7.25 tax',{jurisdiction:'QA',taxName:'QA tax',rate:7.25})).id;tag=(await record('TAXONOMY','Synthetic allergen',{type:'ALLERGEN',description:'Explicit synthetic ingredient classification'})).id;roleTemplate=(await record('ROLE_TEMPLATE','Synthetic waiter',{role:'WAITER',notes:'Existing waiter permissions'})).id;
 const selection={taxId:tax,taxonomyIds:[tag],roleIds:[roleTemplate]};await s.applyPlatformTemplates(db,admin,key(),{tenantId:owner.restroId,outletId:w.outletId,version:w.outlets[0].version,selection,reason});
 assert.deepEqual(await s.getOrder(db,owner,invoiceOrder.id),before);assert.deepEqual((await db.query('SELECT * FROM stock_batches ORDER BY id')).rows,history);
 const outlet=(await db.query<any>('SELECT tax_bps,tax_components FROM outlets WHERE id=$1',[w.outletId])).rows[0];assert.equal(outlet.tax_bps,725);assert.deepEqual(outlet.tax_components,[{name:'QA tax',rateBps:725}]);
 await s.savePlatformConfiguration(db,admin,key(),{key:'onboarding',version:0,data:selection,reason});
 const auth=await s.signup(db,{name:'Future setup owner',email:'future-setup@example.test',password,restaurant:'Future setup QA',outlet:'Blank QA',demo:false,qrEnabled:false},'setup-web',true),actor=await s.authenticate(db,auth.token),created=await s.workspace(db,actor);
 assert.equal(created.menu.length,0);assert.equal(created.outlets[0].tax_bps,725);assert.equal(created.platformSetup.role_templates[0].role,'WAITER');assert.equal(created.platformPolicy.status,'HOLD');
 const menu=(await s.workspace(db,owner)).menu[0];await s.tagPlatformMenu(db,admin,key(),{tenantId:owner.restroId,itemId:menu.id,version:menu.version,tagIds:[tag],reason});assert.equal((await s.workspace(db,owner)).menu.find((m:any)=>m.id===menu.id).masterTags[0].name,'Synthetic allergen');
 await assert.rejects(s.tagPlatformMenu(db,admin,key(),{tenantId:owner.restroId,itemId:ow.menu[0].id,version:ow.menu[0].version,tagIds:[tag],reason}));
});
test('enterprise grants and local branding link actual assigned restaurants without granting owner access to another tenant',async()=>{
 brand=(await record('BRAND','Synthetic enterprise',{legalName:'Synthetic brand only'})).id;await policy(owner);await policy(other);await finalOrder(other);
 await assert.rejects(s.enterpriseReport(db,owner,{brandId:brand,from:today,to:today}));
 await s.savePlatformBrandAccess(db,admin,key(),{brandId:brand,email:'operations-1@example.test',enabled:true,version:0,adminPassword:password,reason});
 assert.equal((await s.enterpriseBrands(db,owner)).length,1);const report=await s.enterpriseReport(db,owner,{brandId:brand,from:today,to:today});assert.equal(report.restaurants,2);assert.equal(report.orders,2);assert.ok(report.netGmv>0);assert.equal((report as any).risk,undefined);
 await assert.rejects(s.getOrder(db,owner,(await s.workspace(db,other)).orders[0].id));
 await s.savePlatformBranding(db,admin,key(),{tenantId:owner.restroId,version:1,displayName:'Synthetic branded venue',color:'#275d47',slug:'synthetic-brand',logoId:null,published:true,reason});
 assert.equal((await s.platformPublicBrand(db,'synthetic-brand')).name,'Synthetic branded venue');
 await s.savePlatformBrandAccess(db,admin,key(),{brandId:brand,email:'operations-1@example.test',enabled:false,version:1,adminPassword:password,reason});await assert.rejects(s.enterpriseReport(db,owner,{brandId:brand,from:today,to:today}));
});
test('regional staff cannot read, mutate, reassign or replay actions outside their explicit restaurant scope',async()=>{
 await s.savePlatformMember(db,admin,key(),{email:'operations-3@example.test',role:'CUSTOM',permissions:['overview','tenants','plans','ecosystem','support','audit'],tenantIds:[owner.restroId],region:'Synthetic region',enabled:true,version:0,adminPassword:password,reason});
 const snapshot=await s.platformSnapshot(db,regional);assert.equal(snapshot.tenants.length,1);assert.equal(snapshot.tenants[0].id,owner.restroId);assert.equal(Number(snapshot.metrics?.restaurants),1);assert.deepEqual(snapshot.audits,[]);
 assert.equal((await s.platformRestaurantDirectory(db,regional)).total,1);await assert.rejects(s.platformRestaurantData(db,regional,{tenantId:other.restroId}),{code:'PLATFORM_SCOPE_FORBIDDEN'});
 await assert.rejects(s.savePlatformConfiguration(db,regional,key(),{key:'risk',data:{enabled:false,baselineOrders:2,dropPercent:50,inactiveDays:7,createTasks:false},version:1,reason}),{code:'PLATFORM_SCOPE_FORBIDDEN'});
 await assert.rejects(s.verifyPlatformAudit(db,regional),{code:'PLATFORM_SCOPE_FORBIDDEN'});
 const foreign=await record('TICKET','Other private ticket',{type:'SUPPORT',priority:'HIGH',status:'OPEN',description:'Other tenant issue'},other.restroId);
 await assert.rejects(s.savePlatformRecord(db,regional,key(),{id:foreign.id,kind:'TICKET',name:'Attempted move',tenantId:owner.restroId,data:{type:'SUPPORT',priority:'HIGH',status:'OPEN',description:'Cannot steal this ticket'},version:1,reason}),{code:'PLATFORM_SCOPE_FORBIDDEN'});
 const grant=await s.createPlatformSupportView(db,regional,key(),{tenantId:owner.restroId,adminPassword:password,reason});assert.equal((await s.readPlatformSupportView(db,regional,grant.id)).restaurant.id,owner.restroId);await assert.rejects(s.createPlatformSupportView(db,regional,key(),{tenantId:other.restroId,adminPassword:password,reason}),{code:'PLATFORM_SCOPE_FORBIDDEN'});
});
test('full owner workspace delegation is session-bound, revocable and enforced read-only by PostgreSQL and RLS',async()=>{
 const grant=await s.createPlatformSupportView(db,admin,key(),{tenantId:owner.restroId,adminPassword:password,reason}),view=await s.platformOwnerView(db,admin,grant.id),readonly=s.platformOwnerReadDatabase(db,view.actor.restroId);
 assert.equal(view.actor.userId,owner.userId);assert.equal((await s.workspace(readonly,view.actor)).restaurant.id,owner.restroId);
 assert.equal((await readonly.query('SELECT id FROM restaurants')).rows.length,1);
 await assert.rejects(readonly.query('UPDATE outlets SET name=$1 WHERE id=$2',['Do not mutate',w.outletId]),/read.only/i);
 await assert.rejects(readonly.transaction(other.restroId,tx=>tx.query('SELECT 1')),{code:'PLATFORM_SCOPE_FORBIDDEN'});
 await assert.rejects(s.platformOwnerView(db,{...admin,sessionHash:regional.sessionHash},grant.id),{code:'PLATFORM_FORBIDDEN'});
 await s.endPlatformSupportView(db,admin,key(),{id:grant.id,reason});await assert.rejects(s.platformOwnerView(db,admin,grant.id),{code:'SUPPORT_UNAVAILABLE'});
});
test('calendar billing, immutable tax snapshots, concurrent receipts and correcting credits preserve original diner financial history',async()=>{
 assert.equal(s.nextBillingDate('2028-01-31','MONTHLY'),'2028-02-29');assert.equal(s.nextBillingDate('2028-02-29','MONTHLY',31),'2028-03-31');
 const issuer={name:'Synthetic issuer',address:'Synthetic legal address',gstin:'27ABCDE1234F1Z5',stateCode:'27',stateName:'Synthetic state',sac:'998314',prefix:'QA',taxRate:18,signatory:'Synthetic signer',eInvoiceRequired:false,eInvoiceExemptionDeclaration:''};await s.savePlatformConfiguration(db,admin,key(),{key:'issuer',version:0,data:issuer,reason});
 await s.savePlatformBillingProfile(db,admin,key(),{tenantId:owner.restroId,version:0,recipient:{name:'Synthetic recipient',address:'Synthetic recipient address',gstin:'',stateCode:'27',stateName:'Synthetic state',deliveryAddress:''},reason});
 const plan=(await record('PLAN','Synthetic monthly',{fee:100,cycle:'MONTHLY',features:['pos','qr','inventory','reports']})).id;
 const start=new Date(Date.parse(today+'T00:00:00Z')-35*86400000).toISOString().slice(0,10);contract=(await record('SUBSCRIPTION','Synthetic contract',{planId:plan,status:'ACTIVE',start},owner.restroId)).id;
 const history=await s.getOrder(db,owner,invoiceOrder.id);
 await s.configurePlatformSubscription(db,admin,key(),{tenantId:owner.restroId,subscriptionId:contract,version:0,enabled:true,settings:{billFrom:start,dueDays:0,graceDays:0,autoRenew:false,enforceAccess:true},reason});
 await s.runPlatformMaintenance(db,admin,key(),{reason});await s.runPlatformMaintenance(db,admin,key(),{reason});
 const docs=(await db.query<any>("SELECT * FROM platform_saas_documents WHERE subscription_id=$1 AND kind='INVOICE' ORDER BY period_start",[contract])).rows;assert.equal(docs.length,2);assert.equal(Number(docs[0].total),11800);assert.equal(docs[0].snapshot.taxes[0].name,'CGST');assert.equal(docs[0].snapshot.taxes[0].amount,900);
 assert.equal((await db.query<any>('SELECT status FROM platform_tenant_policies WHERE restro_id=$1',[owner.restroId])).rows[0].status,'HOLD');
 const results=await Promise.allSettled([1,2].map(i=>s.recordPlatformSaasPayment(db,admin,key(),{tenantId:owner.restroId,invoiceId:docs[0].id,amount:11800,method:'BANK',reference:'SYNTHETIC-'+i,paidOn:today,reason})));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 await s.recordPlatformSaasPayment(db,admin,key(),{tenantId:owner.restroId,invoiceId:docs[1].id,amount:11800,method:'BANK',reference:'SYNTHETIC-SECOND',paidOn:today,reason});await s.runPlatformMaintenance(db,admin,key(),{reason});assert.equal((await db.query<any>('SELECT status FROM platform_tenant_policies WHERE restro_id=$1',[owner.restroId])).rows[0].status,'ACTIVE');
 await s.creditPlatformSaasInvoice(db,admin,key(),{tenantId:owner.restroId,invoiceId:docs[0].id,amount:1000,reason});assert.equal((await s.readPlatformSaasDocument(db,admin,docs[0].id)).snapshot.total,11800);await assert.rejects(db.query("UPDATE platform_saas_documents SET total=0"),/immutable/i);
 assert.deepEqual(await s.getOrder(db,owner,invoiceOrder.id),history);
});
test('commission activation never backcharges old same-day invoices; corrections are immutable and settlements require actual held funds',async()=>{
 const old=await finalOrder(owner,'CUSTOMER_QR'),rule=(await record('FEE_RULE','Synthetic fee',{basis:'PERCENT',amount:10,channel:'QR_PAYMENT'})).id;
 await s.activatePlatformFee(db,admin,key(),{tenantId:owner.restroId,ruleId:rule,active:true,effectiveFrom:today,reason});await s.runPlatformMaintenance(db,admin,key(),{reason});assert.equal((await db.query('SELECT id FROM platform_fee_accruals WHERE rule_id=$1',[rule])).rows.length,0);
 const fresh=await finalOrder(owner,'CUSTOMER_QR');await s.runPlatformMaintenance(db,admin,key(),{reason});await s.runPlatformMaintenance(db,admin,key(),{reason});let fees=(await db.query<any>('SELECT * FROM platform_fee_accruals WHERE rule_id=$1',[rule])).rows;assert.equal(fees.length,1);assert.equal(Number(fees[0].amount),Math.round(Number(fresh.rounds[0].payable)*.1));
 await assert.rejects(s.recordPlatformSettlement(db,admin,key(),{tenantId:owner.restroId,direction:'PAYOUT',amount:100,reference:'NO-HELD-FUNDS',occurredOn:today,confirmedActual:true,reason}),{code:'SETTLEMENT_EXCEEDS_FUNDS'});
 await s.recordPlatformSettlement(db,admin,key(),{tenantId:owner.restroId,direction:'RECEIVED',amount:10000,reference:'SYNTHETIC-HELD',occurredOn:today,confirmedActual:true,reason});const payouts=await Promise.allSettled([1,2].map(i=>s.recordPlatformSettlement(db,admin,key(),{tenantId:owner.restroId,direction:'PAYOUT',amount:8000,reference:'SYNTHETIC-PAYOUT-'+i,occurredOn:today,confirmedActual:true,reason})));assert.equal(payouts.filter(r=>r.status==='fulfilled').length,1);
 const financialBefore=(await db.query('SELECT * FROM payment_attempts WHERE order_id=$1',[fresh.id])).rows;const invoice=(await db.query<any>("SELECT id FROM invoices WHERE order_id=$1 AND document_type='FINAL_TAX_INVOICE'",[fresh.id])).rows[0];await s.submitWebRefund(db,owner,key(),fresh.id,{version:fresh.version,invoiceId:invoice.id,amount:1000,mode:'CASH',reason,reference:'SYNTHETIC-REFUND',confirmed:true});await s.runPlatformMaintenance(db,admin,key(),{reason});await s.runPlatformMaintenance(db,admin,key(),{reason});const credit=(await db.query<any>('SELECT amount FROM platform_fee_accruals WHERE parent_id=$1',[fees[0].id])).rows;assert.equal(credit.length,1);assert.equal(Number(credit[0].amount),-100);assert.deepEqual((await db.query('SELECT * FROM payment_attempts WHERE order_id=$1',[fresh.id])).rows,financialBefore);
 await assert.rejects(db.query('DELETE FROM platform_fee_accruals'),/immutable/i);const oldAfter=await s.getOrder(db,owner,old.id);assert.deepEqual({...oldAfter,customerVisits:old.customerVisits},old);
});
test('GMV uses canonical final-invoice adjustments; CAC/cohorts stay unavailable without recorded inputs',async()=>{
 const report=await s.platformAnalytics(db,admin,{from:today,to:today});assert.ok(report.netGmv>0);assert.equal(report.cac,null);assert.equal(report.nrr,null);assert.equal(report.churn,null);
 await record('ACQUISITION_COST','Synthetic acquisition',{amount:20,date:today,channel:'Synthetic test channel'});
 const updated=await s.platformAnalytics(db,admin,{from:today,to:today});assert.equal(updated.newPayingRestaurants,1);assert.equal(updated.cac,2000);
 const tenant=await s.enterpriseBrands(db,owner);assert.equal(tenant.length,0);
});
test('support deadlines, private evidence, recorded disputes and API telemetry are functional without external messages or refunds',async()=>{
 const ticket=(await record('TICKET','Synthetic dispute',{type:'DISPUTE',priority:'HIGH',status:'OPEN',description:'Synthetic evidence check'},owner.restroId)).id;
 await s.savePlatformCase(db,admin,key(),{tenantId:owner.restroId,ticketId:ticket,version:0,dueAt:new Date(Date.now()-3600000).toISOString(),paymentId:null,amount:0,outcome:'OPEN',reference:'',notes:'Synthetic notes',reason});
 const file=await s.uploadPlatformOperationalFile(db,admin,key(),{type:'CASE',tenantId:owner.restroId,targetId:ticket,name:'synthetic.pdf',mime:'application/pdf',bytes:Buffer.from('%PDF-1.4 synthetic evidence'),reason});assert.equal(Buffer.from((await s.readPlatformCaseFile(db,admin,file.id)).bytes).toString(),'%PDF-1.4 synthetic evidence');await assert.rejects(s.readPlatformCaseFile(db,owner,file.id),{code:'PLATFORM_FORBIDDEN'});
 await s.runPlatformMaintenance(db,admin,key(),{reason});await s.runPlatformMaintenance(db,admin,key(),{reason});assert.equal((await db.query("SELECT id FROM platform_tasks WHERE source_key=$1",['escalation:'+ticket])).rows.length,1);assert.equal((await db.query<any>('SELECT data FROM platform_records WHERE id=$1',[ticket])).rows[0].data.priority,'URGENT');
 await s.recordPlatformHttpSample(db,'/api/superadmin',200,12);await s.recordPlatformHttpSample(db,'/api/superadmin',500,24);const telemetry=await s.platformTelemetry(db,admin);assert.equal(Number(telemetry.routes[0].requests),2);assert.equal(Number(telemetry.routes[0].server_errors),1);assert.equal(telemetry.providerWebhooks,'DEFERRED');assert.ok(telemetry.database.length>0);
 await assert.rejects(s.platformTelemetry(db,regional),{code:'PLATFORM_SCOPE_FORBIDDEN'});assert.equal((await s.verifyPlatformAudit(db,admin)).valid,true);
});

test('QR lifecycle and published logo assets are explicit, versioned and preserve existing table identities',async()=>{
 const created=await s.bulkPlatformQr(db,admin,key(),{outletId:w.outletId,prefix:'OPS-QR-',start:1,count:1,seats:4,floor:'Synthetic floor',reason}),table=created.tables[0];
 await s.changePlatformQr(db,admin,key(),{tenantId:owner.restroId,tableId:table.id,version:1,action:'ROTATE',adminPassword:password,reason});const rotated=(await db.query<any>('SELECT * FROM dining_tables WHERE id=$1',[table.id])).rows[0];assert.notEqual(rotated.public_key,table.key);assert.equal(rotated.id,table.id);
 await assert.rejects(s.changePlatformQr(db,admin,key(),{tenantId:owner.restroId,tableId:table.id,version:1,action:'RETIRE',adminPassword:password,reason}),{code:'VERSION_CONFLICT'});
 await s.changePlatformQr(db,admin,key(),{tenantId:owner.restroId,tableId:table.id,version:2,action:'RETIRE',adminPassword:password,reason});assert.ok((await db.query<any>('SELECT retired_at FROM dining_tables WHERE id=$1',[table.id])).rows[0].retired_at);
 await s.changePlatformQr(db,admin,key(),{tenantId:owner.restroId,tableId:table.id,version:3,action:'RESTORE',adminPassword:password,reason});assert.equal((await db.query<any>('SELECT retired_at FROM dining_tables WHERE id=$1',[table.id])).rows[0].retired_at,null);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO/aH9sAAAAASUVORK5CYII=','base64'),asset=await s.uploadPlatformOperationalFile(db,admin,key(),{type:'BRAND',targetId:brand,name:'logo.png',mime:'image/png',bytes:png,reason});
 await assert.rejects(s.readPlatformBrandAsset(db,asset.id));const setup=(await db.query<any>('SELECT version FROM platform_tenant_setup WHERE restro_id=$1',[owner.restroId])).rows[0];await s.savePlatformBranding(db,admin,key(),{tenantId:owner.restroId,version:setup.version,displayName:'Synthetic branded venue',color:'#275d47',slug:'synthetic-brand',logoId:asset.id,published:true,reason});assert.deepEqual(Buffer.from((await s.readPlatformBrandAsset(db,asset.id)).bytes),png);
 await assert.rejects(s.uploadPlatformOperationalFile(db,admin,key(),{type:'BRAND',targetId:brand,name:'bad.png',mime:'image/png',bytes:Buffer.from('<script>bad</script>'),reason}),{code:'INVALID_FILE'});
});
test('trial expiry and IRN-required blocking never fabricate legal configuration or rewrite prior issued snapshots',async()=>{
 const issuer=(await db.query<any>("SELECT * FROM platform_operational_config WHERE key='issuer'")).rows[0],old=(await db.query<any>("SELECT snapshot FROM platform_saas_documents WHERE kind='INVOICE' ORDER BY created_at LIMIT 1")).rows[0];
 await s.savePlatformConfiguration(db,admin,key(),{key:'issuer',version:issuer.version,data:{...issuer.data,eInvoiceRequired:true},reason});
 const start=new Date(Date.parse(today+'T00:00:00Z')-3*86400000).toISOString().slice(0,10),until=new Date(Date.parse(today+'T00:00:00Z')-86400000).toISOString().slice(0,10),plan=(await record('PLAN','Synthetic trial plan',{fee:100,cycle:'MONTHLY',features:['pos']})).id;
 const trial=(await record('SUBSCRIPTION','Synthetic expiring trial',{planId:plan,status:'TRIAL',start,trialUntil:until},other.restroId)).id;
 await s.savePlatformBillingProfile(db,admin,key(),{tenantId:other.restroId,version:0,recipient:{name:'Synthetic interstate recipient',address:'Synthetic billing address',gstin:'',stateCode:'29',stateName:'Other synthetic state',deliveryAddress:''},reason});
 await s.configurePlatformSubscription(db,admin,key(),{tenantId:other.restroId,subscriptionId:trial,version:0,enabled:true,settings:{billFrom:start,dueDays:5,graceDays:1,autoRenew:true,enforceAccess:false},reason});await s.runPlatformMaintenance(db,admin,key(),{reason});
 assert.equal((await db.query<any>('SELECT state FROM platform_subscription_automation WHERE subscription_id=$1',[trial])).rows[0].state.blocked,'EINVOICE_DEFERRED');assert.equal((await db.query<any>('SELECT data FROM platform_records WHERE id=$1',[trial])).rows[0].data.status,'ACTIVE');assert.equal((await db.query('SELECT id FROM platform_saas_documents WHERE subscription_id=$1',[trial])).rows.length,0);
 await s.savePlatformConfiguration(db,admin,key(),{key:'issuer',version:issuer.version+1,data:{...issuer.data,taxRate:5,eInvoiceRequired:false},reason});await s.runPlatformMaintenance(db,admin,key(),{reason});const doc=(await db.query<any>('SELECT snapshot FROM platform_saas_documents WHERE subscription_id=$1',[trial])).rows[0].snapshot;assert.equal(doc.taxes[0].name,'IGST');assert.equal(doc.total,10500);assert.deepEqual((await db.query<any>("SELECT snapshot FROM platform_saas_documents WHERE kind='INVOICE' ORDER BY created_at LIMIT 1")).rows[0].snapshot,old.snapshot);
});
test('observed positive cohorts and adoption drops create reproducible metrics and one internal follow-up per rule period',async()=>{
 const auth=await s.signup(db,{name:'Synthetic inactive owner',email:'inactive-operations@example.test',password,restaurant:'Synthetic inactive tenant',outlet:'Empty QA',demo:false,qrEnabled:false},'inactive-ops'),inactive=await s.authenticate(db,auth.token);
 await db.query("INSERT INTO orders(id,restro_id,outlet_id,source,type,created_at) SELECT gen_random_uuid(),$1,$2,'CASHIER_POS','TAKEAWAY',now()-interval '10 days' FROM generate_series(1,2)",[inactive.restroId,inactive.outletIds[0]]);
 await s.runPlatformMaintenance(db,admin,key(),{reason});await s.runPlatformMaintenance(db,admin,key(),{reason});assert.equal((await db.query("SELECT id FROM platform_tasks WHERE restro_id=$1 AND kind='ADOPTION'",[inactive.restroId])).rows.length,1);
 const from=new Date(Date.parse(today+'T00:00:00Z')-30*86400000).toISOString().slice(0,10),plan=(await record('PLAN','Synthetic cohort plan',{fee:100,cycle:'MONTHLY',features:['pos']})).id,sub=(await record('SUBSCRIPTION','Synthetic cohort contract',{planId:plan,status:'ACTIVE',start:from},inactive.restroId)).id,base=(await db.query<any>('SELECT data FROM platform_records WHERE id=$1',[sub])).rows[0].data;
 await db.query("INSERT INTO platform_contract_history(id,subscription_id,restro_id,snapshot,recorded_at) VALUES($1,$2,$3,$4::jsonb,$5::date-interval '1 day'),($6,$2,$3,$7::jsonb,now()+interval '1 second')",[key(),sub,inactive.restroId,JSON.stringify(base),from,key(),JSON.stringify({...base,planFee:150})]);
 const report=await s.platformAnalytics(db,admin,{from,to:today});assert.equal(report.nrr,150);assert.equal(report.churn,0);assert.equal(report.risk.find((r:any)=>r.id===inactive.restroId)?.atRisk,true);
});

test('paid replacement fee corrections are exactly once and leave original diner documents and receipts intact',async()=>{
 const rule=(await record('FEE_RULE','Independent replacement fee QA',{basis:'PERCENT',amount:7,channel:'QR_PAYMENT'})).id;
 await s.activatePlatformFee(db,admin,key(),{tenantId:owner.restroId,ruleId:rule,active:true,effectiveFrom:today,reason});
 const order=await finalOrder(owner,'CUSTOMER_QR');await s.runPlatformMaintenance(db,admin,key(),{reason});
 const fee=(await db.query<any>('SELECT * FROM platform_fee_accruals WHERE rule_id=$1',[rule])).rows[0];assert.ok(Number(fee.amount)>0);
 const documents=(await db.query('SELECT * FROM invoices WHERE order_id=$1 ORDER BY id',[order.id])).rows,receipts=(await db.query('SELECT * FROM payment_attempts WHERE order_id=$1 ORDER BY id',[order.id])).rows,item=(await s.workspace(db,owner)).menu[0];
 await s.replacePaidOrder(db,owner,key(),order.id,{version:order.version,items:[{itemId:item.id,quantity:1}],expectedPayable:order.totals.payable,fulfillment:'TAKEAWAY',discardUnserved:false,confirmed:true,reason});
 await Promise.all([s.runPlatformMaintenance(db,admin,key(),{reason}),s.runPlatformMaintenance(db,admin,key(),{reason})]);
 const ledger=(await db.query<any>('SELECT * FROM platform_fee_accruals WHERE rule_id=$1 ORDER BY amount DESC',[rule])).rows;assert.equal(ledger.length,2);assert.equal(ledger[1].source_kind,'REPLACEMENT_FEE_CREDIT');assert.equal(ledger[1].parent_id,fee.id);assert.equal(Number(ledger[0].amount)+Number(ledger[1].amount),0);
 assert.deepEqual((await db.query('SELECT * FROM invoices WHERE order_id=$1 ORDER BY id',[order.id])).rows,documents);assert.deepEqual((await db.query('SELECT * FROM payment_attempts WHERE order_id=$1 ORDER BY id',[order.id])).rows,receipts);
});
