import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createEmbeddedDatabase,createPostgresDatabase,type Database} from '@dinerdost/database';
import {roundAdjustment,type Actor} from '@dinerdost/core';
import * as s from '@dinerdost/services';
let db:Database,owner:Actor,foreign:Actor,w:any,menuId:string,serial=0;const key=()=>randomUUID();
const date=()=>new Date(Date.now()+172800000).toISOString().slice(0,10);
before(async()=>{
 db=process.env.TEST_DATABASE_URL?createPostgresDatabase(process.env.TEST_DATABASE_URL):await createEmbeddedDatabase();await db.migrate();
 for(const i of [0,1]){const a=await s.signup(db,{name:'Bill settings QA',email:`bill-settings-${i}@example.test`,password:'bill-settings-test-password',restaurant:'Bill settings '+i,outlet:'Main',qrEnabled:true,demo:true},'bill-settings-'+i);if(i)foreign=await s.authenticate(db,a.token);else owner=await s.authenticate(db,a.token);}
 w=await s.workspace(db,owner);const material=await s.addIngredient(db,owner,key(),{outletId:w.outletId,name:'Settings stock',unit:'kg'});await s.receiveStock(db,owner,key(),{ingredientId:material.id,batchNumber:key(),quantityMilli:1000000,unitCost:500,reference:'Synthetic settings stock',expiresAt:new Date(Date.now()+864000000).toISOString()},true);
 menuId=(await s.saveMenu(db,owner,key(),{outletId:w.outletId,name:'Settings dish',category:'Food',price:12345,taxBps:500,station:'Settings kitchen',recipe:[{id:material.id,quantityMilli:1000}]})).id;
});
after(async()=>db?.close());
const read=()=>s.getWebBillSettings(db,owner,w.outletId);
async function save(change:Record<string,unknown>={}){const current=await read();return s.saveWebBillSettings(db,owner,key(),{outletId:w.outletId,version:current.version,loyaltyCap:current.loyaltyCap,roundingMode:current.roundingMode,createCoupons:[],removeCoupons:[],...change});}
async function coupon(maxUses=2){const code='TEST-'+key().toUpperCase(),saved=await save({createCoupons:[{code,amount:725,validUntil:date(),maxUses}]});return saved.coupons.find(c=>c.code===code)!;}
async function create(web=true){const o=await s.createRound(db,owner,key(),{outletId:w.outletId,type:'TAKEAWAY',customer:{name:'Settings guest '+ ++serial,phone:'912390'+String(serial).padStart(4,'0')},items:[{itemId:menuId,quantity:1}]},web);await db.transaction(owner.restroId,tx=>tx.query('UPDATE customers SET otp_verified=true WHERE id=$1',[o.customer_id]));return s.getOrder(db,owner,o.id);}
const claim=(o:any,code:string,request=key())=>s.applyEntitlement(db,owner,request,o.id,o.rounds[0].id,{version:o.rounds[0].version,couponCode:code},true);

test('round up always uses the next whole rupee while down and legacy nearest retain their exact rules',()=>{
 for(let paise=0;paise<300;paise++){assert.equal(paise+roundAdjustment(paise,true,'UP'),Math.ceil(paise/100)*100);assert.equal(paise+roundAdjustment(paise,true,'DOWN'),Math.floor(paise/100)*100);assert.equal(paise+roundAdjustment(paise,true,'NEAREST'),Math.round(paise/100)*100);assert.equal(roundAdjustment(paise,false,'UP'),0);}
});

