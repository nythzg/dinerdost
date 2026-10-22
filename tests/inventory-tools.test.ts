import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createEmbeddedDatabase,createPostgresDatabase,type Database} from '@dinerdost/database';
import type {Actor} from '@dinerdost/core';
import * as s from '@dinerdost/services';
let db:Database,owner:Actor,foreign:Actor,w:any;
const key=()=>randomUUID();
before(async()=>{db=process.env.TEST_DATABASE_URL?createPostgresDatabase(process.env.TEST_DATABASE_URL):await createEmbeddedDatabase();await db.migrate();for(const i of [0,1]){const account=await s.signup(db,{name:'Inventory tools QA',email:`inventory-tools-${i}@example.test`,password:'inventory-tools-password',restaurant:'Inventory tools '+i,outlet:'Main',qrEnabled:true,demo:true},'inventory-tools-'+i);const actor=await s.authenticate(db,account.token);if(i)foreign=actor;else owner=actor}w=await s.workspace(db,owner)});
after(async()=>{await db?.close()});
async function snapshot(){return db.transaction(owner.restroId,async tx=>{const result:Record<string,unknown>={};for(const table of ['stock_batches','stock_reservations','stock_movements','orders','order_rounds','invoices','payment_attempts','order_item_costs'])result[table]=(await tx.query(`SELECT * FROM ${table} ORDER BY ${table==='order_item_costs'?'order_item_id':'id'}`)).rows;return result})}
async function fixture(){const ingredient=await s.addIngredient(db,owner,key(),{outletId:w.outletId,name:'Plan material '+key(),unit:'kg'});const batch=await s.receiveStock(db,owner,key(),{ingredientId:ingredient.id,batchNumber:key(),quantityMilli:10000,unitCost:1000,reference:'Synthetic planning receipt',expiresAt:new Date(Date.now()+72*3600000).toISOString()},true);const item=await s.saveMenu(db,owner,key(),{outletId:w.outletId,name:'Plan dish '+key().slice(0,8),category:'Food',price:10000,taxBps:0,station:'Plan kitchen',unit:'piece',recipe:[{id:ingredient.id,quantityMilli:250}]});return {ingredient,batch,item}}
test('planned servings aggregate saved base recipes and subtract usable unreserved stock without reserving or purchasing',async()=>{
 const {ingredient,batch,item}=await fixture();await db.query('UPDATE stock_batches SET reserved=2000 WHERE id=$1',[batch.id]);
 const before=await snapshot(),plan=await s.ingredientPlan(db,owner,{outletId:w.outletId,items:[{itemId:item.id,quantityMilli:40000}]});
 assert(plan.complete);assert.equal(plan.ingredients.length,1);assert.equal(plan.ingredients[0].id,ingredient.id);assert.equal(plan.ingredients[0].required,10000);assert.equal(plan.ingredients[0].available,8000);assert.equal(plan.ingredients[0].shortfall,2000);assert.deepEqual(await snapshot(),before);
});
test('missing recipes remain explicit and fractional whole units, duplicates and unsafe inputs are rejected',async()=>{
 const {item}=await fixture();const missing=w.menu[0];const plan=await s.ingredientPlan(db,owner,{outletId:w.outletId,items:[{itemId:item.id,quantityMilli:1000},{itemId:missing.id,quantityMilli:1000}]});assert(!plan.complete);assert.equal(plan.missing[0].id,missing.id);assert.equal(plan.ingredients.length,1);
 await assert.rejects(s.ingredientPlan(db,owner,{outletId:w.outletId,items:[{itemId:item.id,quantityMilli:500}]}),{code:'WHOLE_QUANTITY_REQUIRED'});
 await assert.rejects(s.ingredientPlan(db,owner,{outletId:w.outletId,items:[{itemId:item.id,quantityMilli:1000},{itemId:item.id,quantityMilli:1000}]}),{code:'DUPLICATE_ITEM'});
 await assert.rejects(s.ingredientPlan(db,owner,{outletId:w.outletId,items:[]}));
});
test('expiry impact lists only current recipe links and excludes expired stock from a plan',async()=>{
 const {ingredient,batch,item}=await fixture();await db.query("UPDATE stock_batches SET expires_at=now()-interval '1 hour' WHERE id=$1",[batch.id]);const before=await snapshot();
 const impact=await s.ingredientExpiryImpact(db,owner,{outletId:w.outletId,ingredientId:ingredient.id});assert.equal(impact.dishes[0].id,item.id);assert.equal(impact.batches[0].expiry_status,'EXPIRED');
 const plan=await s.ingredientPlan(db,owner,{outletId:w.outletId,items:[{itemId:item.id,quantityMilli:1000}]});assert.equal(plan.ingredients[0].available,0);assert.equal(plan.ingredients[0].shortfall,250);assert.deepEqual(await snapshot(),before);
 await s.workspace(db,owner);await s.workspace(db,owner);assert.equal((await s.ingredientExpiryImpact(db,owner,{outletId:w.outletId,ingredientId:ingredient.id})).batches.length,0);
 const waste=await db.transaction(owner.restroId,tx=>tx.query("SELECT count(*)::int AS count FROM stock_movements WHERE batch_id=$1 AND kind='WASTAGE'",[batch.id]));assert.equal(waste.rows[0].count,1);
});
test('order inspector uses recorded needs/consumption/cost and never changes when today recipe changes',async()=>{
 const {ingredient,item}=await fixture();const order=await s.createRound(db,owner,key(),{outletId:w.outletId,type:'TAKEAWAY',items:[{itemId:item.id,quantity:2}]},true);
 const first=await s.orderIngredientReport(db,owner,order.id);assert.equal(first.needs[0].ingredient_id,ingredient.id);assert.equal(Number(first.needs[0].quantity_milli),500);assert.equal(Number(first.consumption[0].quantity),500);assert.equal(Number(first.consumption[0].cost),500);assert.equal(Number(first.items[0].cost),500);
 const before=await snapshot();await s.saveRecipe(db,owner,key(),{itemId:item.id,ingredients:[{id:ingredient.id,quantityMilli:700}]});assert.deepEqual(await s.orderIngredientReport(db,owner,order.id),first);assert.deepEqual(await snapshot(),before);
});
test('unconfigured orders preserve unknown cost and do not manufacture old ingredient usage',async()=>{
 const order=await s.createRound(db,owner,key(),{outletId:w.outletId,type:'TAKEAWAY',items:[{itemId:w.menu[1].id,quantity:1}]},true);const before=await snapshot(),report=await s.orderIngredientReport(db,owner,order.id);assert.equal(report.items[0].cost,null);assert.equal(report.needs.length,0);assert.equal(report.consumption.length,0);assert.deepEqual(await snapshot(),before);
});
test('planning, expiry and order drill-down preserve role, stream, outlet, tenant and native boundaries',async()=>{
 const {ingredient,item}=await fixture(),input={outletId:w.outletId,items:[{itemId:item.id,quantityMilli:1000}]};
 await assert.rejects(s.ingredientPlan(db,foreign,input));await assert.rejects(s.ingredientPlan(db,{...owner,role:'WAITER'},input));await assert.rejects(s.ingredientPlan(db,{...owner,role:'MANAGER',outletIds:[]},input));await assert.rejects(s.ingredientPlan(db,{...owner,role:'BARTENDER'},input));await assert.rejects(s.ingredientPlan(db,{...owner,application:'POS'},input));
 await assert.rejects(s.ingredientExpiryImpact(db,foreign,{outletId:w.outletId,ingredientId:ingredient.id}));await assert.rejects(s.ingredientExpiryImpact(db,{...owner,role:'BARTENDER'},{outletId:w.outletId,ingredientId:ingredient.id}));
 const order=await s.createRound(db,owner,key(),{outletId:w.outletId,type:'TAKEAWAY',draft:true,items:[{itemId:item.id,quantity:1}]},true);await assert.rejects(s.orderIngredientReport(db,foreign,order.id));await assert.rejects(s.orderIngredientReport(db,{...owner,role:'CASHIER'},order.id));await assert.rejects(s.orderIngredientReport(db,{...owner,application:'POS'},order.id));
});
