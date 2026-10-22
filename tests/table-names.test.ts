import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createEmbeddedDatabase,createPostgresDatabase,type Database} from '@dinerdost/database';
import {type Actor,nextTableName} from '@dinerdost/core';
import * as s from '@dinerdost/services';
let db:Database,owner:Actor,foreign:Actor,w:any;const key=()=>randomUUID();
before(async()=>{db=process.env.TEST_DATABASE_URL?createPostgresDatabase(process.env.TEST_DATABASE_URL):await createEmbeddedDatabase();await db.migrate();for(const i of [0,1]){const account=await s.signup(db,{name:'Table names QA',email:`table-names-${i}@example.test`,password:'table-names-test-password',restaurant:'Names '+i,outlet:'Main',demo:true,qrEnabled:true},'table-names-'+i);const actor=await s.authenticate(db,account.token);if(i)foreign=actor;else owner=actor}w=await s.workspace(db,owner);});after(async()=>db?.close());
test('serial table names follow the existing series and concurrent automatic adds never reuse an identity',async()=>{
 assert.equal(nextTableName(['1','2','2 copy']),'3');assert.equal(nextTableName(['T01','T02','Patio']),'T03');assert.equal(nextTableName([]),'T01');
 const input={outletId:w.outletId,label:'',seats:4,floor:w.tables[0].floor};const results=await Promise.all([s.saveTable(db,owner,key(),input,true),s.saveTable(db,owner,key(),input,true)]);assert.equal(new Set(results.map(r=>r.label)).size,2);assert(results.some(r=>r.label==='T13'));assert(results.some(r=>r.label==='T14'));
 const request=key(),created=await s.saveTable(db,owner,request,input,true);assert.deepEqual(await s.saveTable(db,owner,request,input,true),created);await assert.rejects(s.saveTable(db,owner,key(),input),{code:'TABLE_NAME_REQUIRED'});
});
test('renaming a table updates both views and rejects stale/colliding requests without touching sessions, financial records or QR keys',async()=>{
 const table=(await s.workspace(db,owner)).tables.find((t:any)=>t.label==='T01');await s.saveFloorPlan(db,owner,key(),{outletId:w.outletId,floor:table.floor,version:0,objects:[{id:'named-table',kind:'TABLE',tableId:table.id,label:table.label,x:50,y:50,width:150,height:100}]});await s.openSession(db,owner,key(),{tableId:table.id,guests:1});const o=await s.createRound(db,owner,key(),{outletId:w.outletId,type:'DINE_IN',sessionId:(await s.workspace(db,owner)).sessions.find((r:any)=>r.table_id===table.id).id,items:[{itemId:w.menu[0].id,quantity:1}]},true);
 const frozen=async()=>db.transaction(owner.restroId,async tx=>({order:await s.orderDetail(tx,owner,o.id),session:(await tx.query('SELECT * FROM table_sessions WHERE table_id=$1',[table.id])).rows,invoices:(await tx.query('SELECT * FROM invoices')).rows}));const before=await frozen(),oldPlan=(await s.workspace(db,owner)).floorPlans.find((p:any)=>p.floor===table.floor);
 const input={tableId:table.id,version:table.version,label:'Patio one'},request=key(),result=await s.renameTable(db,owner,request,input);assert.deepEqual(await s.renameTable(db,owner,request,input),result);const after=await frozen();assert.deepEqual(after.session,before.session);assert.deepEqual(after.invoices,before.invoices);assert.deepEqual(after.order.rounds,before.order.rounds);
 const changed=(await s.workspace(db,owner)),current=changed.tables.find((t:any)=>t.id===table.id);assert.equal(current.public_key,table.public_key);assert.equal(current.label,'Patio one');assert.equal(changed.floorPlans.find((p:any)=>p.floor===table.floor).objects.find((p:any)=>p.tableId===table.id).label,'Patio one');assert(result.plans.length);assert(result.plans[0].version>oldPlan.version);
 await assert.rejects(s.renameTable(db,owner,key(),{...input,label:'Stale name'}),{code:'VERSION_CONFLICT'});await assert.rejects(s.renameTable(db,owner,key(),{...input,version:current.version,label:'t02'}),{code:'TABLE_LABEL_TAKEN'});assert.equal((await s.verifyAudit(db,owner)).valid,true);
});
test('rename and automatic creation preserve owner, outlet, tenant and web-only access boundaries',async()=>{
 const table=w.tables[1],input={tableId:table.id,version:table.version,label:'Access blocked'};
 for(const actor of [foreign,{...owner,role:'MANAGER' as const},{...owner,role:'CASHIER' as const},{...owner,application:'COMMAND' as const}])await assert.rejects(s.renameTable(db,actor,key(),input));
 for(const actor of [{...owner,role:'MANAGER' as const},{...owner,application:'POS' as const}])await assert.rejects(s.saveTable(db,actor,key(),{outletId:w.outletId,label:'',seats:4,floor:table.floor},true));
 assert.equal((await s.workspace(db,owner)).tables.find((t:any)=>t.id===table.id).label,table.label);
});

test('duplicate rename guidance identifies the saved table and its floor without changing either identity',async()=>{
 const tables=(await s.workspace(db,owner)).tables,table=tables.find((t:any)=>t.label==='T02'),target=tables.find((t:any)=>t.label==='T03');
 await assert.rejects(s.renameTable(db,owner,key(),{tableId:table.id,version:table.version,label:target.label}),error=>(error as any).code==='TABLE_LABEL_TAKEN'&&(error as Error).message.includes(target.label)&&(error as Error).message.includes(target.floor));
 const after=(await s.workspace(db,owner)).tables;assert.deepEqual(after.find((t:any)=>t.id===table.id),table);assert.deepEqual(after.find((t:any)=>t.id===target.id),target);
});
