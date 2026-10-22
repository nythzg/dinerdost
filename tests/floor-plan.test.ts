import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createEmbeddedDatabase, createPostgresDatabase, type Database } from "@dinerdost/database";
import { floorPlanFixtures,fitFloorObject,resizeFloorObject,objectInArea, type Actor } from "@dinerdost/core";
import * as s from "@dinerdost/services";
let db: Database, actor: Actor, workspace: any;
const key = () => randomUUID();
before(async () => {
  db = process.env.TEST_DATABASE_URL ? createPostgresDatabase(process.env.TEST_DATABASE_URL) : await createEmbeddedDatabase();
  await db.migrate();
  const a = await s.signup(db, { name: "Floor QA", email: "floor-resize@example.test", password: "floor-resize-test-123", restaurant: "Resizable floor", outlet: "Main", qrEnabled: true, demo: true }, "floor-resize");
  actor = await s.authenticate(db, a.token); workspace = await s.workspace(db, actor);
});
after(async () => { await db?.close() });
test("floor area and all new fixtures persist; old clients retain dimensions and bounds are enforced", async () => {
  const input = { outletId: workspace.outletId, floor: workspace.tables[0].floor, version: 0, width: 2000, height: 1600,
    objects: floorPlanFixtures.map((fixture, i) => ({ id: "fixture-" + i, kind: fixture.kind, label: fixture.label, width: fixture.width, height: fixture.height, x: 100+(i%4)*450, y: 100+Math.floor(i/4)*350 })) };
  await s.saveFloorPlan(db, actor, key(), input);
  let saved = (await s.workspace(db, actor)).floorPlans[0];
  assert.equal(saved.width, 2000); assert.equal(saved.height, 1600); assert.equal(saved.objects.length, floorPlanFixtures.length);
  await s.saveFloorPlan(db, actor, key(), { outletId: input.outletId, floor: input.floor, version: 1, objects: input.objects });
  saved = (await s.workspace(db, actor)).floorPlans[0]; assert.equal(saved.width, 2000);
  for (const change of [{ width: 399 }, { height: 5001 }, { width: 1200 }, { objects: [{ ...input.objects[0], x: 1999 }] }])
    await assert.rejects(s.saveFloorPlan(db, actor, key(), { ...input, version: 2, ...change }));
  await assert.rejects(s.saveFloorPlan(db, { ...actor, role: "CASHIER" }, key(), { ...input, version: 2 }), { code: "FORBIDDEN" });
  assert.equal((await s.workspace(db, actor)).floorPlans[0].version, 2);
});
test("table copies create independent empty tables and QR keys exactly once; failures roll back all copies", async () => {
  const source = workspace.tables[0];
  await s.openSession(db, actor, key(), { tableId: source.id, guests: 2 });
  const input = { outletId: workspace.outletId, floor: source.floor, version: 2, width: 2000, height: 1600,
    objects: [{ id: "copy-1", kind: "TABLE", copyOfTableId: source.id, label: "T01 copy", width: 140, height: 100, x: 1600, y: 1200 }] };
  const request = key();
  await s.saveFloorPlan(db, actor, request, input); await s.saveFloorPlan(db, actor, request, input);
  let w = await s.workspace(db, actor); const copied = w.tables.find((t: any) => t.label === "T01 copy");
  assert.equal(w.tables.length, 13); assert.notEqual(copied.id, source.id); assert.notEqual(copied.public_key, source.public_key);
  assert.equal(copied.is_occupied, false); assert.equal(copied.seats, source.seats);
  assert.equal(w.floorPlans[0].objects[0].tableId, copied.id); assert.equal(w.floorPlans[0].objects[0].copyOfTableId, undefined);
  await assert.rejects(s.saveFloorPlan(db, { ...actor, role: "MANAGER" }, key(), { ...input, version: 3 }), { code: "FORBIDDEN" });
  await assert.rejects(s.saveFloorPlan(db, actor, key(), { ...input, version: 3, objects: [
    { ...input.objects[0], id: "new-a", label: "Should rollback" }, { ...input.objects[0], id: "new-b", label: "T01 copy", x:1800 },
  ] }), { code: "TABLE_LABEL_TAKEN" });
  w = await s.workspace(db, actor); assert.equal(w.tables.length, 13); assert.equal(w.floorPlans[0].version, 3);
  await assert.rejects(s.saveFloorPlan(db, actor, key(), { ...input, version: 3, objects: [{ ...input.objects[0], copyOfTableId: randomUUID() }] }), { code: "INVALID_TABLE" });
  assert.equal((await s.verifyAudit(db, actor)).valid, true);
});

