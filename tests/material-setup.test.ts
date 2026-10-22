import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createEmbeddedDatabase,createPostgresDatabase,type Database} from '@dinerdost/database';
import type {Actor} from '@dinerdost/core';
import * as s from '@dinerdost/services';
let db:Database,owner:Actor,foreign:Actor,w:any;const key=()=>randomUUID();
before(async()=>{db=process.env.TEST_DATABASE_URL?createPostgresDatabase(process.env.TEST_DATABASE_URL):await createEmbeddedDatabase();await db.migrate();await db.migrate();for(const index of [0,1]){const account=await s.signup(db,{name:'Material QA',email:`material-${index}@example.test`,password:'material-test-password',restaurant:'Material '+index,outlet:'Main',qrEnabled:true,demo:true},'material-'+index);const actor=await s.authenticate(db,account.token);if(index)foreign=actor;else owner=actor}w=await s.workspace(db,owner)});
after(async()=>{await db?.close()});
const create=()=>s.addIngredient(db,owner,key(),{outletId:w.outletId,name:'Material '+key(),unit:'kg'});
async function current(ingredientId:string){return (await s.workspace(db,owner)).ingredients.find((item:any)=>item.id===ingredientId)}
const setup=(ingredientId:string,version:number,extra={})=>({ingredientId,version,category:'Dry goods',code:'',hsn:'',measuredYieldBps:null,packs:[{name:'Bag',factorMilli:5000}],...extra});
const receipt=(ingredientId:string,pack:any,extra={})=>({ingredientId,packId:pack.id,packVersion:pack.version,packQuantityMilli:2000,packCost:12345,batchNumber:key(),reference:'Synthetic pack receipt',expiresAt:new Date(Date.now()+72*3600000).toISOString(),...extra});
async function history(){return db.transaction(owner.restroId,async tx=>{const result:Record<string,unknown>={};for(const table of ['stock_batches','stock_movements','invoices','payment_attempts','order_item_costs'])result[table]=(await tx.query(`SELECT * FROM ${table} ORDER BY ${table==='order_item_costs'?'order_item_id':'id'}`)).rows;return result})}
async function packFor(ingredientId:string){return (await s.workspace(db,owner)).purchasePacks.find((pack:any)=>pack.ingredient_id===ingredientId)}
test('material metadata and packs are versioned/idempotent, retain unknown yield and never change stock or financial history',async()=>{
 const item=await create(),before=await history(),input=setup(item.id,1,{code:'RM-ONE',hsn:'TEST-REFERENCE'}),commandKey=key();await s.saveMaterialSetup(db,owner,commandKey,input);await s.saveMaterialSetup(db,owner,commandKey,input);
 const saved=await current(item.id);assert.equal(saved.material_code,'RM-ONE');assert.equal(saved.material_category,'Dry goods');assert.equal(saved.hsn_code,'TEST-REFERENCE');assert.equal(saved.measured_yield_bps,null);assert.equal(saved.unit,'kg');assert.equal(saved.version,2);assert.equal((await s.workspace(db,owner)).purchasePacks.filter((pack:any)=>pack.ingredient_id===item.id).length,1);assert.deepEqual(await history(),before);
 await assert.rejects(s.saveMaterialSetup(db,owner,key(),input),{code:'VERSION_CONFLICT'});
});
test('codes are unique within an outlet, pack names cannot duplicate and conversion definitions lock the base unit',async()=>{
 const a=await create(),b=await create();await s.saveMaterialSetup(db,owner,key(),setup(a.id,1,{code:'SHARED'}));await assert.rejects(s.saveMaterialSetup(db,owner,key(),setup(b.id,1,{code:'shared'})),{code:'MATERIAL_CODE_EXISTS'});
 await assert.rejects(s.saveMaterialSetup(db,owner,key(),setup(b.id,1,{packs:[{name:'Bag',factorMilli:1000},{name:'bag',factorMilli:2000}]})),{code:'DUPLICATE_PACK'});
 await assert.rejects(s.updateIngredient(db,owner,key(),{id:a.id,version:2,name:'Changed unit',unit:'L',reorderMilli:0}),{code:'UNIT_IN_USE'});
});
test('buying packs convert exact base quantities and actual receipt cost once, with no automatic yield loss',async()=>{
 const item=await create();await s.saveMaterialSetup(db,owner,key(),setup(item.id,1,{measuredYieldBps:8000}));const pack=await packFor(item.id),input=receipt(item.id,pack),commandKey=key();const received=await s.receiveStock(db,owner,commandKey,input,true);assert.equal((await s.receiveStock(db,owner,commandKey,input,true)).id,received.id);
 const batch=(await s.workspace(db,owner)).batches.find((batch:any)=>batch.id===received.id);assert.equal(Number(batch.on_hand),10000);assert.equal(Number(batch.remaining_value),24690);assert.equal(batch.purchase_pack_snapshot.baseQuantityMilli,10000);assert.equal(batch.purchase_pack_snapshot.packQuantityMilli,2000);assert.equal(batch.purchase_pack_snapshot.totalCost,24690);
 assert.equal(Number((await current(item.id)).on_hand),10000);const moves=await db.transaction(owner.restroId,tx=>tx.query('SELECT * FROM stock_movements WHERE batch_id=$1',[batch.id]));assert.equal(moves.rows.length,1);assert.equal(moves.rows[0].kind,'RECEIPT');assert.equal(Number(moves.rows[0].cost),24690);
});
test('FIFO preserves exact pack cost when a per-base rate needs rounding',async()=>{
 const ingredient=await create();await s.saveMaterialSetup(db,owner,key(),setup(ingredient.id,1,{packs:[{name:'Box',factorMilli:2000}]}));const pack=await packFor(ingredient.id),batch=await s.receiveStock(db,owner,key(),receipt(ingredient.id,pack,{packQuantityMilli:3000,packCost:200001}),true);
 const item=await s.saveMenu(db,owner,key(),{outletId:w.outletId,name:'Pack cost dish '+key(),category:'Food',price:300000,taxBps:0,station:'Pack kitchen',unit:'piece',recipe:[{id:ingredient.id,quantityMilli:1000}]});
 for(let i=0;i<2;i++)await s.createRound(db,owner,key(),{outletId:w.outletId,type:'TAKEAWAY',items:[{itemId:item.id,quantity:3}]},true);
 const stock=(await s.workspace(db,owner)).batches.find((saved:any)=>saved.id===batch.id);assert.equal(Number(stock.on_hand),0);assert.equal(Number(stock.remaining_value),0);
 const consumed=await db.transaction(owner.restroId,tx=>tx.query("SELECT sum(cost) AS cost,sum(-delta_milli) AS quantity FROM stock_movements WHERE batch_id=$1 AND kind='RECIPE_CONSUMPTION'",[batch.id]));assert.equal(Number(consumed.rows[0].cost),600003);assert.equal(Number(consumed.rows[0].quantity),6000);
});
test('renaming/removing a pack preserves old receipt snapshots and stale forms cannot receive a changed pack',async()=>{
 const item=await create();await s.saveMaterialSetup(db,owner,key(),setup(item.id,1));const pack=await packFor(item.id),received=await s.receiveStock(db,owner,key(),receipt(item.id,pack),true),before=await history();
 await s.saveMaterialSetup(db,owner,key(),setup(item.id,2,{packs:[{id:pack.id,name:'Large sack',factorMilli:10000}]}));assert.deepEqual(await history(),before);await assert.rejects(s.receiveStock(db,owner,key(),receipt(item.id,pack),true),{code:'VERSION_CONFLICT'});
 const changed=await packFor(item.id);await s.saveMaterialSetup(db,owner,key(),setup(item.id,3,{packs:[]}));assert.deepEqual(await history(),before);await assert.rejects(s.receiveStock(db,owner,key(),receipt(item.id,changed),true));assert.equal((await s.workspace(db,owner)).batches.find((batch:any)=>batch.id===received.id).purchase_pack_snapshot.name,'Bag');
});
test('precision, overflow, expiry, foreign-pack and mixed-base inputs reject without any partial receipt',async()=>{
 const a=await create(),b=await create();await s.saveMaterialSetup(db,owner,key(),setup(a.id,1,{packs:[{name:'Tiny',factorMilli:1}]}));const tiny=await packFor(a.id),before=await history();
 await assert.rejects(s.receiveStock(db,owner,key(),receipt(a.id,tiny,{packQuantityMilli:500}),true),{code:'PACK_PRECISION'});
 await assert.rejects(s.receiveStock(db,owner,key(),receipt(a.id,tiny,{packCost:100000000}),true),{code:'AMOUNT_OVERFLOW'});
 await assert.rejects(s.receiveStock(db,owner,key(),receipt(b.id,tiny),true));
 await assert.rejects(s.receiveStock(db,owner,key(),receipt(a.id,tiny,{expiresAt:new Date(Date.now()-10000).toISOString()}),true));
 await assert.rejects(s.receiveStock(db,owner,key(),{...receipt(a.id,tiny),quantityMilli:1000,unitCost:1},true));assert.deepEqual(await history(),before);
});
test('material setup/pack receipts retain role, outlet, stream, tenant and native boundaries with forced RLS',async()=>{
 const item=await create();await s.saveMaterialSetup(db,owner,key(),setup(item.id,1));const pack=await packFor(item.id),input=setup(item.id,2);
 for(const actor of [foreign,{...owner,role:'WAITER' as const},{...owner,role:'MANAGER' as const,outletIds:[]},{...owner,role:'BARTENDER' as const},{...owner,application:'POS' as const}])await assert.rejects(s.saveMaterialSetup(db,actor,key(),input));
 for(const actor of [foreign,{...owner,role:'WAITER' as const},{...owner,role:'MANAGER' as const,outletIds:[]},{...owner,role:'BARTENDER' as const},{...owner,application:'POS' as const}])await assert.rejects(s.receiveStock(db,actor,key(),receipt(item.id,pack),true));
 const policy=(await db.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='ingredient_purchase_packs'::regclass")).rows[0];assert(policy.relrowsecurity&&policy.relforcerowsecurity);
 await db.transaction(foreign.restroId,async tx=>assert.equal((await tx.query('SELECT id FROM ingredient_purchase_packs WHERE id=$1',[pack.id])).rows.length,0));
});
