import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createEmbeddedDatabase,createPostgresDatabase,type Database} from '@dinerdost/database';
import type {Actor} from '@dinerdost/core';
import * as s from '@dinerdost/services';

let db:Database,admin:Actor,owner:Actor,other:Actor,agent:Actor,outlet:string,conversation:string;
const key=()=>randomUUID(),password='isolated-support-chat-password-123',reason='Isolated support chat verification';
before(async()=>{db=process.env.TEST_DATABASE_URL?createPostgresDatabase(process.env.TEST_DATABASE_URL):await createEmbeddedDatabase();await db.migrate();const actors=[];for(let n=0;n<4;n++){const auth=await s.signup(db,{name:'Support QA '+n,email:'support-chat-'+n+'@example.test',password,restaurant:'Support QA restaurant '+n,outlet:'QA Main',demo:true,qrEnabled:true},'support-chat-'+n);actors.push(await s.authenticate(db,auth.token));}[admin,owner,other,agent]=actors;await s.bootstrapPlatformAdmin(db,'support-chat-0@example.test');outlet=(await s.workspace(db,owner)).outletId;});
after(async()=>db?.close());

test('requester chat creates a real case once, keeps its messages private and rejects forged or delegated sessions',async()=>{
 const input={action:'create',outletId:outlet,queue:'TECHNICAL',subject:'Cannot print a kitchen ticket',message:'The thermal printer is not responding.'},request=key();
 const results=await Promise.all([s.sendRestaurantSupport(db,owner,request,input),s.sendRestaurantSupport(db,owner,request,input)]);assert.deepEqual(results[0],results[1]);conversation=results[0].id;
 const own=await s.readRestaurantSupport(db,owner,conversation);assert.equal(own.thread?.messages.length,1);assert.equal(own.thread?.queue,'TECHNICAL');assert.deepEqual(own.channels,{email:'',whatsapp:'',version:0});assert.equal((await s.platformSnapshot(db,admin)).records.find((r:any)=>r.id===conversation)?.kind,'TICKET');
 await assert.rejects(s.sendRestaurantSupport(db,owner,request,{...input,message:'Different payload'}),{code:'IDEMPOTENCY_CONFLICT'});
 assert.equal((await s.readRestaurantSupport(db,other)).threads.length,0);await assert.rejects(s.readRestaurantSupport(db,other,conversation),{code:'SUPPORT_FORBIDDEN'});
 await assert.rejects(s.sendRestaurantSupport(db,other,key(),{action:'reply',threadId:conversation,message:'Cannot steal this conversation'}),{code:'SUPPORT_FORBIDDEN'});
 await assert.rejects(s.readRestaurantSupport(db,{...owner,restroId:other.restroId}),{code:'UNAUTHENTICATED'});
 await assert.rejects(s.readRestaurantSupport(db,{...owner,sessionHash:other.sessionHash}),{code:'UNAUTHENTICATED'});
 await assert.rejects(s.readRestaurantSupport(db,{...owner,supportView:{id:key(),mode:'EDIT'} as any}),{code:'SUPPORT_FORBIDDEN'});
 for(const table of ['platform_support_threads','platform_support_messages'])await assert.rejects(db.transaction(owner.restroId,tx=>tx.query('SELECT * FROM '+table)),/permission denied/);
});

