import {z} from 'zod';
import {randomBytes,createHash} from 'node:crypto';
import type {Database,Sql} from '@dinerdost/database';
import {ensure,platformPermissions,platformRolePermissions,platformResources,platformFeatures,type Actor,type PlatformPermission} from '@dinerdost/core';
import {canonical,hash,id,json,one,expectedVersion,num,type Row} from './shared';
import {passwordHash,stepUp} from './auth';
import {applyOnboardingDefault} from './platform-setup';
import {platformDataset,restaurantScope,restaurantDatasetCounts} from './platform-restaurant-data';

export type PlatformActor=Pick<Actor,'userId'|'name'|'sessionHash'|'application'|'ip'>&{employeeId?:string};
export async function requirePlatformMember(tx:Sql,actor:PlatformActor,permission?:PlatformPermission):Promise<Row&{permissions:PlatformPermission[]}>{
 ensure(!actor.application||actor.application==='MASTER','PLATFORM_FORBIDDEN','Use the web superadmin panel.',403);
 ensure(actor.sessionHash,'UNAUTHENTICATED','Sign in to continue.',401);
 const separate=(await tx.query<{present:string|null}>("SELECT to_regclass('public.platform_sessions') AS present")).rows[0].present;
 const current=await tx.query<Row>(`SELECT m.*,u.name,u.email FROM platform_members m JOIN users u ON u.id=m.user_id
 WHERE m.user_id=$1 AND m.enabled AND NOT u.disabled AND (EXISTS(SELECT 1 FROM auth_sessions s JOIN employees e ON e.id=s.employee_id AND e.active WHERE s.user_id=u.id AND s.employee_id=$2::uuid AND s.token_hash=$3 AND s.expires_at>now() AND s.application='MASTER')${separate?" OR EXISTS(SELECT 1 FROM platform_sessions s WHERE s.user_id=u.id AND s.token_hash=$3 AND s.expires_at>now())":""})`,[actor.userId,actor.employeeId??null,actor.sessionHash]);
 const result=current.rows[0];ensure(result,'PLATFORM_FORBIDDEN','This account has no platform administration access.',403);
 const permissions=result.role==='SUPERADMIN'?[...platformPermissions]:result.permissions as PlatformPermission[];
 ensure(!permission||permissions.includes(permission),'PLATFORM_FORBIDDEN','Your platform role cannot perform this action.',403);
 return {...result,permissions};
}
export function assertPlatformScope(admin:Row,tenantId?:string|null){ensure(admin.tenant_scope===null||admin.tenant_scope===undefined||!!tenantId&&admin.tenant_scope.includes(tenantId),'PLATFORM_SCOPE_FORBIDDEN','This restaurant is outside your assigned platform scope.',403);}
export async function appendPlatformAudit(tx:Sql,actor:{userId:string;name:string;ip?:string},action:string,entityId:string,reason:string,before:unknown,after:unknown){
 const head=await one(tx,'SELECT * FROM platform_audit_head WHERE singleton=true FOR UPDATE');
 const event=JSON.parse(JSON.stringify({id:id(),sequence:num(head.sequence)+1,actorUserId:actor.userId,actorName:actor.name,action,entityId,reason,ip:actor.ip??null,before:before??null,after:after??null,occurredAt:new Date().toISOString(),previousHash:head.hash}));
 const recordHash=hash(canonical(event));await tx.query('INSERT INTO platform_audit(id,sequence,actor_user_id,actor_name,action,entity_id,reason,ip,before_data,after_data,occurred_at,previous_hash,record_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13)',[event.id,event.sequence,actor.userId,actor.name,action,entityId,reason,event.ip,json(before),json(after),event.occurredAt,head.hash,recordHash]);
 await tx.query('UPDATE platform_audit_head SET sequence=$1,hash=$2 WHERE singleton=true',[event.sequence,recordHash]);
}
/** Operator-only bootstrap. No HTTP action exposes this function. */
export async function bootstrapPlatformAdmin(db:Database,email:string){
 const parsed=z.email().toLowerCase().parse(email);
 return db.transaction(null,async tx=>{
  await one(tx,'SELECT * FROM platform_audit_head WHERE singleton=true FOR UPDATE');
  const user=await one(tx,'SELECT id,name FROM users WHERE email=$1 AND NOT disabled AND EXISTS(SELECT 1 FROM employees e WHERE e.user_id=users.id AND e.active)',[parsed]);
  const existing=(await tx.query<Row>("SELECT * FROM platform_members WHERE role='SUPERADMIN' AND enabled")).rows;
  if(existing.some(row=>row.user_id===user.id))return {userId:user.id,existing:true};
  ensure(existing.length===0,'PLATFORM_BOOTSTRAPPED','Use the existing superadmin to grant further access.',403);
  await tx.query("INSERT INTO platform_members(user_id,role,permissions) VALUES($1,'SUPERADMIN',$2)",[user.id,[...platformPermissions]]);
  await appendPlatformAudit(tx,{userId:user.id,name:user.name},'PLATFORM_BOOTSTRAPPED',user.id,'Explicit local operator provisioning',null,{role:'SUPERADMIN'});
  return {userId:user.id,existing:false};
 });
}
export async function platformMutation<T>(db:Database,actor:PlatformActor,key:string,permission:PlatformPermission,action:string,input:unknown,reason:string,callback:(tx:Sql)=>Promise<T>){
 ensure(/^[\w-]{16,128}$/.test(key),'IDEMPOTENCY_REQUIRED','A request key is required.');
 return db.transaction(null,async tx=>{
  await one(tx,'SELECT * FROM platform_audit_head WHERE singleton=true FOR UPDATE');
  const admin=await requirePlatformMember(tx,actor,permission);
  if(admin.tenant_scope!==null&&admin.tenant_scope!==undefined){
   const value=input as Row;let tenantId=value?.tenantId??value?.tenant_id;
   if(!tenantId&&value?.outletId)tenantId=(await one(tx,'SELECT restro_id FROM outlets WHERE id=$1',[value.outletId])).restro_id;
   if(!tenantId&&action==='PLATFORM_SUPPORT_ENDED')tenantId=(await one(tx,'SELECT restro_id FROM platform_support_access WHERE id=$1',[value.id])).restro_id;
   assertPlatformScope(admin,tenantId);
  }
  const fingerprint=hash(canonical({action,input,role:admin.role,permissions:admin.permissions,scope:admin.tenant_scope??null}));
  await tx.query('INSERT INTO platform_requests(user_id,key,fingerprint) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[actor.userId,key,fingerprint]);
  const request=await one(tx,'SELECT * FROM platform_requests WHERE user_id=$1 AND key=$2 FOR UPDATE',[actor.userId,key]);
  ensure(request.fingerprint===fingerprint,'IDEMPOTENCY_CONFLICT','This request key belongs to a different action.',409);if(request.response!==null)return request.response as T;
  const result=await callback(tx);await tx.query('UPDATE platform_requests SET response=$3::jsonb WHERE user_id=$1 AND key=$2',[actor.userId,key,json(result)]);return result;
 });
}
const reasonSchema=z.string().trim().min(5).max(500);
const dateString=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s,'Use a valid date.');
function recordData(kind:string,input:unknown){
 const spec=platformResources[kind];ensure(spec,'INVALID_INPUT','Unknown administration category.');const shape:Record<string,z.ZodType>={};
 for(const field of spec.fields){let schema:z.ZodType=field.type==='checkbox'?z.boolean():field.type==='features'?z.array(z.enum(platformFeatures)).max(platformFeatures.length).refine(a=>new Set(a).size===a.length):field.type==='number'?z.number().min(field.min??0).max(field.max??1000000000).multipleOf(['fee','amount','rate'].includes(field.key)?.01:1):field.type==='date'?dateString:field.type==='datetime-local'?z.iso.datetime():field.type==='select'?z.enum(field.options as [string,...string[]]):z.string().trim().max(field.type==='textarea'?2000:200);
  if(field.required&&field.type!=='number'&&field.type!=='select'&&field.type!=='date'&&field.type!=='datetime-local')schema=(schema as z.ZodString).min(1);
  shape[field.key]=field.required?schema:schema.optional();
 }
 const data=z.object(shape).strict().parse(input) as Row;
 if(kind==='TICKET'&&data.status==='RESOLVED')ensure(data.resolution?.trim(),'RESOLUTION_REQUIRED','Add a resolution before closing the case.');
 if(kind==='DOMAIN')ensure(/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(data.hostname),'INVALID_DOMAIN','Enter a hostname without a protocol or path.');
 if(data.color)ensure(/^#[a-f0-9]{6}$/i.test(data.color),'INVALID_COLOR','Use a six-digit hex color.');
 if(kind==='FEE_RULE'&&data.basis==='PERCENT')ensure(data.amount<=100,'INVALID_INPUT','A percentage cannot exceed 100.');
 if(kind==='BROADCAST')ensure(new Date(data.endsAt)>new Date(data.startsAt),'INVALID_DATES','End time must follow start time.');
 if(kind==='SUBSCRIPTION'&&data.end)ensure(data.end>=data.start,'INVALID_DATES','End date must follow start date.');
 return data;
}
export async function savePlatformRecord(db:Database,actor:PlatformActor,key:string,input:unknown){
 const data=z.object({id:z.uuid().optional(),kind:z.string(),name:z.string().trim().min(1).max(150),tenantId:z.uuid().nullable().optional(),version:z.number().int().min(0),data:z.unknown(),archived:z.boolean().default(false),reason:reasonSchema}).strict().parse(input);
 const spec=platformResources[data.kind];ensure(spec,'INVALID_INPUT','Unknown administration category.');const payload=recordData(data.kind,data.data);
 ensure(!spec.tenant||data.tenantId,'TENANT_REQUIRED','Choose a restaurant.');
 return platformMutation(db,actor,key,spec.permission,'PLATFORM_RECORD_SAVED',{...data,data:payload},data.reason,async tx=>{
  if(data.tenantId)await one(tx,'SELECT id FROM restaurants WHERE id=$1',[data.tenantId]);
  if(data.kind==='SUBSCRIPTION'){if(payload.status==='ACTIVE'&&!data.archived)ensure(!(await tx.query("SELECT id FROM platform_records WHERE kind='SUBSCRIPTION' AND tenant_id=$1 AND NOT archived AND data->>'status'='ACTIVE' AND id<>$2 AND (nullif(data->>'end','') IS NULL OR (data->>'end')::date>=$3::date) AND ($4::date IS NULL OR (data->>'start')::date<=$4::date)",[data.tenantId,data.id??'00000000-0000-0000-0000-000000000000',payload.start,payload.end??null])).rows.length,'SUBSCRIPTION_OVERLAP','Active subscription dates cannot overlap for a restaurant.',409);const plan=await one<Row>(tx,"SELECT * FROM platform_records WHERE id=$1 AND kind='PLAN' AND NOT archived",[z.uuid().parse(payload.planId)]);payload.planFee=plan.data.fee;payload.planCycle=plan.data.cycle;}
  const before=data.id?(await one<Row>(tx,'SELECT * FROM platform_records WHERE id=$1 FOR UPDATE',[data.id])):null;
  if(before)assertPlatformScope(await requirePlatformMember(tx,actor),before.tenant_id);
  ensure(!before||before.kind===data.kind,'INVALID_INPUT','Record category cannot change.');expectedVersion(before?.version??0,data.version);
  if(before?.kind==='SUBSCRIPTION'&&before.data.planId===payload.planId){payload.planFee=before.data.planFee;payload.planCycle=before.data.planCycle;}
  ensure(!(before?.kind==='BILLING'),'IMMUTABLE_BILLING','Billing records are immutable. Add a correcting credit or payment record.',409);
  if(data.kind==='DOMAIN'&&!data.archived)ensure(!(await tx.query("SELECT id FROM platform_records WHERE kind='DOMAIN' AND NOT archived AND lower(data->>'hostname')=lower($1) AND id<>$2",[payload.hostname,data.id??'00000000-0000-0000-0000-000000000000'])).rows.length,'DOMAIN_TAKEN','This hostname is already requested.',409);
  if(data.kind==='PROMO'&&!data.archived)ensure(!(await tx.query("SELECT id FROM platform_records WHERE kind='PROMO' AND NOT archived AND lower(data->>'code')=lower($1) AND id<>$2",[payload.code,data.id??'00000000-0000-0000-0000-000000000000'])).rows.length,'CODE_TAKEN','Choose a unique SaaS promotion code.',409);
  if(data.kind==='BILLING')ensure(!(await tx.query("SELECT id FROM platform_records WHERE kind='BILLING' AND tenant_id=$1 AND lower(data->>'reference')=lower($2) AND data->>'type'=$3",[data.tenantId,payload.reference,payload.type])).rows.length,'BILLING_REFERENCE_TAKEN','This subscription billing reference is already recorded for the restaurant.',409);
  const recordId=data.id??id();if(before)await tx.query('UPDATE platform_records SET name=$2,tenant_id=$3,data=$4::jsonb,archived=$5,version=version+1,updated_at=now() WHERE id=$1',[recordId,data.name,data.tenantId??null,json(payload),data.archived]);else await tx.query('INSERT INTO platform_records(id,kind,name,tenant_id,data,archived) VALUES($1,$2,$3,$4,$5::jsonb,$6)',[recordId,data.kind,data.name,data.tenantId??null,json(payload),data.archived]);
  if(data.kind==='SUBSCRIPTION')await tx.query('INSERT INTO platform_contract_history(id,subscription_id,restro_id,snapshot) VALUES($1,$2,$3,$4::jsonb)',[id(),recordId,data.tenantId,json({...payload,archived:data.archived})]);
  await appendPlatformAudit(tx,actor,'PLATFORM_'+data.kind+'_SAVED',recordId,data.reason,before,{name:data.name,tenantId:data.tenantId??null,data:payload,archived:data.archived});return {ok:true,id:recordId,version:(before?.version??0)+1};
 });
}
export async function savePlatformTenant(db:Database,actor:PlatformActor,key:string,input:unknown){
 const data=z.object({tenantId:z.uuid(),version:z.number().int().min(0),status:z.enum(['ACTIVE','HOLD','SUSPENDED','TERMINATED']),kyc:z.enum(['UNREVIEWED','VERIFIED','REJECTED']),brandId:z.uuid().nullable(),planId:z.uuid().nullable(),businessType:z.enum(['RESTAURANT','CLOUD_KITCHEN','FRANCHISE']),gstin:z.string().trim().max(30),license:z.string().trim().max(100),notes:z.string().trim().max(2000),reason:reasonSchema,adminPassword:z.string().optional()}).strict().parse(input);
 if(data.status==='TERMINATED')await stepUp(db,actor,data.adminPassword);
 return platformMutation(db,actor,key,'tenants','PLATFORM_TENANT_SAVED',{...data,adminPassword:undefined},data.reason,async tx=>{
  await one(tx,'SELECT id FROM restaurants WHERE id=$1',[data.tenantId]);
  const before=(await tx.query<Row>('SELECT * FROM platform_tenant_policies WHERE restro_id=$1 FOR UPDATE',[data.tenantId])).rows[0];expectedVersion(before?.version??0,data.version);const scoped=await requirePlatformMember(tx,actor);if(scoped.tenant_scope!==null&&scoped.tenant_scope!==undefined)ensure(data.brandId===(before?.brand_id??null),'PLATFORM_SCOPE_FORBIDDEN','Parent-brand reassignment requires platform-wide access.',403);
  ensure(before?.status!=='TERMINATED'||data.status==='TERMINATED','TENANT_TERMINATED','A terminated account cannot be reactivated.',409);
  if(data.brandId)await one(tx,"SELECT id FROM platform_records WHERE id=$1 AND kind='BRAND' AND NOT archived",[data.brandId]);
  const plan=data.planId?await one<Row>(tx,"SELECT * FROM platform_records WHERE id=$1 AND kind='PLAN' AND NOT archived",[data.planId]):null;
  const details={businessType:data.businessType,gstin:data.gstin,license:data.license,notes:data.notes};
  await tx.query(`INSERT INTO platform_tenant_policies(restro_id,status,kyc,brand_id,plan_id,features,staff_limit,outlet_limit,order_limit,details) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb)
   ON CONFLICT(restro_id) DO UPDATE SET status=excluded.status,kyc=excluded.kyc,brand_id=excluded.brand_id,plan_id=excluded.plan_id,features=excluded.features,staff_limit=excluded.staff_limit,outlet_limit=excluded.outlet_limit,order_limit=excluded.order_limit,details=excluded.details,version=platform_tenant_policies.version+1,updated_at=now()`,[data.tenantId,data.status,data.kyc,data.brandId,data.planId,plan?json(plan.data.features??[]):null,plan?.data.staffLimit??null,plan?.data.outletLimit??null,plan?.data.orderLimit??null,json(details)]);
  await appendPlatformAudit(tx,actor,'PLATFORM_TENANT_SAVED',data.tenantId,data.reason,before,{status:data.status,kyc:data.kyc,brandId:data.brandId,planId:data.planId,details});return {ok:true,version:(before?.version??0)+1};
 });
}
export async function createPlatformTenant(db:Database,actor:PlatformActor,key:string,input:unknown){
 const data=z.object({name:z.string().trim().min(2).max(150),outlet:z.string().trim().min(2).max(150),ownerName:z.string().trim().min(2).max(120),email:z.email().toLowerCase(),password:z.string().min(12).max(128),reason:reasonSchema}).strict().parse(input);
 const encoded=await passwordHash(data.password);
 return platformMutation(db,actor,key,'tenants','PLATFORM_TENANT_CREATED',{...data,password:hash(data.password)},data.reason,async tx=>{
  ensure(!(await tx.query('SELECT id FROM users WHERE email=$1',[data.email])).rows.length,'EMAIL_TAKEN','Use a new owner email. Existing accounts are never overwritten.',409);
  const userId=id(),restroId=id(),outletId=id(),employeeId=id();
  await tx.query('INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)',[userId,data.email,data.ownerName,encoded]);
  await tx.query('INSERT INTO restaurants(id,name,slug) VALUES($1,$2,$3)',[restroId,data.name,'restaurant-'+restroId]);
  await tx.query("INSERT INTO outlets(id,restro_id,name,code,qr_enabled,payment_policy,tax_bps) VALUES($1,$2,$3,'OUT01',false,'PREPAID',0)",[outletId,restroId,data.outlet]);
  await tx.query("INSERT INTO employees(id,restro_id,user_id,name,role,outlet_ids) VALUES($1,$2,$3,$4,'OWNER',$5)",[employeeId,restroId,userId,data.ownerName,[outletId]]);
  await tx.query("INSERT INTO platform_tenant_policies(restro_id,status) VALUES($1,'HOLD')",[restroId]);
  await applyOnboardingDefault(tx,restroId,outletId);
  await appendPlatformAudit(tx,actor,'PLATFORM_TENANT_CREATED',restroId,data.reason,null,{name:data.name,outlet:data.outlet,ownerEmail:data.email,status:'HOLD'});return {ok:true,id:restroId};
 });
}
export async function savePlatformMember(db:Database,actor:PlatformActor,key:string,input:unknown){
 const data=z.object({email:z.email().toLowerCase(),role:z.enum(['SUPERADMIN','ONBOARDING','BILLING','SUPPORT','SALES','ANALYST','CUSTOM']),permissions:z.array(z.enum(platformPermissions)).max(platformPermissions.length),enabled:z.boolean(),version:z.number().int().min(0),reason:reasonSchema,tenantIds:z.array(z.uuid()).max(1000).nullable().optional(),region:z.string().trim().max(100).optional(),adminPassword:z.string()}).strict().parse(input);
 await stepUp(db,actor,data.adminPassword);
 return platformMutation(db,actor,key,'team','PLATFORM_MEMBER_SAVED',{...data,adminPassword:undefined},data.reason,async tx=>{
  const admin=await requirePlatformMember(tx,actor);ensure(admin.role==='SUPERADMIN','PLATFORM_FORBIDDEN','Only a superadmin can grant internal access.',403);
  const user=await one(tx,'SELECT id,name FROM users WHERE email=$1 AND NOT disabled AND (EXISTS(SELECT 1 FROM employees e WHERE e.user_id=users.id AND e.active) OR EXISTS(SELECT 1 FROM platform_members m WHERE m.user_id=users.id))',[data.email]);
  const before=(await tx.query<Row>('SELECT * FROM platform_members WHERE user_id=$1 FOR UPDATE',[user.id])).rows[0];expectedVersion(before?.version??0,data.version);
  if(before?.role==='SUPERADMIN'&&before.enabled&&(!data.enabled||data.role!=='SUPERADMIN'))ensure(num((await one(tx,"SELECT count(*) AS count FROM platform_members WHERE role='SUPERADMIN' AND enabled")).count)>1,'LAST_SUPERADMIN','Keep at least one enabled superadmin.',409);
  const permissions=data.role==='CUSTOM'?Array.from(new Set(data.permissions)):platformRolePermissions[data.role];
  ensure(data.role==='SUPERADMIN'||!permissions.includes('team'),'PLATFORM_FORBIDDEN','Internal access administration is reserved for superadmins.',403);
  const scope=data.tenantIds===undefined?before?.tenant_scope??null:data.tenantIds;ensure(data.role!=='SUPERADMIN'||scope===null,'INVALID_SCOPE','Superadmins must have platform-wide access.');if(scope)ensure((await tx.query('SELECT id FROM restaurants WHERE id=ANY($1::uuid[])',[scope])).rows.length===new Set(scope).size,'INVALID_SCOPE','Choose existing restaurants.');
  await tx.query('INSERT INTO platform_members(user_id,role,permissions,enabled) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET role=excluded.role,permissions=excluded.permissions,enabled=excluded.enabled,version=platform_members.version+1',[user.id,data.role,permissions,data.enabled]);
  await tx.query('UPDATE platform_members SET tenant_scope=$2,region=$3 WHERE user_id=$1',[user.id,scope,data.region??before?.region??'']);
  await appendPlatformAudit(tx,actor,'PLATFORM_MEMBER_SAVED',user.id,data.reason,before?{role:before.role,permissions:before.permissions,enabled:before.enabled,tenantScope:before.tenant_scope??null,region:before.region??''}:null,{role:data.role,permissions,enabled:data.enabled,tenantScope:scope,region:data.region??before?.region??''});return {ok:true,version:(before?.version??0)+1};
 });
}
export async function createPlatformSupportView(db:Database,actor:PlatformActor,key:string,input:unknown){
 const data=z.object({tenantId:z.uuid(),reason:reasonSchema,adminPassword:z.string(),mode:z.enum(['READ_ONLY','EDIT']).default('READ_ONLY'),confirmedChanges:z.boolean().default(false)}).strict().parse(input);if(data.mode==='EDIT')ensure(data.confirmedChanges,'SUPPORT_CONFIRMATION_REQUIRED','Confirm that troubleshooting changes affect real restaurant data.');await stepUp(db,actor,data.adminPassword);
 return platformMutation(db,actor,key,'support','PLATFORM_SUPPORT_OPENED',{tenantId:data.tenantId,reason:data.reason,mode:data.mode},data.reason,async tx=>{
  if(data.mode==='EDIT')ensure((await requirePlatformMember(tx,actor,'support')).role==='SUPERADMIN','PLATFORM_FORBIDDEN','Only a Superadmin may enable changes in owner support.',403);
  await one(tx,'SELECT id FROM restaurants WHERE id=$1',[data.tenantId]);const grantId=id();
  await tx.query("INSERT INTO platform_support_access(id,user_id,restro_id,session_hash,reason,expires_at,mode) VALUES($1,$2,$3,$4,$5,now()+interval '15 minutes',$6)",[grantId,actor.userId,data.tenantId,actor.sessionHash,data.reason,data.mode]);
  await appendPlatformAudit(tx,actor,'PLATFORM_SUPPORT_OPENED',data.tenantId,data.reason,null,{accessId:grantId,mode:data.mode,minutes:15});return {ok:true,id:grantId};
 });
}
export async function readPlatformSupportView(db:Database,actor:PlatformActor,grantId:string){
 return db.transaction(null,async tx=>{const admin=await requirePlatformMember(tx,actor,'support');const grant=await one(tx,'SELECT * FROM platform_support_access WHERE id=$1 AND user_id=$2 AND session_hash=$3 AND expires_at>now() AND ended_at IS NULL',[z.uuid().parse(grantId),actor.userId,actor.sessionHash],'This support view expired or is unavailable.');assertPlatformScope(admin,grant.restro_id);
  const restaurant=await one(tx,'SELECT id,name FROM restaurants WHERE id=$1',[grant.restro_id]);
  const outlets=(await tx.query('SELECT id,name,code FROM outlets WHERE restro_id=$1 ORDER BY code',[grant.restro_id])).rows;
  const menu=(await tx.query('SELECT id,outlet_id,name,price,active FROM menu_items WHERE restro_id=$1 ORDER BY name LIMIT 200',[grant.restro_id])).rows;
  const orders=(await tx.query('SELECT id,outlet_id,type,status,created_at FROM orders WHERE restro_id=$1 ORDER BY created_at DESC LIMIT 50',[grant.restro_id])).rows;
  const invoices=(await tx.query('SELECT id,outlet_id,number,created_at FROM invoices WHERE restro_id=$1 ORDER BY created_at DESC LIMIT 50',[grant.restro_id])).rows;
  return {restaurant,outlets,menu,orders,invoices,expiresAt:grant.expires_at,readOnly:true};
 });
}
export async function endPlatformSupportView(db:Database,actor:PlatformActor,key:string,input:unknown){const data=z.object({id:z.uuid(),reason:reasonSchema}).strict().parse(input);return platformMutation(db,actor,key,'support','PLATFORM_SUPPORT_ENDED',data,data.reason,async tx=>{const grant=await one(tx,'SELECT * FROM platform_support_access WHERE id=$1 AND user_id=$2 AND session_hash=$3',[data.id,actor.userId,actor.sessionHash]);await tx.query('UPDATE platform_support_access SET ended_at=coalesce(ended_at,now()) WHERE id=$1',[grant.id]);await appendPlatformAudit(tx,actor,'PLATFORM_SUPPORT_ENDED',grant.restro_id,data.reason,null,{accessId:grant.id});return {ok:true};});}
export async function bulkPlatformQr(db:Database,actor:PlatformActor,key:string,input:unknown){const data=z.object({outletId:z.uuid(),prefix:z.string().trim().min(1).max(20),start:z.number().int().min(1).max(100000),count:z.number().int().min(1).max(50),seats:z.number().int().min(1).max(100),floor:z.string().trim().min(1).max(80),reason:reasonSchema}).strict().parse(input);return platformMutation(db,actor,key,'ecosystem','PLATFORM_QR_CREATED',data,data.reason,async tx=>{const outlet=await one(tx,'SELECT id,restro_id FROM outlets WHERE id=$1 FOR UPDATE',[data.outletId]),tables=[];for(let i=0;i<data.count;i++){const table={id:id(),label:data.prefix+String(data.start+i),key:randomBytes(20).toString('hex')};ensure(table.label.length<=30,'INVALID_LABEL','Table labels may contain at most 30 characters.');await tx.query('INSERT INTO dining_tables(id,restro_id,outlet_id,label,seats,floor,public_key) VALUES($1,$2,$3,$4,$5,$6,$7)',[table.id,outlet.restro_id,outlet.id,table.label,data.seats,data.floor,table.key]);tables.push(table);}await appendPlatformAudit(tx,actor,'PLATFORM_QR_CREATED',outlet.id,data.reason,null,{tables:tables.map(t=>({id:t.id,label:t.label})),seats:data.seats,floor:data.floor});return {ok:true,tables};});}

export async function platformSnapshot(db:Database,actor:PlatformActor,datasetInput:unknown='all'){
 const dataset=platformDataset.parse(datasetInput);
 return db.transaction(null,async tx=>{
  await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
  const admin=await requirePlatformMember(tx,actor),permissions=admin.permissions as PlatformPermission[],allow=(p:PlatformPermission)=>permissions.includes(p),scope=admin.tenant_scope??null;
  const recordKinds=Object.keys(platformResources).filter(kind=>allow(platformResources[kind].permission)||(kind==='PLAN'&&allow('tenants')));
  const records=(await tx.query<Row>('SELECT * FROM platform_records WHERE kind=ANY($1::text[]) AND ($2::uuid[] IS NULL OR tenant_id IS NULL OR tenant_id=ANY($2)) ORDER BY updated_at DESC LIMIT 1000',[recordKinds,scope])).rows;
  const tenants=allow('tenants')||allow('plans')||allow('ecosystem')||allow('support')?(await tx.query<Row>(`SELECT r.id,r.name,r.slug,r.is_demo,r.created_at,p.status,p.kyc,p.brand_id,p.plan_id,p.details,p.version,
   (SELECT count(*) FROM outlets WHERE restro_id=r.id) AS outlets,
   (SELECT count(*) FROM employees WHERE restro_id=r.id AND active) AS staff,
   (SELECT count(*) FROM orders WHERE restro_id=r.id AND created_at>=now()-interval '7 days') AS current_orders,
   (SELECT count(*) FROM orders WHERE restro_id=r.id AND created_at>=now()-interval '14 days' AND created_at<now()-interval '7 days') AS previous_orders
   FROM restaurants r LEFT JOIN platform_tenant_policies p ON p.restro_id=r.id WHERE ($1::uuid[] IS NULL OR r.id=ANY($1)) ORDER BY r.created_at DESC LIMIT 500`,[scope])).rows.map((row):Row=>({...row,status:row.status??'ACTIVE',kyc:row.kyc??'UNREVIEWED',version:row.version??0,details:allow('tenants')?row.details??{}:undefined})):[];
  const documents=allow('tenants')?(await tx.query('SELECT id,restro_id,name,mime,sha256,created_at FROM platform_documents WHERE ($1::uuid[] IS NULL OR restro_id=ANY($1)) ORDER BY created_at DESC LIMIT 500',[scope])).rows:[];
  const brandReports=allow('tenants')?(await tx.query(`SELECT b.id,b.name,count(DISTINCT p.restro_id) AS restaurants,count(DISTINCT o.id) AS outlets,count(DISTINCT q.id) AS orders_30d FROM platform_records b LEFT JOIN platform_tenant_policies p ON p.brand_id=b.id LEFT JOIN outlets o ON o.restro_id=p.restro_id LEFT JOIN orders q ON q.restro_id=p.restro_id AND q.outlet_id=o.id AND q.created_at>=now()-interval '30 days' WHERE b.kind='BRAND' AND NOT b.archived AND ($1::uuid[] IS NULL OR p.restro_id=ANY($1)) GROUP BY b.id,b.name ORDER BY b.name`,[scope])).rows:[];
  const balances=allow('plans')?(await tx.query(`SELECT r.id,r.name,coalesce(sum(CASE WHEN b.data->>'type'='INVOICE' THEN (b.data->>'amount')::numeric ELSE -(b.data->>'amount')::numeric END),0)*100 AS balance FROM restaurants r JOIN platform_records b ON b.tenant_id=r.id AND b.kind='BILLING' WHERE ($1::uuid[] IS NULL OR r.id=ANY($1)) GROUP BY r.id,r.name ORDER BY r.name`,[scope])).rows:[];
  const outlets=allow('ecosystem')||allow('tenants')?(await tx.query('SELECT id,restro_id,name,code FROM outlets WHERE ($1::uuid[] IS NULL OR restro_id=ANY($1)) ORDER BY name LIMIT 1000',[scope])).rows:[];
  const qrTables=allow('ecosystem')?(await tx.query('SELECT id,restro_id,outlet_id,label,seats,floor,public_key AS key FROM dining_tables WHERE retired_at IS NULL AND ($1::uuid[] IS NULL OR restro_id=ANY($1)) ORDER BY id DESC LIMIT 200',[scope])).rows:[];
  const members=allow('team')&&scope===null?(await tx.query('SELECT m.user_id,m.role,m.permissions,m.enabled,m.version,m.tenant_scope,m.region,u.name,u.email FROM platform_members m JOIN users u ON u.id=m.user_id ORDER BY u.name')).rows:[];
  const audits=allow('audit')&&scope===null?(await tx.query('SELECT * FROM platform_audit ORDER BY sequence DESC LIMIT 100')).rows:[];
  let metrics:Row|null=null;
  if(allow('overview')){
   const started=Date.now();await tx.query('SELECT 1');const databaseLatencyMs=Date.now()-started;
   const counts=await one(tx,`WITH selected AS (SELECT r.id FROM restaurants r WHERE ${restaurantScope} AND ($2::uuid[] IS NULL OR r.id=ANY($2)))
    SELECT (SELECT count(*) FROM selected) AS restaurants,
    (SELECT count(*) FROM outlets WHERE restro_id IN(SELECT id FROM selected)) AS outlets,
    (SELECT count(*) FROM employees WHERE active AND restro_id IN(SELECT id FROM selected)) AS staff,
    (SELECT count(*) FROM orders WHERE restro_id IN(SELECT id FROM selected) AND created_at>=now()-interval '30 days') AS orders_30d,
    (SELECT coalesce(sum(amount),0) FROM payment_attempts WHERE restro_id IN(SELECT id FROM selected) AND state='VERIFIED' AND created_at>=now()-interval '30 days') AS verified_receipts_30d`,[dataset,scope]);
   const datasets=await restaurantDatasetCounts(tx,scope);
   const subscriptions=(await tx.query<Row>("SELECT data FROM platform_records WHERE kind='SUBSCRIPTION' AND NOT archived AND ($1::uuid[] IS NULL OR tenant_id=ANY($1)) AND data->>'status'='ACTIVE' AND (data->>'start')::date<=current_date AND (nullif(data->>'end','') IS NULL OR (data->>'end')::date>=current_date)",[scope])).rows;
   const mrr=subscriptions.length?subscriptions.reduce((sum,row)=>sum+Math.round(Number(row.data.planFee??0)*100/({MONTHLY:1,QUARTERLY:3,ANNUAL:12}[row.data.planCycle as 'MONTHLY']??1)),0):null;
   const queues=(await tx.query('SELECT state,count(*) AS count FROM outbox WHERE ($1::uuid[] IS NULL OR restro_id=ANY($1)) GROUP BY state ORDER BY state',[scope])).rows;
   metrics={...counts,dataset,datasets,contractedMrr:mrr,contractedArr:mrr===null?null:mrr*12,databaseLatencyMs,queues,cac:null,nrr:null,churn:null,providerHealth:'NOT_CONFIGURED'};
  }
  return {admin:{userId:actor.userId,name:admin.name,email:admin.email,role:admin.role,permissions,tenantScope:scope,region:admin.region??''},tenants,outlets,records,members,audits,documents,brandReports,balances,qrTables,metrics,readAt:new Date().toISOString()};
 });
}
export async function platformRestaurantDirectory(db:Database,actor:PlatformActor,input:unknown={}){
 const data=z.object({dataset:platformDataset.default('all'),search:z.string().trim().max(150).default(''),page:z.coerce.number().int().min(1).max(1000000).default(1)}).strict().parse(input);
 return db.transaction(null,async tx=>{
  await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
  const admin=await requirePlatformMember(tx,actor,'tenants');const scope=admin.tenant_scope??null;
  const where=`${restaurantScope} AND ($3::uuid[] IS NULL OR r.id=ANY($3)) AND ($2='' OR strpos(lower(r.name||' '||r.slug||' '||coalesce(p.status,'ACTIVE')||' '||coalesce((SELECT string_agg(e.name,' ') FROM employees e WHERE e.restro_id=r.id AND e.role='OWNER' AND e.active),'')),lower($2))>0)`;
  const params=[data.dataset,data.search,scope];
  const total=num((await one(tx,`SELECT count(*) AS count FROM restaurants r LEFT JOIN platform_tenant_policies p ON p.restro_id=r.id WHERE ${where}`,params)).count);
  const pageSize=25,pages=Math.max(1,Math.ceil(total/pageSize)),page=Math.min(data.page,pages);
  const rows=(await tx.query<Row>(`SELECT r.id,r.name,r.slug,r.is_demo,r.created_at,p.status,p.kyc,p.brand_id,p.plan_id,p.details,p.version,
   (SELECT string_agg(e.name,', ' ORDER BY e.name) FROM employees e WHERE e.restro_id=r.id AND e.role='OWNER' AND e.active) AS owner_names,
   (SELECT count(*) FROM outlets WHERE restro_id=r.id) AS outlets,
   (SELECT count(*) FROM employees WHERE restro_id=r.id AND active) AS staff,
   (SELECT count(*) FROM orders WHERE restro_id=r.id) AS orders,
   (SELECT count(*) FROM orders WHERE restro_id=r.id AND created_at>=now()-interval '7 days') AS current_orders,
   (SELECT count(*) FROM orders WHERE restro_id=r.id AND created_at>=now()-interval '14 days' AND created_at<now()-interval '7 days') AS previous_orders
   FROM restaurants r LEFT JOIN platform_tenant_policies p ON p.restro_id=r.id WHERE ${where} ORDER BY lower(r.name),r.id LIMIT $4 OFFSET $5`,[...params,pageSize,(page-1)*pageSize])).rows.map((row):Row=>({...row,status:row.status??'ACTIVE',kyc:row.kyc??'UNREVIEWED',version:row.version??0,details:row.details??{}}));
  return {rows,total,page,pages,pageSize,dataset:data.dataset,datasets:await restaurantDatasetCounts(tx,scope),readAt:new Date().toISOString()};
 });
}

export async function platformRestaurantData(db:Database,actor:PlatformActor,input:unknown){
 const data=z.object({tenantId:z.uuid(),outletId:z.uuid().optional()}).strict().parse(input);
 return db.transaction(null,async tx=>{
  await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
  const admin=await requirePlatformMember(tx,actor,'tenants');assertPlatformScope(admin,data.tenantId);
  const restaurant=(await tx.query<Row>('SELECT id,name,slug,currency,is_demo,created_at FROM restaurants WHERE id=$1',[data.tenantId])).rows[0];
  ensure(restaurant,'NOT_FOUND','Restaurant not found.',404);
  const outlets=(await tx.query<Row>('SELECT id,name,code FROM outlets WHERE restro_id=$1 ORDER BY name,id',[data.tenantId])).rows;
  ensure(!data.outletId||outlets.some(row=>row.id===data.outletId),'NOT_FOUND','Outlet does not belong to this restaurant.',404);
  const params=[data.tenantId,data.outletId??null],scope='restro_id=$1 AND ($2::uuid IS NULL OR outlet_id=$2)';
  const summary=await one(tx,`SELECT
   (SELECT count(*) FROM orders WHERE ${scope}) AS orders,
   (SELECT count(*) FROM employees WHERE restro_id=$1 AND active AND ($2::uuid IS NULL OR $2=ANY(outlet_ids))) AS active_staff,
   (SELECT count(*) FROM menu_items WHERE ${scope} AND active) AS active_menu_items,
   (SELECT count(*) FROM dining_tables WHERE ${scope} AND retired_at IS NULL) AS tables,
   (SELECT count(*) FROM ingredients WHERE ${scope}) AS ingredients,
   (SELECT count(*) FROM invoices WHERE ${scope}) AS issued_documents,
   (SELECT count(*) FROM payment_attempts WHERE ${scope} AND state='VERIFIED') AS verified_payments,
   (SELECT coalesce(sum(amount),0) FROM payment_attempts WHERE ${scope} AND state='VERIFIED') AS gross_verified_receipts`,params);
  const recentOrders=(await tx.query<Row>(`SELECT id,outlet_id,number,type,source,status,created_at FROM orders WHERE ${scope} ORDER BY created_at DESC,id DESC LIMIT 21`,params)).rows;
  const recentInvoices=(await tx.query<Row>(`SELECT id,outlet_id,order_id,number,document_type,created_at FROM invoices WHERE ${scope} ORDER BY created_at DESC,id DESC LIMIT 21`,params)).rows;
  return {restaurant,outlets,outletId:data.outletId??null,summary,recentOrders:recentOrders.slice(0,20),recentInvoices:recentInvoices.slice(0,20),moreOrders:recentOrders.length>20,moreInvoices:recentInvoices.length>20,readAt:new Date().toISOString()};
 });
}

export async function verifyPlatformAudit(db:Database,actor:PlatformActor){return db.transaction(null,async tx=>{const admin=await requirePlatformMember(tx,actor,'audit');assertPlatformScope(admin);const rows=(await tx.query<Row>('SELECT * FROM platform_audit ORDER BY sequence')).rows;let previous='',sequence=0;for(const row of rows){const event={id:row.id,sequence:num(row.sequence),actorUserId:row.actor_user_id,actorName:row.actor_name,action:row.action,entityId:row.entity_id,reason:row.reason,ip:row.ip,before:row.before_data,after:row.after_data,occurredAt:new Date(row.occurred_at).toISOString(),previousHash:row.previous_hash};if(event.sequence!==++sequence||event.previousHash!==previous||hash(canonical(event))!==row.record_hash)return {valid:false,count:rows.length};previous=row.record_hash;}const head=await one(tx,'SELECT * FROM platform_audit_head WHERE singleton=true');return {valid:num(head.sequence)===sequence&&head.hash===previous,count:rows.length};});}

/** Minimal discovery for the authenticated account, never a tenant-role privilege. */
export async function platformConsoleAvailable(db:Database,actor:Actor){
 if(!actor.sessionHash||(actor.application&&actor.application!=='MASTER'))return false;
 return db.transaction(null,async tx=>{if(!(await tx.query<{present:string|null}>("SELECT to_regclass('public.platform_members') AS present")).rows[0].present)return false;try{await requirePlatformMember(tx,actor);return true}catch(error){if((error as {code?:string}).code==='PLATFORM_FORBIDDEN')return false;throw error}});
}

export async function uploadPlatformDocument(db:Database,actor:PlatformActor,key:string,input:{tenantId:string;name:string;mime:string;bytes:Uint8Array;reason:string}){
 const data=z.object({tenantId:z.uuid(),name:z.string().trim().min(1).max(150).regex(/^[^\\/\x00-\x1f]+$/),mime:z.enum(['application/pdf','image/png','image/jpeg']),reason:reasonSchema}).strict().parse({tenantId:input.tenantId,name:input.name,mime:input.mime,reason:input.reason});
 const bytes=Buffer.from(input.bytes);ensure(bytes.length>0&&bytes.length<=2097152,'INVALID_DOCUMENT','Document size must be between 1 byte and 2 MiB.');
 const valid=data.mime==='application/pdf'?bytes.subarray(0,5).toString()==='%PDF-':data.mime==='image/png'?bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a':bytes.subarray(0,3).toString('hex')==='ffd8ff';
 ensure(valid,'INVALID_DOCUMENT','The file content does not match its PDF, PNG or JPEG type.');const sha256=createHash('sha256').update(bytes).digest('hex');
 return platformMutation(db,actor,key,'tenants','PLATFORM_DOCUMENT_UPLOADED',{...data,sha256},data.reason,async tx=>{await one(tx,'SELECT id FROM restaurants WHERE id=$1',[data.tenantId]);const documentId=id();await tx.query('INSERT INTO platform_documents(id,restro_id,name,mime,bytes,sha256,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[documentId,data.tenantId,data.name,data.mime,bytes,sha256,actor.userId]);await appendPlatformAudit(tx,actor,'PLATFORM_DOCUMENT_UPLOADED',data.tenantId,data.reason,null,{id:documentId,name:data.name,mime:data.mime,size:bytes.length,sha256});return {ok:true,id:documentId};});
}
export async function readPlatformDocument(db:Database,actor:PlatformActor,documentId:string){return db.transaction(null,async tx=>{const admin=await requirePlatformMember(tx,actor,'tenants');const doc=await one(tx,'SELECT * FROM platform_documents WHERE id=$1',[z.uuid().parse(documentId)]);assertPlatformScope(admin,doc.restro_id);await appendPlatformAudit(tx,actor,'PLATFORM_DOCUMENT_DOWNLOADED',doc.restro_id,'Authenticated document download',null,{id:doc.id,name:doc.name});return {name:doc.name,mime:doc.mime,bytes:doc.bytes as Uint8Array};});}
export async function redeemPlatformPromo(db:Database,actor:PlatformActor,key:string,input:unknown){const data=z.object({tenantId:z.uuid(),promoId:z.uuid(),reason:reasonSchema}).strict().parse(input);return platformMutation(db,actor,key,'plans','PLATFORM_PROMO_REDEEMED',data,data.reason,async tx=>{await one(tx,'SELECT id FROM restaurants WHERE id=$1',[data.tenantId]);const promo=await one(tx,"SELECT * FROM platform_records WHERE id=$1 AND kind='PROMO' AND NOT archived FOR UPDATE",[data.promoId]);const today=(await one(tx,"SELECT to_char(now() AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD') AS day")).day;ensure(promo.data.expiry>=today,'PROMO_EXPIRED','This SaaS promotion has expired.',409);ensure(!(await tx.query('SELECT billing_id FROM platform_promo_redemptions WHERE promo_id=$1 AND restro_id=$2',[promo.id,data.tenantId])).rows.length,'PROMO_ALREADY_USED','This restaurant already used this promotion.',409);const count=Number((await one(tx,'SELECT count(*) AS count FROM platform_promo_redemptions WHERE promo_id=$1',[promo.id])).count);ensure(count<promo.data.maxUses,'PROMO_EXHAUSTED','This promotion has reached its total use limit.',409);const billingId=id(),credit={type:'CREDIT',amount:promo.data.amount,reference:'PROMO-'+promo.id+'-'+data.tenantId,date:today,notes:'SaaS onboarding promotion '+promo.data.code};await tx.query("INSERT INTO platform_records(id,kind,name,tenant_id,data) VALUES($1,'BILLING',$2,$3,$4::jsonb)",[billingId,'Promotion '+promo.data.code,data.tenantId,json(credit)]);await tx.query('INSERT INTO platform_promo_redemptions(promo_id,restro_id,billing_id) VALUES($1,$2,$3)',[promo.id,data.tenantId,billingId]);await appendPlatformAudit(tx,actor,'PLATFORM_PROMO_REDEEMED',data.tenantId,data.reason,null,{promoId:promo.id,billingId,amount:promo.data.amount});return {ok:true,id:billingId};});}
