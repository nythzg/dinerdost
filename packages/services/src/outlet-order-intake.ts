import {z} from 'zod';
import type {Database,Sql} from '@dinerdost/database';
import {ensure,isManager,requireOutlet,type Actor} from '@dinerdost/core';
import {audit,command,expectedVersion,one} from './shared';

// The shared outlet lock serializes order intake with the On/Off change.
export async function assertOutletOrderIntake(tx:Sql,outletId:string){
 const outlet=await one(tx,'SELECT order_intake_enabled FROM outlets WHERE id=$1 FOR SHARE',[outletId]);
 ensure(outlet.order_intake_enabled,'OUTLET_ORDERING_PAUSED','This outlet is not accepting new orders. Please try again when ordering reopens.',409);
}

export async function setOutletOrderIntake(db:Database,actor:Actor,key:string,input:unknown){
 ensure(!actor.application||actor.application==='MASTER','APPLICATION_FORBIDDEN','Use the restaurant web workspace to change order intake.',403);
 ensure(actor.supportView?.mode!=='READ_ONLY','SUPPORT_READ_ONLY','This is a read-only owner view.',403);
 ensure(isManager(actor),'FORBIDDEN','Only the owner or an assigned outlet manager can change order intake.',403);
 const data=z.object({outletId:z.uuid(),enabled:z.boolean(),version:z.number().int().positive()}).strict().parse(input);
 requireOutlet(actor,data.outletId);
 return command(db,actor,key,'OUTLET_ORDER_INTAKE_CHANGED',data,async tx=>{
  const before=await one(tx,'SELECT id,order_intake_enabled,order_intake_version FROM outlets WHERE id=$1 FOR UPDATE',[data.outletId]);
  expectedVersion(before.order_intake_version,data.version);
  const saved=await one(tx,'UPDATE outlets SET order_intake_enabled=$2,order_intake_version=order_intake_version+1 WHERE id=$1 RETURNING order_intake_enabled,order_intake_version',[data.outletId,data.enabled]);
  await audit(tx,actor,{action:'OUTLET_ORDER_INTAKE_CHANGED',entityType:'OUTLET',entityId:data.outletId,outletId:data.outletId,oldState:{enabled:before.order_intake_enabled},newState:{enabled:data.enabled},reason:data.enabled?'Reopened new order intake for this outlet':'Paused new order intake from all sources for this outlet; existing orders and financial history remain available'});
  return saved;
 });
}
