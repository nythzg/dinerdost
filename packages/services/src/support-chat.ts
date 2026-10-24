import {z} from 'zod';
import type {Database,Sql} from '@dinerdost/database';
import {ensure,type Actor} from '@dinerdost/core';
import {canonical,hash,id,json,one,expectedVersion,type Row} from './shared';
import {appendPlatformAudit,assertPlatformScope,platformMutation,requirePlatformMember,createPlatformSupportView,type PlatformActor} from './platform-console';

const queue=z.enum(['TECHNICAL','BILLING','ACCOUNT','GENERAL']);
const message=z.string().trim().min(1).max(2000);
export const supportChannelsSchema=z.object({email:z.union([z.literal(''),z.email()]),whatsapp:z.union([z.literal(''),z.string().regex(/^\+?[1-9]\d{7,14}$/,'Use an international WhatsApp number with country code.')])}).strict();
const customerInput=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),queue,subject:z.string().trim().min(3).max(150),message,outletId:z.uuid()}).strict(),
 z.object({action:z.literal('reply'),threadId:z.uuid(),message}).strict()
]);
const adminInput=z.discriminatedUnion('action',[
 z.object({action:z.literal('reply'),tenantId:z.uuid(),threadId:z.uuid(),message}).strict(),
 z.object({action:z.literal('assign'),tenantId:z.uuid(),threadId:z.uuid(),version:z.number().int().min(1),queue,assignedTo:z.uuid().nullable()}).strict(),
 z.object({action:z.literal('resolve'),tenantId:z.uuid(),threadId:z.uuid(),version:z.number().int().min(1),resolution:message}).strict(),
 z.object({action:z.literal('close'),tenantId:z.uuid(),threadId:z.uuid(),version:z.number().int().min(1),resolution:message}).strict(),
 z.object({action:z.literal('troubleshoot'),tenantId:z.uuid(),threadId:z.uuid(),reason:z.string().trim().min(5).max(400),adminPassword:z.string(),mode:z.enum(['READ_ONLY','EDIT']),confirmedChanges:z.boolean()}).strict()
]);

