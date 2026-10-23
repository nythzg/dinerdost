import {z} from 'zod';
import {randomBytes} from 'node:crypto';
import type {Database,Sql} from '@dinerdost/database';
import {ensure,type Actor,type PlatformPermission} from '@dinerdost/core';
import {id,json,one,expectedVersion,hash,num,type Row} from './shared';
import {stepUp} from './auth';
import {platformMutation,requirePlatformMember,assertPlatformScope,appendPlatformAudit,type PlatformActor} from './platform-console';
import {setupSelection,applyPlatformSetup} from './platform-setup';

export const operationReason=z.string().trim().min(5).max(500);
export const issuerSchema=z.object({name:z.string().trim().min(2).max(150),address:z.string().trim().min(5).max(500),gstin:z.string().regex(/^\d{2}[A-Z0-9]{13}$/),stateCode:z.string().regex(/^\d{2}$/),stateName:z.string().trim().min(2).max(80),sac:z.string().regex(/^\d{4,8}$/),prefix:z.string().regex(/^[A-Z0-9]{1,4}$/),taxRate:z.number().min(0).max(100).multipleOf(.01),signatory:z.string().trim().min(2).max(100),eInvoiceRequired:z.boolean(),eInvoiceExemptionDeclaration:z.string().trim().max(1500).default('')}).strict();
const riskSchema=z.object({enabled:z.boolean(),baselineOrders:z.number().int().min(1).max(100000),dropPercent:z.number().int().min(1).max(100),inactiveDays:z.number().int().min(1).max(365),createTasks:z.boolean()}).strict();
const deskSchema=z.object({escalateAfterHours:z.number().int().min(1).max(720)}).strict();
const scopeSql='($1::uuid[] IS NULL OR restro_id=ANY($1))';
export async function savePlatformConfiguration(db:Database,actor:PlatformActor,key:string,input:unknown){
 const data=z.object({key:z.enum(['issuer','onboarding','risk','serviceDesk']),data:z.unknown(),version:z.number().int().min(0),reason:operationReason}).strict().parse(input);
 const payload=({issuer:issuerSchema,onboarding:setupSelection,risk:riskSchema,serviceDesk:deskSchema}[data.key]).parse(data.data);
 const permission:PlatformPermission=data.key==='issuer'?'plans':data.key==='serviceDesk'?'support':'tenants';
 return platformMutation(db,actor,key,permission,'PLATFORM_CONFIG_SAVED',data,data.reason,async tx=>{
  const admin=await requirePlatformMember(tx,actor);assertPlatformScope(admin);
  const before=(await tx.query<Row>('SELECT * FROM platform_operational_config WHERE key=$1 FOR UPDATE',[data.key])).rows[0];expectedVersion(before?.version??0,data.version);
  if(data.key==='onboarding'){
   const value=payload as z.infer<typeof setupSelection>,ids=[...value.taxonomyIds,...value.roleIds,...(value.taxId?[value.taxId]:[])];
   for(const [kind,list] of [['TAXONOMY',value.taxonomyIds],['ROLE_TEMPLATE',value.roleIds],['TAX_TEMPLATE',value.taxId?[value.taxId]:[]]] as const)if(list.length)ensure((await tx.query("SELECT id FROM platform_records WHERE id=ANY($1::uuid[]) AND kind=$2 AND NOT archived",[list,kind])).rows.length===new Set(list).size,'INVALID_TEMPLATE','Choose active templates of the correct type.');
   ensure(ids.length===new Set(ids).size,'INVALID_TEMPLATE','Do not repeat a template.');
  }
  await tx.query('INSERT INTO platform_operational_config(key,data,updated_by) VALUES($1,$2::jsonb,$3) ON CONFLICT(key) DO UPDATE SET data=excluded.data,version=platform_operational_config.version+1,updated_by=excluded.updated_by,updated_at=now()',[data.key,json(payload),actor.userId]);
  await appendPlatformAudit(tx,actor,'PLATFORM_CONFIG_SAVED',data.key,data.reason,before,payload);return {ok:true};
 });
}

