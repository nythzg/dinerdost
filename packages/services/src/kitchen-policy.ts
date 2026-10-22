import {z} from 'zod';
import type {Database,Sql} from '@dinerdost/database';
import {ensure,isManager,requireOutlet,requirePermission,type Actor} from '@dinerdost/core';
import {audit,command,expectedVersion,one} from './shared';
/** Called only immediately after inserting a new web round; never backfills old rounds. */
export async function snapshotWebKitchenPolicy(tx:Sql,outletId:string,roundId:string,web:boolean){
 if(web)await tx.query('UPDATE order_rounds SET web_kitchen_stages_enabled=(SELECT web_kitchen_stages_enabled FROM outlets WHERE id=$2) WHERE id=$1',[roundId,outletId]);
}
export async function saveKitchenStages(db:Database,actor:Actor,key:string,input:unknown){
 requirePermission(actor,'kitchen');requirePermission(actor,'sessions');ensure(isManager(actor),'FORBIDDEN','An owner or manager must change kitchen workflow.',403);ensure(!actor.application||actor.application==='MASTER','APPLICATION_FORBIDDEN','Change kitchen workflow in the web workspace.',403);
 const data=z.object({outletId:z.uuid(),version:z.number().int().positive(),enabled:z.boolean()}).strict().parse(input);requireOutlet(actor,data.outletId);
 return command(db,actor,key,'WEB_KITCHEN_POLICY_CHANGED',data,async tx=>{const outlet=await one(tx,'SELECT * FROM outlets WHERE id=$1 FOR UPDATE',[data.outletId]);expectedVersion(outlet.version,data.version);await tx.query('UPDATE outlets SET web_kitchen_stages_enabled=$2,version=version+1 WHERE id=$1',[data.outletId,data.enabled]);await audit(tx,actor,{action:'WEB_KITCHEN_POLICY_CHANGED',entityType:'OUTLET',entityId:data.outletId,outletId:data.outletId,oldState:{enabled:outlet.web_kitchen_stages_enabled},newState:{enabled:data.enabled},reason:'Applies only to new web rounds; staff serving is still required'});return {ok:true};});
}
