import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createEmbeddedDatabase,createPostgresDatabase,type Database} from '@dinerdost/database';
import * as s from '@dinerdost/services';
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
 assert.ok((await db.query("SELECT id FROM platform_audit WHERE actor_user_id=$1 AND action='PLATFORM_OWNER_TRANSACTION'",[admin.userId])).rows.length>0);
});

test('cached edit databases reject ended, expired and demoted grants and cannot replay owner idempotency results',async()=>{
 const grant=await start(),view=await s.platformOwnerView(db,admin,grant.id),edit=s.platformOwnerEditDatabase(db,admin,grant.id,owner.restroId),request=key(),input={outletId:owner.outletIds[0],name:'Owner retry boundary',unit:'kg'};await s.addIngredient(db,owner,request,input);await assert.rejects(s.addIngredient(edit,view.actor,request,input),{code:'IDEMPOTENCY_CONFLICT'});
 await s.endPlatformSupportView(db,admin,key(),{id:grant.id,reason});await assert.rejects(edit.query('SELECT id FROM restaurants'),{code:'SUPPORT_UNAVAILABLE'});
 const expired=await start();await db.query("UPDATE platform_support_access SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.id]);await assert.rejects(s.platformOwnerEditDatabase(db,admin,expired.id,owner.restroId).query('SELECT 1'),{code:'SUPPORT_UNAVAILABLE'});
 const demoted=await start();await db.query("UPDATE platform_members SET role='SUPPORT' WHERE user_id=$1",[admin.userId]);await assert.rejects(s.platformOwnerEditDatabase(db,admin,demoted.id,owner.restroId).query('SELECT 1'),{code:'PLATFORM_FORBIDDEN'});
});
