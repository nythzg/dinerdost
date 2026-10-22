import {z} from 'zod';
import type {Database} from '@dinerdost/database';
import {calculate,can,ensure,requireOutlet,type Actor} from '@dinerdost/core';
import {audit,command,expectedVersion,id,one,scopedOrder} from './shared';
import {expireCalculatorData} from './calculator-retention';
function web(actor:Actor){ensure(!actor.application||actor.application==='MASTER','APPLICATION_FORBIDDEN','This tool is available in the web workspace.',403)}
const pageSchema=z.coerce.number().int().min(0).max(100000).default(0);
export async function calculatorHistory(db:Database,actor:Actor,page:unknown=0){
 web(actor);const offset=pageSchema.parse(page)*25;
 return db.transaction(actor.restroId,async tx=>{await expireCalculatorData(tx,actor.employeeId);const rows=(await tx.query("SELECT id,expression,result,note,created_at FROM calculator_history WHERE employee_id=$1 AND created_at >= now()-interval '168 hours' ORDER BY created_at DESC,id DESC LIMIT 26 OFFSET $2",[actor.employeeId,offset])).rows;return {rows:rows.slice(0,25),more:rows.length>25}});
}
export async function calculatorAction(db:Database,actor:Actor,key:string,input:unknown){
 web(actor);
 const note=z.string().trim().max(500);
 const data=z.discriminatedUnion('action',[
  z.object({action:z.literal('calculate'),expression:z.string().trim().min(1).max(200),note:note.default('')}).strict(),
  z.object({action:z.literal('note'),id:z.uuid(),note}).strict(),
  z.object({action:z.literal('delete'),id:z.uuid()}).strict()
 ]).parse(input);
 let result='';if(data.action==='calculate'){try{result=calculate(data.expression)}catch(error){ensure(false,'INVALID_CALCULATION',(error as Error).message,422)}}
 await db.transaction(actor.restroId,tx=>expireCalculatorData(tx,actor.employeeId));
 const response=await command(db,actor,key,'CALCULATOR_'+data.action.toUpperCase(),data,async tx=>{
  if(data.action==='calculate'){
   const entry=await one(tx,'INSERT INTO calculator_history(id,restro_id,employee_id,expression,result,note) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,expression,result,note,created_at',[id(),actor.restroId,actor.employeeId,data.expression,result,data.note]);
   // Audit metadata only: personal scratch notes are not copied into the restaurant audit trail.
   await audit(tx,actor,{action:'CALCULATOR_SAVED',entityType:'calculator',entityId:entry.id});return entry;
  }
  const entry=await one(tx,"SELECT id FROM calculator_history WHERE id=$1 AND employee_id=$2 AND created_at >= now()-interval '168 hours' FOR UPDATE",[data.id,actor.employeeId],'Calculation unavailable or older than seven days.');
  if(data.action==='note')await tx.query('UPDATE calculator_history SET note=$3 WHERE id=$1 AND employee_id=$2',[data.id,actor.employeeId,data.note]);
  else await tx.query('DELETE FROM calculator_history WHERE id=$1 AND employee_id=$2',[data.id,actor.employeeId]);
  await audit(tx,actor,{action:data.action==='note'?'CALCULATOR_NOTE_UPDATED':'CALCULATOR_DELETED',entityType:'calculator',entityId:entry.id});return {ok:true};
 });
 ensure(!response.expired,'CALCULATION_EXPIRED','This calculation is older than seven days and was automatically deleted. Start a new calculation.',410);
 return response;
}
export async function activeOrderList(db:Database,actor:Actor,outletId:string,page:unknown=0){
 web(actor);requireOutlet(actor,outletId);ensure(can(actor,'orders'),'FORBIDDEN','Orders are unavailable to your role.',403);
 const offset=pageSchema.parse(page)*25;
 return db.transaction(actor.restroId,async tx=>{
  await one(tx,'SELECT id FROM outlets WHERE id=$1',[outletId],'Outlet unavailable.');
  const rows=(await tx.query(`SELECT o.id,o.number,o.type,o.status,o.created_at,t.label AS table_label,coalesce(p.pinned,false) AS pinned,coalesce(p.version,0) AS pin_version,
    coalesce(r.payable,0) AS payable,coalesce(r.paid,0) AS paid,coalesce(r.stages,'[]'::jsonb) AS stages
    FROM orders o LEFT JOIN order_pins p ON p.order_id=o.id AND p.restro_id=o.restro_id LEFT JOIN table_sessions s ON s.id=o.session_id AND s.restro_id=o.restro_id
    LEFT JOIN dining_tables t ON t.id=s.table_id AND t.restro_id=s.restro_id
    LEFT JOIN LATERAL(SELECT sum(payable) AS payable,sum(paid) AS paid,jsonb_agg(DISTINCT kot_status) AS stages FROM order_rounds WHERE order_id=o.id AND status NOT IN ('REJECTED','VOIDED')) r ON true
    WHERE o.outlet_id=$1 AND o.status NOT IN ('SETTLED','VOIDED','REJECTED','CANCELLED') AND ($2 OR s.owner_employee_id=$3)
    ORDER BY coalesce(p.pinned,false) DESC,o.created_at DESC,o.id DESC LIMIT 26 OFFSET $4`,[outletId,actor.role!=='WAITER',actor.employeeId,offset])).rows;
  return {rows:rows.slice(0,25),more:rows.length>25};
 });
}
export async function setOrderPin(db:Database,actor:Actor,key:string,orderId:string,input:unknown){
 web(actor);ensure(can(actor,'orders'),'FORBIDDEN','Orders are unavailable to your role.',403);
 const data=z.object({pinned:z.boolean(),version:z.number().int().min(0)}).strict().parse(input);
 return command(db,actor,key,'ORDER_PIN_CHANGED',{orderId,...data},async tx=>{
  const order=await scopedOrder(tx,actor,orderId,true);
  ensure(!data.pinned||!['SETTLED','VOIDED','REJECTED','CANCELLED'].includes(order.status),'ORDER_CLOSED','Only active orders can be pinned.',409);
  await tx.query('INSERT INTO order_pins(restro_id,order_id,updated_by) VALUES($1,$2,$3) ON CONFLICT(order_id) DO NOTHING',[actor.restroId,orderId,actor.employeeId]);
  const previous=await one(tx,'SELECT * FROM order_pins WHERE order_id=$1 FOR UPDATE',[orderId]);expectedVersion(previous.version,data.version);
  const saved=await one(tx,'UPDATE order_pins SET pinned=$2,version=version+1,updated_by=$3,updated_at=now() WHERE order_id=$1 RETURNING pinned,version AS pin_version',[orderId,data.pinned,actor.employeeId]);
  await audit(tx,actor,{action:data.pinned?'ORDER_PINNED':'ORDER_UNPINNED',entityType:'ORDER',entityId:orderId,outletId:order.outlet_id,oldState:{pinned:previous.pinned},newState:{pinned:data.pinned},reason:'Staff changed order priority; amounts, stages and customer records unchanged'});return saved;
 });
}
