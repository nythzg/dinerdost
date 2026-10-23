import {z} from 'zod';
import type {Database,Sql} from '@dinerdost/database';
import {ensure,isManager,requireOutlet,type Actor} from '@dinerdost/core';
import {audit,command,expectedVersion,num,one,type Row} from './shared';
/** Explicit operator provisioning; restaurant roles never imply platform administration. */
export function isPlatformLoyaltyAdmin(actor:Actor){return (!actor.application||actor.application==='MASTER')&&(process.env.DD_PLATFORM_ADMIN_USER_IDS??'').split(',').map(v=>v.trim()).filter(v=>z.uuid().safeParse(v).success).includes(actor.userId);}
export async function savePlatformLoyaltyCap(db:Database,actor:Actor,key:string,input:unknown){
 ensure(!actor.application||actor.application==='MASTER','APPLICATION_FORBIDDEN','Use web bill settings to change the loyalty cap.',403);
 ensure(isManager(actor)||isPlatformLoyaltyAdmin(actor),'FORBIDDEN','Only restaurant owners, outlet managers or a provisioned administrator can change the loyalty cap.',403);
 const data=z.object({outletId:z.uuid(),version:z.number().int().positive(),limit:z.number().int().min(0).max(1000000000)}).strict().parse(input);requireOutlet(actor,data.outletId);
 return command(db,actor,key,'WEB_LOYALTY_CAP_CHANGED',data,async tx=>{const outlet=await one(tx,'SELECT * FROM outlets WHERE id=$1 FOR UPDATE',[data.outletId]);expectedVersion(outlet.version,data.version);await tx.query('UPDATE outlets SET web_loyalty_cap_paise=$2,version=version+1 WHERE id=$1',[outlet.id,data.limit]);await audit(tx,actor,{action:'WEB_LOYALTY_CAP_CHANGED',entityType:'OUTLET',entityId:outlet.id,outletId:outlet.id,oldState:{limit:num(outlet.web_loyalty_cap_paise)},newState:{limit:data.limit},reason:'Authorized owner, outlet manager or platform administrator changed the outlet default per-bill cap for future loyalty claims; historical discounts preserved'});return{ok:true,version:num(outlet.version)+1,limit:data.limit};});
}
export async function webLoyaltyLimit(tx:Sql,order:Row,round:Row,outlet:Row,spendablePoints:number){
 const used=await one(tx,`SELECT coalesce(sum(greatest(0,r.discount-r.manual_discount)),0) AS amount
 FROM loyalty_reservations l JOIN order_rounds r ON r.id=l.round_id AND r.restro_id=l.restro_id
 WHERE r.order_id=$1 AND r.id<>$2 AND r.status NOT IN ('VOIDED','REJECTED')
 AND (l.state IN ('LOCKED','REDEEMED') OR (l.state='RESERVED' AND l.reserved_until>now()))`,[order.id,round.id]);
 const own=await one(tx,"SELECT coalesce(sum(points),0) AS points FROM loyalty_reservations WHERE round_id=$1 AND (state='LOCKED' OR (state='RESERVED' AND reserved_until>now()))",[round.id]);
 const pointValue=num(outlet.point_value_paise);ensure(pointValue>0,'LOYALTY_CONFIGURATION','The point value must be configured before redemption.',409);
 const orderCap=num(outlet.web_loyalty_cap_paise),remainingCap=Math.max(0,orderCap-num(used.amount));
 const maximum=Math.max(0,Math.min(100000*pointValue,(spendablePoints+num(own.points))*pointValue,remainingCap,num(outlet.max_redemption_paise),Math.floor(num(round.subtotal)*num(outlet.max_redemption_bps)/10000),num(round.subtotal)));
 return{orderCap,usedOnOtherRounds:num(used.amount),remainingOrderCap:remainingCap,maxRedemptionAmount:Math.floor(maximum/pointValue)*pointValue,pointValue};
}
/** Naming is an outlet setting, not an adjustment to an existing bill. */
export async function saveWebLoyaltyName(db:Database,actor:Actor,key:string,input:unknown){
 ensure(!actor.application||actor.application==='MASTER','APPLICATION_FORBIDDEN','Use web loyalty settings.',403);
 ensure(isManager(actor),'FORBIDDEN','Only restaurant owners and assigned outlet managers can change the loyalty reward name.',403);
 const data=z.object({outletId:z.uuid(),version:z.number().int().positive(),name:z.string().trim().min(1).max(80).regex(/^[^\u0000-\u001f\u007f]+$/,'Use a single-line reward name.')}).strict().parse(input);
 requireOutlet(actor,data.outletId);
 return command(db,actor,key,'WEB_LOYALTY_NAME_CHANGED',data,async tx=>{
  const outlet=await one(tx,'SELECT * FROM outlets WHERE id=$1 FOR UPDATE',[data.outletId]);expectedVersion(outlet.version,data.version);
  await tx.query('UPDATE outlets SET web_loyalty_name=$2,version=version+1 WHERE id=$1',[outlet.id,data.name]);
  await audit(tx,actor,{action:'WEB_LOYALTY_NAME_CHANGED',entityType:'OUTLET',entityId:outlet.id,outletId:outlet.id,oldState:{name:outlet.web_loyalty_name},newState:{name:data.name},reason:'Changed the outlet name for future web loyalty claims; prior claims and issued financial records preserved'});
  return {ok:true,name:data.name,version:num(outlet.version)+1};
 });
}
