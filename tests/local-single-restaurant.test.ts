import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createEmbeddedDatabase} from '@dinerdost/database';
import * as s from '@dinerdost/services';
import {copySingleRestaurant} from '../scripts/lib/copy-single-restaurant';

test('clean local copy retains one exact restaurant, original logins and immutable history while source and FK enforcement stay intact',async()=>{
 const source=await createEmbeddedDatabase(),destination=await createEmbeddedDatabase(),password='local-copy-synthetic-password',email='kept-superadmin@example.test',key=()=>randomUUID();
 try{
  await source.migrate();await destination.migrate();
  const keepAuth=await s.signup(source,{name:'Nihal QA owner',email:'kept-owner@example.test',password,restaurant:'Kept cooks QA',outlet:'N1 QA',demo:true,qrEnabled:true},'kept-copy'),keep=await s.authenticate(source,keepAuth.token);
  const removeAuth=await s.signup(source,{name:'Removed QA owner',email:'removed-owner@example.test',password,restaurant:'Removed QA',outlet:'Removed',demo:true,qrEnabled:true},'removed-copy');
  const invite=await s.inviteInitialPlatformIdentity(source,email),platformSession=await s.completePlatformEnrolment(source,{token:invite.token,name:'Kept QA administrator',password},'copy-enrol');
  const w=await s.workspace(source,keep);
  let order=await s.createRound(source,keep,key(),{outletId:w.outletId,type:'TAKEAWAY',items:[{itemId:w.menu[0].id,quantity:1}],customer:{name:'Synthetic retained diner',phone:'9187654321'}},true);
  order=(await s.recordPayment(source,keep,key(),order.id,order.rounds[0].id,{version:order.rounds[0].version,method:'CASH',amount:Number(order.rounds[0].payable)},true)).order;
  await s.generateBill(source,keep,key(),order.id,{final:false});
  const before=await s.getOrder(source,keep,order.id),sourceWorkspace=await s.workspace(source,keep);
  const result=await copySingleRestaurant(source,destination,{tenantId:keep.restroId,platformEmail:email});
  assert.equal(result.retainedFingerprintsEqual,true);assert.equal(result.originalRowsModified,0);
  assert.equal((await destination.query('SELECT id FROM restaurants')).rows.length,1);assert.equal((await source.query('SELECT id FROM restaurants')).rows.length,2);
  const kept=await s.authenticate(destination,keepAuth.token),platform=await s.authenticatePlatform(destination,platformSession.token);
  assert.deepEqual(await s.getOrder(destination,kept,order.id),before);
  assert.deepEqual((await s.workspace(destination,kept)).movements,sourceWorkspace.movements);
  assert.equal((await s.verifyAudit(destination,kept)).valid,true);assert.equal((await s.verifyPlatformAudit(destination,platform)).valid,true);
  assert.equal((await s.platformRestaurantDirectory(destination,platform,{search:'Nihal QA owner'})).rows[0].id,keep.restroId);
  assert.equal((await s.platformSnapshot(destination,platform)).tenants.length,1);
  assert.equal((await s.authenticate(destination,(await s.login(destination,{email:'kept-owner@example.test',password},'copy-login')).token)).restroId,keep.restroId);
  assert.equal((await s.authenticatePlatform(destination,(await s.loginPlatform(destination,{email,password},'copy-platform-login')).token)).userId,invite.userId);
  await assert.rejects(s.authenticate(destination,removeAuth.token),{code:'UNAUTHENTICATED'});
  await assert.rejects(s.login(destination,{email:'removed-owner@example.test',password},'removed-login'));
  const fk=await destination.query('SELECT condeferrable FROM pg_constraint WHERE contype=\'f\'');assert.ok(fk.rows.every(row=>!row.condeferrable));
  const triggerQuery="SELECT c.relname,t.tgname,t.tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal AND c.relnamespace='public'::regnamespace ORDER BY c.relname,t.tgname";
  assert.deepEqual((await destination.query(triggerQuery)).rows,(await source.query(triggerQuery)).rows);
  await assert.rejects(destination.query('INSERT INTO outlets(id,restro_id,name,code,qr_enabled,payment_policy) VALUES($1,$2,$3,$4,true,$5)',[key(),key(),'Foreign','FOREIGN','POSTPAID']),/foreign key/i);
  await assert.rejects(destination.query('UPDATE invoices SET number=$1',['changed']),/immutable|append.only/i);
  await assert.rejects(copySingleRestaurant(source,destination,{tenantId:keep.restroId,platformEmail:email}),/Destination must be empty/);
  const next=await s.createRound(destination,kept,key(),{outletId:w.outletId,type:'TAKEAWAY',items:[{itemId:w.menu[0].id,quantity:1}],customer:{name:'New QA diner',phone:'9187654322'}},true);
  assert.ok(Number(next.number)>Number(order.number));assert.deepEqual(await s.getOrder(source,keep,order.id),before);
 }finally{await source.close();await destination.close()}
});