export async function applyPlatformTemplates(db:Database,actor:PlatformActor,key:string,input:unknown){
 const data=z.object({tenantId:z.uuid(),outletId:z.uuid(),version:z.number().int().min(1),selection:setupSelection,reason:operationReason}).strict().parse(input);
 return platformMutation(db,actor,key,'tenants','PLATFORM_TEMPLATES_APPLIED',data,data.reason,async tx=>{
  const before=await one(tx,'SELECT * FROM outlets WHERE restro_id=$1 AND id=$2 FOR UPDATE',[data.tenantId,data.outletId]);expectedVersion(before.version,data.version);
  const result=await applyPlatformSetup(tx,data.tenantId,data.outletId,data.selection);
  await appendPlatformAudit(tx,actor,'PLATFORM_TEMPLATES_APPLIED',data.tenantId,data.reason,{outletId:before.id,taxBps:before.tax_bps,taxComponents:before.tax_components},{...result,outletId:before.id,taxTemplateId:data.selection.taxId,futureTransactionsOnly:true});return {ok:true};
 });
}
export async function tagPlatformMenu(db:Database,actor:PlatformActor,key:string,input:unknown){
 const data=z.object({tenantId:z.uuid(),itemId:z.uuid(),version:z.number().int().min(1),tagIds:z.array(z.uuid()).max(100),reason:operationReason}).strict().parse(input);
 return platformMutation(db,actor,key,'ecosystem','PLATFORM_MENU_TAGGED',data,data.reason,async tx=>{
  const item=await one(tx,'SELECT id,version FROM menu_items WHERE restro_id=$1 AND id=$2 FOR UPDATE',[data.tenantId,data.itemId]);expectedVersion(item.version,data.version);
  const tags=(await tx.query<Row>("SELECT id,name,data FROM platform_records WHERE kind='TAXONOMY' AND NOT archived AND id=ANY($1::uuid[])",[data.tagIds])).rows;ensure(tags.length===new Set(data.tagIds).size,'INVALID_TAG','Choose existing active master tags.');
  const before=(await tx.query('SELECT tag_id,snapshot FROM platform_menu_tags WHERE restro_id=$1 AND item_id=$2',[data.tenantId,item.id])).rows;
  await tx.query('DELETE FROM platform_menu_tags WHERE restro_id=$1 AND item_id=$2',[data.tenantId,item.id]);
  for(const tag of tags)await tx.query('INSERT INTO platform_menu_tags(restro_id,item_id,tag_id,snapshot) VALUES($1,$2,$3,$4::jsonb)',[data.tenantId,item.id,tag.id,json({name:tag.name,type:tag.data.type,description:tag.data.description??''})]);
  await tx.query('UPDATE menu_items SET version=version+1 WHERE restro_id=$1 AND id=$2',[data.tenantId,item.id]);
  await appendPlatformAudit(tx,actor,'PLATFORM_MENU_TAGGED',data.tenantId,data.reason,before,tags.map(t=>({id:t.id,name:t.name})));return {ok:true};
 });
}

