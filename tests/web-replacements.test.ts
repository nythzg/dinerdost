import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createEmbeddedDatabase,createPostgresDatabase,type Database} from '@dinerdost/database';
import {businessDate,type Actor} from '@dinerdost/core';
import * as s from '@dinerdost/services';
let db:Database,owner:Actor,foreign:Actor,w:any,menuId:string,materialId:string,serial=0;
const key=()=>randomUUID();
before(async()=>{
 db=process.env.TEST_DATABASE_URL?createPostgresDatabase(process.env.TEST_DATABASE_URL):await createEmbeddedDatabase();await db.migrate();
 for(const n of [0,1]){const account=await s.signup(db,{name:'Replacement QA',email:`replacement-${n}@example.test`,password:'replacement-test-password',restaurant:'Replacement '+n,outlet:'Main',qrEnabled:true,demo:true},'replacement-'+n);if(n)foreign=await s.authenticate(db,account.token);else owner=await s.authenticate(db,account.token)}
 w=await s.workspace(db,owner);materialId=(await s.addIngredient(db,owner,key(),{outletId:w.outletId,name:'Replacement synthetic ingredient',unit:'kg'})).id;
 await s.receiveStock(db,owner,key(),{ingredientId:materialId,batchNumber:key(),quantityMilli:500000,unitCost:523,reference:'Synthetic replacement stock',expiresAt:new Date(Date.now()+172800000).toISOString()},true);
 menuId=(await s.saveMenu(db,owner,key(),{outletId:w.outletId,name:'Replacement dish',category:'Food',price:10000,taxBps:500,station:'Replacement kitchen',recipe:[{id:materialId,quantityMilli:1000}]})).id;
});
after(async()=>db?.close());
async function paid(final=false,service={}){
 const o=await s.createRound(db,owner,key(),{outletId:w.outletId,type:'TAKEAWAY',items:[{itemId:menuId,quantity:1}],customer:{name:'Replacement guest '+ ++serial,phone:'918340'+String(serial).padStart(4,'0')},...service},true);
 await s.recordPayment(db,owner,key(),o.id,o.rounds[0].id,{version:o.rounds[0].version,method:'CASH',amount:Number(o.totals.payable)},true);
 let current=await s.getOrder(db,owner,o.id);
 if(final){await s.completePreparedService(db,owner,key(),o.id,current.rounds[0].id,{version:current.rounds[0].version,confirmedPreparedAndServed:true});await s.generateBill(db,owner,key(),o.id,{final:true})}
 else await s.generateBill(db,owner,key(),o.id,{final:false});
 return s.getOrder(db,owner,o.id);
}
const input=(o:any,quantity=1,extra={})=>({version:o.version,items:[{itemId:menuId,quantity}],expectedPayable:10500*quantity,reason:'Synthetic guest requested replacement',discardUnserved:true,confirmed:true as const,...extra});
const period=()=>({outletId:w.outletId,from:businessDate(),to:businessDate()});
async function finish(o:any){let current=await s.getOrder(db,owner,o.id);const round=current.rounds[0];if(Number(round.paid)<Number(round.payable))await s.recordPayment(db,owner,key(),o.id,round.id,{version:round.version,method:'CASH',amount:Number(round.payable)-Number(round.paid)},true);current=await s.getOrder(db,owner,o.id);await s.completePreparedService(db,owner,key(),o.id,round.id,{version:current.rounds[0].version,confirmedPreparedAndServed:true});return s.generateBill(db,owner,key(),o.id,{final:true})}