// This explicit bridge validates the live restaurant session before any private platform query.
async function restaurantMember(tx:Sql,actor:Actor){
 ensure(!actor.supportView&&actor.application==='MASTER'&&actor.sessionHash,'SUPPORT_FORBIDDEN','Use your own restaurant web sign-in to contact support.',403);
 const member=(await tx.query<Row>(`SELECT e.* FROM auth_sessions s JOIN employees e ON e.id=s.employee_id AND e.user_id=s.user_id JOIN users u ON u.id=e.user_id WHERE s.token_hash=$1 AND s.user_id=$2 AND e.id=$3 AND e.restro_id=$4 AND e.active AND NOT u.disabled AND s.application='MASTER' AND s.expires_at>now()`,[actor.sessionHash,actor.userId,actor.employeeId,actor.restroId])).rows[0];
 ensure(member,'UNAUTHENTICATED','Sign in again to contact support.',401);return member;
}
async function channels(tx:Sql){const row=(await tx.query<Row>("SELECT data,version FROM platform_operational_config WHERE key='supportChannels'")).rows[0];return {email:row?.data.email??'',whatsapp:row?.data.whatsapp??'',version:row?.version??0};}
async function thread(tx:Sql,threadId:string){return one<Row>(tx,"SELECT r.*,t.restro_id,t.employee_id,t.outlet_id,t.queue,t.assigned_to FROM platform_support_threads t JOIN platform_records r ON r.id=t.id WHERE t.id=$1 AND r.kind='TICKET' AND NOT r.archived FOR UPDATE OF r",[threadId]);}
async function messages(tx:Sql,threadId:string){return (await tx.query('SELECT id,sender_name,side,body,created_at FROM platform_support_messages WHERE thread_id=$1 ORDER BY created_at,id',[threadId])).rows;}
async function appendMessage(tx:Sql,threadId:string,userId:string,name:string,side:string,body:string){
 ensure(Number((await one(tx,'SELECT count(*) AS count FROM platform_support_messages WHERE thread_id=$1',[threadId])).count)<2000,'CHAT_FULL','This conversation is full. Open a new support request.',409);
 ensure(Number((await one(tx,"SELECT count(*) AS count FROM platform_support_messages WHERE sender_id=$1 AND created_at>now()-interval '10 minutes'",[userId])).count)<60,'SUPPORT_RATE_LIMIT','Please wait a few minutes before sending more messages.',429);
 const messageId=id();await tx.query('INSERT INTO platform_support_messages(id,thread_id,sender_id,sender_name,side,body) VALUES($1,$2,$3,$4,$5,$6)',[messageId,threadId,userId,name,side,body]);
 await tx.query('UPDATE platform_records SET updated_at=now(),version=version+1 WHERE id=$1',[threadId]);return messageId;
}
// shortcut: requesters see their latest 50 cases; add history paging when older personal conversations need browsing.
export async function readRestaurantSupport(db:Database,actor:Actor,threadId?:string){
 if(threadId)z.uuid().parse(threadId);
 return db.transaction(null,async tx=>{await restaurantMember(tx,actor);const list=(await tx.query<Row>(`SELECT r.id,r.name,r.data->>'status' AS status,r.version,r.updated_at,t.queue,m.name AS assigned_name,EXISTS(SELECT 1 FROM platform_support_calls c WHERE c.thread_id=t.id AND c.state='RINGING' AND c.caller_side='SUPPORT' AND c.expires_at>now()) AS incoming_call FROM platform_support_threads t JOIN platform_records r ON r.id=t.id LEFT JOIN users m ON m.id=t.assigned_to WHERE t.restro_id=$1 AND t.employee_id=$2 AND NOT r.archived ORDER BY (r.data->>'status' IN('RESOLVED','CLOSED')),r.updated_at DESC LIMIT 50`,[actor.restroId,actor.employeeId])).rows;
  let detail:Row|null=null;if(threadId){const row=await thread(tx,threadId);ensure(row.restro_id===actor.restroId&&row.employee_id===actor.employeeId,'SUPPORT_FORBIDDEN','This conversation is private to its requester.',403);detail={id:row.id,name:row.name,status:row.data.status,resolution:row.data.resolution??'',closedReason:row.data.closedReason??'',queue:row.queue,messages:await messages(tx,threadId)};}
  return {threads:list,thread:detail,channels:await channels(tx)};
 });
}
export async function sendRestaurantSupport(db:Database,actor:Actor,key:string,input:unknown){
 z.uuid().parse(key);const data=customerInput.parse(input);
 return db.transaction(null,async tx=>{
  await one(tx,'SELECT * FROM platform_audit_head WHERE singleton=true FOR UPDATE');const member=await restaurantMember(tx,actor);
  const fingerprint=hash(canonical({action:'RESTAURANT_SUPPORT',employee:actor.employeeId,tenant:actor.restroId,data}));
  await tx.query('INSERT INTO platform_requests(user_id,key,fingerprint) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[actor.userId,key,fingerprint]);
  const request=await one(tx,'SELECT * FROM platform_requests WHERE user_id=$1 AND key=$2 FOR UPDATE',[actor.userId,key]);ensure(request.fingerprint===fingerprint,'IDEMPOTENCY_CONFLICT','This request key belongs to a different message.',409);if(request.response!==null)return request.response as {id:string};
  let threadId:string;
  if(data.action==='create'){
   const outlet=await one<Row>(tx,'SELECT id FROM outlets WHERE id=$1 AND restro_id=$2',[data.outletId,actor.restroId]);ensure(member.role==='OWNER'||member.outlet_ids.includes(outlet.id),'OUTLET_FORBIDDEN','Choose an assigned outlet.',403);
   ensure(Number((await one(tx,"SELECT count(*) AS count FROM platform_support_threads t JOIN platform_records r ON r.id=t.id WHERE t.employee_id=$1 AND r.data->>'status' IN('OPEN','IN_PROGRESS') AND NOT r.archived",[actor.employeeId])).count)<10,'SUPPORT_REQUEST_LIMIT','You already have 10 open requests. Continue an existing conversation.',409);
   threadId=id();await tx.query("INSERT INTO platform_records(id,kind,name,tenant_id,data) VALUES($1,'TICKET',$2,$3,$4::jsonb)",[threadId,data.subject,actor.restroId,json({type:'SUPPORT',priority:'NORMAL',status:'OPEN',description:data.message})]);
   await tx.query('INSERT INTO platform_support_threads(id,restro_id,employee_id,outlet_id,queue) VALUES($1,$2,$3,$4,$5)',[threadId,actor.restroId,actor.employeeId,outlet.id,data.queue]);
  }else{threadId=data.threadId;const row=await thread(tx,threadId);ensure(row.restro_id===actor.restroId&&row.employee_id===actor.employeeId,'SUPPORT_FORBIDDEN','This conversation is private to its requester.',403);ensure(!['RESOLVED','CLOSED'].includes(row.data.status),'SUPPORT_CLOSED','This conversation is resolved. Open a new request if you need more help.',409);}
  const messageId=await appendMessage(tx,threadId,actor.userId,member.name,'RESTAURANT',data.message);
  await appendPlatformAudit(tx,{userId:actor.userId,name:member.name},'RESTAURANT_SUPPORT_MESSAGE',threadId,'Requester sent a support message',null,{messageId,tenantId:actor.restroId});
  const result={id:threadId};await tx.query('UPDATE platform_requests SET response=$3::jsonb WHERE user_id=$1 AND key=$2',[actor.userId,key,json(result)]);return result;
 });
}
const deskFilters=z.object({search:z.string().trim().max(100).default(''),status:z.enum(['ALL','OPEN','IN_PROGRESS','RESOLVED','CLOSED']).default('ALL'),queue:z.enum(['ALL','TECHNICAL','BILLING','ACCOUNT','GENERAL']).default('ALL'),assignment:z.enum(['ALL','MINE','UNASSIGNED']).default('ALL'),offset:z.number().int().min(0).max(100000).default(0)}).strict();
export async function readPlatformSupportNotifications(db:Database,actor:PlatformActor){
 return db.transaction(null,async tx=>{
  const admin=await requirePlatformMember(tx,actor,'support');
  const rows=(await tx.query<Row>(`SELECT count(*) OVER() AS total,r.id,r.name,r.version,r.updated_at,r.data->>'status' AS status,r.data->>'priority' AS priority,v.name AS restaurant,t.queue,t.id IS NOT NULL AS conversation,m.id AS last_request_id,m.created_at AS last_request_at,c.id AS incoming_call_id
   FROM platform_records r LEFT JOIN platform_support_threads t ON t.id=r.id LEFT JOIN restaurants v ON v.id=r.tenant_id
   LEFT JOIN LATERAL(SELECT id,created_at FROM platform_support_messages WHERE thread_id=t.id AND side='RESTAURANT' ORDER BY created_at DESC,id DESC LIMIT 1) m ON true
   LEFT JOIN platform_support_calls c ON c.thread_id=t.id AND c.state='RINGING' AND c.caller_side='RESTAURANT' AND c.expires_at>now()
   WHERE r.kind='TICKET' AND NOT r.archived AND r.data->>'status' IN('OPEN','IN_PROGRESS') AND ($1::uuid[] IS NULL OR r.tenant_id IS NULL OR r.tenant_id=ANY($1))
   ORDER BY (c.id IS NOT NULL) DESC,r.updated_at DESC,r.id LIMIT 50`,[admin.tenant_scope??null])).rows;
  return {total:Number(rows[0]?.total??0),items:rows.map(({total,...row})=>row)};
 });
}
export async function readPlatformSupportChat(db:Database,actor:PlatformActor,threadId?:string,input:unknown={}){
 if(threadId)z.uuid().parse(threadId);const filters=deskFilters.parse(input);
 return db.transaction(null,async tx=>{const admin=await requirePlatformMember(tx,actor,'support'),scope=admin.tenant_scope??null;
  const predicate=`NOT r.archived AND ($1::uuid[] IS NULL OR t.restro_id=ANY($1)) AND ($2='ALL' OR r.data->>'status'=$2) AND ($3='ALL' OR t.queue=$3) AND ($4='ALL' OR $4='MINE' AND t.assigned_to=$5::uuid OR $4='UNASSIGNED' AND t.assigned_to IS NULL) AND ($6='' OR strpos(lower(r.name||' '||v.name||' '||e.name||' '||o.name),lower($6))>0)`,params=[scope,filters.status,filters.queue,filters.assignment,actor.userId,filters.search];
  const joins=' FROM platform_support_threads t JOIN platform_records r ON r.id=t.id JOIN employees e ON e.id=t.employee_id JOIN outlets o ON o.id=t.outlet_id JOIN restaurants v ON v.id=t.restro_id LEFT JOIN users u ON u.id=t.assigned_to ';
  const total=Number((await one(tx,'SELECT count(*) AS count'+joins+'WHERE '+predicate,params)).count);
  const list=(await tx.query<Row>(`SELECT r.id,r.name,r.tenant_id,r.version,r.data->>'status' AS status,r.updated_at,t.queue,t.assigned_to,e.name AS requester,o.name AS outlet,v.name AS restaurant,u.name AS assigned_name,EXISTS(SELECT 1 FROM platform_support_calls c WHERE c.thread_id=t.id AND c.state='RINGING' AND c.caller_side='RESTAURANT' AND c.expires_at>now()) AS incoming_call`+joins+`WHERE ${predicate} ORDER BY (r.data->>'status' IN('RESOLVED','CLOSED')),r.updated_at DESC,r.id LIMIT 50 OFFSET $7`,[...params,filters.offset])).rows;
  const agents=(await tx.query<Row>(`SELECT m.user_id,m.role,m.tenant_scope,u.name FROM platform_members m JOIN users u ON u.id=m.user_id WHERE m.enabled AND NOT u.disabled AND (m.role='SUPERADMIN' OR 'support'=ANY(m.permissions)) AND ($1::uuid[] IS NULL OR m.tenant_scope IS NOT NULL AND m.tenant_scope<@$1)`,[scope])).rows;
  let detail:Row|null=null;if(threadId){const row=await thread(tx,threadId);assertPlatformScope(admin,row.restro_id);const identity=await one<Row>(tx,'SELECT v.name AS restaurant,e.name AS requester,o.name AS outlet'+joins+'WHERE t.id=$1',[threadId]);detail={...identity,id:row.id,name:row.name,tenant_id:row.restro_id,status:row.data.status,resolution:row.data.resolution??'',closedReason:row.data.closedReason??'',version:row.version,queue:row.queue,assigned_to:row.assigned_to,messages:await messages(tx,threadId)};}
  return {threads:list,total,offset:filters.offset,thread:detail,agents,capabilities:{canClose:admin.role==='SUPERADMIN',canEditWorkspace:admin.role==='SUPERADMIN',userId:actor.userId},channels:scope===null?await channels(tx):null};
 });
}
export async function managePlatformSupportChat(db:Database,actor:PlatformActor,key:string,input:unknown){
 const data=adminInput.parse(input);
 if(data.action==='troubleshoot'){
  await db.transaction(null,async tx=>{const admin=await requirePlatformMember(tx,actor,'support'),row=await thread(tx,data.threadId);assertPlatformScope(admin,row.restro_id);ensure(row.restro_id===data.tenantId,'SUPPORT_FORBIDDEN','Choose the correct restaurant conversation.',403);});
  return createPlatformSupportView(db,actor,key,{tenantId:data.tenantId,reason:'Chat '+data.threadId+' · '+data.reason,adminPassword:data.adminPassword,mode:data.mode,confirmedChanges:data.confirmedChanges});
 }
 return platformMutation(db,actor,key,'support','PLATFORM_SUPPORT_CHAT',data,'Support conversation '+data.action,async tx=>{
  const admin=await requirePlatformMember(tx,actor,'support'),row=await thread(tx,data.threadId);assertPlatformScope(admin,row.restro_id);ensure(row.restro_id===data.tenantId,'SUPPORT_FORBIDDEN','Choose the correct restaurant conversation.',403);
  if(data.action==='reply'){ensure(!['RESOLVED','CLOSED'].includes(row.data.status),'SUPPORT_CLOSED','This conversation is already resolved.',409);await appendMessage(tx,row.id,actor.userId,admin.name,'SUPPORT',data.message);await tx.query("UPDATE platform_records SET data=jsonb_set(data,'{status}','\"IN_PROGRESS\"'::jsonb) WHERE id=$1",[row.id]);}
  else{expectedVersion(row.version,data.version);if(data.action==='assign'){
   ensure(!['RESOLVED','CLOSED'].includes(row.data.status),'SUPPORT_CLOSED','This conversation is finished.',409);
   if(data.assignedTo){const agent=await one<Row>(tx,"SELECT m.* FROM platform_members m JOIN users u ON u.id=m.user_id WHERE m.user_id=$1 AND m.enabled AND NOT u.disabled AND (m.role='SUPERADMIN' OR 'support'=ANY(m.permissions))",[data.assignedTo]);assertPlatformScope(agent,row.restro_id);}
   await tx.query('UPDATE platform_support_threads SET queue=$2,assigned_to=$3 WHERE id=$1',[row.id,data.queue,data.assignedTo]);await tx.query('UPDATE platform_records SET version=version+1,updated_at=now() WHERE id=$1',[row.id]);
  }else{
   ensure(row.data.status!=='CLOSED','SUPPORT_CLOSED','This conversation is already closed.',409);
   if(data.action==='close')ensure(admin.role==='SUPERADMIN','PLATFORM_FORBIDDEN','Only a Superadmin can close conversations.',403);
   else ensure(row.data.status!=='RESOLVED','SUPPORT_CLOSED','This conversation is already solved.',409);
   await tx.query("UPDATE platform_support_calls SET state='ENDED',ended_at=now(),version=version+1 WHERE thread_id=$1 AND state IN('RINGING','ANSWERED')",[row.id]);
   await appendMessage(tx,row.id,actor.userId,admin.name,'SUPPORT',data.resolution);
   await tx.query('UPDATE platform_records SET data=data||$2::jsonb WHERE id=$1',[row.id,json(data.action==='close'?{status:'CLOSED',closedReason:data.resolution}:{status:'RESOLVED',resolution:data.resolution})]);
  }}
  await appendPlatformAudit(tx,actor,'PLATFORM_SUPPORT_'+data.action.toUpperCase(),row.id,'Support conversation '+data.action,{queue:row.queue,assignedTo:row.assigned_to,status:row.data.status},{tenantId:row.restro_id,action:data.action,...(data.action==='assign'?{queue:data.queue,assignedTo:data.assignedTo}:{})});return {id:row.id};
 });
}

const sdp=z.string().min(5).max(48000).regex(/^v=0\r?\n/,'Invalid voice session description.');
const callInput=z.discriminatedUnion('action',[
 z.object({action:z.literal('start'),threadId:z.uuid(),offer:sdp}).strict(),
 z.object({action:z.literal('answer'),threadId:z.uuid(),callId:z.uuid(),version:z.number().int().min(1),answer:sdp}).strict(),
 z.object({action:z.literal('end'),threadId:z.uuid(),callId:z.uuid(),version:z.number().int().min(1),decline:z.boolean().default(false)}).strict()
]);
async function callMember(tx:Sql,actor:Actor|PlatformActor,platform:boolean,threadId:string){
 const member=platform?await requirePlatformMember(tx,actor,'support'):await restaurantMember(tx,actor as Actor),row=await thread(tx,threadId);
 if(platform)assertPlatformScope(member,row.restro_id);
 else ensure(row.restro_id===(actor as Actor).restroId&&row.employee_id===(actor as Actor).employeeId,'SUPPORT_FORBIDDEN','This conversation is private to its requester.',403);
 return {member,row,side:platform?'SUPPORT':'RESTAURANT'};
}
export async function readSupportCall(db:Database,actor:Actor|PlatformActor,threadId:string,platform=false){
 z.uuid().parse(threadId);
 return db.transaction(null,async tx=>{const {member}=await callMember(tx,actor,platform,threadId);const call=(await tx.query<Row>("SELECT id,caller_id,caller_name,caller_side,answered_by,state,offer,answer,version,expires_at FROM platform_support_calls WHERE thread_id=$1 AND state IN('RINGING','ANSWERED') AND expires_at>now() ORDER BY created_at DESC LIMIT 1",[threadId])).rows[0]??null;return {call,userId:actor.userId,canEndAll:platform&&member.role==='SUPERADMIN'};});
}
export async function changeSupportCall(db:Database,actor:Actor|PlatformActor,key:string,input:unknown,platform=false){
 z.uuid().parse(key);const data=callInput.parse(input);
 return db.transaction(null,async tx=>{
  await one(tx,'SELECT * FROM platform_audit_head WHERE singleton=true FOR UPDATE');const {member,row,side}=await callMember(tx,actor,platform,data.threadId);
  const fingerprint=hash(canonical({action:'SUPPORT_CALL',platform,userId:actor.userId,threadId:row.id,data}));
  await tx.query('INSERT INTO platform_requests(user_id,key,fingerprint) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[actor.userId,key,fingerprint]);
  const request=await one(tx,'SELECT * FROM platform_requests WHERE user_id=$1 AND key=$2 FOR UPDATE',[actor.userId,key]);ensure(request.fingerprint===fingerprint,'IDEMPOTENCY_CONFLICT','This request key belongs to a different call action.',409);if(request.response!==null)return request.response as {id:string};
  let callId:string;
  if(data.action==='start'){
   ensure(!['RESOLVED','CLOSED'].includes(row.data.status),'SUPPORT_CLOSED','This conversation is finished.',409);
   await tx.query("UPDATE platform_support_calls SET state='ENDED',ended_at=now(),version=version+1 WHERE thread_id=$1 AND state IN('RINGING','ANSWERED') AND expires_at<=now()",[row.id]);
   ensure(!(await tx.query("SELECT id FROM platform_support_calls WHERE thread_id=$1 AND state IN('RINGING','ANSWERED')",[row.id])).rows.length,'CALL_ACTIVE','A call is already active in this conversation.',409);
   ensure(Number((await one(tx,"SELECT count(*) AS count FROM platform_support_calls WHERE caller_id=$1 AND created_at>now()-interval '10 minutes'",[actor.userId])).count)<10,'CALL_RATE_LIMIT','Please wait before starting more calls.',429);
   callId=id();await tx.query("INSERT INTO platform_support_calls(id,thread_id,caller_id,caller_name,caller_side,state,offer,expires_at) VALUES($1,$2,$3,$4,$5,'RINGING',$6,now()+interval '90 seconds')",[callId,row.id,actor.userId,member.name,side,data.offer]);
  }else{
   callId=data.callId;const call=await one<Row>(tx,'SELECT * FROM platform_support_calls WHERE id=$1 AND thread_id=$2 FOR UPDATE',[callId,row.id]);expectedVersion(call.version,data.version);
   ensure(['RINGING','ANSWERED'].includes(call.state)&&new Date(call.expires_at).getTime()>Date.now(),'CALL_FINISHED','This call is no longer active.',409);
   if(data.action==='answer'){
    ensure(call.state==='RINGING'&&call.caller_side!==side,'CALL_FORBIDDEN','Only the other participant can answer this call.',403);
    await tx.query("UPDATE platform_support_calls SET state='ANSWERED',answered_by=$2,answer=$3,expires_at=now()+interval '2 hours',version=version+1 WHERE id=$1",[callId,actor.userId,data.answer]);
   }else{
    if(data.decline)ensure(call.state==='RINGING'&&call.caller_side!==side,'CALL_FORBIDDEN','Only an incoming ringing call can be declined.',403);
    ensure(call.caller_id===actor.userId||call.answered_by===actor.userId||call.state==='RINGING'&&call.caller_side!==side||platform&&member.role==='SUPERADMIN','CALL_FORBIDDEN','Only a participant or Superadmin can end this call.',403);
    await tx.query('UPDATE platform_support_calls SET state=$2,ended_at=now(),version=version+1 WHERE id=$1',[callId,data.decline?'DECLINED':'ENDED']);
   }
  }
  await appendPlatformAudit(tx,{userId:actor.userId,name:member.name},'SUPPORT_CALL_'+data.action.toUpperCase(),row.id,'Support voice call '+data.action,null,{callId,tenantId:row.restro_id});
  const result={id:row.id};await tx.query('UPDATE platform_requests SET response=$3::jsonb WHERE user_id=$1 AND key=$2',[actor.userId,key,json(result)]);return result;
 });
}
