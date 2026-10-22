import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createEmbeddedDatabase,createPostgresDatabase,type Database} from '@dinerdost/database';
import {type Actor} from '@dinerdost/core';
import * as s from '@dinerdost/services';
let db:Database,owner:Actor,foreign:Actor,w:any,menuId:string,tableIndex=0;
const key=()=>randomUUID(),detail=(id:string)=>s.getOrder(db,owner,id);
before(async()=>{
 db=process.env.TEST_DATABASE_URL?createPostgresDatabase(process.env.TEST_DATABASE_URL):await createEmbeddedDatabase();await db.migrate();await db.migrate();
 for(const n of [0,1]){const account=await s.signup(db,{name:'Priority QA',email:`priority-${n}@example.test`,password:'priority-qr-test-password',restaurant:'Priority '+n,outlet:'Main',qrEnabled:true,demo:true},'priority-'+n);const actor=await s.authenticate(db,account.token);if(n)foreign=actor;else owner=actor}
 w=await s.workspace(db,owner);
 const stock=await s.addIngredient(db,owner,key(),{outletId:w.outletId,name:'QR tracked material',unit:'kg'});
 await s.receiveStock(db,owner,key(),{ingredientId:stock.id,quantityMilli:30000,unitCost:1000,batchNumber:key(),reference:'Synthetic stock',expiresAt:new Date(Date.now()+172800000).toISOString()},true);
 menuId=(await s.saveMenu(db,owner,key(),{outletId:w.outletId,name:'QR tracked dish',category:'Food',price:10000,taxBps:0,station:'Main kitchen',recipe:[{id:stock.id,quantityMilli:1000}]})).id;
});
after(async()=>{await db?.close()});
async function mode(qrPaymentMode:'ORDER_ONLY'|'PAYMENT'){
 const outlet=(await s.workspace(db,owner)).outlets[0];return s.saveOutlet(db,owner,key(),{id:outlet.id,version:outlet.version,name:outlet.name,code:outlet.code,address:outlet.address,gstin:outlet.gstin,qrEnabled:true,qrPaymentMode,paymentPolicy:'PREPAID',taxBps:Number(outlet.tax_bps),earnBps:Number(outlet.earn_bps)});
}
async function qr(qrMode:'ORDER_ONLY'|'PAYMENT',legacy=false){
 await mode(qrMode);const table=w.tables[tableIndex++],device=key();assert(table);
 await s.openSession(db,owner,key(),{tableId:table.id,guests:1});const visit=await s.connectGuest(db,table.public_key,device,key());
 const submitted=await s.guestSubmit(db,table.public_key,visit.token,device,key(),{name:'QR Priority Guest',phone:'9123456719',items:[{itemId:menuId,quantity:1}]},!legacy);return detail(submitted.id);
}
async function accept(o:any,web=true){return s.decideRound(db,owner,key(),o.id,o.rounds[0].id,{version:o.rounds[0].version,decision:'ACCEPT'},web)}
async function frozen(){return db.transaction(owner.restroId,async tx=>{const result:Record<string,unknown>={};for(const table of ['orders','order_rounds','invoices','payment_attempts','stock_movements','order_item_costs'])result[table]=(await tx.query(`SELECT * FROM ${table} ORDER BY ${table==='order_item_costs'?'order_item_id':'id'}`)).rows;return result})}
test('VIP pins are shared metadata, sort before pagination and preserve order/payment/stock history',async()=>{
 const first=await s.createRound(db,owner,key(),{outletId:w.outletId,type:'TAKEAWAY',draft:true,items:[{itemId:w.menu[0].id,quantity:1}]},true);
 for(let n=0;n<26;n++)await s.createRound(db,owner,key(),{outletId:w.outletId,type:'TAKEAWAY',draft:true,items:[{itemId:w.menu[0].id,quantity:1}]},true);
 const before=await frozen(),request=key(),input={pinned:true,version:0};const pinned=await s.setOrderPin(db,owner,request,first.id,input);assert.equal(pinned.pin_version,1);assert.deepEqual(await s.setOrderPin(db,owner,request,first.id,input),pinned);
 assert.equal((await s.workspace(db,owner)).orders[0].id,first.id);const list=await s.activeOrderList(db,owner,w.outletId);assert.equal(list.rows[0].id,first.id);assert(list.rows[0].pinned);assert(list.more);assert.equal((await detail(first.id)).pinned,true);assert.deepEqual(await frozen(),before);
 await s.setOrderPin(db,owner,key(),first.id,{pinned:false,version:1});assert.equal((await detail(first.id)).pinned,false);
});
test('VIP changes retain waiter assignment, outlet, tenant, role, native and row-security boundaries',async()=>{
 const order=await qr('ORDER_ONLY'),waiter={...owner,role:'WAITER' as const};await s.setOrderPin(db,waiter,key(),order.id,{pinned:true,version:0});
 for(const actor of [foreign,{...owner,role:'KITCHEN' as const},{...owner,role:'ACCOUNTANT' as const},{...owner,application:'POS' as const},{...owner,role:'CASHIER' as const,outletIds:[]},{...owner,role:'WAITER' as const,employeeId:foreign.employeeId}])await assert.rejects(s.setOrderPin(db,actor,key(),order.id,{pinned:false,version:1}));
 assert.equal((await detail(order.id)).pinned,true);await db.transaction(foreign.restroId,async tx=>assert.equal((await tx.query('SELECT * FROM order_pins WHERE order_id=$1',[order.id])).rows.length,0));
 const rls=(await db.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='order_pins'::regclass")).rows[0];assert(rls.relrowsecurity&&rls.relforcerowsecurity);
});
test('VIP optimistic conflicts are atomic, closed orders cannot be newly pinned and unpin remains possible',async()=>{
 const o=await s.createRound(db,owner,key(),{outletId:w.outletId,type:'TAKEAWAY',items:[{itemId:w.menu[0].id,quantity:1}]});const results=await Promise.allSettled([s.setOrderPin(db,owner,key(),o.id,{pinned:true,version:0}),s.setOrderPin(db,owner,key(),o.id,{pinned:true,version:0})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 await s.decideRound(db,owner,key(),o.id,o.rounds[0].id,{version:o.rounds[0].version,decision:'REJECT',reason:'Synthetic rejection'});
 await assert.rejects(s.setOrderPin(db,owner,key(),o.id,{pinned:true,version:1}),{code:'ORDER_CLOSED'});await s.setOrderPin(db,owner,key(),o.id,{pinned:false,version:1});
 assert.equal((await s.verifyAudit(db,owner)).valid,true);
});
test('current and legacy order-only QR acceptance release once; accepted legacy rounds require explicit staff release',async()=>{
 for(const legacy of [false,true]){const o=await qr('ORDER_ONLY',legacy),before=await frozen(),accepted=await accept(o);assert.equal(accepted.rounds[0].kot_status,'RELEASED');assert.equal(accepted.rounds[0].payment_gate,'QR_ORDER_ONLY');assert.equal(Number(accepted.rounds[0].paid),0);assert.equal(accepted.rounds[0].postpaid_authorized,false);assert.equal((await s.workspace(db,owner)).tickets.filter((t:any)=>t.round_id===accepted.rounds[0].id).length,1);assert((await frozen()).invoices instanceof Array);assert.deepEqual((await frozen()).invoices,before.invoices)}
 let old=await qr('ORDER_ONLY',true);old=await accept(old,false);assert.equal(old.rounds[0].kot_status,'HELD');const before=await frozen(),request=key(),input={version:old.rounds[0].version,decision:'ACCEPT' as const};const released=await s.decideRound(db,owner,request,old.id,old.rounds[0].id,input,true);await s.decideRound(db,owner,request,old.id,old.rounds[0].id,input,true);assert.equal(released.rounds[0].kot_status,'RELEASED');
 const after=await frozen();assert.equal((after.stock_movements as any[]).length,(before.stock_movements as any[]).length+1);await assert.rejects(accept(released),{code:'INVALID_STATE'});assert.deepEqual(await frozen(),after);
});
test('integrated-payment QR stays held until acceptance and separate manager postpaid authorization, including legacy prepaid outlets',async()=>{
 for(const legacy of [false,true]){const o=await qr('PAYMENT',legacy);await assert.rejects(s.authorizePostpaid(db,owner,key(),o.id,o.rounds[0].id,{version:o.rounds[0].version},true),{code:'ORDER_NOT_ACCEPTED'});const accepted=await accept(o);assert.equal(accepted.rounds[0].kot_status,'HELD');
  await assert.rejects(s.authorizePostpaid(db,{...owner,role:'CASHIER'},key(),o.id,accepted.rounds[0].id,{version:accepted.rounds[0].version},true),{code:'FORBIDDEN'});
  const released=await s.authorizePostpaid(db,owner,key(),o.id,accepted.rounds[0].id,{version:accepted.rounds[0].version},true);assert.equal(released.rounds[0].kot_status,'RELEASED');assert.equal(released.rounds[0].postpaid_authorized,true);assert.equal(Number(released.rounds[0].paid),0);
 }
});
test('legacy QR recovery rejects unresolved payments, wrong mode, stale state and non-web calls without consuming stock',async()=>{
 let o=await qr('PAYMENT',true);o=await accept(o,false);await s.reviewRewards(db,owner,key(),o.id,o.rounds[0].id);await s.initiatePayment(db,owner,key(),o.id,o.rounds[0].id,{version:o.rounds[0].version,method:'CASH',amount:Number(o.rounds[0].payable)});await mode('ORDER_ONLY');const before=await frozen();
 await assert.rejects(accept(o),{code:'PAYMENT_RECONCILIATION_REQUIRED'});assert.deepEqual(await frozen(),before);
 const clean=await qr('ORDER_ONLY',true),held=await accept(clean,false);await assert.rejects(accept(held,false),{code:'INVALID_STATE'});await mode('PAYMENT');await assert.rejects(accept(held),{code:'INVALID_STATE'});assert.equal((await detail(held.id)).rounds[0].kot_status,'HELD');
});
test('loyalty review is optional for web receipt recording after an adjustment; amount and native quote guards remain',async()=>{
 const o=await s.createRound(db,owner,key(),{outletId:w.outletId,type:'TAKEAWAY',customer:{name:'Optional Loyalty Guest',phone:'9123456718'},items:[{itemId:w.menu[0].id,quantity:1}]},true);
 const changed=await s.changeRoundAdjustments(db,owner,key(),o.id,o.rounds[0].id,{version:o.rounds[0].version,discount:101,roundToRupee:true,roundingMode:'DOWN'});
 const current=await detail(o.id),round=current.rounds[0],input={version:round.version,method:'CASH' as const,amount:Number(round.payable)};assert.equal(round.quote_version,null);assert.equal(changed.rounds[0].version,round.version);
 await assert.rejects(s.recordPayment(db,owner,key(),o.id,round.id,input),{code:'ENTITLEMENTS_REQUIRED'});
 const paid=(await s.recordPayment(db,owner,key(),o.id,round.id,input,true)).order;assert.equal(Number(paid.rounds[0].paid),Number(round.payable));assert.equal(Number(paid.rounds[0].payable),Number(round.payable));assert.equal(Number(paid.rounds[0].discount),Number(round.discount));assert.equal(paid.rounds[0].payment_status,'PAID');
});
test('VIP status reaches kitchen and service priorities without creating tickets or advancing stages',async()=>{
 const a=await accept(await qr('ORDER_ONLY')),b=await accept(await qr('ORDER_ONLY'));const before=await frozen();await s.setOrderPin(db,owner,key(),a.id,{pinned:true,version:0});
 let state=await s.workspace(db,owner);assert.equal(state.tickets[0].order_id,a.id);assert(state.tickets[0].pinned);assert.equal(state.tickets.find((t:any)=>t.order_id===a.id)?.status,'RELEASED');assert.deepEqual(await frozen(),before);
 for(const o of [a,b])for(const t of state.tickets.filter((t:any)=>t.order_id===o.id)){await s.kitchenDecision(db,owner,key(),t.id,{state:'PREPARING'});await s.kitchenDecision(db,owner,key(),t.id,{state:'READY'})}
 state=await s.workspace(db,owner);assert.equal(state.readyTickets[0].order_id,a.id);assert(state.readyTickets[0].pinned);
});
