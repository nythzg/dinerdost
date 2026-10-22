import { z } from 'zod';
import type { Database, Sql } from '@dinerdost/database';
import { ensure, integer, isManager, quote, requireOutlet, requirePermission, roundAdjustment, type Actor } from '@dinerdost/core';
import { audit, command, expectedVersion, id, json, num, one, scopedOrder, type Row } from './shared';
import { acceptStaffSubmission, buildItems, insertItems, orderDetail, roundInput } from './orders';
import { snapshotWebKitchenPolicy } from './kitchen-policy';
import { refundBalancesRead } from './web-refunds';
import { releaseStock } from './stock';

const replacementInput = z.object({
 version:z.number().int().positive(), items:z.lazy(()=>roundInput.shape.items),
 discount:z.number().int().min(0).max(1000000000).default(0),
 charges:z.array(z.object({name:z.string().trim().min(1).max(60),amount:z.number().int().positive().max(1000000000)}).strict()).max(20).default([]),
 roundDown:z.boolean().default(false), reason:z.string().trim().min(5).max(500),
 expectedPayable:z.number().int().positive().max(1000000000),
 fulfillment:z.enum(['ORIGINAL_VISIT','TAKEAWAY']).default('ORIGINAL_VISIT'),
 discardUnserved:z.boolean().default(false), confirmed:z.literal(true),
}).strict();

function web(actor:Actor){
 ensure(!actor.application||actor.application==='MASTER','APPLICATION_FORBIDDEN','Use paid replacement in the web workspace.',403);
 requirePermission(actor,'payments');requirePermission(actor,'accept');
 ensure(isManager(actor),'FORBIDDEN','An owner or manager must authorize paid replacement.',403);
}
async function sourceRead(tx:Sql,actor:Actor,orderId:string,lock=false){
 const order=await scopedOrder(tx,actor,orderId,lock), detail=await orderDetail(tx,actor,orderId);
 ensure(!['VOIDED','REJECTED'].includes(order.status),'REPLACEMENT_BLOCKED','This order is already closed without a sale.',409);
 ensure(!(await tx.query('SELECT id FROM web_replacements WHERE source_order_id=$1',[orderId])).rows.length,'ALREADY_REPLACED','This order already has a linked replacement.',409);
 const rounds=detail.rounds.filter(r=>!['REJECTED','VOIDED'].includes(r.status));
 ensure(rounds.length>0&&detail.totals.payable>0&&rounds.every(r=>r.status==='ACCEPTED'&&num(r.paid)===num(r.payable)),'PAID_ORDER_REQUIRED','Every active round must be fully paid before replacement.',409);
 ensure(!(await tx.query("SELECT id FROM payment_attempts WHERE order_id=$1 AND state IN ('INITIATED','AWAITING_VERIFICATION','UNKNOWN')",[orderId])).rows.length,'PAYMENT_ACTIVE','Reconcile pending receipts before replacement.',409);
 const payments=await refundBalancesRead(tx,orderId), available=payments.reduce((n,p)=>n+num(p.available),0);
 ensure(available>0&&available<=detail.totals.paid,'REPLACEMENT_CREDIT_UNAVAILABLE','No unallocated actual payment is available for replacement.',409);
 return {order,detail,rounds,payments,available};
}

export async function webReplacementSource(db:Database,actor:Actor,orderId:string){
 web(actor);z.uuid().parse(orderId);
 return db.transaction(actor.restroId,async tx=>{const v=await sourceRead(tx,actor,orderId);return{order:v.detail,credit:v.available,sessionOpen:!v.order.session_id||!!(await tx.query("SELECT id FROM table_sessions WHERE id=$1 AND status='OPEN'",[v.order.session_id])).rows.length,requiresDiscard:v.rounds.some(r=>!['HELD','SERVED'].includes(r.kot_status)),outlet:await one(tx,'SELECT tax_components,web_round_down_default FROM outlets WHERE id=$1',[v.order.outlet_id]),menu:(await tx.query('SELECT * FROM menu_items WHERE outlet_id=$1 AND active ORDER BY name',[v.order.outlet_id])).rows}});
}

