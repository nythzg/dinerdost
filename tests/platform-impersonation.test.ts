import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createEmbeddedDatabase,createPostgresDatabase,type Database} from '@dinerdost/database';
import * as s from '@dinerdost/services';
import {audit} from '../packages/services/src/shared';
let db:Database,admin:any,owner:any,foreign:any;
const key=()=>randomUUID(),password='isolated-impersonation-password-123',reason='Diagnose synthetic restaurant issue';
const start=()=>s.createPlatformSupportView(db,admin,key(),{tenantId:owner.restroId,mode:'EDIT',confirmedChanges:true,adminPassword:password,reason});
before(async()=>{db=process.env.TEST_DATABASE_URL?createPostgresDatabase(process.env.TEST_DATABASE_URL):await createEmbeddedDatabase();await db.migrate();const actors=[];for(let n=0;n<3;n++){const a=await s.signup(db,{name:'Impersonation QA '+n,email:'impersonation-'+n+'@example.test',password,restaurant:'Impersonation QA '+n,outlet:'Synthetic',demo:true,qrEnabled:true},'impersonation-'+n);actors.push(await s.authenticate(db,a.token));}[admin,owner,foreign]=actors;await s.bootstrapPlatformAdmin(db,'impersonation-0@example.test');});
beforeEach(async()=>{await db.query('DELETE FROM rate_limits')});
after(async()=>db?.close());

test('editable owner delegation requires explicit confirmation, password and a fresh Superadmin membership',async()=>{
 await assert.rejects(s.createPlatformSupportView(db,admin,key(),{tenantId:owner.restroId,mode:'EDIT',confirmedChanges:false,adminPassword:password,reason}),{code:'SUPPORT_CONFIRMATION_REQUIRED'});
 await assert.rejects(s.createPlatformSupportView(db,owner,key(),{tenantId:owner.restroId,mode:'EDIT',confirmedChanges:true,adminPassword:password,reason}),{code:'PLATFORM_FORBIDDEN'});
 await db.query("UPDATE platform_members SET role='SUPPORT' WHERE user_id=$1",[admin.userId]);await assert.rejects(start(),{code:'PLATFORM_FORBIDDEN'});await db.query("UPDATE platform_members SET role='SUPERADMIN' WHERE user_id=$1",[admin.userId]);
 const grant=await s.createPlatformSupportView(db,admin,key(),{tenantId:owner.restroId,adminPassword:password,reason}),view=await s.platformOwnerView(db,admin,grant.id);assert.equal(view.actor.supportView?.mode,'READ_ONLY');
 const ro=s.platformOwnerReadDatabase(db,owner.restroId);await assert.rejects(s.addIngredient(ro,view.actor,key(),{outletId:owner.outletIds[0],name:'Cannot write',unit:'kg'}),/read.only/i);
});

