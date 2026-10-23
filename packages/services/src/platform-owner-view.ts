import {z} from 'zod';
import type {Database,Sql} from '@dinerdost/database';
import {ensure,type Actor} from '@dinerdost/core';
import {one,type Row} from './shared';
import {requirePlatformMember,assertPlatformScope,appendPlatformAudit,type PlatformActor} from './platform-console';

export const PLATFORM_OWNER_VIEW_COOKIE='dd_platform_owner_view';
async function ownerView(tx:Sql,actor:PlatformActor,grantId:string,lock=false){
 const admin=await requirePlatformMember(tx,actor,'support');
 const grant=(await tx.query<Row>('SELECT * FROM platform_support_access WHERE id=$1 AND user_id=$2 AND session_hash=$3 AND ended_at IS NULL AND expires_at>clock_timestamp()'+(lock?' FOR SHARE':''),[z.uuid().parse(grantId),actor.userId,actor.sessionHash])).rows[0];
 ensure(grant,'SUPPORT_UNAVAILABLE','This temporary owner view expired or was revoked. Return to superadmin.',401);assertPlatformScope(admin,grant.restro_id);
 if(grant.mode==='EDIT')ensure(admin.role==='SUPERADMIN','PLATFORM_FORBIDDEN','Only an active Superadmin may use editable owner support.',403);
 const owner=await one(tx,"SELECT e.*,u.name AS user_name FROM employees e JOIN users u ON u.id=e.user_id AND NOT u.disabled WHERE e.restro_id=$1 AND e.active AND e.role='OWNER' ORDER BY e.created_at,e.id LIMIT 1",[grant.restro_id],'No active owner is available for this view.');
 return {actor:{userId:owner.user_id,employeeId:owner.id,restroId:owner.restro_id,name:grant.mode==='EDIT'?actor.name+' · support as '+owner.name:owner.name,role:'OWNER',outletIds:owner.outlet_ids,application:'MASTER',ip:actor.ip,supportView:{operatorId:actor.userId,operatorName:actor.name,grantId:grant.id,mode:grant.mode??'READ_ONLY',expiresAt:new Date(grant.expires_at).toISOString()}} as Actor,expiresAt:new Date(grant.expires_at).toISOString()};
}
export async function platformOwnerView(db:Database,actor:PlatformActor,grantId:string){return db.transaction(null,tx=>ownerView(tx,actor,grantId));}

/** Revalidate before every transaction; keep owner RLS and normal financial guards. */
export function platformOwnerEditDatabase(db:Database,operator:PlatformActor,grantId:string,tenantId:string):Database{
 const transaction:Database['transaction']=async(restroId,callback)=>{
  ensure(restroId===null||restroId===tenantId,'PLATFORM_SCOPE_FORBIDDEN','A support session cannot change restaurant.',403);
  return db.transaction(null,async raw=>{
   let checked=false,readOnly=false,auditSequence=0;
   const tx:Sql={query:async(sql,params)=>{
    // Read models may choose isolation/read-only before their first query.
    if(!checked&&/^\s*SET TRANSACTION\b/i.test(sql)){readOnly=readOnly||/READ ONLY/i.test(sql);return raw.query(sql,params);}
    if(!checked){
     if(!readOnly)await one(raw,'SELECT * FROM platform_audit_head WHERE singleton=true FOR UPDATE');
     const view=await ownerView(raw,operator,grantId,!readOnly);
     ensure(view.actor.supportView?.mode==='EDIT','SUPPORT_READ_ONLY','This grant does not permit changes.',403);
     ensure(view.actor.restroId===tenantId,'PLATFORM_SCOPE_FORBIDDEN','This support session belongs to another restaurant.',403);
     await raw.query("SELECT set_config('app.restro_id',$1,true),set_config('app.support_readonly','false',true)",[tenantId]);
     if(!readOnly)auditSequence=Number((await raw.query<{sequence:number}>('SELECT sequence FROM audit_heads WHERE restro_id=$1',[tenantId])).rows[0]?.sequence??0);
     await raw.query('SET LOCAL ROLE dinerdost_app');checked=true;
    }
    return raw.query(sql,params);
   }};
   const result=await callback(tx);
   if(checked&&!readOnly){
    await raw.query('RESET ROLE');
    // Only this transaction's immutable business events count, never reads or idempotent replays.
    const actions=(await raw.query<Row>('SELECT id,action,entity_type,entity_id,outlet_id FROM audit_events WHERE restro_id=$1 AND sequence>$2 AND xmin=pg_current_xact_id_if_assigned()::xid ORDER BY sequence',[tenantId,auditSequence])).rows;
    for(const event of actions)await appendPlatformAudit(raw,operator,'PLATFORM_OWNER_ACTION',tenantId,'Explicit editable owner support',null,{grantId,mode:'EDIT',tenantAuditId:event.id,action:event.action,entityType:event.entity_type,entityId:event.entity_id,outletId:event.outlet_id});
   }
   return result;
  });
 };
 return {transaction,query:(sql,params)=>transaction(tenantId,tx=>tx.query(sql,params)),migrate:async()=>{throw new Error('Support cannot migrate databases');},close:async()=>{}};
}
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