test('equal paid replacement preserves original money, invoices, FIFO costs and service truth; creates a linked credit without new receipts',async()=>{
 const o=await paid(),beforeReport=await s.financialReport(db,owner,period()),beforeCosts=await db.query('SELECT * FROM order_item_costs WHERE round_id=$1 ORDER BY order_item_id',[o.rounds[0].id]),originalPayments=o.rounds[0].payments,request=key(),data=input(o);
 const result=await s.replacePaidOrder(db,owner,request,o.id,data);assert.equal((await s.replacePaidOrder(db,owner,request,o.id,data)).replacementId,result.replacementId);
 const old=await s.getOrder(db,owner,o.id),target=result.order,r=target.rounds[0];
 assert.deepEqual(old.invoices,o.invoices);assert.deepEqual(old.rounds[0].payments,originalPayments);assert.deepEqual(old.totals,o.totals);assert.deepEqual(old.rounds[0].items,o.rounds[0].items);assert.equal(old.rounds[0].kot_status,'CANCELLED');assert.notEqual(old.rounds[0].kot_status,'SERVED');assert.equal(old.status,'VOIDED');
 assert.deepEqual(await db.query('SELECT * FROM order_item_costs WHERE round_id=$1 ORDER BY order_item_id',[o.rounds[0].id]),beforeCosts);
 assert.equal(Number(r.paid),10500);assert.equal(r.payment_status,'PAID');assert.equal(r.payments.length,0);assert.notEqual(r.kot_status,'SERVED');assert.equal((await s.webRefunds(db,owner,o.id)).available,0);assert.equal((await s.webRefunds(db,owner,target.id)).available,10500);
 await assert.rejects(s.generateBill(db,owner,key(),target.id,{final:true}),{code:'SETTLEMENT_NOT_READY'});await assert.rejects(s.generateBill(db,owner,key(),o.id,{final:true}),{code:'ALREADY_REPLACED'});
 const invoice=await finish(target),report=await s.financialReport(db,owner,period());assert.equal(report.receipts,beforeReport.receipts+10500);assert.equal(report.cogs,beforeReport.cogs+1046);assert.equal(invoice.snapshot.replacement.sourceOrderId,o.id);assert.equal(invoice.snapshot.replacement.credit,10500);
 const record=await s.getWebReplacementDocument(db,owner,result.replacementId);assert.deepEqual(record.snapshot.original.invoices,JSON.parse(JSON.stringify(o.invoices)));assert.equal(record.allocations[0].paymentId,originalPayments[0].id);assert.equal((await s.verifyAudit(db,owner)).valid,true);
 await assert.rejects(db.transaction(owner.restroId,tx=>tx.query('UPDATE web_replacements SET amount=1 WHERE id=$1',[record.id])));
});

test('a higher replacement credits the original paid invoice once and collects only extra; reports reconcile tax, methods, costs and existing rewards',async()=>{
 const o=await paid(true),baseline=await s.financialReport(db,owner,period()),ledger=await db.query("SELECT * FROM loyalty_ledger WHERE order_id=$1 AND state<>'PENDING_EARN' ORDER BY id",[o.id]);
 const result=await s.replacePaidOrder(db,owner,key(),o.id,input(o,2));assert.equal(result.order.rounds[0].payment_status,'PARTIALLY_PAID');assert.equal(Number(result.order.rounds[0].paid),10500);assert.equal(result.order.totals.outstanding,10500);
 const original=await s.getOrder(db,owner,o.id);assert.deepEqual(original.rounds,o.rounds);assert.deepEqual(original.invoices,o.invoices);assert.deepEqual(await db.query("SELECT * FROM loyalty_ledger WHERE order_id=$1 AND state<>'PENDING_EARN' ORDER BY id",[o.id]),ledger);
 await finish(result.order);const report=await s.financialReport(db,owner,period());assert.equal(report.receipts,baseline.receipts+10500);assert.equal(report.netSales,baseline.netSales+10000);assert.equal(report.tax,baseline.tax+500);assert.equal(report.cogs,baseline.cogs+1046);assert.equal(report.methods.reduce((n,r)=>n+Number(r.amount),0),baseline.methods.reduce((n,r)=>n+Number(r.amount),0)+10500);
 const points=await db.query("SELECT sum(points) AS points FROM loyalty_ledger WHERE order_id=ANY($1::uuid[]) AND state='EARNED'",[[o.id,result.order.id]]),policy=await db.query('SELECT earn_bps FROM outlets WHERE id=$1',[w.outletId]);assert.equal(Number(points.rows[0].points),Math.floor(20000*Number(policy.rows[0].earn_bps)/1000000));
});

test('final payable includes discounts, tax, named charges and rounding, with stale-price and owner-only charge enforcement',async()=>{
 const o=await paid(),before=await db.query('SELECT count(*) AS count FROM orders');
 await assert.rejects(s.replacePaidOrder(db,owner,key(),o.id,input(o,1,{discount:1,expectedPayable:10499})),{code:'REPLACEMENT_BELOW_ORIGINAL'});
 await assert.rejects(s.replacePaidOrder(db,owner,key(),o.id,input(o,1,{expectedPayable:99999})),{code:'QUOTE_CHANGED'});
 await assert.rejects(s.replacePaidOrder(db,{...owner,role:'MANAGER'},key(),o.id,input(o,1,{charges:[{name:'Packaging',amount:100}],expectedPayable:10600})),{code:'FORBIDDEN'});
 assert.deepEqual(await db.query('SELECT count(*) AS count FROM orders'),before);
 const replacement=await s.replacePaidOrder(db,owner,key(),o.id,input(o,1,{discount:1000,charges:[{name:'Packaging',amount:1050}]}));assert.equal(Number(replacement.order.rounds[0].tax),450);assert.equal(replacement.order.totals.payable,10500);
});

