import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createEmbeddedDatabase,createPostgresDatabase,type Database} from '@dinerdost/database';
import type {Actor} from '@dinerdost/core';
import * as s from '@dinerdost/services';
let db:Database,owner:Actor,foreign:Actor,w:any,menuId:string;let serial=0;const key=()=>randomUUID();
before(async()=>{db=process.env.TEST_DATABASE_URL?createPostgresDatabase(process.env.TEST_DATABASE_URL):await createEmbeddedDatabase();await db.migrate();for(const i of [0,1]){const a=await s.signup(db,{name:'Bill policy QA',email:`bill-policy-${i}@example.test`,password:'bill-policy-test-password',restaurant:'Bill policy '+i,outlet:'Main',qrEnabled:true,demo:true},'bill-policy-'+i);if(i)foreign=await s.authenticate(db,a.token);else owner=await s.authenticate(db,a.token)}w=await s.workspace(db,owner);const material=await s.addIngredient(db,owner,key(),{outletId:w.outletId,name:'Bill policy stock',unit:'kg'});await s.receiveStock(db,owner,key(),{ingredientId:material.id,batchNumber:key(),quantityMilli:500000,unitCost:500,reference:'Synthetic bill stock',expiresAt:new Date(Date.now()+172800000).toISOString()},true);menuId=(await s.saveMenu(db,owner,key(),{outletId:w.outletId,name:'Bill policy dish',category:'Food',price:12345,taxBps:500,station:'Bill policy',recipe:[{id:material.id,quantityMilli:1000}]})).id});
after(async()=>db?.close());
const create=(web=true)=>s.createRound(db,owner,key(),{outletId:w.outletId,type:'TAKEAWAY',items:[{itemId:menuId,quantity:1}],customer:{name:'Bill policy guest '+ ++serial,phone:'912360'+String(serial).padStart(4,'0')}},web);
const refresh=(id:string)=>s.getOrder(db,owner,id);
async function defaults(roundDown:boolean){const outlet=(await s.workspace(db,owner)).outlets[0];return s.saveBillDefaults(db,owner,key(),{outletId:w.outletId,version:outlet.version,roundDown})}
test('round-down defaults affect subsequent staff, QR and D2C web rounds only and preserve existing/native amounts',async()=>{
 const old=await create(),snapshot=await refresh(old.id);await defaults(true);assert.deepEqual(await refresh(old.id),snapshot);
 const next=await create();assert.equal(next.rounds[0].rounding_enabled,true);assert.equal(next.rounds[0].rounding_mode,'DOWN');assert.equal(Number(next.rounds[0].payable)%100,0);assert.equal(Number(next.rounds[0].discount),0);const native=await create(false);assert.equal(native.rounds[0].rounding_enabled,false);
 const table=w.tables[0],device=key();await s.openSession(db,owner,key(),{tableId:table.id,guests:1});const grant=await s.connectGuest(db,table.public_key,device,key()),guest=await s.guestSubmit(db,table.public_key,grant.token,device,key(),{name:'Bill policy QR',phone:'9123600071',items:[{itemId:menuId,quantity:1}]},true);assert.equal((await refresh(guest.id)).rounds[0].rounding_enabled,true);
 const brand=await s.saveRecord(db,owner,key(),'brands',{outletId:w.outletId,title:'Bill policy store',data:{active:true,description:'Synthetic policy store'}});await s.saveStorefront(db,owner,key(),{outletId:w.outletId,brandId:brand.id,slug:'bill-policy-store',published:true});const d=key(),visit=await s.connectStorefront(db,'bill-policy-store',d,key()),store=await s.submitStorefrontOrder(db,'bill-policy-store',visit.token,d,key(),{name:'Bill policy D2C',phone:'9123600072',items:[{itemId:menuId,quantity:1}]});assert.equal((await refresh(store.id)).rounds[0].rounding_enabled,true);
 const frozen=await refresh(next.id);await defaults(false);assert.deepEqual(await refresh(next.id),frozen);assert.equal((await create()).rounds[0].rounding_enabled,false);
});
test('web discounts and owner charges remain editable before full payment at every kitchen stage without changing verified receipts or stock',async()=>{
 for(const stage of ['RELEASED','PREPARING','READY','SERVED']){
  let o=await create(),r=o.rounds[0];const ticket=(await s.workspace(db,owner)).tickets.find((t:any)=>t.order_id===o.id);
  if(stage!=='RELEASED')await s.kitchenDecision(db,owner,key(),ticket.id,{state:'PREPARING'});if(['READY','SERVED'].includes(stage))await s.kitchenDecision(db,owner,key(),ticket.id,{state:'READY'});if(stage==='SERVED')await s.serveRound(db,owner,key(),o.id,r.id);
  o=await refresh(o.id);o=(await s.recordPayment(db,owner,key(),o.id,r.id,{version:o.rounds[0].version,method:'CASH',amount:1000},true)).order;
  const before=await refresh(o.id),stock=(await s.workspace(db,owner)).movements;const input={version:o.rounds[0].version,discount:345,roundToRupee:true,roundingMode:'DOWN' as const},request=key();
  o=await s.changeRoundAdjustments(db,owner,request,o.id,r.id,input,true);assert.equal(Number(o.rounds[0].manual_discount),345);assert.equal(Number(o.rounds[0].paid),1000);assert.equal(o.rounds[0].payment_status,'PARTIALLY_PAID');assert.equal(o.rounds[0].kot_status,stage);assert.deepEqual(o.rounds[0].payments,before.rounds[0].payments);assert.deepEqual(o.invoices,before.invoices);assert.deepEqual((await s.workspace(db,owner)).movements,stock);assert.equal((await s.changeRoundAdjustments(db,owner,request,o.id,r.id,input,true)).version,o.version);
  o=await s.changeRoundCharges(db,owner,key(),o.id,r.id,{version:o.rounds[0].version,charges:[{name:'Packaging',amount:250}]},true);assert.equal(Number(o.totals.charges),250);assert.deepEqual(o.rounds[0].payments,before.rounds[0].payments);assert.deepEqual((await s.workspace(db,owner)).movements,stock);
  await assert.rejects(s.changeRoundAdjustments(db,owner,key(),o.id,r.id,{version:o.rounds[0].version,discount:Number(o.rounds[0].subtotal),roundToRupee:false},true),{code:'PAYABLE_BELOW_RECEIVED'});assert.deepEqual(await refresh(o.id),o);
  const points=await db.query('SELECT points FROM loyalty_ledger WHERE round_id=$1 AND state=\'PENDING_EARN\'',[r.id]);assert.ok(Number(points.rows[0].points)>0);
 }
});
test('web partial-payment edits enforce role, tenant, pending-receipt, stale, full-payment and native guards atomically',async()=>{
 let o=await create(),r=o.rounds[0];o=(await s.recordPayment(db,owner,key(),o.id,r.id,{version:r.version,method:'CASH',amount:1000},true)).order;r=o.rounds[0];const input={version:r.version,discount:100,roundToRupee:false};
 await assert.rejects(s.changeRoundAdjustments(db,owner,key(),o.id,r.id,input),{code:'ADJUSTMENTS_LOCKED'});
 await assert.rejects(s.changeRoundAdjustments(db,foreign,key(),o.id,r.id,input,true));await assert.rejects(s.changeRoundAdjustments(db,{...owner,role:'KITCHEN'},key(),o.id,r.id,input,true),{code:'FORBIDDEN'});await assert.rejects(s.changeRoundCharges(db,{...owner,role:'MANAGER'},key(),o.id,r.id,{version:r.version,charges:[]},true),{code:'FORBIDDEN'});
 await assert.rejects(s.changeRoundAdjustments(db,owner,key(),o.id,r.id,{...input,version:999},true),{code:'VERSION_CONFLICT'});
 const pending=key();await db.transaction(owner.restroId,tx=>tx.query("INSERT INTO payment_attempts(id,restro_id,outlet_id,order_id,round_id,method,amount,order_version,state) VALUES($1,$2,$3,$4,$5,'CASH',1,$6,'UNKNOWN')",[pending,owner.restroId,w.outletId,o.id,r.id,r.version]));await assert.rejects(s.changeRoundAdjustments(db,owner,key(),o.id,r.id,input,true),{code:'PAYMENT_ACTIVE'});await db.transaction(owner.restroId,tx=>tx.query("UPDATE payment_attempts SET state='REJECTED' WHERE id=$1",[pending]));
 o=(await s.recordPayment(db,owner,key(),o.id,r.id,{version:r.version,method:'CASH',amount:Number(r.payable)-Number(r.paid)},true)).order;await assert.rejects(s.changeRoundAdjustments(db,owner,key(),o.id,r.id,{...input,version:o.rounds[0].version},true),{code:'ADJUSTMENTS_LOCKED'});
});
test('future-default configuration is outlet scoped, versioned and limited to owner/manager web roles',async()=>{
 const outlet=(await s.workspace(db,owner)).outlets[0],input={outletId:w.outletId,version:outlet.version,roundDown:true};for(const a of [foreign,{...owner,role:'CASHIER' as const},{...owner,application:'POS' as const}])await assert.rejects(s.saveBillDefaults(db,a,key(),input));await assert.rejects(s.saveBillDefaults(db,owner,key(),{...input,version:999}),{code:'VERSION_CONFLICT'});await s.saveBillDefaults(db,{...owner,role:'MANAGER'},key(),input);assert.equal((await s.verifyAudit(db,owner)).valid,true);
});


