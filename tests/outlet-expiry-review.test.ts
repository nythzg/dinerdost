import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createEmbeddedDatabase,createPostgresDatabase,type Database} from '@dinerdost/database';
import type {Actor} from '@dinerdost/core';
import * as s from '@dinerdost/services';
let db:Database,owner:Actor,foreign:Actor,w:any,ingredientId:string,itemId:string;
const key=()=>randomUUID();
before(async()=>{db=process.env.TEST_DATABASE_URL?createPostgresDatabase(process.env.TEST_DATABASE_URL):await createEmbeddedDatabase();await db.migrate();for(const i of [0,1]){const account=await s.signup(db,{name:'Expiry QA',email:`expiry-review-${i}@example.test`,password:'expiry-review-password',restaurant:'Expiry '+i,outlet:'Main',qrEnabled:true,demo:true},'expiry-review-'+i);const actor=await s.authenticate(db,account.token);if(i)foreign=actor;else owner=actor}w=await s.workspace(db,owner);ingredientId=(await s.addIngredient(db,owner,key(),{outletId:w.outletId,name:'=Expiry material',unit:'kg'})).id;itemId=(await s.saveMenu(db,owner,key(),{outletId:w.outletId,name:'Expiry dish',category:'Food',price:10000,taxBps:0,station:'Kitchen',recipe:[{id:ingredientId,quantityMilli:1000}]})).id});
after(async()=>{await db?.close()});
async function frozen(){return db.transaction(owner.restroId,async tx=>({batches:(await tx.query('SELECT * FROM stock_batches ORDER BY id')).rows,movements:(await tx.query('SELECT * FROM stock_movements ORDER BY id')).rows,reservations:(await tx.query('SELECT * FROM stock_reservations ORDER BY id')).rows}))}
test('outlet expiry review returns every authorized batch beyond screen limits, current dish links and unknown deadlines without mutation',async()=>{
 await db.transaction(owner.restroId,tx=>tx.query("INSERT INTO stock_batches(id,restro_id,outlet_id,ingredient_id,batch_number,on_hand,unit_cost,expires_at) SELECT gen_random_uuid(),$1,$2,$3,'Synthetic batch '||n,1000,100,now()+interval '3 days' FROM generate_series(1,205) n",[owner.restroId,w.outletId,ingredientId]));
 await db.transaction(owner.restroId,tx=>tx.query('UPDATE stock_batches SET expires_at=NULL,expires_on=NULL WHERE id=(SELECT id FROM stock_batches WHERE ingredient_id=$1 ORDER BY id LIMIT 1)',[ingredientId]));
 const before=await frozen(),report=await s.outletExpiryReport(db,owner,w.outletId);assert.equal(report.batches.length,205);assert(report.batches.some(row=>row.expiry_status==='UNKNOWN'));assert(report.batches.every(row=>(row.dishes as any[]).some((dish:any)=>dish.id===itemId)));assert.deepEqual(await frozen(),before);assert.equal(report.processed.length,0);
});
test('bulk refresh retains exactly-once expiry cost/reservation handling and exposes recorded write-offs without changing later history',async()=>{
 const expiryIngredient=(await s.addIngredient(db,owner,key(),{outletId:w.outletId,name:'Reserved expiry material',unit:'kg'})).id,expiryDish=(await s.saveMenu(db,owner,key(),{outletId:w.outletId,name:'Reserved expiry dish',category:'Food',price:10000,taxBps:0,station:'Kitchen',recipe:[{id:expiryIngredient,quantityMilli:1000}]})).id;
 const batch=await s.receiveStock(db,owner,key(),{ingredientId:expiryIngredient,quantityMilli:3000,unitCost:1100,batchNumber:'Audited expiry',reference:'Synthetic expiry receipt',expiresAt:new Date(Date.now()+86400000).toISOString()},true);
 // Reserve this material's only lot before its deadline.
 await db.transaction(owner.restroId,tx=>tx.query("UPDATE stock_batches SET expires_at=now()+interval '1 hour' WHERE id=$1",[batch.id]));
 const order=await s.createRound(db,owner,key(),{outletId:w.outletId,type:'TAKEAWAY',items:[{itemId:expiryDish,quantity:1}]});await s.decideRound(db,owner,key(),order.id,order.rounds[0].id,{version:order.rounds[0].version,decision:'ACCEPT'});
 await db.transaction(owner.restroId,tx=>tx.query("UPDATE stock_batches SET expires_at=now()-interval '1 minute' WHERE id=$1",[batch.id]));const before=await frozen(),pending=await s.outletExpiryReport(db,owner,w.outletId);assert.equal(pending.batches.find(row=>row.id===batch.id)?.expiry_status,'EXPIRED');assert.deepEqual(await frozen(),before);
 await s.workspace(db,owner);const once=await frozen();await s.workspace(db,owner);assert.deepEqual(await frozen(),once);const report=await s.outletExpiryReport(db,owner,w.outletId),processed=report.processed.filter(row=>row.batch_number==='Audited expiry');assert.equal(processed.length,1);assert.equal(Number(processed[0].quantity),3000);assert.equal(Number(processed[0].cost),3300);assert(!report.batches.some(row=>row.id===batch.id));assert((once.reservations as any[]).some(row=>row.batch_id===batch.id&&row.state==='EXPIRED'));assert.equal((await s.verifyAudit(db,owner)).valid,true);
});
test('outlet expiry report enforces inventory, outlet, tenant, stream and web-only boundaries',async()=>{
 const bar=(await s.addIngredient(db,owner,key(),{outletId:w.outletId,name:'Bar expiry material',unit:'L',category:'LIQUOR'})).id;await s.receiveStock(db,owner,key(),{ingredientId:bar,quantityMilli:1000,unitCost:100,batchNumber:key(),reference:'Bar synthetic receipt',expiresAt:new Date(Date.now()+86400000).toISOString()},true);
 const bartender=await s.outletExpiryReport(db,{...owner,role:'BARTENDER'},w.outletId);assert.equal(bartender.batches.length,1);assert.equal(bartender.batches[0].ingredient_id,bar);assert.equal(bartender.processed.length,0);
 for(const actor of [foreign,{...owner,role:'WAITER' as const},{...owner,role:'MANAGER' as const,outletIds:[]},{...owner,application:'POS' as const}])await assert.rejects(s.outletExpiryReport(db,actor,w.outletId));
 await assert.rejects(s.outletExpiryReport(db,owner,key()));await assert.rejects(s.outletExpiryReport(db,owner,'bad-id'));
});
