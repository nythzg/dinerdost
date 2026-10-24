import { z } from "zod";
import type { Database, Sql } from "@dinerdost/database";
import {
  ensure,
  requireOutlet,
  requirePermission,
  isManager,
  type Actor,
} from "@dinerdost/core";
import { audit, command, one, scopedOrder,expectedVersion } from "./shared";
import { orderDetail } from "./orders";
import { refreshOrderStatus } from "./order-state";
import { requireTicketStream } from "./operational-access";
import {releaseStock} from './stock';

/** Rejection is explicit cancellation, never a refund or a return of consumed food. */
export async function rejectKitchenRounds(db:Database,actor:Actor,key:string,input:unknown){
 requirePermission(actor,'accept');ensure(isManager(actor),'FORBIDDEN','A manager must authorize rejection of released food.',403);
 ensure(!actor.application||actor.application==='MASTER','APPLICATION_FORBIDDEN','Use the web kitchen selection workflow.',403);
 const data=z.object({outletId:z.uuid(),from:z.enum(['RELEASED','PREPARING','READY']),reason:z.string().trim().min(5).max(500),rounds:z.array(z.object({orderId:z.uuid(),roundId:z.uuid(),version:z.number().int().positive()}).strict()).min(1).max(20)}).strict().parse(input);
 requireOutlet(actor,data.outletId);ensure(new Set(data.rounds.map(r=>r.roundId)).size===data.rounds.length,'DUPLICATE_ROUND','Select each round once.');
 return command(db,actor,key,'KITCHEN_ROUNDS_REJECTED',data,async tx=>{
  const orders=new Map<string,any>();for(const orderId of [...new Set(data.rounds.map(r=>r.orderId))].sort()){const order=await scopedOrder(tx,actor,orderId,true);ensure(order.outlet_id===data.outletId,'OUTLET_FORBIDDEN','All selected rounds must belong to this outlet.',403);orders.set(orderId,order);}
  for(const entry of [...data.rounds].sort((a,b)=>a.roundId.localeCompare(b.roundId))){
   const round=await one(tx,'SELECT * FROM order_rounds WHERE id=$1 AND order_id=$2 FOR UPDATE',[entry.roundId,entry.orderId]);expectedVersion(round.version,entry.version);
   ensure(round.status==='ACCEPTED'&&['RELEASED','PREPARING','READY'].includes(round.kot_status),'TICKET_CHANGED','A selected round has changed. Refresh and select again.',409);
   ensure(!['SETTLED','VOIDED','REJECTED'].includes(orders.get(entry.orderId).status)&&Number(round.paid)===0,'REJECTION_BLOCKED','Paid food needs the existing refund workflow; it cannot be rejected here.',409);
   ensure(!(await tx.query("SELECT id FROM payment_attempts WHERE round_id=$1 AND state NOT IN ('FAILED','REJECTED')",[entry.roundId])).rows.length,'PAYMENT_RECONCILIATION_REQUIRED','Reconcile the payment before rejecting food.',409);
   ensure(!(await tx.query('SELECT id FROM invoices WHERE order_id=$1',[entry.orderId])).rows.length,'ISSUED_DOCUMENT_LOCKED','An issued bill must use the existing correction workflow.',409);
   const tickets=(await tx.query('SELECT * FROM kot_tickets WHERE round_id=$1 ORDER BY id FOR UPDATE',[entry.roundId])).rows;
   ensure(tickets.length>0&&tickets.some(t=>t.status===data.from)&&tickets.every(t=>['RELEASED','PREPARING','READY'].includes(String(t.status))),'TICKET_CHANGED','Only unserved food can be rejected.',409);
   await releaseStock(tx,entry.roundId); // Only still-reserved stock; consumed FIFO/cost movements stay immutable.
   await tx.query("UPDATE coupons SET state='AVAILABLE',round_id=NULL,round_version=NULL,reserved_until=NULL WHERE round_id=$1 AND state IN ('RESERVED','LOCKED')",[entry.roundId]);
   await tx.query("UPDATE loyalty_reservations SET state='RELEASED' WHERE round_id=$1 AND state IN ('RESERVED','LOCKED')",[entry.roundId]);
   await tx.query("UPDATE kot_tickets SET status='CANCELLED',updated_at=now() WHERE round_id=$1",[entry.roundId]);
   await tx.query("UPDATE order_rounds SET status='REJECTED',kot_status='CANCELLED',rejection_reason=$2,version=version+1,quote_version=NULL WHERE id=$1",[entry.roundId,data.reason]);
   await audit(tx,actor,{action:'KITCHEN_ROUND_REJECTED',entityType:'ORDER_ROUND',entityId:entry.roundId,outletId:data.outletId,reason:data.reason,newState:{from:data.from,consumedStockRetained:true},impact:-Number(round.payable),risk:'WARNING'});
  }
  for(const orderId of orders.keys())await refreshOrderStatus(tx,orderId);
  return {ok:true,rejected:data.rounds.length};
 });
}