test('rotated wall origins and anchored fractional resizes persist while actual outside geometry and foreign writes fail atomically',async()=>{
 const current=await s.workspace(db,actor),plan={floor:'Geometry acceptance',version:0},area={width:400,height:1200};
 const wall=fitFloorObject({id:'flush-wall',kind:'WALL',label:'Flush wall',x:-5000,y:-5000,width:1100,height:20,rotation:90},area);
 const room=resizeFloorObject({id:'rotated-room',kind:'RECEPTION',label:'Reception',x:100,y:300,width:100,height:60,rotation:15},area,'se',70,50);
 assert(wall.x<0);assert(objectInArea(wall,area));assert(objectInArea(room,area));
 const identities=JSON.stringify(current.tables),orders=JSON.stringify(current.orders);
 await s.saveFloorPlan(db,actor,key(),{outletId:current.outletId,floor:plan.floor,version:plan.version,...area,objects:[wall,room]});
 const saved=(await s.workspace(db,actor)).floorPlans.find((p:any)=>p.floor===plan.floor);assert.deepEqual(saved.objects,[wall,room]);
 await assert.rejects(s.saveFloorPlan(db,actor,key(),{outletId:current.outletId,floor:plan.floor,version:saved.version,...area,objects:[{...wall,x:wall.x-1}]}),{code:'OUTSIDE_FLOOR_PLAN'});
 await assert.rejects(s.saveFloorPlan(db,{...actor,role:'CASHIER'},key(),{outletId:current.outletId,floor:plan.floor,version:saved.version,...area,objects:[wall]}),{code:'FORBIDDEN'});
 const after=await s.workspace(db,actor);assert.equal(JSON.stringify(after.tables),identities);assert.equal(JSON.stringify(after.orders),orders);assert.equal(after.floorPlans.find((p:any)=>p.floor===plan.floor).version,saved.version);assert.equal((await s.verifyAudit(db,actor)).valid,true);
});

test('new tables and private rooms save together with independent QR identity only after an authorized atomic layout save',async()=>{
 const before=await s.workspace(db,actor),floor='Draft table acceptance';
 const input={outletId:before.outletId,floor,version:0,objects:[{id:'new-table',kind:'TABLE' as const,label:'New layout table',newTable:{seats:6},x:100,y:100,width:150,height:100},{id:'room',kind:'PRIVATE_ROOM' as const,label:'Private dining',x:500,y:300,width:260,height:180}]};
 await assert.rejects(s.saveFloorPlan(db,{...actor,role:'MANAGER'},key(),input),{code:'FORBIDDEN'});
 await assert.rejects(s.saveFloorPlan(db,actor,key(),{...input,objects:[input.objects[0],{...input.objects[0],id:'duplicate',x:300}]}),{code:'TABLE_LABEL_TAKEN'});
 assert.equal((await s.workspace(db,actor)).tables.length,before.tables.length);
 const request=key();await s.saveFloorPlan(db,actor,request,input);await s.saveFloorPlan(db,actor,request,input);
 const after=await s.workspace(db,actor),table=after.tables.find((t:any)=>t.label==='New layout table'),saved=after.floorPlans.find((p:any)=>p.floor===floor);
 assert.equal(after.tables.length,before.tables.length+1);assert.equal(table.seats,6);assert(table.public_key);assert(!before.tables.some((t:any)=>t.public_key===table.public_key));assert.equal(table.is_occupied,false);
 assert.equal(saved.objects[0].tableId,table.id);assert.equal(saved.objects[0].newTable,undefined);assert.equal(saved.objects[0].copyOfTableId,undefined);assert.equal(saved.objects[1].kind,'PRIVATE_ROOM');assert.deepEqual(after.sessions,before.sessions);assert.deepEqual(after.orders,before.orders);
 await assert.rejects(s.saveFloorPlan(db,actor,key(),{...input,objects:[{...input.objects[0],label:'Another new table'}]}),{code:'VERSION_CONFLICT'});
 assert.equal((await s.workspace(db,actor)).tables.length,after.tables.length);assert.equal((await s.verifyAudit(db,actor)).valid,true);
});