test('support role assignments and real replies enforce scope, permissions, version and immutable history',async()=>{
 await s.savePlatformMember(db,admin,key(),{email:'support-chat-3@example.test',role:'SUPPORT',permissions:['overview','support'],tenantIds:[owner.restroId],region:'QA',enabled:true,version:0,adminPassword:password,reason});
 const inbox=await s.readPlatformSupportChat(db,agent,conversation);assert.equal(inbox.threads.length,1);assert.equal(inbox.channels,null);assert.equal(inbox.thread?.messages.length,1);
 await assert.rejects(s.readPlatformSupportChat(db,owner),{code:'PLATFORM_FORBIDDEN'});
 const detail=inbox.thread!;await s.managePlatformSupportChat(db,agent,key(),{action:'assign',tenantId:owner.restroId,threadId:conversation,version:detail.version,queue:'BILLING',assignedTo:agent.userId});
 await assert.rejects(s.managePlatformSupportChat(db,agent,key(),{action:'assign',tenantId:owner.restroId,threadId:conversation,version:detail.version,queue:'GENERAL',assignedTo:null}),{code:'VERSION_CONFLICT'});
 const input={action:'reply',tenantId:owner.restroId,threadId:conversation,message:'We have received your request. Please check the printer connection.'},request=key();await s.managePlatformSupportChat(db,agent,request,input);await s.managePlatformSupportChat(db,agent,request,input);
 const own=await s.readRestaurantSupport(db,owner,conversation);assert.equal(own.thread?.messages.length,2);assert.equal(own.thread?.status,'IN_PROGRESS');assert.equal(own.threads[0].assigned_name,agent.name);
 const foreign=await s.sendRestaurantSupport(db,other,key(),{action:'create',outletId:(await s.workspace(db,other)).outletId,queue:'GENERAL',subject:'Other tenant issue',message:'Private other tenant conversation.'});
 await assert.rejects(s.readPlatformSupportChat(db,agent,foreign.id),{code:'PLATFORM_SCOPE_FORBIDDEN'});
 await assert.rejects(s.managePlatformSupportChat(db,agent,key(),{action:'reply',tenantId:owner.restroId,threadId:foreign.id,message:'Out of scope'}),{code:'PLATFORM_SCOPE_FORBIDDEN'});
 await assert.rejects(s.managePlatformSupportChat(db,admin,key(),{action:'assign',tenantId:other.restroId,threadId:foreign.id,version:2,queue:'GENERAL',assignedTo:agent.userId}),{code:'PLATFORM_SCOPE_FORBIDDEN'});
 await assert.rejects(db.query("UPDATE platform_support_messages SET body='rewritten' WHERE thread_id=$1",[conversation]),/immutable/i);
 assert.equal((await s.verifyPlatformAudit(db,admin)).valid,true);
});

test('contacts are explicitly configured by global support staff and generate no external delivery',async()=>{
 const input={key:'supportChannels',version:0,data:{email:'support@example.test',whatsapp:'+919876543210'},reason};
 await assert.rejects(s.savePlatformConfiguration(db,owner,key(),input),{code:'PLATFORM_FORBIDDEN'});await assert.rejects(s.savePlatformConfiguration(db,agent,key(),input),{code:'PLATFORM_SCOPE_FORBIDDEN'});
 await assert.rejects(s.savePlatformConfiguration(db,admin,key(),{...input,data:{email:'bad-address',whatsapp:'javascript:bad'}}));
 await s.savePlatformConfiguration(db,admin,key(),input);assert.deepEqual((await s.readRestaurantSupport(db,owner)).channels,{email:'support@example.test',whatsapp:'+919876543210',version:1});
 await assert.rejects(s.savePlatformConfiguration(db,admin,key(),input),{code:'VERSION_CONFLICT'});
});

test('resolution is shared, blocks new replies and generic ticket edits cannot move conversations across tenants',async()=>{
 const row=(await s.readPlatformSupportChat(db,admin,conversation,{search:'Does not match this conversation'})).thread!;assert.equal(row.restaurant,'Support QA restaurant 1');assert.equal(row.requester,'Support QA 1');assert.equal(row.outlet,'QA Main');
 await assert.rejects(s.savePlatformRecord(db,admin,key(),{id:conversation,kind:'TICKET',name:row.name,tenantId:other.restroId,version:row.version,data:{type:'SUPPORT',priority:'NORMAL',status:'OPEN',description:'Attempted transfer'},reason}),{code:'SUPPORT_TENANT_FIXED'});
 await s.managePlatformSupportChat(db,admin,key(),{action:'resolve',tenantId:owner.restroId,threadId:conversation,version:row.version,resolution:'Resolved with the restaurant. Printer connection restored.'});
 const resolved=(await s.readRestaurantSupport(db,owner,conversation)).thread!;assert.equal(resolved.status,'RESOLVED');assert.match(resolved.resolution,/Printer connection/);assert.equal(resolved.messages.length,3);
 await assert.rejects(s.sendRestaurantSupport(db,owner,key(),{action:'reply',threadId:conversation,message:'Cannot post into a closed case'}),{code:'SUPPORT_CLOSED'});
 await assert.rejects(s.managePlatformSupportChat(db,admin,key(),{action:'reply',tenantId:owner.restroId,threadId:conversation,message:'Cannot reply to a closed case'}),{code:'SUPPORT_CLOSED'});
 const fresh=await s.sendRestaurantSupport(db,owner,key(),{action:'create',outletId:outlet,queue:'ACCOUNT',subject:'Another request',message:'Please help with account setup.'});assert.notEqual(fresh.id,conversation);
});