export async function savePlatformBrandAccess(db:Database,actor:PlatformActor,key:string,input:unknown){
 const data=z.object({brandId:z.uuid(),email:z.email().toLowerCase(),enabled:z.boolean(),version:z.number().int().min(0),adminPassword:z.string(),reason:operationReason}).strict().parse(input);await stepUp(db,actor,data.adminPassword);
 return platformMutation(db,actor,key,'tenants','PLATFORM_BRAND_ACCESS_SAVED',{...data,adminPassword:undefined},data.reason,async tx=>{
  const admin=await requirePlatformMember(tx,actor);assertPlatformScope(admin);ensure(admin.role==='SUPERADMIN','PLATFORM_FORBIDDEN','Only a superadmin may grant enterprise reporting access.',403);
  await one(tx,"SELECT id FROM platform_records WHERE id=$1 AND kind='BRAND' AND NOT archived",[data.brandId]);
  const user=await one(tx,'SELECT id FROM users WHERE lower(email)=$1 AND NOT disabled AND EXISTS(SELECT 1 FROM employees e WHERE e.user_id=users.id AND e.active)',[data.email]);
  const before=(await tx.query<Row>('SELECT * FROM platform_brand_access WHERE brand_id=$1 AND user_id=$2 FOR UPDATE',[data.brandId,user.id])).rows[0];expectedVersion(before?.version??0,data.version);
  await tx.query('INSERT INTO platform_brand_access(brand_id,user_id,enabled) VALUES($1,$2,$3) ON CONFLICT(brand_id,user_id) DO UPDATE SET enabled=excluded.enabled,version=platform_brand_access.version+1',[data.brandId,user.id,data.enabled]);
  await appendPlatformAudit(tx,actor,'PLATFORM_BRAND_ACCESS_SAVED',data.brandId,data.reason,before,{userId:user.id,enabled:data.enabled});return {ok:true};
 });
}
export async function savePlatformBranding(db:Database,actor:PlatformActor,key:string,input:unknown){
 const data=z.object({tenantId:z.uuid(),version:z.number().int().min(0),displayName:z.string().trim().min(2).max(120),color:z.string().regex(/^#[a-fA-F0-9]{6}$/),slug:z.string().regex(/^[a-z0-9][a-z0-9-]{2,59}$/),logoId:z.uuid().nullable(),published:z.boolean(),reason:operationReason}).strict().parse(input);
 return platformMutation(db,actor,key,'tenants','PLATFORM_BRANDING_SAVED',data,data.reason,async tx=>{
  await one(tx,'SELECT id FROM restaurants WHERE id=$1',[data.tenantId]);
  const before=(await tx.query<Row>('SELECT * FROM platform_tenant_setup WHERE restro_id=$1 FOR UPDATE',[data.tenantId])).rows[0];expectedVersion(before?.version??0,data.version);
  ensure(!(await tx.query("SELECT restro_id FROM platform_tenant_setup WHERE restro_id<>$1 AND branding->>'slug'=$2",[data.tenantId,data.slug])).rows.length,'BRAND_SLUG_TAKEN','This local brand address is already in use.',409);
  if(data.logoId){const asset=await one(tx,'SELECT brand_id FROM platform_assets WHERE id=$1',[data.logoId]);const policy=await one(tx,'SELECT brand_id FROM platform_tenant_policies WHERE restro_id=$1',[data.tenantId]);ensure(policy.brand_id===asset.brand_id,'INVALID_BRAND_ASSET','Choose an asset from the assigned parent brand.');}
  const value={displayName:data.displayName,color:data.color,slug:data.slug,logoId:data.logoId,published:data.published};
  await tx.query('INSERT INTO platform_tenant_setup(restro_id,branding) VALUES($1,$2::jsonb) ON CONFLICT(restro_id) DO UPDATE SET branding=excluded.branding,version=platform_tenant_setup.version+1',[data.tenantId,json(value)]);
  await appendPlatformAudit(tx,actor,'PLATFORM_BRANDING_SAVED',data.tenantId,data.reason,before?.branding??null,value);return {ok:true,url:'/brand/'+data.slug};
 });
}
export async function platformPublicBrand(db:Database,slug:string){return db.transaction(null,async tx=>{
 const row=await one<Row>(tx,"SELECT s.restro_id,s.branding,r.name FROM platform_tenant_setup s JOIN restaurants r ON r.id=s.restro_id LEFT JOIN platform_tenant_policies p ON p.restro_id=r.id WHERE s.branding->>'slug'=$1 AND s.branding->>'published'='true' AND coalesce(p.status,'ACTIVE')='ACTIVE'",[z.string().max(60).parse(slug)],'This brand page is unavailable.');
 const outlets=(await tx.query('SELECT id,name,code FROM outlets WHERE restro_id=$1 ORDER BY code',[row.restro_id])).rows;
 const stores=(await tx.query('SELECT outlet_id,slug FROM storefronts WHERE restro_id=$1 AND published',[row.restro_id])).rows;
 return {name:row.branding.displayName,color:row.branding.color,logoId:row.branding.logoId,outlets:outlets.map(o=>({...o,storefront:stores.find(s=>s.outlet_id===o.id)?.slug??null}))};
});}

export async function changePlatformQr(db:Database,actor:PlatformActor,key:string,input:unknown){
 const data=z.object({tenantId:z.uuid(),tableId:z.uuid(),version:z.number().int().min(1),action:z.enum(['ROTATE','RETIRE','RESTORE']),reason:operationReason,adminPassword:z.string()}).strict().parse(input);await stepUp(db,actor,data.adminPassword);
 return platformMutation(db,actor,key,'ecosystem','PLATFORM_QR_CHANGED',{...data,adminPassword:undefined},data.reason,async tx=>{
  const table=await one(tx,'SELECT * FROM dining_tables WHERE restro_id=$1 AND id=$2 FOR UPDATE',[data.tenantId,data.tableId]);expectedVersion(table.version,data.version);
  if(data.action==='RETIRE')ensure(!(await tx.query("SELECT id FROM table_sessions WHERE restro_id=$1 AND table_id=$2 AND status<>'CLOSED'",[data.tenantId,table.id])).rows.length,'TABLE_OCCUPIED','Close existing table visits before retiring this QR.',409);
  const newKey=data.action==='ROTATE'?randomBytes(20).toString('hex'):table.public_key;
  await tx.query('UPDATE dining_tables SET public_key=$3,retired_at=CASE WHEN $4=\'RETIRE\' THEN now() WHEN $4=\'RESTORE\' THEN NULL ELSE retired_at END,version=version+1 WHERE restro_id=$1 AND id=$2',[data.tenantId,table.id,newKey,data.action]);
  await tx.query('INSERT INTO platform_qr_events(id,restro_id,table_id,action,previous_key_hash,new_key_hash,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id(),data.tenantId,table.id,data.action,hash(table.public_key),hash(newKey),data.reason,actor.userId]);
  await appendPlatformAudit(tx,actor,'PLATFORM_QR_CHANGED',data.tenantId,data.reason,{tableId:table.id,version:table.version},{action:data.action,version:table.version+1});return {ok:true};
 });
}

export async function savePlatformCase(db:Database,actor:PlatformActor,key:string,input:unknown){
 const data=z.object({tenantId:z.uuid(),ticketId:z.uuid(),version:z.number().int().min(0),dueAt:z.iso.datetime(),paymentId:z.uuid().nullable(),amount:z.number().int().min(0).max(1e12),outcome:z.enum(['OPEN','WON','LOST']),reference:z.string().trim().max(150),notes:z.string().trim().max(2000),reason:operationReason}).strict().parse(input);
 return platformMutation(db,actor,key,'support','PLATFORM_CASE_SAVED',data,data.reason,async tx=>{
  const ticket=await one(tx,"SELECT * FROM platform_records WHERE id=$1 AND tenant_id=$2 AND kind='TICKET' FOR UPDATE",[data.ticketId,data.tenantId]);
  const before=(await tx.query<Row>('SELECT * FROM platform_case_details WHERE ticket_id=$1 FOR UPDATE',[ticket.id])).rows[0];expectedVersion(before?.version??0,data.version);
  if(data.paymentId){const payment=await one(tx,"SELECT amount FROM payment_attempts WHERE restro_id=$1 AND id=$2 AND state='VERIFIED'",[data.tenantId,data.paymentId]);ensure(data.amount<=num(payment.amount),'INVALID_AMOUNT','A dispute amount cannot exceed its verified receipt.');}
  if(data.outcome!=='OPEN')ensure(data.reference.length>=3&&data.notes.length>=5,'CASE_EVIDENCE_REQUIRED','Record a resolution reference and evidence notes.');
  await tx.query('INSERT INTO platform_case_details(ticket_id,restro_id,data,due_at) VALUES($1,$2,$3::jsonb,$4) ON CONFLICT(ticket_id) DO UPDATE SET data=excluded.data,due_at=excluded.due_at,version=platform_case_details.version+1',[ticket.id,data.tenantId,json({paymentId:data.paymentId,amount:data.amount,outcome:data.outcome,reference:data.reference,notes:data.notes}),data.dueAt]);
  await appendPlatformAudit(tx,actor,'PLATFORM_CASE_SAVED',data.tenantId,data.reason,before,{...data,financialEffect:'NONE_EXTERNAL_PROVIDER_DEFERRED'});return {ok:true};
 });
}
export async function decidePlatformTask(db:Database,actor:PlatformActor,key:string,input:unknown){
 const data=z.object({tenantId:z.uuid(),taskId:z.uuid(),version:z.number().int().min(1),state:z.enum(['IN_PROGRESS','RESOLVED']),resolution:z.string().trim().min(5).max(1000),reason:operationReason}).strict().parse(input);
 return platformMutation(db,actor,key,'support','PLATFORM_TASK_DECIDED',data,data.reason,async tx=>{
  const before=await one(tx,'SELECT * FROM platform_tasks WHERE id=$1 AND restro_id=$2 FOR UPDATE',[data.taskId,data.tenantId]);expectedVersion(before.version,data.version);
  await tx.query('UPDATE platform_tasks SET state=$3,data=data||$4::jsonb,version=version+1 WHERE id=$1 AND restro_id=$2',[data.taskId,data.tenantId,data.state,json({resolution:data.resolution})]);
  await appendPlatformAudit(tx,actor,'PLATFORM_TASK_DECIDED',data.tenantId,data.reason,before,{state:data.state,resolution:data.resolution});return {ok:true};
 });
}

function fileContent(mime:string,bytes:Uint8Array,imagesOnly=false){const content=Buffer.from(bytes);ensure(content.length>0&&content.length<=2097152,'INVALID_FILE','Files must be at most 2 MiB.');const valid=mime==='image/png'?content.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==='image/jpeg'?content[0]===255&&content[1]===216&&content[2]===255:!imagesOnly&&mime==='application/pdf'&&content.subarray(0,5).toString()==='%PDF-';ensure(valid,'INVALID_FILE','Supply a PNG, JPEG or supported PDF with matching content.');return content;}
export async function uploadPlatformOperationalFile(db:Database,actor:PlatformActor,key:string,input:{type:'BRAND'|'CASE';tenantId?:string;targetId:string;name:string;mime:string;bytes:Uint8Array;reason:string}){
 const {bytes:rawBytes,...metadata}=input;
 const data=z.object({type:z.enum(['BRAND','CASE']),tenantId:z.uuid().optional(),targetId:z.uuid(),name:z.string().trim().min(1).max(120).refine(s=>!/[\\/\x00-\x1f]/.test(s)),mime:z.enum(['image/png','image/jpeg','application/pdf']),reason:operationReason}).strict().parse(metadata);
 const content=fileContent(data.mime,input.bytes,data.type==='BRAND');
 return platformMutation(db,actor,key,data.type==='BRAND'?'tenants':'support','PLATFORM_FILE_UPLOADED',{...data,sha256:hash(content.toString('base64'))},data.reason,async tx=>{
  const admin=await requirePlatformMember(tx,actor);
  if(data.type==='BRAND'){assertPlatformScope(admin);await one(tx,"SELECT id FROM platform_records WHERE id=$1 AND kind='BRAND' AND NOT archived",[data.targetId]);}
  else{const ticket=await one(tx,"SELECT tenant_id FROM platform_records WHERE id=$1 AND kind='TICKET'",[data.targetId]);assertPlatformScope(admin,ticket.tenant_id);ensure(ticket.tenant_id===data.tenantId,'PLATFORM_SCOPE_FORBIDDEN','Select the ticket restaurant.',403);}
  const fileId=id(),digest=hash(content.toString('base64'));
  if(data.type==='BRAND')await tx.query('INSERT INTO platform_assets(id,brand_id,mime,bytes,sha256,uploaded_by) VALUES($1,$2,$3,$4,$5,$6)',[fileId,data.targetId,data.mime,content,digest,actor.userId]);
  else await tx.query('INSERT INTO platform_case_attachments(id,ticket_id,name,mime,bytes,sha256,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[fileId,data.targetId,data.name,data.mime,content,digest,actor.userId]);
  await appendPlatformAudit(tx,actor,'PLATFORM_FILE_UPLOADED',data.tenantId??data.targetId,data.reason,null,{id:fileId,type:data.type,mime:data.mime,sha256:digest});return {ok:true,id:fileId};
 });
}
export async function readPlatformCaseFile(db:Database,actor:PlatformActor,fileId:string){return db.transaction(null,async tx=>{const admin=await requirePlatformMember(tx,actor,'support'),file=await one(tx,'SELECT a.*,r.tenant_id FROM platform_case_attachments a JOIN platform_records r ON r.id=a.ticket_id WHERE a.id=$1',[z.uuid().parse(fileId)]);assertPlatformScope(admin,file.tenant_id);await appendPlatformAudit(tx,actor,'PLATFORM_CASE_FILE_READ',file.tenant_id,'Authenticated case evidence download',null,{id:file.id});return {name:file.name,mime:file.mime,bytes:file.bytes as Uint8Array};});}
export async function readPlatformBrandAsset(db:Database,fileId:string){return db.transaction(null,async tx=>{const file=await one(tx,"SELECT a.mime,a.bytes FROM platform_assets a WHERE a.id=$1 AND EXISTS(SELECT 1 FROM platform_tenant_setup s WHERE s.branding->>'logoId'=a.id::text AND s.branding->>'published'='true')",[z.uuid().parse(fileId)]);return {mime:file.mime,bytes:file.bytes as Uint8Array};});}

export async function readPlatformOperations(db:Database,actor:PlatformActor,input:unknown){
 const data=z.object({section:z.enum(['overview','tenants','plans','ecosystem','team','support'])}).strict().parse(input);
 const permission:PlatformPermission=data.section==='overview'?'overview':data.section==='ecosystem'?'ecosystem':data.section==='support'?'support':data.section as PlatformPermission;
 return db.transaction(null,async tx=>{
  await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');const admin=await requirePlatformMember(tx,actor,permission),scope=admin.tenant_scope??null;
  const scoped=async(table:string,columns='*',tail='')=>(await tx.query<Row>('SELECT '+columns+' FROM '+table+' WHERE '+scopeSql+' '+tail,[scope])).rows;
  const config=scope===null?(await tx.query<Row>("SELECT * FROM platform_operational_config WHERE key=ANY($1::text[])",[[data.section==='plans'?'issuer':data.section==='support'?'serviceDesk':'risk',...(data.section==='tenants'?['onboarding']:[])]] )).rows:[];
  if(data.section==='plans')return {config,profiles:await scoped('platform_billing_profiles'),automation:await scoped('platform_subscription_automation'),documents:await scoped('platform_saas_documents',"*,(SELECT coalesce(sum(p.amount),0) FROM platform_saas_payments p WHERE p.invoice_id=platform_saas_documents.id) AS paid_total,(SELECT coalesce(sum(c.total),0) FROM platform_saas_documents c WHERE c.kind='CREDIT' AND c.snapshot->>'originalInvoiceId'=platform_saas_documents.id::text) AS credited_total",'ORDER BY created_at DESC LIMIT 300'),payments:await scoped('platform_saas_payments','*','ORDER BY created_at DESC LIMIT 300'),fees:await scoped('platform_fee_accruals','*','ORDER BY created_at DESC LIMIT 300'),settlements:await scoped('platform_settlement_entries','*','ORDER BY created_at DESC LIMIT 300')};
  if(data.section==='tenants')return {config,setups:await scoped('platform_tenant_setup'),outlets:await scoped('outlets','id,restro_id,name,code,version,tax_bps,tax_components'),brandAccess:scope===null?(await tx.query('SELECT a.*,u.name,u.email FROM platform_brand_access a JOIN users u ON u.id=a.user_id')).rows:[],assets:scope===null?(await tx.query('SELECT id,brand_id,mime,created_at FROM platform_assets')).rows:[]};
  if(data.section==='ecosystem')return {tables:await scoped('dining_tables','id,restro_id,outlet_id,label,version,retired_at,public_key'),menu:await scoped('menu_items','id,restro_id,outlet_id,name,version,active'),tags:await scoped('platform_menu_tags'),events:await scoped('platform_qr_events','*','ORDER BY created_at DESC LIMIT 200')};
  if(data.section==='support')return {config,cases:await scoped('platform_case_details'),tasks:await scoped('platform_tasks','*','ORDER BY created_at DESC LIMIT 300'),attachments:(await tx.query('SELECT a.id,a.ticket_id,a.name,a.mime,a.created_at FROM platform_case_attachments a JOIN platform_records r ON r.id=a.ticket_id WHERE ($1::uuid[] IS NULL OR r.tenant_id=ANY($1))',[scope])).rows};
  return {config,readAt:new Date().toISOString()};
 });
}