test('fixture details: free entry-exit and outdoor tables, fence, rounded boundaries and overlap guards preserve scope and history',async()=>{
 const current=await s.workspace(db,actor),floor='Fixture details acceptance',area={width:1000,height:700};
 const history=async()=>db.transaction(actor.restroId,async tx=>Promise.all(['invoices','payment_attempts','stock_movements','stock_batches'].map(async table=>(await tx.query('SELECT * FROM '+table+' ORDER BY id')).rows)));
 const beforeHistory=await history();
 const objects=[
  {id:'entry',kind:'ENTRY' as const,label:'Entry/Exit',x:-40,y:100,width:80,height:80},
  {id:'legacy-exit',kind:'EXIT' as const,label:'Exit',x:220,y:-100,width:80,height:60},
  {id:'kitchen',kind:'KITCHEN' as const,label:'Kitchen',x:100,y:150,width:300,height:220},
  {id:'fence',kind:'FENCE' as const,label:'Fence',x:500,y:100,width:240,height:20},
  {id:'outside-table',kind:'TABLE' as const,label:'Outdoor fixture QA',newTable:{seats:4},x:1080,y:300,width:120,height:90,allowOutside:true},
 ];
 const input={outletId:current.outletId,floor,version:0,...area,boundaryRoundness:80,objects};
 for(const change of [{objects:[{...objects[2],x:-20}]},{objects:[{...objects[4],allowOutside:false}]},{objects:[{...objects[2],x:0,y:0}]},{boundaryRoundness:501},{objects:[{...objects[2],allowOutside:true}]},{objects:[objects[2],{...objects[2],id:'overlap',x:200,rotation:30}]}])await assert.rejects(s.saveFloorPlan(db,actor,key(),{...input,...change}));
 await assert.rejects(s.saveFloorPlan(db,{...actor,role:'CASHIER'},key(),input),{code:'FORBIDDEN'});
 await assert.rejects(s.saveFloorPlan(db,actor,key(),{...input,outletId:randomUUID()}));
 await assert.rejects(s.saveFloorPlan(db,{...actor,restroId:randomUUID()},key(),input));
 const request=key();await s.saveFloorPlan(db,actor,request,input);await s.saveFloorPlan(db,actor,request,input);
 const after=await s.workspace(db,actor),saved=after.floorPlans.find((p:any)=>p.floor===floor);
 assert.equal(saved.boundary_roundness,80);assert.equal(saved.objects.length,5);assert.equal(saved.objects[4].allowOutside,true);
 assert.equal(after.tables.length,current.tables.length+1);assert.deepEqual(after.sessions,current.sessions);assert.deepEqual(after.orders,current.orders);assert.deepEqual(await history(),beforeHistory);
 // Older web payloads retain the saved option and boundary roundness.
 const legacy=saved.objects.map(({allowOutside,...o}:any)=>o);await s.saveFloorPlan(db,actor,key(),{outletId:current.outletId,floor,version:saved.version,objects:legacy});
 const retained=(await s.workspace(db,actor)).floorPlans.find((p:any)=>p.floor===floor);assert.equal(retained.boundary_roundness,80);assert.equal(retained.objects[4].allowOutside,true);
 assert.equal((await s.verifyAudit(db,actor)).valid,true);
});

test('fixture details: concurrent layout edits serialize with exact retries and a single fence and boundary update',async()=>{
 const current=await s.workspace(db,actor),floor='Fixture concurrent acceptance',objects=[{id:'fence',kind:'FENCE',label:'Fence',x:100,y:150,width:240,height:20}];
 await s.saveFloorPlan(db,actor,key(),{outletId:current.outletId,floor,version:0,objects});
 const requests=[key(),key()],inputs=[30,70].map(boundaryRoundness=>({outletId:current.outletId,floor,version:1,boundaryRoundness,objects}));
 const results=await Promise.allSettled(inputs.map((input,i)=>s.saveFloorPlan(db,actor,requests[i],input)));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const winner=results.findIndex(r=>r.status==='fulfilled');
 const failure=results.find(r=>r.status==='rejected') as PromiseRejectedResult;assert.equal(failure.reason.code,'VERSION_CONFLICT');
 await s.saveFloorPlan(db,actor,requests[winner],inputs[winner]);
 const plan=(await s.workspace(db,actor)).floorPlans.find((p:any)=>p.floor===floor);assert.equal(plan.version,2);assert.equal(plan.boundary_roundness,inputs[winner].boundaryRoundness);assert.equal(plan.objects.length,1);
 const events=await db.transaction(actor.restroId,tx=>tx.query("SELECT id FROM audit_events WHERE entity_id=$1 AND action='FLOOR_PLAN_SAVED'",[plan.id]));assert.equal(events.rows.length,2);assert.equal((await s.verifyAudit(db,actor)).valid,true);
});
