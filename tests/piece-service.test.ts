import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createEmbeddedDatabase,createPostgresDatabase,type Database} from '@dinerdost/database';
import {wholeUnit,type Actor} from '@dinerdost/core';
import * as s from '@dinerdost/services';
let db:Database,owner:Actor,w:any;
const key=()=>randomUUID();
before(async()=>{
 db=process.env.TEST_DATABASE_URL?createPostgresDatabase(process.env.TEST_DATABASE_URL):await createEmbeddedDatabase();await db.migrate();await db.migrate();
 const a=await s.signup(db,{name:'Piece QA',email:'piece-qa@example.test',password:'piece-service-test-password',restaurant:'Piece QA',outlet:'Main',qrEnabled:true,demo:true},'piece-qa');owner=await s.authenticate(db,a.token);w=await s.workspace(db,owner);
});
after(async()=>{await db?.close()});
const order=(itemId:string,quantity=1,extra={})=>s.createRound(db,owner,key(),{outletId:w.outletId,type:'TAKEAWAY',items:[{itemId,quantity}],...extra},true);
const dish=(unit:string='piece')=>s.saveMenu(db,owner,key(),{outletId:w.outletId,name:'Piece dish '+key().slice(0,6),category:'Food',price:10000,taxBps:0,station:'Piece kitchen',unit,stream:'FOOD'});
test('piece is an integer selling unit for staff and QR, snapshots the entered unit and preserves exact recipe usage',async()=>{
 assert(wholeUnit('piece'));assert(!wholeUnit('kg'));assert(!wholeUnit('L'));
 const ingredient=await s.addIngredient(db,owner,key(),{outletId:w.outletId,name:'Piece recipe '+key(),unit:'kg'});
 const batch=await s.receiveStock(db,owner,key(),{ingredientId:ingredient.id,batchNumber:key(),quantityMilli:10000,unitCost:1000,reference:'Synthetic piece recipe',expiresAt:new Date(Date.now()+72*3600000).toISOString()},true);
 const item=await s.saveMenu(db,owner,key(),{outletId:w.outletId,name:'Recipe piece '+key().slice(0,6),category:'Food',price:15000,taxBps:0,station:'Piece kitchen',unit:'piece',recipe:[{id:ingredient.id,quantityMilli:250}]});
 await assert.rejects(order(item.id,1.5),{code:'WHOLE_QUANTITY_REQUIRED'});
 const created=await order(item.id,2);assert.equal(created.rounds[0].items[0].unit_snapshot,'piece');assert.equal(Number(created.rounds[0].items[0].quantity_milli),2000);assert.equal(Number(created.totals.subtotal),30000);
 assert.equal(Number((await s.workspace(db,owner)).batches.find((b:any)=>b.id===batch.id).on_hand),9500);
 const table=w.tables[0];await s.openSession(db,owner,key(),{tableId:table.id,guests:2});const guest=await s.connectGuest(db,table.public_key,'piece-guest','piece-guest');
 await assert.rejects(s.guestSubmit(db,table.public_key,guest.token,'piece-guest',key(),{name:'Piece Guest',phone:'9123456763',items:[{itemId:item.id,quantity:0.5}]}),{code:'WHOLE_QUANTITY_REQUIRED'});
});
test('adding/editing piece units never rewrites prior orders or their recorded weight/amounts',async()=>{
 let item=await dish('kg');const old=await order(item.id,1.5);const before=await s.getOrder(db,owner,old.id);
 const saved=(await s.workspace(db,owner)).menu.find((m:any)=>m.id===item.id);
 await s.saveMenu(db,owner,key(),{id:item.id,version:saved.version,outletId:w.outletId,name:saved.name,category:saved.category,price:Number(saved.price),taxBps:Number(saved.tax_bps),station:saved.station,unit:'piece'});
 assert.deepEqual(await s.getOrder(db,owner,old.id),before);assert.equal(before.rounds[0].items[0].unit_snapshot,'kg');
 const next=await order(item.id,2);assert.equal(next.rounds[0].items[0].unit_snapshot,'piece');
});
test('ready notification takes web service staff to Service but retains kitchen and native application destinations',async()=>{
 const item=await dish(),created=await order(item.id);const ticket=(await s.workspace(db,owner)).tickets.find((t:any)=>t.order_id===created.id);
 await s.kitchenDecision(db,owner,key(),ticket.id,{state:'PREPARING'});await s.kitchenDecision(db,owner,key(),ticket.id,{state:'READY'});
 for(const role of ['OWNER','MANAGER','CASHIER'] as const){const feed=await s.notificationInbox(db,{...owner,role,outletIds:[w.outletId]},{outletId:w.outletId});const ready=feed.items.find((n:any)=>n.kind==='ORDER_READY'&&n.title.includes('#'+created.number));assert(ready);assert.equal(ready.path,'/app/tasks#ready-orders');}
 const chef=await s.notificationInbox(db,{...owner,role:'KITCHEN',outletIds:[w.outletId]},{outletId:w.outletId});assert.equal(chef.items.find((n:any)=>n.kind==='ORDER_READY')?.path,'/app/kitchen');
 const pos=await s.notificationInbox(db,{...owner,role:'CASHIER',application:'POS',outletIds:[w.outletId]},{outletId:w.outletId});assert.equal(pos.items.find((n:any)=>n.kind==='ORDER_READY')?.path,'/app/orders/'+created.id);
 const detail=await s.getOrder(db,owner,created.id);assert.equal(detail.rounds[0].kot_status,'READY');assert.equal(Number(detail.totals.paid),0);
});
test('a ready notification cannot bypass all-station service readiness or waiter ownership',async()=>{
 const item=await dish(),created=await s.createRound(db,owner,key(),{outletId:w.outletId,type:'TAKEAWAY',items:[{itemId:item.id,quantity:1},{itemId:w.menu[0].id,quantity:1}]},true);
 const tickets=(await s.workspace(db,owner)).tickets.filter((t:any)=>t.order_id===created.id);assert.equal(tickets.length,2);
 await s.kitchenDecision(db,owner,key(),tickets[0].id,{state:'PREPARING'});await s.kitchenDecision(db,owner,key(),tickets[0].id,{state:'READY'});
 await assert.rejects(s.serveRound(db,owner,key(),created.id,created.rounds[0].id),{code:'FOOD_NOT_READY'});
 await assert.rejects(s.serveRound(db,{...owner,role:'WAITER',employeeId:key(),outletIds:[w.outletId]},key(),created.id,created.rounds[0].id));
});