/** Both refunds and replacements serialize on the source order. All writes roll back together. */
export async function replacePaidOrder(db:Database,actor:Actor,key:string,orderId:string,input:unknown){
 web(actor);z.uuid().parse(orderId);const data=replacementInput.parse(input);
 ensure(!data.charges.length||actor.role==='OWNER','FORBIDDEN','Only the owner can configure replacement charges.',403);
 ensure(new Set(data.charges.map(c=>c.name.toLowerCase())).size===data.charges.length,'DUPLICATE_CHARGE','Use each charge name once.');
 return command(db,actor,key,'PAID_ORDER_REPLACED',{orderId,...data},async tx=>{
  const {order,detail,rounds,payments,available}=await sourceRead(tx,actor,orderId,true);expectedVersion(order.version,data.version);
  if(rounds.some(r=>!['HELD','SERVED'].includes(r.kot_status)))ensure(data.discardUnserved,'FOOD_DISPOSITION_REQUIRED','Confirm the original unserved food is discarded; it will not be restored or offered for resale.',409);
  const sessionId=data.fulfillment==='TAKEAWAY'?null:order.session_id;
  if(sessionId){const session=await one(tx,'SELECT status FROM table_sessions WHERE id=$1',[sessionId]);ensure(session.status==='OPEN','SESSION_CLOSED','The original visit is closed. Paid replacement cannot attach to another guest visit.',409);}
  const targetId=id(),roundId=id(),replacementId=id();
  await tx.query("INSERT INTO orders(id,restro_id,outlet_id,session_id,source,type,created_by,status,customer_id,customer_snapshot) VALUES($1,$2,$3,$4,'CASHIER_POS',$5,$6,'PENDING',$7,$8::jsonb)",[targetId,actor.restroId,order.outlet_id,sessionId,data.fulfillment==='TAKEAWAY'?'TAKEAWAY':order.type,actor.employeeId,order.customer_id,json(order.customer_snapshot)]);
  const target=await one(tx,'SELECT * FROM orders WHERE id=$1',[targetId]),items=await buildItems(tx,order.outlet_id,data.items,target.tax_bps_override);
  const total=quote(items.map(i=>({unit_price:num(i.unit_price),quantity_milli:num(i.quantity_milli),tax_bps:num(i.tax_bps)})),data.discount);
  const charges=integer(data.charges.reduce((n,c)=>n+c.amount,0),'Other charges'),beforeRounding=integer(total.payable+charges,'Payable amount'),roundOff=roundAdjustment(beforeRounding,data.roundDown,'DOWN'),payable=beforeRounding+roundOff;
  ensure(payable===data.expectedPayable,'QUOTE_CHANGED','The replacement price or tax changed. Refresh and review before confirming.',409);
  ensure(payable>=detail.totals.payable,'REPLACEMENT_BELOW_ORIGINAL','The replacement final payable, including tax, discount and charges, must be at least the original final payable.',409);
  await tx.query("INSERT INTO order_rounds(id,restro_id,order_id,round_number,status,course,subtotal,discount,manual_discount,tax,charges,charges_total,rounding_enabled,rounding_mode,round_off,payable,paid,payment_status,payment_gate) VALUES($1,$2,$3,1,'PENDING','IMMEDIATE',$4,$5,$5,$6,$7::jsonb,$8,$9,'DOWN',$10,$11,$12,$13,'STAFF')",[roundId,actor.restroId,targetId,total.subtotal,data.discount,total.tax,json(data.charges),charges,data.roundDown,roundOff,payable,available,available===payable?'PAID':'PARTIALLY_PAID']);
  await snapshotWebKitchenPolicy(tx,order.outlet_id,roundId,true);await insertItems(tx,actor.restroId,roundId,items);
  const allocations=payments.filter(p=>num(p.available)>0).map(p=>({paymentId:p.id,roundId:p.round_id,method:p.method,reference:p.reference,amount:num(p.available)}));
  const invoice=detail.invoices.find(i=>i.document_type==='FINAL_TAX_INVOICE')??detail.invoices.find(i=>i.document_type==='PROVISIONAL_BILL');
  // A recognized sale gets an immutable credit adjustment. Unbilled food costs
  // are expensed once here; the replacement consumes and records its own FIFO.
  const recognized=invoice?.document_type==='FINAL_TAX_INVOICE',gross=detail.totals.payable;
  const refunded=await one(tx,'SELECT coalesce(sum(net_sales),0) AS net_sales,coalesce(sum(tax),0) AS tax,coalesce(sum(charges),0) AS charges FROM web_refunds WHERE order_id=$1',[orderId]);
  // Subtract already-frozen refund components, rather than rounding the
  // remainder independently. Refund + credit must reconcile every paise.
  const netSales=recognized?detail.totals.subtotal-detail.totals.discount-num(refunded.net_sales):0,tax=recognized?detail.totals.tax-num(refunded.tax):0,creditCharges=recognized?detail.totals.charges-num(refunded.charges):0,creditRoundOff=recognized?available-netSales-tax-creditCharges:0;
  const unbilledCogs=recognized?0:rounds.reduce((n,r)=>n+num(r.cogs),0);
  const snapshot={number:'RP-'+replacementId.slice(0,8).toUpperCase(),sourceOrderId:orderId,sourceOrderNumber:order.number,targetOrderId:targetId,targetOrderNumber:target.number,originalInvoiceId:invoice?.id??null,originalInvoiceNumber:invoice?.number??null,original:detail,originalPayable:gross,credit:available,replacementPayable:payable,extraDue:payable-available,allocations,reason:data.reason,actor:actor.name,issuedAt:new Date().toISOString(),recognized,unbilledCogs};
  await tx.query('INSERT INTO web_replacements(id,restro_id,outlet_id,source_order_id,target_order_id,source_invoice_id,amount,original_payable,allocations,snapshot,net_sales,tax,charges,round_off,unbilled_cogs,reason,recorded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14,$15,$16,$17)',[replacementId,actor.restroId,order.outlet_id,orderId,targetId,invoice?.id??null,available,gross,json(allocations),json(snapshot),netSales,tax,creditCharges,creditRoundOff,unbilledCogs,data.reason,actor.employeeId]);
  for(const round of rounds){
   if(round.kot_status==='HELD')await releaseStock(tx,round.id);
   else if(round.kot_status!=='SERVED'){
    const lines=(await tx.query<Row>('SELECT i.*,c.cost FROM order_items i LEFT JOIN order_item_costs c ON c.order_item_id=i.id AND c.restro_id=i.restro_id WHERE i.round_id=$1 ORDER BY i.id',[round.id])).rows;
    for(const line of lines)await tx.query("INSERT INTO prepared_food_movements(id,restro_id,outlet_id,round_id,kind,delta_milli,cost,reason,actor_id) VALUES($1,$2,$3,$4,'WASTAGE',$5,$6,$7,$8)",[id(),actor.restroId,order.outlet_id,round.id,-num(line.quantity_milli),line.cost??null,data.reason,actor.employeeId]);
   }
   if(round.kot_status!=='SERVED'){
    await tx.query("UPDATE kot_tickets SET status='CANCELLED',updated_at=now() WHERE round_id=$1 AND status<>'SERVED'",[round.id]);
    await tx.query("UPDATE order_rounds SET kot_status='CANCELLED',version=version+1 WHERE id=$1",[round.id]);
   }
  }
  await tx.query("UPDATE orders SET status=CASE WHEN status='SETTLED' THEN status ELSE 'VOIDED' END,version=version+1 WHERE id=$1",[orderId]);
  await acceptStaffSubmission(tx,actor,targetId,roundId);
  await audit(tx,actor,{action:'PAID_ORDER_REPLACED',entityType:'WEB_REPLACEMENT',entityId:replacementId,outletId:order.outlet_id,newState:snapshot,reason:data.reason,impact:payable-gross,risk:'WARNING'});
  return {replacementId,order:await orderDetail(tx,actor,targetId)};
 });
}