test('combined settings are atomic, versioned, audited and preserve current bills, receipts, stock and native totals',async()=>{
 const old=await create(),round=old.rounds[0];await s.recordPayment(db,owner,key(),old.id,round.id,{version:round.version,method:'CASH',amount:1000},true);const snapshot=await s.getOrder(db,owner,old.id),stock=(await s.workspace(db,owner)).movements,current=await read(),request=key(),input={outletId:w.outletId,version:current.version,loyaltyCap:7350,roundingMode:'UP',createCoupons:[{code:'COMBINED-'+key(),amount:1500,validUntil:date(),maxUses:3}],removeCoupons:[]};
 const saved=await s.saveWebBillSettings(db,owner,request,input);assert.equal(saved.loyaltyCap,7350);assert.equal(saved.roundingMode,'UP');assert.equal(saved.version,current.version+1);assert.deepEqual(await s.saveWebBillSettings(db,owner,request,input),saved);
 assert.deepEqual(await s.getOrder(db,owner,old.id),snapshot);assert.deepEqual((await s.workspace(db,owner)).movements,stock);
 const next=await create(),native=await create(false);assert.equal(next.rounds[0].rounding_mode,'UP');assert.equal(Number(next.totals.payable)%100,0);assert.equal(Number(next.rounds[0].manual_discount),0);assert.equal(native.rounds[0].rounding_enabled,false);
 await assert.rejects(s.saveWebBillSettings(db,owner,key(),input),{code:'VERSION_CONFLICT'});
 const before=await read();await assert.rejects(save({loyaltyCap:1,roundingMode:'DOWN',createCoupons:[{code:'NEW-'+key(),amount:1,validUntil:date(),maxUses:1},{code:saved.coupons[0].code,amount:1,validUntil:date(),maxUses:1}]}),{code:'COUPON_DUPLICATE'});assert.deepEqual(await read(),before);assert.equal((await s.verifyAudit(db,owner)).valid,true);
});
test('only owner and assigned manager web sessions can read/save settings; tenant, outlet and native boundaries hold',async()=>{
 const current=await read(),input={outletId:w.outletId,version:current.version,loyaltyCap:5000,roundingMode:'NONE',createCoupons:[],removeCoupons:[]};
 for(const actor of [foreign,{...owner,role:'CASHIER' as const},{...owner,role:'WAITER' as const},{...owner,role:'MANAGER' as const,outletIds:[]},...(['POS','CAPTAIN','KITCHEN','BAR','COMMAND'] as const).map(application=>({...owner,application}))]){await assert.rejects(s.getWebBillSettings(db,actor,w.outletId));await assert.rejects(s.saveWebBillSettings(db,actor,key(),input));}
 await s.saveWebBillSettings(db,{...owner,role:'MANAGER'},key(),input);assert.equal((await read()).roundingMode,'NONE');
 await db.transaction(foreign.restroId,async tx=>{assert.equal((await tx.query('SELECT id FROM web_discount_coupons WHERE outlet_id=$1',[w.outletId])).rows.length,0);});
});
test('coupon amount, date, uniqueness and total-use validation reject invalid saves without changing settings',async()=>{
 const current=await read(),base={code:'VALID-'+key(),amount:100,validUntil:date(),maxUses:1};
 for(const row of [{...base,amount:0},{...base,amount:1.5},{...base,maxUses:0},{...base,maxUses:1.5},{...base,maxUses:1000001},{...base,validUntil:'2026-02-31'},{...base,validUntil:'2000-01-01'},{...base,code:'BAD CODE'}])await assert.rejects(save({loyaltyCap:1234,createCoupons:[row]}));
 assert.deepEqual(await read(),current);
 const c=await coupon();await assert.rejects(save({createCoupons:[{...base,code:c.code.toLowerCase()}]}),{code:'COUPON_DUPLICATE'});
 const expiry=(await db.query('SELECT expires_at FROM web_discount_coupons WHERE id=$1',[c.id])).rows[0].expires_at;assert.equal(new Date(String(expiry)).getTime(),new Date(date()+'T00:00:00+05:30').getTime()+86400000);
});
test('concurrent claims cannot exceed the shared limit and exact retries do not consume another use',async()=>{
 const c=await coupon(1),orders=await Promise.all([create(),create()]),requests=[key(),key()],results=await Promise.allSettled(orders.map((o,i)=>claim(o,c.code.toLowerCase(),requests[i])));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&(r.reason as any).code==='COUPON_EXHAUSTED').length,1);
 const winner=results.findIndex(r=>r.status==='fulfilled'),again=await claim(orders[winner],c.code.toLowerCase(),requests[winner]);assert.equal(Number(again.order.rounds[0].discount),725);assert.equal(again.order.rounds[0].coupon_code,c.code);
 const settings=await read(),row=settings.coupons.find(r=>r.id===c.id)!;assert.equal(Number(row.held),1);assert.equal(Number(row.redeemed),0);
 const loser=await s.getOrder(db,owner,orders[1-winner].id);assert.equal(Number(loser.rounds[0].discount),0);assert.equal(loser.rounds[0].coupon_code,null);
});
test('releasing or expiring a reservation frees capacity; token IDs cannot bypass web-only guards',async()=>{
 const c=await coupon(1),first=await create();let used=(await claim(first,c.code)).order;
 const token=(await db.query('SELECT id FROM coupons WHERE round_id=$1',[first.rounds[0].id])).rows[0];await assert.rejects(s.applyEntitlement(db,{...owner,application:'POS'},key(),used.id,used.rounds[0].id,{version:used.rounds[0].version,couponId:token.id},false),{code:'APPLICATION_FORBIDDEN'});
 used=(await s.applyEntitlement(db,owner,key(),used.id,used.rounds[0].id,{version:used.rounds[0].version,points:0},true)).order;assert.equal(used.rounds[0].coupon_code,null);
 const second=await create();await claim(second,c.code);await db.transaction(owner.restroId,tx=>tx.query("UPDATE coupons SET reserved_until=now()-interval '1 minute' WHERE web_discount_coupon_id=$1 AND state='RESERVED'",[c.id]));const third=(await claim(await create(),c.code)).order;assert.equal(third.rounds[0].coupon_code,c.code);assert.equal(Number((await read()).coupons.find(row=>row.id===c.id)!.held),1);
});
test('removed or expired coupons reject new authorization, but locked/issued financial history stays intact',async()=>{
 const c=await coupon(3),old=await create(),reserved=(await claim(old,c.code)).order;await save({removeCoupons:[c.id]});await assert.rejects(claim(await create(),c.code),{code:'COUPON_INELIGIBLE'});
 await assert.rejects(s.recordPayment(db,owner,key(),reserved.id,reserved.rounds[0].id,{version:reserved.rounds[0].version,method:'CASH',amount:Number(reserved.totals.payable)},true),{code:'REWARD_EXPIRED'});assert.deepEqual(await s.getOrder(db,owner,reserved.id),reserved);
 const live=await coupon(2);let paid=(await claim(await create(),live.code)).order;paid=(await s.recordPayment(db,owner,key(),paid.id,paid.rounds[0].id,{version:paid.rounds[0].version,method:'CASH',amount:Number(paid.totals.payable)},true)).order;await save({removeCoupons:[live.id]});await s.completePreparedService(db,owner,key(),paid.id,paid.rounds[0].id,{version:paid.rounds[0].version,confirmedPreparedAndServed:true});await s.generateBill(db,owner,key(),paid.id,{final:true});const frozen=await s.getOrder(db,owner,paid.id);assert.equal(frozen.rounds[0].coupon_code,live.code);assert.equal((await db.query('SELECT state FROM coupons WHERE round_id=$1',[paid.rounds[0].id])).rows[0].state,'REDEEMED');
 await save({loyaltyCap:1234,roundingMode:'DOWN'});assert.deepEqual(await s.getOrder(db,owner,paid.id),frozen);
 const exp=await coupon();await db.query("UPDATE web_discount_coupons SET expires_at=now()-interval '1 second' WHERE id=$1",[exp.id]);await assert.rejects(claim(await create(),exp.code),{code:'COUPON_INELIGIBLE'});
});
test('stale/concurrent settings edits and foreign removals cannot partially save another field',async()=>{
 const current=await read(),base={outletId:w.outletId,version:current.version,loyaltyCap:5000,roundingMode:'DOWN',createCoupons:[],removeCoupons:[]};const results=await Promise.allSettled([s.saveWebBillSettings(db,owner,key(),base),s.saveWebBillSettings(db,{...owner,role:'MANAGER'},key(),{...base,loyaltyCap:7000})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&(r.reason as any).code==='VERSION_CONFLICT').length,1);
 const before=await read();await assert.rejects(save({loyaltyCap:2,removeCoupons:[key()]}));assert.deepEqual(await read(),before);assert.equal((await s.verifyAudit(db,owner)).valid,true);
});


test('concurrent switches between coupon definitions preserve both limits and release old reservations',async()=>{
 const a=await coupon(2),b=await coupon(2);let first=(await claim(await create(),a.code)).order,second=(await claim(await create(),b.code)).order;
 for(let i=0;i<4;i++){
  const codes=i%2?[a.code,b.code]:[b.code,a.code];
  const changed=await Promise.all([claim(first,codes[0]),claim(second,codes[1])]);first=changed[0].order;second=changed[1].order;
  assert.equal(first.rounds[0].coupon_code,codes[0]);assert.equal(second.rounds[0].coupon_code,codes[1]);
  const current=await read();for(const c of [a,b])assert.equal(Number(current.coupons.find(row=>row.id===c.id)!.held),1);
 }
 assert.equal((await s.verifyAudit(db,owner)).valid,true);
});