test('partially refunded receipts give only their real remaining credit and replacement edits retain the original payable floor',async()=>{
 const o=await paid(true);await s.submitWebRefund(db,owner,key(),o.id,{version:o.version,invoiceId:o.invoices[0].id,amount:1000,mode:'CASH',reason:'Synthetic original partial refund',confirmed:true});
 const current=await s.getOrder(db,owner,o.id),result=await s.replacePaidOrder(db,owner,key(),o.id,input(current));assert.equal(Number(result.order.rounds[0].paid),9500);assert.equal(result.order.totals.outstanding,1000);assert.equal((await s.webRefunds(db,owner,current.id)).available,0);
 await assert.rejects(s.changeRoundAdjustments(db,owner,key(),result.order.id,result.order.rounds[0].id,{version:result.order.rounds[0].version,discount:100,roundToRupee:false},true),{code:'REPLACEMENT_BELOW_ORIGINAL'});
 await finish(result.order);const invoice=(await s.getOrder(db,owner,result.order.id)).invoices[0];const target=await s.getOrder(db,owner,result.order.id);await s.submitWebRefund(db,owner,key(),target.id,{version:target.version,invoiceId:invoice.id,amount:10500,mode:'CASH',reason:'Synthetic replacement full refund',confirmed:true});assert.equal((await s.webRefunds(db,owner,target.id)).available,0);
});