test('message validation, outlet boundaries, disabled sessions and revoked support access fail closed',async()=>{
 await assert.rejects(s.sendRestaurantSupport(db,owner,key(),{action:'create',outletId:(await s.workspace(db,other)).outletId,queue:'GENERAL',subject:'Wrong outlet',message:'This must fail'}));
 await assert.rejects(s.sendRestaurantSupport(db,owner,key(),{action:'create',outletId:outlet,queue:'UNKNOWN',subject:'Invalid category',message:'Invalid'}));
 await assert.rejects(s.sendRestaurantSupport(db,owner,key(),{action:'reply',threadId:conversation,message:' '.repeat(10)}));
 await assert.rejects(s.sendRestaurantSupport(db,owner,key(),{action:'reply',threadId:conversation,message:'x'.repeat(2001)}));
 await db.query('UPDATE employees SET active=false WHERE id=$1',[other.employeeId]);await assert.rejects(s.readRestaurantSupport(db,other),{code:'UNAUTHENTICATED'});
 await db.query('UPDATE platform_members SET enabled=false WHERE user_id=$1',[agent.userId]);await assert.rejects(s.readPlatformSupportChat(db,agent),{code:'PLATFORM_FORBIDDEN'});
});


test('voice signalling is private, exactly once, race-safe and ends when the conversation closes',async()=>{
 await db.query('UPDATE platform_members SET enabled=true WHERE user_id=$1',[agent.userId]);
 const threadId=(await s.readRestaurantSupport(db,owner)).threads.find((t:any)=>t.status==='OPEN')!.id;
 const offer='v=0\r\ns=Isolated test offer\r\n',answer='v=0\r\ns=Isolated test answer\r\n',input={action:'start',threadId,offer},request=key();
 await s.changeSupportCall(db,owner,request,input);await s.changeSupportCall(db,owner,request,input);
 assert.equal((await db.query('SELECT id FROM platform_support_calls WHERE thread_id=$1',[threadId])).rows.length,1);
 let call=(await s.readSupportCall(db,admin,threadId,true)).call!;
 await assert.rejects(s.changeSupportCall(db,owner,key(),{action:'answer',threadId,callId:call.id,version:call.version,answer}),{code:'CALL_FORBIDDEN'});
 await assert.rejects(s.readSupportCall(db,{...owner,sessionHash:other.sessionHash},threadId),{code:'UNAUTHENTICATED'});
 await assert.rejects(s.changeSupportCall(db,admin,key(),{action:'start',threadId,offer},true),{code:'CALL_ACTIVE'});
 const answers=await Promise.allSettled([admin,agent].map(actor=>s.changeSupportCall(db,actor,key(),{action:'answer',threadId,callId:call.id,version:call.version,answer},true)));assert.equal(answers.filter(r=>r.status==='fulfilled').length,1);
 call=(await s.readSupportCall(db,owner,threadId)).call!;assert.equal(call.state,'ANSWERED');
 await s.changeSupportCall(db,admin,key(),{action:'end',threadId,callId:call.id,version:call.version},true);assert.equal((await s.readSupportCall(db,owner,threadId)).call,null);
 await s.changeSupportCall(db,admin,key(),{action:'start',threadId,offer},true);call=(await s.readSupportCall(db,owner,threadId)).call!;assert.equal((await s.readRestaurantSupport(db,owner)).threads.find((t:any)=>t.id===threadId)?.incoming_call,true);
 await s.changeSupportCall(db,owner,key(),{action:'end',threadId,callId:call.id,version:call.version,decline:true});assert.equal((await s.readSupportCall(db,owner,threadId)).call,null);
 await s.changeSupportCall(db,owner,key(),{action:'start',threadId,offer});await db.query("UPDATE platform_support_calls SET expires_at=now()-interval '1 second' WHERE thread_id=$1 AND state='RINGING'",[threadId]);assert.equal((await s.readSupportCall(db,owner,threadId)).call,null);
 await s.changeSupportCall(db,owner,key(),{action:'start',threadId,offer});const row=(await s.readPlatformSupportChat(db,admin,threadId)).thread!;
 await assert.rejects(s.managePlatformSupportChat(db,agent,key(),{action:'close',tenantId:owner.restroId,threadId,version:row.version,resolution:'Support staff cannot close this.'}),{code:'PLATFORM_FORBIDDEN'});
 await s.managePlatformSupportChat(db,admin,key(),{action:'close',tenantId:owner.restroId,threadId,version:row.version,resolution:'Closed after voice support.'});assert.equal((await s.readRestaurantSupport(db,owner,threadId)).thread?.status,'CLOSED');assert.equal((await s.readSupportCall(db,owner,threadId)).call,null);
 await assert.rejects(s.changeSupportCall(db,owner,key(),{action:'start',threadId,offer}),{code:'SUPPORT_CLOSED'});
 await assert.rejects(s.changeSupportCall(db,owner,key(),{action:'start',threadId,offer:'Invalid SDP'}));
 await assert.rejects(db.transaction(owner.restroId,tx=>tx.query('SELECT * FROM platform_support_calls')),/permission denied/);
 assert.equal((await s.verifyPlatformAudit(db,admin)).valid,true);
});

