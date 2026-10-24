import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createEmbeddedDatabase,createPostgresDatabase,type Database} from '@dinerdost/database';
import type {Actor} from '@dinerdost/core';
import * as s from '@dinerdost/services';
let db:Database,owner:Actor,foreign:Actor,w:any,outletId:string,itemId:string;
const key=()=>randomUUID(),items=()=>[{itemId,quantity:1}];
before(async()=>{db=process.env.TEST_DATABASE_URL?createPostgresDatabase(process.env.TEST_DATABASE_URL):await createEmbeddedDatabase();await db.migrate();await db.migrate();for(const n of [0,1]){const account=await s.signup(db,{name:'Intake QA',email:`intake-${n}@example.test`,password:'intake-qa-password-123',restaurant:'Intake QA '+n,outlet:'Main',qrEnabled:true,demo:true},'intake-'+n);const actor=await s.authenticate(db,account.token);if(n)foreign=actor;else owner=actor}w=await s.workspace(db,owner);outletId=w.outletId;itemId=w.menu[0].id;await s.saveOutlet(db,owner,key(),{name:'Second intake outlet',code:'A2',qrEnabled:true,paymentPolicy:'PREPAID',taxBps:0});});
after(async()=>db?.close());
async function state(){return db.transaction(owner.restroId,async tx=>(await tx.query('SELECT * FROM outlets WHERE id=$1',[outletId])).rows[0])}
async function set(enabled:boolean){const outlet=await state();return s.setOutletOrderIntake(db,owner,key(),{outletId,enabled,version:outlet.order_intake_version})}
async function frozen(){return db.transaction(owner.restroId,async tx=>{const result:Record<string,unknown>={};for(const table of ['orders','order_rounds','order_items','stock_batches','stock_movements','payment_attempts','invoices'])result[table]=(await tx.query(`SELECT to_jsonb(t)::text AS value FROM ${table} t ORDER BY to_jsonb(t)::text`)).rows;return result})}
test('only scoped owners/managers change intake, with versions, idempotency and unchanged QR settings',async()=>{
 const initial=await state();assert.equal(initial.order_intake_enabled,true);assert.equal(initial.order_intake_version,1);const input={outletId,enabled:false,version:1},request=key();
 for(const role of ['CASHIER','WAITER','KITCHEN'] as const)await assert.rejects(s.setOutletOrderIntake(db,{...owner,role},key(),input),{code:'FORBIDDEN'});
 await assert.rejects(s.setOutletOrderIntake(db,{...owner,role:'MANAGER',outletIds:[]},key(),input),{code:'OUTLET_FORBIDDEN'});await assert.rejects(s.setOutletOrderIntake(db,foreign,key(),input),{code:'NOT_FOUND'});
 await assert.rejects(s.setOutletOrderIntake(db,{...owner,application:'COMMAND'},key(),input),{code:'APPLICATION_FORBIDDEN'});
 await assert.rejects(s.setOutletOrderIntake(db,{...owner,supportView:{operatorId:key(),operatorName:'Read only',grantId:key(),mode:'READ_ONLY',expiresAt:new Date(Date.now()+60000).toISOString()}},key(),input),{code:'SUPPORT_READ_ONLY'});
 const saved=await s.setOutletOrderIntake(db,{...owner,role:'MANAGER',outletIds:[outletId]},request,input);assert.deepEqual(await s.setOutletOrderIntake(db,{...owner,role:'MANAGER',outletIds:[outletId]},request,input),saved);assert.equal(saved.order_intake_enabled,false);
 await assert.rejects(s.setOutletOrderIntake(db,owner,key(),input),{code:'VERSION_CONFLICT'});assert.equal((await state()).qr_enabled,initial.qr_enabled);assert.equal((await s.workspace(db,owner)).outlets.find((row:any)=>row.id!==outletId).order_intake_enabled,true);await set(true);
});
test('pause blocks POS, waiter, native/shared calls, drafts, Add More and edits without changing business records',async()=>{
 const draft=await s.createRound(db,owner,key(),{outletId,type:'TAKEAWAY',draft:true,items:items()},true);const session=await s.openSession(db,owner,key(),{tableId:w.tables[0].id,guests:1});await set(false);const before=await frozen();
 try{for(const web of [true,false])for(const type of ['TAKEAWAY','DELIVERY'] as const)await assert.rejects(s.createRound(db,owner,key(),{outletId,type,items:items()},web),{code:'OUTLET_ORDERING_PAUSED'});
 await assert.rejects(s.createRound(db,{...owner,role:'WAITER',outletIds:[outletId]},key(),{outletId,sessionId:session.id,items:items()},true),{code:'OUTLET_ORDERING_PAUSED'});
 await assert.rejects(s.createRound(db,owner,key(),{outletId,type:'TAKEAWAY',draft:true,items:items()},true),{code:'OUTLET_ORDERING_PAUSED'});
 await assert.rejects(s.createRound(db,owner,key(),{outletId,type:'TAKEAWAY',orderId:draft.id,version:draft.version,items:items()},true),{code:'OUTLET_ORDERING_PAUSED'});
 await assert.rejects(s.editRound(db,owner,key(),draft.id,draft.rounds[0].id,{version:draft.rounds[0].version,items:items(),submit:true},true),{code:'OUTLET_ORDERING_PAUSED'});assert.deepEqual(await frozen(),before);assert.equal((await s.getOrder(db,owner,draft.id)).id,draft.id);
 }finally{await set(true)}
});
test('QR orders and extra rounds are blocked for existing visitor grants and resume after reopening',async()=>{
 const table=w.tables[1],device=key();await s.openSession(db,owner,key(),{tableId:table.id,guests:1});const visit=await s.connectGuest(db,table.public_key,device,key()),input={name:'Intake Guest',phone:'9123456718',items:items()};await set(false);const before=await frozen();
 try{for(const web of [true,false])await assert.rejects(s.guestSubmit(db,table.public_key,visit.token,device,key(),input,web),{code:'OUTLET_ORDERING_PAUSED'});assert.deepEqual(await frozen(),before);assert.equal((await s.guestCatalog(db,table.public_key,visit.token,device,true)).orderingEnabled,false)}finally{await set(true)}
 const order=await s.guestSubmit(db,table.public_key,visit.token,device,key(),input,true);await set(false);try{await assert.rejects(s.guestSubmit(db,table.public_key,visit.token,device,key(),{...input,version:order.version},true),{code:'OUTLET_ORDERING_PAUSED'})}finally{await set(true)}
});
test('online checkout is blocked for an existing storefront visitor and resumes with no lost visit history',async()=>{
 const brand=await s.saveRecord(db,owner,key(),'brands',{outletId,title:'Intake Store',data:{description:'Intake QA',active:true}});await s.saveStorefront(db,owner,key(),{outletId,brandId:brand.id,slug:'intake-qa',published:true});const device=key(),visit=await s.connectStorefront(db,'intake-qa',device,key()),input={name:'Online Intake Guest',phone:'9123456717',items:items()};await set(false);const before=await frozen();try{await assert.rejects(s.submitStorefrontOrder(db,'intake-qa',visit.token,device,key(),input),{code:'OUTLET_ORDERING_PAUSED'});assert.deepEqual(await frozen(),before);assert.equal((await s.storefrontCatalog(db,'intake-qa',visit.token,device)).orderingEnabled,false)}finally{await set(true)}assert((await s.submitStorefrontOrder(db,'intake-qa',visit.token,device,key(),input)).id);
});
test('paid replacement is blocked while existing orders can still take payment, serve and settle',async()=>{
 const order=await s.createRound(db,owner,key(),{outletId,type:'TAKEAWAY',items:items(),customer:{name:'Paid Intake Guest',phone:'9123456716'}},true);await set(false);try{await s.recordPayment(db,owner,key(),order.id,order.rounds[0].id,{version:order.rounds[0].version,method:'CASH',amount:Number(order.totals.payable)},true);const current=await s.getOrder(db,owner,order.id);const before=await frozen();await assert.rejects(s.replacePaidOrder(db,owner,key(),order.id,{version:current.version,items:items(),expectedPayable:Number(current.totals.payable),reason:'Synthetic paused intake replacement',discardUnserved:true,confirmed:true}),{code:'OUTLET_ORDERING_PAUSED'});assert.deepEqual(await frozen(),before);await s.completePreparedService(db,owner,key(),order.id,current.rounds[0].id,{version:current.rounds[0].version,confirmedPreparedAndServed:true});await s.generateBill(db,owner,key(),order.id,{final:true});assert.equal((await s.getOrder(db,owner,order.id)).status,'SETTLED')}finally{await set(true)}
});
test('concurrent changes cannot overwrite a newer state',async()=>{const outlet=await state(),version=outlet.order_intake_version;const results=await Promise.allSettled([false,true].map(enabled=>s.setOutletOrderIntake(db,owner,key(),{outletId,enabled,version})));assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal((results.find(result=>result.status==='rejected') as PromiseRejectedResult).reason.code,'VERSION_CONFLICT');await set(true)});
