import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createEmbeddedDatabase,createPostgresDatabase,type Database} from '@dinerdost/database';
import type {Actor} from '@dinerdost/core';
import * as s from '@dinerdost/services';
let db:Database,owner:Actor,foreign:Actor,w:any,menuId:string,serial=0;const key=()=>randomUUID();
before(async()=>{db=process.env.TEST_DATABASE_URL?createPostgresDatabase(process.env.TEST_DATABASE_URL):await createEmbeddedDatabase();await db.migrate();for(const i of [0,1]){const a=await s.signup(db,{name:'Web loyalty QA',email:`web-loyalty-${i}@example.test`,password:'web-loyalty-test-password',restaurant:'Web loyalty '+i,outlet:'Main',qrEnabled:true,demo:true},'web-loyalty-'+i);if(i)foreign=await s.authenticate(db,a.token);else owner=await s.authenticate(db,a.token)}w=await s.workspace(db,owner);const material=await s.addIngredient(db,owner,key(),{outletId:w.outletId,name:'Loyalty stock',unit:'kg'});await s.receiveStock(db,owner,key(),{ingredientId:material.id,batchNumber:key(),quantityMilli:500000,unitCost:500,reference:'Synthetic loyalty stock',expiresAt:new Date(Date.now()+172800000).toISOString()},true);menuId=(await s.saveMenu(db,owner,key(),{outletId:w.outletId,name:'Loyalty dish',category:'Food',price:100000,taxBps:500,station:'Loyalty kitchen',recipe:[{id:material.id,quantityMilli:1000}]})).id});
after(async()=>db?.close());
async function create(verified=true){const o=await s.createRound(db,owner,key(),{outletId:w.outletId,type:'TAKEAWAY',items:[{itemId:menuId,quantity:1}],customer:{name:'Loyalty guest '+ ++serial,phone:'912370'+String(serial).padStart(4,'0')}},true);await db.transaction(owner.restroId,async tx=>{await tx.query('UPDATE customers SET otp_verified=$2 WHERE id=$1',[o.customer_id,verified]);await tx.query("INSERT INTO loyalty_ledger(id,restro_id,outlet_id,customer_id,order_id,round_id,state,points,reason) VALUES($1,$2,$3,$4,$5,$6,'EARNED',1000,'Synthetic loyalty acceptance balance')",[key(),owner.restroId,w.outletId,o.customer_id,o.id,o.rounds[0].id])});return s.getOrder(db,owner,o.id)}
const claim=(o:any,r:any,amount:number,web=true)=>s.applyEntitlement(db,owner,key(),o.id,r.id,{version:r.version,amount},web);
test('default rupee claims share one ₹50 order cap across rounds and reject stale/over-cap claims without losing the prior reservation',async()=>{
 let o=await create(),first=o.rounds[0];o=(await claim(o,first,3000)).order;first=o.rounds[0];assert.equal(Number(first.discount),3000);
 o=await s.createRound(db,owner,key(),{outletId:w.outletId,orderId:o.id,version:o.version,type:'TAKEAWAY',items:[{itemId:menuId,quantity:1}]},true);const second=o.rounds[1],review=await s.reviewRewards(db,owner,key(),o.id,second.id);assert.equal(review.entitlements.webLoyalty!.maxRedemptionAmount,2000);
 const before=await s.getOrder(db,owner,o.id);await assert.rejects(claim(o,second,3000),{code:'REDEMPTION_CAP'});assert.deepEqual(await s.getOrder(db,owner,o.id),before);o=(await claim(o,second,2000)).order;assert.equal(Number(o.totals.discount),5000);
 await assert.rejects(claim(o,second,1000),{code:'VERSION_CONFLICT'});o=(await claim(o,o.rounds[0],1000)).order;assert.equal(Number(o.totals.discount),3000);assert.equal((await s.reviewRewards(db,owner,key(),o.id,o.rounds[0].id)).entitlements.webLoyalty!.maxRedemptionAmount,3000);
});
test('coupon-code entry replaces loyalty, preserves code and snapshots, rejects stacking/expired/foreign codes, and keeps OTP/native guards',async()=>{
 let o=await create(),r=o.rounds[0];o=(await claim(o,r,1000)).order;r=o.rounds[0];const coupon=key(),code='WEB-'+key();await db.transaction(owner.restroId,tx=>tx.query("INSERT INTO coupons(id,restro_id,outlet_id,code,discount_amount,expires_at) VALUES($1,$2,$3,$4,700,now()+interval '1 day')",[coupon,owner.restroId,w.outletId,code]));
 await assert.rejects(s.applyEntitlement(db,owner,key(),o.id,r.id,{version:r.version,couponCode:code,amount:100},true),{code:'STACKING_NOT_ALLOWED'});o=(await s.applyEntitlement(db,owner,key(),o.id,r.id,{version:r.version,couponCode:code.toLowerCase(),points:0},true)).order;assert.equal(Number(o.rounds[0].discount),700);assert.equal(o.rounds[0].coupon_code,code);assert.equal((await db.query('SELECT state FROM loyalty_reservations WHERE round_id=$1',[r.id])).rows[0].state,'RELEASED');
 o=(await claim(o,o.rounds[0],500)).order;assert.equal(o.rounds[0].coupon_code,null);assert.equal((await db.query('SELECT state FROM coupons WHERE id=$1',[coupon])).rows[0].state,'AVAILABLE');
 const unverified=await create(false);await assert.rejects(claim(unverified,unverified.rounds[0],100),{code:'OTP_REQUIRED'});await assert.rejects(claim(o,o.rounds[0],100,false),{code:'APPLICATION_FORBIDDEN'});await assert.rejects(s.applyEntitlement(db,owner,key(),o.id,o.rounds[0].id,{version:o.rounds[0].version,couponCode:'NOT-A-CODE'},true),{code:'COUPON_NOT_FOUND'});await assert.rejects(s.applyEntitlement(db,foreign,key(),o.id,o.rounds[0].id,{version:o.rounds[0].version,couponCode:code},true));
});
test('concurrent claims on separate rounds cannot multiply the per-bill cap',async()=>{
 let o=await create();o=await s.createRound(db,owner,key(),{outletId:w.outletId,orderId:o.id,version:o.version,type:'TAKEAWAY',items:[{itemId:menuId,quantity:1}]},true);const results=await Promise.allSettled(o.rounds.map((r:any)=>claim(o,r,5000)));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected').length,1);assert.equal(Number((await s.getOrder(db,owner,o.id)).totals.discount),5000);
});
test('owners and assigned managers can change the outlet default cap while other roles, foreign outlets and native apps remain blocked',async()=>{
 const beforeEnv=process.env.DD_PLATFORM_ADMIN_USER_IDS;
 try{
  delete process.env.DD_PLATFORM_ADMIN_USER_IDS;
  const outlet=(await s.workspace(db,owner)).outlets[0],input={outletId:w.outletId,version:Number(outlet.version),limit:7000};
  for(const role of ['CASHIER','WAITER','KITCHEN','ACCOUNTANT'] as const)await assert.rejects(s.savePlatformLoyaltyCap(db,{...owner,role},key(),input),{code:'FORBIDDEN'});
  await assert.rejects(s.savePlatformLoyaltyCap(db,{...owner,role:'MANAGER',outletIds:[]},key(),input),{code:'OUTLET_FORBIDDEN'});
  await assert.rejects(s.savePlatformLoyaltyCap(db,foreign,key(),input));
  for(const application of ['POS','CAPTAIN','KITCHEN','BAR','COMMAND'] as const)await assert.rejects(s.savePlatformLoyaltyCap(db,{...owner,application},key(),input),{code:'APPLICATION_FORBIDDEN'});
  assert.equal((await s.workspace(db,owner)).platformLoyaltyAdmin,false);
  const o=await create(),claimed=(await claim(o,o.rounds[0],5000)).order;
  const saved=await s.savePlatformLoyaltyCap(db,owner,key(),input);assert.equal(saved.version,input.version+1);assert.deepEqual(await s.getOrder(db,owner,o.id),claimed);
  await assert.rejects(s.savePlatformLoyaltyCap(db,owner,key(),input),{code:'VERSION_CONFLICT'});
  await s.savePlatformLoyaltyCap(db,{...owner,role:'MANAGER'},key(),{...input,version:saved.version,limit:1000});assert.deepEqual(await s.getOrder(db,owner,o.id),claimed);
  const next=await create(),review=await s.reviewRewards(db,owner,key(),next.id,next.rounds[0].id);assert.equal(review.entitlements.webLoyalty!.orderCap,1000);assert.equal(review.entitlements.webLoyalty!.maxRedemptionAmount,1000);
  for(const limit of [-1,1.5,1000000001])await assert.rejects(s.savePlatformLoyaltyCap(db,owner,key(),{...input,version:saved.version+1,limit}));
  process.env.DD_PLATFORM_ADMIN_USER_IDS=owner.userId;assert.equal((await s.workspace(db,owner)).platformLoyaltyAdmin,true);
  await s.savePlatformLoyaltyCap(db,{...owner,role:'CASHIER'},key(),{...input,version:saved.version+1,limit:5000});assert.equal((await s.verifyAudit(db,owner)).valid,true);
 }finally{if(beforeEnv===undefined)delete process.env.DD_PLATFORM_ADMIN_USER_IDS;else process.env.DD_PLATFORM_ADMIN_USER_IDS=beforeEnv}
});