test('chat-linked troubleshooting reuses password, scope and Superadmin-only edit grants',async()=>{
 const input={action:'troubleshoot',tenantId:owner.restroId,threadId:conversation,reason:'Troubleshoot this linked support issue',adminPassword:password,mode:'READ_ONLY',confirmedChanges:false};
 await assert.rejects(s.managePlatformSupportChat(db,admin,key(),{...input,adminPassword:'wrong-password'}));
 await assert.rejects(s.managePlatformSupportChat(db,agent,key(),{...input,mode:'EDIT',confirmedChanges:true}),{code:'PLATFORM_FORBIDDEN'});
 const view=await s.managePlatformSupportChat(db,agent,key(),input);assert.equal((await s.platformOwnerView(db,agent,view.id)).actor.supportView?.mode,'READ_ONLY');
 const edit=await s.managePlatformSupportChat(db,admin,key(),{...input,mode:'EDIT',confirmedChanges:true});assert.equal((await s.platformOwnerView(db,admin,edit.id)).actor.supportView?.mode,'EDIT');
 const saved=(await db.query<any>('SELECT reason FROM platform_support_access WHERE id=$1',[edit.id])).rows[0];assert.match(saved.reason,new RegExp(conversation));
 await assert.rejects(s.managePlatformSupportChat(db,admin,key(),{...input,tenantId:other.restroId}),{code:'SUPPORT_FORBIDDEN'});
 await s.endPlatformSupportView(db,admin,key(),{id:edit.id,reason:'Finished isolated support test'});
});

test('live support notifications count scoped unresolved tickets, expose new requester events and ringing calls without changing history',async()=>{
 const memberVersion=(await db.query<any>('SELECT version FROM platform_members WHERE user_id=$1',[agent.userId])).rows[0]?.version??0;await s.savePlatformMember(db,admin,key(),{email:'support-chat-3@example.test',role:'SUPPORT',permissions:['overview','support'],tenantIds:[owner.restroId],region:'QA',enabled:true,version:memberVersion,adminPassword:password,reason});
 const before=await s.readPlatformSupportNotifications(db,admin),created=await s.sendRestaurantSupport(db,owner,key(),{action:'create',outletId:outlet,queue:'GENERAL',subject:'Live notifications test',message:'First notification message.'}),id=created.id;
 const first=await s.readPlatformSupportNotifications(db,admin),item=first.items.find(row=>row.id===id)!;assert.equal(first.total,before.total+1);assert.equal(item.conversation,true);assert(item.last_request_id);assert.equal(item.incoming_call_id,null);assert.equal('messages' in item,false);assert.equal('body' in item,false);
 const scoped=await s.readPlatformSupportNotifications(db,agent);assert(scoped.items.every(row=>!row.restaurant||row.restaurant==='Support QA restaurant 1'));assert(scoped.items.some(row=>row.id===id));
 const auditCount=(await db.query('SELECT count(*) AS count FROM platform_audit')).rows;assert.deepEqual(await s.readPlatformSupportNotifications(db,admin),first);assert.deepEqual((await db.query('SELECT count(*) AS count FROM platform_audit')).rows,auditCount);
 await s.sendRestaurantSupport(db,owner,key(),{action:'reply',threadId:id,message:'Next requester message.'});const replied=(await s.readPlatformSupportNotifications(db,admin)).items.find(row=>row.id===id)!;assert.notEqual(replied.last_request_id,item.last_request_id);
 await s.managePlatformSupportChat(db,agent,key(),{action:'reply',tenantId:owner.restroId,threadId:id,message:'Support reply is not an incoming requester message.'});assert.equal((await s.readPlatformSupportNotifications(db,admin)).items.find(row=>row.id===id)!.last_request_id,replied.last_request_id);
 await s.changeSupportCall(db,owner,key(),{action:'start',threadId:id,offer:'v=0\r\ns=Notification test offer\r\n'});const call=(await s.readPlatformSupportNotifications(db,agent)).items.find(row=>row.id===id)!;assert(call.incoming_call_id);assert.equal((await s.readPlatformSupportNotifications(db,agent)).items[0].id,id);
 await db.query("UPDATE platform_support_calls SET expires_at=now()-interval '1 second' WHERE id=$1",[call.incoming_call_id]);assert.equal((await s.readPlatformSupportNotifications(db,agent)).items.find(row=>row.id===id)!.incoming_call_id,null);
 const current=(await s.readPlatformSupportChat(db,admin,id)).thread!;await s.managePlatformSupportChat(db,admin,key(),{action:'close',threadId:id,tenantId:owner.restroId,version:current.version,resolution:'Closed notification test.'});assert.equal((await s.readPlatformSupportNotifications(db,admin)).total,before.total);assert(!(await s.readPlatformSupportNotifications(db,agent)).items.some(row=>row.id===id));
 await assert.rejects(s.readPlatformSupportNotifications(db,owner),{code:'PLATFORM_FORBIDDEN'});await assert.rejects(s.readPlatformSupportNotifications(db,{...agent,sessionHash:owner.sessionHash}),{code:'PLATFORM_FORBIDDEN'});
 const member=(await db.query<any>('SELECT permissions,enabled,tenant_scope FROM platform_members WHERE user_id=$1',[agent.userId])).rows[0];
 try{await db.query('UPDATE platform_members SET tenant_scope=$2::uuid[] WHERE user_id=$1',[agent.userId,[]]);assert.equal((await s.readPlatformSupportNotifications(db,agent)).items.some(row=>row.restaurant==='Support QA restaurant 1'),false);await db.query('UPDATE platform_members SET enabled=false WHERE user_id=$1',[agent.userId]);await assert.rejects(s.readPlatformSupportNotifications(db,agent),{code:'PLATFORM_FORBIDDEN'})}finally{await db.query('UPDATE platform_members SET tenant_scope=$2::uuid[],enabled=$3 WHERE user_id=$1',[agent.userId,member.tenant_scope,member.enabled])}
});

