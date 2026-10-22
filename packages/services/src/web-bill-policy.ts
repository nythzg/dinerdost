import {z} from 'zod';
import type {Database,Sql} from '@dinerdost/database';
import {ensure,isManager,requireOutlet,requirePermission,roundAdjustment,type Actor} from '@dinerdost/core';
import {audit,command,expectedVersion,num,one,type Row} from './shared';
export async function snapshotWebBillDefaults(tx:Sql,outletId:string,roundId:string,web:boolean){
 if(!web)return;const outlet=await one(tx,'SELECT web_round_down_default FROM outlets WHERE id=$1',[outletId]);if(!outlet.web_round_down_default)return;
 const round=await one(tx,'SELECT payable FROM order_rounds WHERE id=$1',[roundId]),adjustment=roundAdjustment(num(round.payable),true,'DOWN');
 await tx.query("UPDATE order_rounds SET rounding_enabled=true,rounding_mode='DOWN',round_off=$2,payable=payable+$2 WHERE id=$1",[roundId,adjustment]);
 return{payable:num(round.payable)+adjustment,roundOff:adjustment,roundingEnabled:true,roundingMode:'DOWN'};
}
export async function saveBillDefaults(db:Database,actor:Actor,key:string,input:unknown){
 requirePermission(actor,'bill');ensure(isManager(actor),'FORBIDDEN','Only the owner or outlet manager can change future bill rounding.',403);ensure(!actor.application||actor.application==='MASTER','APPLICATION_FORBIDDEN','Use web bill settings.',403);
 const data=z.object({outletId:z.uuid(),version:z.number().int().positive(),roundDown:z.boolean()}).strict().parse(input);requireOutlet(actor,data.outletId);
 return command(db,actor,key,'WEB_BILL_DEFAULTS_CHANGED',data,async tx=>{const outlet=await one(tx,'SELECT * FROM outlets WHERE id=$1 FOR UPDATE',[data.outletId]);expectedVersion(outlet.version,data.version);await tx.query('UPDATE outlets SET web_round_down_default=$2,version=version+1 WHERE id=$1',[data.outletId,data.roundDown]);await audit(tx,actor,{action:'WEB_BILL_DEFAULTS_CHANGED',entityType:'OUTLET',entityId:outlet.id,outletId:outlet.id,oldState:{roundDown:outlet.web_round_down_default},newState:{roundDown:data.roundDown},reason:'Round down to rupee applies only to future web transactions; no discount default'});return{ok:true};});
}
/** Web-only extension. Verified receipts remain immutable; unresolved receipts block editing. */
export async function requireWebBillEditable(tx:Sql,actor:Actor,order:Row,round:Row){
 ensure(!actor.application||actor.application==='MASTER','APPLICATION_FORBIDDEN','Use the application billing workflow.',403);
 ensure(['DRAFT','PENDING','ACCEPTED'].includes(round.status)&&round.payment_status!=='PAID'&&num(round.paid)<Math.max(1,num(round.payable)),'ADJUSTMENTS_LOCKED','Fully paid or closed bills require a separate refund or replacement.',409);
 ensure(!(await tx.query("SELECT id FROM invoices WHERE order_id=$1 AND document_type='FINAL_TAX_INVOICE' LIMIT 1",[order.id])).rows.length,'INVOICE_LOCKED','Issued final invoices require a separate adjustment record.',409);
 ensure(!(await tx.query("SELECT id FROM payment_attempts WHERE round_id=$1 AND state IN ('INITIATED','AWAITING_VERIFICATION','UNKNOWN') LIMIT 1",[round.id])).rows.length,'PAYMENT_ACTIVE','Resolve pending receipts before changing this bill.',409);
}