export async function replacementFloor(tx:Sql,orderId:string,roundId:string,payable:number){
 const replacement=(await tx.query('SELECT original_payable FROM web_replacements WHERE target_order_id=$1',[orderId])).rows[0];
 if(!replacement)return;
 const other=await one(tx,"SELECT coalesce(sum(payable),0) AS payable FROM order_rounds WHERE order_id=$1 AND id<>$2 AND status NOT IN ('REJECTED','VOIDED')",[orderId,roundId]);
 ensure(payable+num(other.payable)>=num(replacement.original_payable),'REPLACEMENT_BELOW_ORIGINAL','The replacement final payable must remain at least the original final payable.',409);
}

export async function replacementAdjustmentsRead(tx:Sql,outletIds:string[],from:string,to:string){
 return one(tx,`SELECT coalesce(sum(CASE WHEN snapshot->>'recognized'='true' THEN amount ELSE 0 END),0) AS amount,coalesce(sum(net_sales),0) AS net_sales,coalesce(sum(tax),0) AS tax,coalesce(sum(charges),0) AS charges,coalesce(sum(unbilled_cogs),0) AS cogs FROM web_replacements WHERE outlet_id=ANY($1::uuid[]) AND (created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $2::date AND $3::date`,[outletIds,from,to]);
}