export async function kitchenDecision(
  db: Database,
  actor: Actor,
  key: string,
  ticketId: string,
  input: unknown,
) {
  requirePermission(actor, "kitchen");
  const data = z
    .object({ state: z.enum(["PREPARING", "READY"]) })
    .strict()
    .parse(input);
  return command(
    db,
    actor,
    key,
    "KITCHEN_STATE_CHANGED",
    { ticketId, ...data },
    async (tx) => {
      await transitionTicket(tx,actor,ticketId,data.state);
      return { ok: true };
    },
  );
}
async function transitionTicket(tx:Sql,actor:Actor,ticketId:string,state:'PREPARING'|'READY'){
      const context = await one(
        tx,
        "SELECT order_id FROM kot_tickets WHERE id=$1",
        [ticketId],
      );
      await scopedOrder(tx, actor, context.order_id, true);
      const ticket = await one(
        tx,
        "SELECT * FROM kot_tickets WHERE id=$1 FOR UPDATE",
        [ticketId],
      );
      requireOutlet(actor, ticket.outlet_id);
      requireTicketStream(actor, ticket.production_stream);
      ensure(
        state === "PREPARING"
          ? ticket.status === "RELEASED"
          : ticket.status === "PREPARING",
        "INVALID_KITCHEN_TRANSITION",
        "Follow the ticket sequence: released, preparing, then ready.",
        409,
      );
      await tx.query(
        "UPDATE kot_tickets SET status=$2,updated_at=now() WHERE id=$1",
        [ticketId, state],
      );
      const remaining = (
        await tx.query(
          "SELECT id FROM kot_tickets WHERE round_id=$1 AND status<>$2",
          [ticket.round_id, state],
        )
      ).rows;
      if (!remaining.length || state === "PREPARING")
        await tx.query("UPDATE order_rounds SET kot_status=$2 WHERE id=$1", [
          ticket.round_id,
          state,
        ]);
      await refreshOrderStatus(tx, ticket.order_id);
      await audit(tx, actor, {
        action: "KOT_" + state,
        entityType: "KOT",
        entityId: ticketId,
        outletId: ticket.outlet_id,
        newState: { state: state },
      });

}
export async function kitchenBulk(db:Database,actor:Actor,key:string,input:unknown){
 requirePermission(actor,'kitchen');
 const data=z.object({outletId:z.uuid(),from:z.enum(['RELEASED','PREPARING']),ticketIds:z.array(z.uuid()).min(1).max(20)}).strict().parse(input);
 requireOutlet(actor,data.outletId);
 ensure(new Set(data.ticketIds).size===data.ticketIds.length,'DUPLICATE_TICKET','Select each kitchen ticket once.');
 return command(db,actor,key,'KITCHEN_BULK_FORWARDED',data,async tx=>{
  const tickets=(await tx.query("SELECT id,order_id,production_stream FROM kot_tickets WHERE id=ANY($1::uuid[]) AND outlet_id=$2 ORDER BY id",[data.ticketIds,data.outletId])).rows;
  ensure(tickets.length===data.ticketIds.length,'TICKET_CHANGED','One of the selected kitchen tickets is unavailable. Refresh and select again.',409);
  for(const ticket of tickets)requireTicketStream(actor,String(ticket.production_stream));
  for(const orderId of [...new Set(tickets.map(ticket=>String(ticket.order_id)))].sort())await scopedOrder(tx,actor,orderId,true);
  const locked=(await tx.query("SELECT id,status FROM kot_tickets WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",[data.ticketIds])).rows;
  ensure(locked.every(ticket=>ticket.status===data.from),'TICKET_CHANGED','A selected ticket has already changed stage. Refresh and select again.',409);
  for(const ticket of locked)await transitionTicket(tx,actor,String(ticket.id),data.from==='RELEASED'?'PREPARING':'READY');
  return {ok:true,forwarded:locked.length};
 });
}
export async function serveRound(
  db: Database,
  actor: Actor,
  key: string,
  orderId: string,
  roundId: string,
) {
  requirePermission(actor, "orders");
  return command(
    db,
    actor,
    key,
    "ROUND_SERVED",
    { orderId, roundId },
    async (tx) => {
      await serveInTransaction(tx,actor,orderId,roundId);
      return orderDetail(tx, actor, orderId);
    },
  );
}
async function serveInTransaction(tx:Sql,actor:Actor,orderId:string,roundId:string,version?:number){
      const order = await scopedOrder(tx, actor, orderId, true);
      const round = await one(
        tx,
        "SELECT * FROM order_rounds WHERE id=$1 AND order_id=$2 FOR UPDATE",
        [roundId, orderId],
      );
      if(version!==undefined)expectedVersion(round.version,version);
      ensure(
        round.kot_status === "READY",
        "FOOD_NOT_READY",
        "Every station must mark this round ready before service.",
        409,
      );
      const stations=(await tx.query('SELECT status FROM kot_tickets WHERE round_id=$1 FOR UPDATE',[roundId])).rows;
      ensure(stations.length>0&&stations.every(ticket=>ticket.status==='READY'),'FOOD_NOT_READY','Every station must mark this round ready before service.',409);
      ensure(!(await tx.query("SELECT i.id FROM order_items i JOIN menu_items m ON m.id=i.item_id AND m.restro_id=i.restro_id JOIN prepared_food_batches b ON b.id=m.ready_food_batch_id AND b.restro_id=m.restro_id WHERE i.round_id=$1 AND b.expires_at<=now()",[roundId])).rows.length,"FOOD_EXPIRED","This prepared food has passed its use-by time and cannot be served.",409);
      await tx.query(
        "UPDATE kot_tickets SET status='SERVED',updated_at=now() WHERE round_id=$1",
        [roundId],
      );
      await tx.query(
        "UPDATE order_rounds SET kot_status='SERVED' WHERE id=$1",
        [roundId],
      );
      await refreshOrderStatus(tx, orderId);
      await audit(tx, actor, {
        action: "ORDER_SERVED",
        entityType: "ORDER_ROUND",
        entityId: roundId,
        outletId: order.outlet_id,
      });
}

