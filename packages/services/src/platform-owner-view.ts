import {z} from 'zod';
import type {Database} from '@dinerdost/database';
import {ensure,type Actor} from '@dinerdost/core';
import {one,type Row} from './shared';
import {requirePlatformMember,assertPlatformScope,type PlatformActor} from './platform-console';

export const PLATFORM_OWNER_VIEW_COOKIE='dd_platform_owner_view';
export async function platformOwnerView(db:Database,actor:PlatformActor,grantId:string){return db.transaction(null,async tx=>{
 const admin=await requirePlatformMember(tx,actor,'support');
 const grant=(await tx.query<Row>('SELECT * FROM platform_support_access WHERE id=$1 AND user_id=$2 AND session_hash=$3 AND ended_at IS NULL AND expires_at>now()',[z.uuid().parse(grantId),actor.userId,actor.sessionHash])).rows[0];
 ensure(grant,'SUPPORT_UNAVAILABLE','This temporary owner view expired or was revoked. Return to superadmin.',401);assertPlatformScope(admin,grant.restro_id);
 const owner=await one(tx,"SELECT e.*,u.name AS user_name FROM employees e JOIN users u ON u.id=e.user_id AND NOT u.disabled WHERE e.restro_id=$1 AND e.active AND e.role='OWNER' ORDER BY e.created_at,e.id LIMIT 1",[grant.restro_id],'No active owner is available for this view.');
 return {actor:{userId:owner.user_id,employeeId:owner.id,restroId:owner.restro_id,name:owner.name,role:'OWNER',outletIds:owner.outlet_ids,application:'MASTER',supportView:{operatorName:actor.name,expiresAt:new Date(grant.expires_at).toISOString()}} as Actor,expiresAt:new Date(grant.expires_at).toISOString()};
});}
/** Enforces read-only PostgreSQL transactions and tenant RLS for every owner-view service call. */
export function platformOwnerReadDatabase(db:Database,tenantId:string):Database{
 const transaction:Database['transaction']=async(restroId,callback)=>{
  ensure(restroId===null||restroId===tenantId,'PLATFORM_SCOPE_FORBIDDEN','A support view cannot change restaurant.',403);
  return db.transaction(null,async tx=>{
   await tx.query('SET TRANSACTION READ ONLY');
   await tx.query("SELECT set_config('app.restro_id',$1,true),set_config('app.support_readonly','true',true)",[tenantId]);
   await tx.query('SET LOCAL ROLE dinerdost_app');
   return callback(tx);
  });
 };
 return {transaction,query:(sql,params)=>transaction(tenantId,tx=>tx.query(sql,params)),migrate:async()=>{throw new Error('Read-only support database');},close:async()=>{}};
}
