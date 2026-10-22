import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createEmbeddedDatabase,createPostgresDatabase,type Database} from '@dinerdost/database';
import type {Actor} from '@dinerdost/core';
import * as s from '@dinerdost/services';
let db:Database,owner:Actor,foreign:Actor,manager:Actor,w:any;
const key=()=>randomUUID();
before(async()=>{
 db=process.env.TEST_DATABASE_URL?createPostgresDatabase(process.env.TEST_DATABASE_URL):await createEmbeddedDatabase();
 await db.migrate();await db.migrate();
 for(const index of [0,1]){
  const account=await s.signup(db,{name:'Latest QA',email:`latest-batch-${index}@example.test`,password:'latest-batch-test-password',restaurant:'Latest batch '+index,outlet:'Main',qrEnabled:true,demo:true},'latest-batch-'+index);
  const actor=await s.authenticate(db,account.token);if(index)foreign=actor;else owner=actor;
 }
 w=await s.workspace(db,owner);
 const invitation=await s.createStaffInvitation(db,owner,key(),{name:'Latest manager',email:'latest-manager@example.test',role:'MANAGER',outletIds:[w.outletId]});
 const account=await s.acceptStaffInvitation(db,invitation.token,{name:'Latest manager',password:'latest-manager-password'},'latest-manager');
 manager=await s.authenticate(db,account.token);
});
after(async()=>{await db?.close()});
async function history(){return db.transaction(owner.restroId,async tx=>{const result:Record<string,unknown>={};for(const table of ['invoices','payment_attempts','stock_movements','order_item_costs'])result[table]=(await tx.query(`SELECT * FROM ${table} ORDER BY ${table==='order_item_costs'?'order_item_id':'id'}`)).rows;return result})}
async function ticketFixture(){
 const items=[];
 for(const station of ['Latest hot','Latest cold'])items.push(await s.saveMenu(db,owner,key(),{outletId:w.outletId,name:station+' '+key().slice(0,6),category:'Food',price:10000,taxBps:0,station,unit:'portion',stream:'FOOD'}));
 const orders:any[]=[];
 for(const index of [0,1])orders.push(await s.createRound(db,owner,key(),{outletId:w.outletId,type:'TAKEAWAY',customer:{name:'Latest Guest',phone:'9123456762'},items:items.slice(0,index?1:2).map(item=>({itemId:item.id,quantity:1}))},true));
 const tickets=(await s.workspace(db,owner)).tickets.filter((ticket:any)=>orders.some(order=>order.id===ticket.order_id));
 assert.equal(tickets.length,3);assert(tickets.every((ticket:any)=>ticket.status==='RELEASED'));
 return {orders,tickets};
}
test('dismissal survives workspace reads and reauthentication, is idempotent, and leaves source history intact',async()=>{
 const before=await history(), signature=(await s.stockAlerts(db,owner,{outletId:w.outletId})).signature;
 const commandKey=key(),input={outletId:w.outletId,kind:'STOCK',stateKey:signature};
 await s.dismissAlert(db,owner,commandKey,input);await s.dismissAlert(db,owner,commandKey,input);await s.dismissAlert(db,owner,key(),input);
 const account=await s.login(db,{email:'latest-batch-0@example.test',password:'latest-batch-test-password'},'latest-repeat-login');
 const refreshed=await s.authenticate(db,account.token);
 assert((await s.workspace(db,refreshed)).uiDismissals.includes('STOCK:'+signature));
 const count=await db.transaction(owner.restroId,tx=>tx.query('SELECT count(*)::int AS count FROM ui_alert_dismissals WHERE employee_id=$1 AND state_key=$2',[owner.employeeId,signature]));
 assert.equal(count.rows[0].count,1);assert.deepEqual(await history(),before);
});
test('dismissal is scoped to employee and outlet and does not hide source Overview records',async()=>{
 const stateKey='review-'+key();
 const before=await s.workspace(db,owner);
 await s.dismissAlert(db,owner,key(),{outletId:w.outletId,kind:'OVERVIEW',stateKey});
 const own=await s.workspace(db,owner);assert(own.uiDismissals.includes('OVERVIEW:'+stateKey));assert.deepEqual(own.alerts,before.alerts);
 assert(!(await s.workspace(db,manager)).uiDismissals.includes('OVERVIEW:'+stateKey));
 const other=await s.saveOutlet(db,owner,key(),{name:'Latest second',code:'ZZLATEST2',qrEnabled:false,taxBps:0});
 assert(!(await s.workspace(db,owner,other.id)).uiDismissals.includes('OVERVIEW:'+stateKey));
 assert(!(await s.workspace(db,foreign)).uiDismissals.includes('OVERVIEW:'+stateKey));
});
test('dismissal denies unauthorized roles, outlets and cross-tenant foreign keys',async()=>{
 await assert.rejects(s.dismissAlert(db,{...owner,role:'WAITER'},key(),{outletId:w.outletId,kind:'STOCK',stateKey:'denied'}),/role|unavailable/i);
 await assert.rejects(s.dismissAlert(db,{...manager,outletIds:[]},key(),{outletId:w.outletId,kind:'OVERVIEW',stateKey:'denied'}),/outlet/i);
 await assert.rejects(s.dismissAlert(db,foreign,key(),{outletId:w.outletId,kind:'STOCK',stateKey:'denied'}));
});
test('stock alert signature is stable without changes and a later no-stock episode resurfaces',async()=>{
 const ingredient=await s.addIngredient(db,owner,key(),{outletId:w.outletId,name:'Latest signature '+key(),unit:'kg'});
 const first=await s.stockAlerts(db,owner,{outletId:w.outletId});
 assert.equal(first.signature,(await s.stockAlerts(db,owner,{outletId:w.outletId})).signature);
 await s.dismissAlert(db,owner,key(),{outletId:w.outletId,kind:'STOCK',stateKey:first.signature});
 const receipt=await s.receiveStock(db,owner,key(),{ingredientId:ingredient.id,batchNumber:key(),quantityMilli:1000,unitCost:500,reference:'Latest synthetic receipt',expiresAt:new Date(Date.now()+72*3600000).toISOString()},true);
 await s.wasteStock(db,owner,key(),{batchId:receipt.id,quantityMilli:1000,reason:'Synthetic returned-to-zero episode'});
 const changed=await s.stockAlerts(db,owner,{outletId:w.outletId});assert.notEqual(changed.signature,first.signature);
 assert(!(await s.workspace(db,owner)).uiDismissals.includes('STOCK:'+changed.signature));
});
test('bulk kitchen forwarding transitions selected tickets once and service waits for every station',async()=>{
 const {orders,tickets}=await ticketFixture(),before=await history();
 const input={outletId:w.outletId,from:'RELEASED',ticketIds:tickets.map((ticket:any)=>ticket.id)},commandKey=key();
 assert.equal((await s.kitchenBulk(db,owner,commandKey,input)).forwarded,3);assert.equal((await s.kitchenBulk(db,owner,commandKey,input)).forwarded,3);
 const multi=tickets.filter((ticket:any)=>ticket.order_id===orders[0].id);
 await s.kitchenBulk(db,owner,key(),{outletId:w.outletId,from:'PREPARING',ticketIds:[multi[0].id]});
 await assert.rejects(s.serveRound(db,owner,key(),orders[0].id,orders[0].rounds[0].id),/Every station/i);
 await s.kitchenBulk(db,owner,key(),{outletId:w.outletId,from:'PREPARING',ticketIds:[multi[1].id]});
 await s.serveRound(db,owner,key(),orders[0].id,orders[0].rounds[0].id);
 const served=await s.getOrder(db,owner,orders[0].id);assert.equal(served.rounds[0].kot_status,'SERVED');
 assert.equal(Number(served.totals.payable),Number(orders[0].totals.payable));assert.equal(Number(served.totals.paid),0);
 assert.deepEqual(await history(),before);
});
test('a stale selection rolls the whole bulk command back without a partial transition or audit',async()=>{
 const {tickets}=await ticketFixture();
 await s.kitchenDecision(db,owner,key(),tickets[0].id,{state:'PREPARING'});
 const before=await db.transaction(owner.restroId,tx=>tx.query('SELECT id,status FROM kot_tickets WHERE id=ANY($1::uuid[]) ORDER BY id',[tickets.map((ticket:any)=>ticket.id)]));
 const audit=await s.verifyAudit(db,owner);
 await assert.rejects(s.kitchenBulk(db,owner,key(),{outletId:w.outletId,from:'RELEASED',ticketIds:tickets.map((ticket:any)=>ticket.id)}),/already changed/i);
 assert.deepEqual(await db.transaction(owner.restroId,tx=>tx.query('SELECT id,status FROM kot_tickets WHERE id=ANY($1::uuid[]) ORDER BY id',[tickets.map((ticket:any)=>ticket.id)])),before);
 assert.deepEqual(await s.verifyAudit(db,owner),audit);
});
test('bulk forwarding rejects duplicate, over-limit, cross-outlet and cross-tenant selections and unauthorized roles',async()=>{
 const {tickets}=await ticketFixture(),ticket=tickets[0].id;
 const input={outletId:w.outletId,from:'RELEASED',ticketIds:[ticket]};
 await assert.rejects(s.kitchenBulk(db,owner,key(),{...input,ticketIds:[ticket,ticket]}),/once/i);
 await assert.rejects(s.kitchenBulk(db,owner,key(),{...input,ticketIds:Array.from({length:21},key)}));
 await assert.rejects(s.kitchenBulk(db,{...owner,role:'CASHIER'},key(),input),/role/i);
 await assert.rejects(s.kitchenBulk(db,foreign,key(),input));
 await assert.rejects(s.kitchenBulk(db,{...manager,outletIds:[]},key(),input),/outlet/i);
 await assert.rejects(s.kitchenBulk(db,owner,key(),{...input,outletId:key()}),/unavailable/i);
});
test('kitchen/bar bulk operations and read models retain stream isolation',async()=>{
 const {tickets}=await ticketFixture();
 await assert.rejects(s.kitchenBulk(db,{...owner,role:'BARTENDER'},key(),{outletId:w.outletId,from:'RELEASED',ticketIds:[tickets[0].id]}),/stream/i);
 const food=await s.workspace(db,{...owner,role:'KITCHEN'}),bar=await s.workspace(db,{...owner,role:'BARTENDER'});
 assert(food.tickets.every((ticket:any)=>ticket.production_stream==='FOOD'));
 assert(bar.tickets.every((ticket:any)=>ticket.production_stream==='BAR'));
});