test('shared message desk filters and paginates every authorized conversation without leaking other tenants',async()=>{
 const ids=Array.from({length:101},key),values={type:'SUPPORT',priority:'NORMAL',status:'OPEN',description:'Isolated pagination fixture'};
 await db.query("INSERT INTO platform_records(id,kind,name,tenant_id,data) SELECT id,'TICKET','Desk pagination '||id::text,$2,$3::jsonb FROM unnest($1::uuid[]) AS ids(id)",[ids,owner.restroId,JSON.stringify(values)]);
 await db.query("INSERT INTO platform_support_threads(id,restro_id,employee_id,outlet_id,queue) SELECT id,$2,$3,$4,'GENERAL' FROM unnest($1::uuid[]) AS ids(id)",[ids,owner.restroId,owner.employeeId,outlet]);
 const pages=await Promise.all([0,50,100].map(offset=>s.readPlatformSupportChat(db,agent,undefined,{search:'Desk pagination',status:'OPEN',queue:'GENERAL',offset})));assert.deepEqual(pages.map(p=>p.threads.length),[50,50,1]);assert(pages.every(p=>p.total===101));assert.equal(new Set(pages.flatMap(p=>p.threads.map(t=>t.id))).size,101);
 const alerts=await s.readPlatformSupportNotifications(db,agent);assert(alerts.total>=101);assert.equal(alerts.items.length,50);assert.equal(alerts.total,Number((await db.query("SELECT count(*) AS count FROM platform_records WHERE kind='TICKET' AND NOT archived AND data->>'status' IN('OPEN','IN_PROGRESS') AND (tenant_id=$1 OR tenant_id IS NULL)",[owner.restroId])).rows[0].count));
 const first=pages[0].threads[0];await s.managePlatformSupportChat(db,agent,key(),{action:'assign',threadId:first.id,tenantId:owner.restroId,version:first.version,queue:'GENERAL',assignedTo:agent.userId});
 assert.equal((await s.readPlatformSupportChat(db,agent,undefined,{search:'Desk pagination',assignment:'MINE'})).total,1);assert.equal((await s.readPlatformSupportChat(db,agent,undefined,{search:'Desk pagination',assignment:'UNASSIGNED'})).total,100);
 assert.equal((await s.readPlatformSupportChat(db,agent,undefined,{search:'%'})).total,0);
 await assert.rejects(s.readPlatformSupportChat(db,agent,undefined,{offset:-1}));
 const row=(await s.readPlatformSupportChat(db,admin,first.id)).thread!;await assert.rejects(s.savePlatformRecord(db,agent,key(),{id:first.id,kind:'TICKET',name:row.name,tenantId:owner.restroId,version:row.version,data:{...values,status:'CLOSED',resolution:'Attempted bypass'},reason}),{code:'SUPPORT_DESK_REQUIRED'});
});