test('refund/replacement races and duplicate replacements cannot allocate a receipt twice',async()=>{
 const o=await paid(true),results=await Promise.allSettled([s.replacePaidOrder(db,owner,key(),o.id,input(o)),s.submitWebRefund(db,owner,key(),o.id,{version:o.version,invoiceId:o.invoices[0].id,amount:8000,mode:'CASH',reason:'Synthetic competing refund',confirmed:true})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const other=await paid(true),race=await Promise.allSettled([s.replacePaidOrder(db,owner,key(),other.id,input(other)),s.replacePaidOrder(db,owner,key(),other.id,input(other))]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);assert.equal((await db.query('SELECT id FROM web_replacements WHERE source_order_id=$1',[other.id])).rows.length,1);
});

test('authorization, tenant/outlet/native scope, explicit food disposition and insufficient stock reject atomically',async()=>{
 const o=await paid(),before=await s.getOrder(db,owner,o.id);
 for(const actor of [foreign,{...owner,role:'CASHIER' as const},{...owner,role:'MANAGER' as const,outletIds:[]},{...owner,application:'POS' as const}])await assert.rejects(s.replacePaidOrder(db,actor,key(),o.id,input(o)));
 await assert.rejects(s.replacePaidOrder(db,owner,key(),o.id,input(o,1,{discardUnserved:false})),{code:'FOOD_DISPOSITION_REQUIRED'});await assert.rejects(s.replacePaidOrder(db,owner,key(),o.id,input(o,1000)),{code:'OUT_OF_STOCK'});
 assert.deepEqual(await s.getOrder(db,owner,o.id),before);assert.equal((await db.query('SELECT id FROM web_replacements WHERE source_order_id=$1',[o.id])).rows.length,0);
});

test('successive replacements carry the same actual receipt IDs without creating fresh collections or multiplying refundable balances',async()=>{
 const o=await paid(true),first=await s.replacePaidOrder(db,owner,key(),o.id,input(o));await finish(first.order);const firstPaid=await s.getOrder(db,owner,first.order.id),second=await s.replacePaidOrder(db,owner,key(),firstPaid.id,input(firstPaid,2));
 assert.equal((await s.webRefunds(db,owner,o.id)).available,0);assert.equal((await s.webRefunds(db,owner,firstPaid.id)).available,0);const balance=await s.webRefunds(db,owner,second.order.id);assert.equal(balance.available,10500);assert.equal(balance.payments[0].id,o.rounds[0].payments[0].id);assert.equal(second.order.rounds[0].payments.length,0);await finish(second.order);assert.equal((await s.verifyAudit(db,owner)).valid,true);
});

test('refund and replacement credit components reconcile odd paise exactly instead of independently rounding the remainder',async()=>{
 const item=(await s.saveMenu(db,owner,key(),{outletId:w.outletId,name:'Paise reconciliation QA',category:'Food',price:101,taxBps:100,station:'Replacement kitchen',recipe:[{id:materialId,quantityMilli:1}]})).id;
 const o=await paid(true,{items:[{itemId:item,quantity:1}]}),before=await s.financialReport(db,owner,period());assert.equal(o.totals.payable,102);
 const refund=await s.submitWebRefund(db,owner,key(),o.id,{version:o.version,invoiceId:o.invoices[0].id,amount:51,mode:'CASH',reason:'Synthetic odd-paise manual refund',confirmed:true});
 const current=await s.getOrder(db,owner,o.id),r=await s.replacePaidOrder(db,owner,key(),o.id,{...input(current),items:[{itemId:item,quantity:1}],expectedPayable:102});
 const a=await s.getWebRefundDocument(db,owner,refund.id),b=await s.getWebReplacementDocument(db,owner,r.replacementId);assert.equal(Number(a.net_sales)+Number(b.net_sales),101);assert.equal(Number(a.tax)+Number(b.tax),1);assert.equal(Number(a.round_off)+Number(b.round_off),0);
 const report=await s.financialReport(db,owner,period());assert.equal(report.netSales,before.netSales-101);assert.equal(report.tax,before.tax-1);assert.equal(report.receipts,before.receipts-102);
});

test('a closed original table visit cannot capture a later guest; an explicitly selected takeaway replacement retains original documents and RLS',async()=>{
 const session=await s.openSession(db,owner,key(),{tableId:w.tables[0].id,guests:1}),o=await paid(true,{type:'DINE_IN',sessionId:session.id});await s.closeSession(db,owner,key(),session.id,{reason:'Synthetic completed visit'});
 const later=await s.openSession(db,owner,key(),{tableId:w.tables[0].id,guests:1}),before=await db.query('SELECT * FROM table_sessions WHERE id=$1',[later.id]);
 await assert.rejects(s.replacePaidOrder(db,owner,key(),o.id,input(o)),{code:'SESSION_CLOSED'});
 const result=await s.replacePaidOrder(db,owner,key(),o.id,input(o,1,{fulfillment:'TAKEAWAY'}));assert.equal(result.order.session_id,null);assert.equal(result.order.type,'TAKEAWAY');assert.deepEqual(await db.query('SELECT * FROM table_sessions WHERE id=$1',[later.id]),before);
 assert.equal((await db.transaction(foreign.restroId,tx=>tx.query('SELECT id FROM web_replacements WHERE id=$1',[result.replacementId]))).rows.length,0);await assert.rejects(s.getWebReplacementDocument(db,foreign,result.replacementId));assert.deepEqual((await s.getOrder(db,owner,o.id)).invoices,o.invoices);
});

test('locked original loyalty and coupons are redeemed once only at actual replacement settlement',async()=>{
 for(const kind of ['points','coupon']){
  let o=await s.createRound(db,owner,key(),{outletId:w.outletId,type:'TAKEAWAY',items:[{itemId:menuId,quantity:1}],customer:{name:'Replacement reward guest '+ ++serial,phone:'918340'+String(serial).padStart(4,'0')}},true);
  let couponId:string|undefined;
  if(kind==='points'){
   const balance=await s.createRound(db,owner,key(),{outletId:w.outletId,type:'TAKEAWAY',items:[{itemId:menuId,quantity:1}],customer:{name:o.customer_snapshot.name,phone:o.customer_snapshot.phone}},true);
   await db.transaction(owner.restroId,async tx=>{await tx.query('UPDATE customers SET otp_verified=true WHERE id=$1',[o.customer_id]);await tx.query("INSERT INTO loyalty_ledger(id,restro_id,outlet_id,customer_id,order_id,round_id,state,points,reason) VALUES($1,$2,$3,$4,$5,$6,'EARNED',1000,'Synthetic opening reward balance')",[key(),owner.restroId,w.outletId,o.customer_id,balance.id,balance.rounds[0].id])});
   o=(await s.applyEntitlement(db,owner,key(),o.id,o.rounds[0].id,{version:o.rounds[0].version,amount:100},true)).order;
  }else{
   couponId=key();const code='RP-'+key();await db.transaction(owner.restroId,tx=>tx.query("INSERT INTO coupons(id,restro_id,outlet_id,code,discount_amount,expires_at) VALUES($1,$2,$3,$4,100,now()+interval '1 day')",[couponId,owner.restroId,w.outletId,code]));o=(await s.applyEntitlement(db,owner,key(),o.id,o.rounds[0].id,{version:o.rounds[0].version,couponCode:code},true)).order;
  }
  await s.recordPayment(db,owner,key(),o.id,o.rounds[0].id,{version:o.rounds[0].version,method:'CASH',amount:o.totals.payable},true);o=await s.getOrder(db,owner,o.id);
  const state=async()=>kind==='points'?(await db.query('SELECT state FROM loyalty_reservations WHERE round_id=$1',[o.rounds[0].id])).rows[0].state:(await db.query('SELECT state FROM coupons WHERE id=$1',[couponId])).rows[0].state;
  assert.equal(await state(),'LOCKED');const result=await s.replacePaidOrder(db,owner,key(),o.id,input(o));assert.equal(await state(),'LOCKED');const invoice=await finish(result.order);assert.equal(await state(),'REDEEMED');
  if(kind==='points'){const rows=(await db.query("SELECT points,settlement_ref FROM loyalty_ledger WHERE round_id=$1 AND state='REDEEMED'",[o.rounds[0].id])).rows;assert.equal(rows.length,1);assert.equal(rows[0].settlement_ref,invoice.id);assert.equal(Number(rows[0].points),-1)}
  assert.equal((await s.verifyAudit(db,owner)).valid,true);
 }
});
