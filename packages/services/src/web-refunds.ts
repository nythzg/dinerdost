import {z} from 'zod';
import type {Database,Sql} from '@dinerdost/database';
import {ensure,isManager,requireOutlet,requirePermission,type Actor} from '@dinerdost/core';
import {audit,command,expectedVersion,id,json,num,one,scopedOrder,type Row} from './shared';
const web=(actor:Actor)=>{ensure(!actor.application||actor.application==='MASTER','APPLICATION_FORBIDDEN','Use the web refund workflow.',403);requirePermission(actor,'payments')};
const inputSchema=z.object({version:z.number().int().positive(),invoiceId:z.uuid(),amount:z.number().int().positive().max(1000000000),mode:z.enum(['CASH','UPI','CARD','OTHER']),reason:z.string().trim().min(5).max(500),reference:z.string().trim().max(120).default(''),confirmed:z.literal(true)}).strict();
export async function refundBalancesRead(tx:Sql,orderId:string){
 return (await tx.query(`WITH owned AS (
  SELECT id AS payment_id,amount FROM payment_attempts WHERE order_id=$1 AND state='VERIFIED'
  UNION ALL SELECT (a->>'paymentId')::uuid,(a->>'amount')::bigint FROM web_replacements r CROSS JOIN LATERAL jsonb_array_elements(r.allocations) a WHERE r.target_order_id=$1
 ), balances AS (SELECT payment_id,sum(amount) AS amount FROM owned GROUP BY payment_id)
 SELECT p.id,p.round_id,p.method,p.reference,b.amount,p.created_at,
 b.amount-coalesce((SELECT sum((a->>'amount')::bigint) FROM web_refunds f CROSS JOIN LATERAL jsonb_array_elements(f.allocations) a WHERE f.order_id=$1 AND a->>'paymentId'=p.id::text),0)
 -coalesce((SELECT sum((a->>'amount')::bigint) FROM web_replacements r CROSS JOIN LATERAL jsonb_array_elements(r.allocations) a WHERE r.source_order_id=$1 AND a->>'paymentId'=p.id::text),0) AS available
 FROM balances b JOIN payment_attempts p ON p.id=b.payment_id AND p.state='VERIFIED' ORDER BY p.created_at,p.id`,[orderId])).rows;
}
async function eligibility(tx:Sql,order:Row,data:{invoiceId:string;amount:number}){
 const invoice=await one(tx,"SELECT * FROM invoices WHERE id=$1 AND order_id=$2 AND document_type IN ('FINAL_TAX_INVOICE','PROVISIONAL_BILL')",[data.invoiceId,order.id],'Choose an issued bill belonging to this order.');
 const payments=await refundBalancesRead(tx,order.id),available=payments.reduce((n,p)=>n+num(p.available),0);
 ensure(data.amount<=available,'REFUND_EXCEEDS_PAID','This refund exceeds the remaining amount actually received.',409);
 const prior=await one(tx,'SELECT coalesce(sum(amount),0) AS amount FROM web_refunds WHERE invoice_id=$1',[invoice.id]);
 ensure(num(invoice.snapshot?.totals?.payable)>0&&num(prior.amount)+data.amount<=num(invoice.snapshot.totals.payable),'REFUND_EXCEEDS_INVOICE','Choose a current bill reference that covers this refund.',409);
 ensure(!(await tx.query("SELECT id FROM payment_attempts WHERE order_id=$1 AND state IN ('INITIATED','AWAITING_VERIFICATION','UNKNOWN') LIMIT 1",[order.id])).rows.length,'PAYMENT_ACTIVE','Resolve pending receipts before recording a refund.',409);
 return{invoice,payments,prior:num(prior.amount),available};
}
function cumulativeShare(total:number,amount:number,gross:number){return Number((BigInt(total)*BigInt(amount)+BigInt(gross)/2n)/BigInt(gross))}
async function postRefund(tx:Sql,actor:Actor,order:Row,data:z.infer<typeof inputSchema>,requestId:string|null=null){
 ensure(isManager(actor),'MANAGER_APPROVAL_REQUIRED','A manager or owner must approve the refund record.',403);
 const {invoice,payments,prior}=await eligibility(tx,order,data),gross=num(invoice.snapshot.totals.payable);let remaining=data.amount;
 const allocations=[];for(const payment of payments){const amount=Math.min(remaining,num(payment.available));if(amount<=0)continue;allocations.push({paymentId:payment.id,roundId:payment.round_id,method:payment.method,reference:payment.reference,amount});remaining-=amount;if(!remaining)break}ensure(!remaining,'REFUND_EXCEEDS_PAID','The refundable receipts changed. Refresh this order.',409);
 const component=(amount:number)=>cumulativeShare(amount,prior+data.amount,gross)-cumulativeShare(amount,prior,gross);
 const netSales=component(num(invoice.snapshot.totals.subtotal)-num(invoice.snapshot.totals.discount)),tax=component(num(invoice.snapshot.totals.tax)),charges=component(num(invoice.snapshot.totals.charges)),roundOff=data.amount-netSales-tax-charges;
 const refundId=id(),snapshot={number:'RF-'+refundId.slice(0,8).toUpperCase(),orderNumber:order.number,invoiceId:invoice.id,invoiceNumber:invoice.number,original:invoice.snapshot,amount:data.amount,mode:data.mode,reason:data.reason,reference:data.reference,allocations,netSales,tax,charges,roundOff,actor:actor.name,recordOnly:true};
 await tx.query('INSERT INTO web_refunds(id,restro_id,outlet_id,order_id,invoice_id,request_id,amount,mode,reason,reference,allocations,snapshot,net_sales,tax,charges,round_off,recorded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14,$15,$16,$17)',[refundId,actor.restroId,order.outlet_id,order.id,invoice.id,requestId,data.amount,data.mode,data.reason,data.reference,json(allocations),json(snapshot),netSales,tax,charges,roundOff,actor.employeeId]);
 await tx.query('UPDATE orders SET version=version+1 WHERE id=$1',[order.id]);
 await audit(tx,actor,{action:'MANUAL_REFUND_RECORDED',entityType:'WEB_REFUND',entityId:refundId,outletId:order.outlet_id,newState:{...snapshot,requestId},impact:-data.amount,risk:'WARNING',reason:data.reason});
 return{id:refundId,state:'RECORDED',amount:data.amount,recordOnly:true};
}
export async function submitWebRefund(db:Database,actor:Actor,key:string,orderId:string,input:unknown){
 web(actor);const data=inputSchema.parse(input);
 return command(db,actor,key,'WEB_REFUND_SUBMITTED',{orderId,...data},async tx=>{
  const order=await scopedOrder(tx,actor,orderId,true);expectedVersion(order.version,data.version);
  if(isManager(actor))return postRefund(tx,actor,order,data);
  await eligibility(tx,order,data);
  ensure(actor.role==='CASHIER','MANAGER_APPROVAL_REQUIRED','Only billing cashiers may request manager approval.',403);
  const requestId=id();await tx.query('INSERT INTO web_refund_requests(id,restro_id,outlet_id,order_id,invoice_id,amount,mode,reason,reference,requested_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[requestId,actor.restroId,order.outlet_id,order.id,data.invoiceId,data.amount,data.mode,data.reason,data.reference,actor.employeeId]);
  await audit(tx,actor,{action:'WEB_REFUND_APPROVAL_REQUESTED',entityType:'WEB_REFUND_REQUEST',entityId:requestId,outletId:order.outlet_id,newState:{orderId,...data},risk:'WARNING',reason:data.reason});return{id:requestId,state:'PENDING',amount:data.amount,recordOnly:true};
 });
}
export async function decideWebRefund(db:Database,actor:Actor,key:string,requestId:string,input:unknown){
 web(actor);ensure(isManager(actor),'MANAGER_APPROVAL_REQUIRED','An owner or manager must approve refund requests.',403);
 const data=z.object({version:z.number().int().positive(),decision:z.enum(['APPROVE','REJECT']),note:z.string().trim().min(5).max(500),confirmed:z.literal(true)}).strict().parse(input);
 return command(db,actor,key,'WEB_REFUND_DECIDED',{requestId,...data},async tx=>{const context=await one(tx,'SELECT order_id FROM web_refund_requests WHERE id=$1',[requestId]),order=await scopedOrder(tx,actor,context.order_id,true),request=await one(tx,'SELECT * FROM web_refund_requests WHERE id=$1 FOR UPDATE',[requestId]);expectedVersion(request.version,data.version);ensure(request.state==='PENDING','REFUND_REQUEST_CLOSED','This request has already been decided.',409);
  const result=data.decision==='APPROVE'?await postRefund(tx,actor,order,{version:order.version,invoiceId:request.invoice_id,amount:num(request.amount),mode:request.mode,reason:request.reason,reference:request.reference,confirmed:true},request.id):{id:request.id,state:'REJECTED'};
  await tx.query('UPDATE web_refund_requests SET state=$2,version=version+1,decided_by=$3,decision_note=$4,decided_at=now() WHERE id=$1',[request.id,data.decision==='APPROVE'?'APPROVED':'REJECTED',actor.employeeId,data.note]);await audit(tx,actor,{action:'WEB_REFUND_APPROVAL_DECIDED',entityType:'WEB_REFUND_REQUEST',entityId:request.id,outletId:order.outlet_id,oldState:{state:request.state},newState:{decision:data.decision,refund:result},reason:data.note});return result;
 });
}
export async function webRefunds(db:Database,actor:Actor,orderId:string){
 web(actor);z.uuid().parse(orderId);return db.transaction(actor.restroId,async tx=>{const order=await scopedOrder(tx,actor,orderId),payments=await refundBalancesRead(tx,orderId),invoices=(await tx.query("SELECT id,number,document_type,created_at FROM invoices WHERE order_id=$1 AND document_type IN ('FINAL_TAX_INVOICE','PROVISIONAL_BILL') ORDER BY CASE WHEN document_type='FINAL_TAX_INVOICE' THEN 0 ELSE 1 END,created_at DESC",[orderId])).rows,refunds=(await tx.query<Row>('SELECT * FROM web_refunds WHERE order_id=$1 ORDER BY created_at DESC',[orderId])).rows,requests=(await tx.query('SELECT r.*,e.name AS requested_name FROM web_refund_requests r JOIN employees e ON e.id=r.requested_by AND e.restro_id=r.restro_id WHERE r.order_id=$1 ORDER BY r.created_at DESC',[orderId])).rows;
  return{order:{id:order.id,number:order.number,version:order.version},payments,invoices,refunds,requests,available:payments.reduce((n,p)=>n+num(p.available),0),refunded:refunds.reduce((n,r)=>n+num(r.amount),0),canApprove:isManager(actor),recordOnly:true};});
}
export async function pendingWebRefunds(db:Database,actor:Actor,outletId:string){web(actor);ensure(isManager(actor),'MANAGER_APPROVAL_REQUIRED','Manager access is required.',403);z.uuid().parse(outletId);requireOutlet(actor,outletId);return db.transaction(actor.restroId,async tx=>(await tx.query("SELECT r.*,o.number,e.name AS requested_name FROM web_refund_requests r JOIN orders o ON o.id=r.order_id AND o.restro_id=r.restro_id JOIN employees e ON e.id=r.requested_by AND e.restro_id=r.restro_id WHERE r.outlet_id=$1 AND r.state='PENDING' ORDER BY r.created_at,r.id",[outletId])).rows)}
export async function getWebRefundDocument(db:Database,actor:Actor,refundId:string){ensure(!actor.application||actor.application==='MASTER','APPLICATION_FORBIDDEN','Use web refund documents.',403);if(actor.role==='ACCOUNTANT')requirePermission(actor,'reports');else requirePermission(actor,'payments');z.uuid().parse(refundId);return db.transaction(actor.restroId,async tx=>{const row=await one(tx,'SELECT * FROM web_refunds WHERE id=$1',[refundId]);requireOutlet(actor,row.outlet_id);return row})}
/** Report refunds when the sale is recognized; a pre-settlement refund is not subtracted twice. */
export async function settledRefundsRead(tx:Sql,outletIds:string[],from:string,to:string){return one(tx,`SELECT coalesce(sum(r.amount),0) AS amount,coalesce(sum(r.net_sales),0) AS net_sales,coalesce(sum(r.tax),0) AS tax,coalesce(sum(r.charges),0) AS charges,coalesce(sum(r.round_off),0) AS round_off
 FROM web_refunds r JOIN invoices f ON f.order_id=r.order_id AND f.restro_id=r.restro_id AND f.document_type='FINAL_TAX_INVOICE'
 WHERE r.outlet_id=ANY($1::uuid[]) AND (greatest(r.created_at,f.created_at) AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $2::date AND $3::date`,[outletIds,from,to])}