test('concurrent cap edits serialize by outlet version and exact retries write one audit event',async()=>{
 const outlet=(await s.workspace(db,owner)).outlets[0],version=Number(outlet.version),requests=[key(),key()],limits=[6000,8000];
 const results=await Promise.allSettled(limits.map((limit,index)=>s.savePlatformLoyaltyCap(db,index?{...owner,role:'MANAGER'}:owner,requests[index],{outletId:w.outletId,version,limit})));
 assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(results.filter(result=>result.status==='rejected'&&(result.reason as any).code==='VERSION_CONFLICT').length,1);
 const index=results.findIndex(result=>result.status==='fulfilled'),actor=index?{...owner,role:'MANAGER' as const}:owner;
 const before=await db.query("SELECT id FROM audit_events WHERE action='WEB_LOYALTY_CAP_CHANGED' ORDER BY id");
 const retry=await s.savePlatformLoyaltyCap(db,actor,requests[index],{outletId:w.outletId,version,limit:limits[index]});assert.equal(retry.limit,limits[index]);
 assert.deepEqual((await db.query("SELECT id FROM audit_events WHERE action='WEB_LOYALTY_CAP_CHANGED' ORDER BY id")).rows,before.rows);assert.equal((await s.verifyAudit(db,owner)).valid,true);
});