export async function getWebReplacementDocument(db:Database,actor:Actor,replacementId:string){
 ensure(!actor.application||actor.application==='MASTER','APPLICATION_FORBIDDEN','Use web replacement documents.',403);
 requirePermission(actor,actor.role==='ACCOUNTANT'?'reports':'payments');z.uuid().parse(replacementId);
 return db.transaction(actor.restroId,async tx=>{const row=await one(tx,'SELECT * FROM web_replacements WHERE id=$1',[replacementId]);requireOutlet(actor,row.outlet_id);return row});
}

const ancestorsSql=`WITH RECURSIVE ancestors AS (
 SELECT source_order_id FROM web_replacements WHERE target_order_id=$1
 UNION ALL SELECT r.source_order_id FROM web_replacements r JOIN ancestors a ON r.target_order_id=a.source_order_id
)`;
export async function replacementEarnedPoints(tx:Sql,orderId:string){
 return num((await one(tx,ancestorsSql+" SELECT coalesce(sum(l.points),0) AS points FROM loyalty_ledger l JOIN ancestors a ON a.source_order_id=l.order_id WHERE l.state='EARNED'",[orderId])).points);
}
/** Consume prior locked redemptions only when the replacement is actually settled. */
export async function settleReplacementRewards(tx:Sql,actor:Actor,orderId:string,invoiceId:string){
 const ancestors=(await tx.query<Row>(ancestorsSql+' SELECT source_order_id FROM ancestors',[orderId])).rows;
 for(const ancestor of ancestors){
  const reservations=(await tx.query<Row>("SELECT l.*,r.order_id FROM loyalty_reservations l JOIN order_rounds r ON r.id=l.round_id AND r.restro_id=l.restro_id WHERE r.order_id=$1 AND l.state IN ('LOCKED','RESERVED') ORDER BY l.id FOR UPDATE OF l",[ancestor.source_order_id])).rows;
  for(const reservation of reservations){
   await tx.query("INSERT INTO loyalty_ledger(id,restro_id,outlet_id,customer_id,order_id,round_id,state,points,settlement_ref,reason) VALUES($1,$2,$3,$4,$5,$6,'REDEEMED',$7,$8,'Original reward carried into linked paid replacement') ON CONFLICT(round_id,state) DO NOTHING",[id(),actor.restroId,reservation.outlet_id,reservation.customer_id,reservation.order_id,reservation.round_id,-num(reservation.points),invoiceId]);
   await tx.query("UPDATE loyalty_reservations SET state='REDEEMED' WHERE id=$1",[reservation.id]);
  }
  await tx.query("UPDATE coupons SET state='REDEEMED' WHERE round_id IN (SELECT id FROM order_rounds WHERE order_id=$1) AND state IN ('LOCKED','RESERVED')",[ancestor.source_order_id]);
 }
}