export async function serveSelected(db:Database,actor:Actor,key:string,input:unknown){
 requirePermission(actor,'sessions');requirePermission(actor,'orders');
 ensure(!actor.application||actor.application==='MASTER','APPLICATION_FORBIDDEN','Serve selected rounds in the web workspace.',403);
 const data=z.object({outletId:z.uuid(),confirmedServed:z.literal(true),rounds:z.array(z.object({orderId:z.uuid(),roundId:z.uuid(),version:z.number().int().positive()}).strict()).min(1).max(20)}).strict().parse(input);requireOutlet(actor,data.outletId);
 ensure(new Set(data.rounds.map(r=>r.roundId)).size===data.rounds.length,'DUPLICATE_ROUND','Select each round once.');
 return command(db,actor,key,'SELECTED_ROUNDS_SERVED',data,async tx=>{
  for(const orderId of [...new Set(data.rounds.map(r=>r.orderId))].sort()){const order=await scopedOrder(tx,actor,orderId,true);ensure(order.outlet_id===data.outletId,'OUTLET_FORBIDDEN','All selected rounds must belong to this outlet.',403);}
  for(const round of [...data.rounds].sort((a,b)=>a.roundId.localeCompare(b.roundId)))await serveInTransaction(tx,actor,round.orderId,round.roundId,round.version);
  return {ok:true,served:data.rounds.length};
 });
}

export async function completePreparedService(db:Database,actor:Actor,key:string,orderId:string,roundId:string,input:unknown){
 requirePermission(actor,'kitchen');requirePermission(actor,'orders');
 ensure(!actor.application||actor.application==='MASTER','APPLICATION_FORBIDDEN','Complete selected kitchen/service steps in the web workspace.',403);
 const data=z.object({version:z.number().int().positive(),confirmedPreparedAndServed:z.literal(true)}).strict().parse(input);
 return command(db,actor,key,'PREPARED_SERVICE_CONFIRMED',{orderId,roundId,...data},async tx=>{
  const order=await scopedOrder(tx,actor,orderId,true),round=await one(tx,'SELECT * FROM order_rounds WHERE id=$1 AND order_id=$2 FOR UPDATE',[roundId,orderId]);expectedVersion(round.version,data.version);
  ensure(!['SETTLED','VOIDED','REJECTED'].includes(order.status)&&round.status==='ACCEPTED'&&['RELEASED','PREPARING','READY'].includes(round.kot_status),'SERVICE_NOT_ELIGIBLE','Only accepted, authorized and unserved food can complete these steps.',409);
  const tickets=(await tx.query('SELECT id,status FROM kot_tickets WHERE round_id=$1 ORDER BY id FOR UPDATE',[roundId])).rows;
  ensure(tickets.length>0&&tickets.every(ticket=>['RELEASED','PREPARING','READY'].includes(String(ticket.status))),'FOOD_NOT_READY','Refresh the current kitchen tickets before completing service.',409);
  for(const ticket of tickets){if(ticket.status==='RELEASED')await transitionTicket(tx,actor,String(ticket.id),'PREPARING');if(ticket.status!=='READY')await transitionTicket(tx,actor,String(ticket.id),'READY');}
  await serveInTransaction(tx,actor,orderId,roundId);
  await audit(tx,actor,{action:'PREPARED_SERVICE_CONFIRMED',entityType:'ORDER_ROUND',entityId:roundId,outletId:order.outlet_id,newState:{foodPreparedAndServed:true},reason:'Authorized staff explicitly confirmed physical preparation and service',risk:'WARNING'});
  return orderDetail(tx,actor,orderId);
 });
}
