import {z} from 'zod';
import type {Database,Sql} from '@dinerdost/database';
import {ensure,restaurantFeatures,type FeatureFlags} from '@dinerdost/core';
import {appendPlatformAudit,platformMutation,requirePlatformMember,type PlatformActor} from './platform-console';
import {expectedVersion,id,json,one,type Row} from './shared';
export async function platformFeatureFlags(tx:Sql,lock=false):Promise<FeatureFlags>{
 if(!(await tx.query("SELECT to_regprocedure('public.platform_own_feature_controls(boolean)') AS present")).rows[0].present)return {};
 return (await tx.query<{flags:FeatureFlags}>('SELECT platform_own_feature_controls($1) AS flags',[lock])).rows[0].flags;
}
export async function savePlatformFeatureControls(db:Database,actor:PlatformActor,key:string,input:unknown){
 const names=restaurantFeatures.map(([name])=>name) as [string,...string[]];
 const data=z.object({tenantId:z.uuid().nullable(),version:z.number().int().min(0),flags:z.partialRecord(z.enum(names),z.boolean()),reason:z.string().trim().min(5).max(500)}).strict().parse(input);
 return platformMutation(db,actor,key,'tenants','PLATFORM_FEATURE_CONTROLS_SAVED',data,data.reason,async tx=>{
  const admin=await requirePlatformMember(tx,actor);ensure(admin.role==='SUPERADMIN','PLATFORM_FORBIDDEN','Only Superadmin can change feature availability.',403);
  if(data.tenantId)await one(tx,'SELECT id FROM restaurants WHERE id=$1',[data.tenantId]);
  // platformMutation's audit-head lock serializes configuration saves, including first creation.
  const old=(await tx.query<Row>("SELECT * FROM platform_records WHERE kind='FEATURE_CONTROL' AND tenant_id IS NOT DISTINCT FROM $1::uuid FOR UPDATE",[data.tenantId])).rows[0];
  expectedVersion(old?.version??0,data.version);
  const recordId=old?.id??id();
  if(old)await tx.query('UPDATE platform_records SET data=$2::jsonb,version=version+1,updated_at=now() WHERE id=$1',[recordId,json(data.flags)]);
  else await tx.query("INSERT INTO platform_records(id,kind,name,tenant_id,data) VALUES($1,'FEATURE_CONTROL','Restaurant feature availability',$2,$3::jsonb)",[recordId,data.tenantId,json(data.flags)]);
  await appendPlatformAudit(tx,actor,'PLATFORM_FEATURE_CONTROLS_SAVED',data.tenantId??'SERVER',data.reason,old?.data??{},data.flags);
  return {id:recordId,version:(old?.version??0)+1};
 });
}