test('editable dashboard uses normal owner services, tenant RLS and immutable financial guards while attributing the administrator',async()=>{
 const grant=await start(),view=await s.platformOwnerView(db,admin,grant.id),edit=s.platformOwnerEditDatabase(db,admin,grant.id,owner.restroId);assert.equal(view.actor.supportView?.mode,'EDIT');assert.equal((await s.workspace(edit,view.actor)).restaurant.id,owner.restroId);
 const material=await s.addIngredient(edit,view.actor,key(),{outletId:owner.outletIds[0],name:'Diagnostic synthetic material',unit:'kg'});await s.receiveStock(edit,view.actor,key(),{ingredientId:material.id,batchNumber:key(),quantityMilli:1000,unitCost:500,reference:'Synthetic diagnostic receipt',expiresAt:new Date(Date.now()+86400000).toISOString()},true);
 const w=await s.workspace(edit,view.actor);let order=await s.createRound(edit,view.actor,key(),{outletId:w.outletId,type:'TAKEAWAY',items:[{itemId:w.menu[0].id,quantity:1}],customer:{name:'Synthetic diner',phone:'9187654321'}},true);await s.recordPayment(edit,view.actor,key(),order.id,order.rounds[0].id,{version:order.rounds[0].version,method:'CASH',amount:order.totals.payable},true);order=await s.getOrder(edit,view.actor,order.id);await s.completePreparedService(edit,view.actor,key(),order.id,order.rounds[0].id,{version:order.rounds[0].version,confirmedPreparedAndServed:true});await s.generateBill(edit,view.actor,key(),order.id,{final:true});
 const invoices=(await db.query('SELECT * FROM invoices WHERE order_id=$1',[order.id])).rows,payments=(await db.query('SELECT * FROM payment_attempts WHERE order_id=$1',[order.id])).rows;
 await assert.rejects(edit.query("UPDATE invoices SET snapshot='{}' WHERE order_id=$1",[order.id]),/immutable|permission denied/i);await assert.rejects(edit.transaction(foreign.restroId,tx=>tx.query('SELECT 1')),{code:'PLATFORM_SCOPE_FORBIDDEN'});assert.equal((await edit.query('SELECT id FROM restaurants')).rows.length,1);
 await edit.transaction(owner.restroId,async tx=>{await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');assert.equal((await tx.query('SELECT id FROM restaurants')).rows.length,1)});
 assert.deepEqual((await db.query('SELECT * FROM invoices WHERE order_id=$1',[order.id])).rows,invoices);assert.deepEqual((await db.query('SELECT * FROM payment_attempts WHERE order_id=$1',[order.id])).rows,payments);
 const event=(await db.query<any>("SELECT * FROM audit_events WHERE action='INGREDIENT_CREATED' AND restro_id=$1 ORDER BY sequence DESC LIMIT 1",[owner.restroId])).rows[0];assert.match(event.actor_name,/Impersonation QA 0/);assert.ok(event.reason.includes(grant.id));
 assert.ok((await db.query("SELECT id FROM platform_audit WHERE actor_user_id=$1 AND action='PLATFORM_OWNER_ACTION'",[admin.userId])).rows.length>0);
});

test('owner support audit ignores reads, retries and rolled-back actions while recording each committed action',async()=>{
 const grant=await start(),view=await s.platformOwnerView(db,admin,grant.id),edit=s.platformOwnerEditDatabase(db,admin,grant.id,owner.restroId);
 const count=async()=>Number((await db.query<any>('SELECT count(*) AS n FROM platform_audit')).rows[0].n),before=await count();
 for(let n=0;n<3;n++){await edit.query('SELECT id FROM restaurants');await s.workspace(edit,view.actor)}
 assert.equal(await count(),before,'Opening or refreshing a dashboard must not register an action');
 const request=key(),input={outletId:owner.outletIds[0],name:'Audited diagnostic '+key(),unit:'kg'};
 const [first,retry]=await Promise.all([s.addIngredient(edit,view.actor,request,input),s.addIngredient(edit,view.actor,request,input)]);assert.equal(first.id,retry.id);assert.equal(await count(),before+1,'One committed action, even when submitted concurrently twice');
 const event=(await db.query<any>("SELECT * FROM platform_audit WHERE action='PLATFORM_OWNER_ACTION' ORDER BY sequence DESC LIMIT 1")).rows[0];assert.equal(event.actor_user_id,admin.userId);assert.equal(event.after_data.action,'INGREDIENT_CREATED');assert.equal(event.after_data.entityId,first.id);assert.equal(event.after_data.grantId,grant.id);
 const tenant=(await db.query<any>('SELECT * FROM audit_events WHERE id=$1',[event.after_data.tenantAuditId])).rows[0];assert.equal(tenant.action,event.after_data.action);assert.equal(tenant.restro_id,owner.restroId);
 const parallel={outletId:owner.outletIds[0],name:'Parallel operator '+key(),unit:'kg'};await Promise.all([s.addIngredient(edit,view.actor,key(),parallel),s.addIngredient(db,owner,key(),{...parallel,name:'Parallel actual owner '+key()})]);assert.equal(await count(),before+2,'A concurrent real-owner action must not be attributed to the operator');
 await assert.rejects(edit.transaction(owner.restroId,async tx=>{await tx.query("INSERT INTO ingredients(id,restro_id,outlet_id,name,unit) VALUES($1,$2,$3,$4,'kg')",[key(),owner.restroId,owner.outletIds[0],'Rolled back diagnostic']);await audit(tx,view.actor,{action:'ROLLBACK_DIAGNOSTIC',entityType:'ingredient',entityId:'synthetic-rollback',reason:'Synthetic transaction rollback'});throw new Error('Rollback diagnostic')}),/Rollback diagnostic/);
 assert.equal(await count(),before+2);assert.equal((await db.query("SELECT id FROM ingredients WHERE name='Rolled back diagnostic'")).rows.length,0);assert.equal((await s.verifyPlatformAudit(db,admin)).valid,true);
});

test('owner support audit preserves the legacy chain while the console lists actionable events',async()=>{
 await db.transaction(null,tx=>s.appendPlatformAudit(tx,admin,'PLATFORM_OWNER_TRANSACTION',owner.restroId,'Historical generic editable transaction',null,{mode:'EDIT'}));
 const count=Number((await db.query<any>('SELECT count(*) AS n FROM platform_audit')).rows[0].n),snapshot=await s.platformSnapshot(db,admin);
 assert.ok(snapshot.audits.length>0);assert.ok(snapshot.audits.every((r:any)=>r.action!=='PLATFORM_OWNER_TRANSACTION'));
 assert.equal((await s.verifyPlatformAudit(db,admin)).count,count);assert.equal((await s.verifyPlatformAudit(db,admin)).valid,true);
 assert.ok((await db.query("SELECT id FROM platform_audit WHERE action='PLATFORM_OWNER_TRANSACTION'")).rows.length>0);
});

test('cached edit databases reject ended, expired and demoted grants and cannot replay owner idempotency results',async()=>{
 const grant=await start(),view=await s.platformOwnerView(db,admin,grant.id),edit=s.platformOwnerEditDatabase(db,admin,grant.id,owner.restroId),request=key(),input={outletId:owner.outletIds[0],name:'Owner retry boundary',unit:'kg'};await s.addIngredient(db,owner,request,input);await assert.rejects(s.addIngredient(edit,view.actor,request,input),{code:'IDEMPOTENCY_CONFLICT'});
 await s.endPlatformSupportView(db,admin,key(),{id:grant.id,reason});await assert.rejects(edit.query('SELECT id FROM restaurants'),{code:'SUPPORT_UNAVAILABLE'});
 const expired=await start();await db.query("UPDATE platform_support_access SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.id]);await assert.rejects(s.platformOwnerEditDatabase(db,admin,expired.id,owner.restroId).query('SELECT 1'),{code:'SUPPORT_UNAVAILABLE'});
 const demoted=await start();await db.query("UPDATE platform_members SET role='SUPPORT' WHERE user_id=$1",[admin.userId]);await assert.rejects(s.platformOwnerEditDatabase(db,admin,demoted.id,owner.restroId).query('SELECT 1'),{code:'PLATFORM_FORBIDDEN'});
});
