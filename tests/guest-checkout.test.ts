import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createEmbeddedDatabase,createPostgresDatabase,type Database} from '@dinerdost/database';
import type {Actor} from '@dinerdost/core';
import * as s from '@dinerdost/services';
let db:Database,owner:Actor,foreign:Actor,w:any,menuId:string,serial=0;
const key=()=>randomUUID(),date=()=>new Date(Date.now()+172800000).toISOString().slice(0,10);
before(async()=>{
 db=process.env.TEST_DATABASE_URL?createPostgresDatabase(process.env.TEST_DATABASE_URL):await createEmbeddedDatabase();await db.migrate();
 for(const i of [0,1]){const signed=await s.signup(db,{name:'Checkout QA',email:`checkout-${i}@example.test`,password:'checkout-test-password',restaurant:'Checkout '+i,outlet:'Main',qrEnabled:true,demo:true},'checkout-'+i);if(i)foreign=await s.authenticate(db,signed.token);else owner=await s.authenticate(db,signed.token)}
 w=await s.workspace(db,owner);const material=await s.addIngredient(db,owner,key(),{outletId:w.outletId,name:'Checkout stock',unit:'kg'});await s.receiveStock(db,owner,key(),{ingredientId:material.id,batchNumber:key(),quantityMilli:1000000,unitCost:500,reference:'Synthetic checkout stock',expiresAt:new Date(Date.now()+864000000).toISOString()},true);
 menuId=(await s.saveMenu(db,owner,key(),{outletId:w.outletId,name:'Checkout dish',category:'Starters',price:10000,taxBps:500,station:'Checkout kitchen',recipe:[{id:material.id,quantityMilli:1000}]})).id;
 const outlet=(await s.workspace(db,owner)).outlets[0];await s.saveTaxSettings(db,owner,key(),{outletId:w.outletId,version:outlet.version,taxes:[{name:'CGST',rateBps:250},{name:'SGST',rateBps:250}]});
});
after(async()=>db?.close());
async function settings(change:Record<string,unknown>={}){const current=await s.getWebBillSettings(db,owner,w.outletId);return s.saveWebBillSettings(db,owner,key(),{outletId:w.outletId,version:current.version,loyaltyCap:5000,roundingMode:'UP',createCoupons:[],removeCoupons:[],charges:[{name:'Service charge',amount:1275}],...change})}
async function visit(){const saved=await s.saveTable(db,owner,key(),{outletId:w.outletId,label:'Checkout '+ ++serial,seats:2,floor:'Main floor'}),table=(await db.query<{id:string;public_key:string}>('SELECT * FROM dining_tables WHERE id=$1',[saved.id])).rows[0];await s.openSession(db,owner,key(),{tableId:table.id,guests:1});const device=key(),grant=await s.connectGuest(db,table.public_key,device,key());return{table,device,token:grant.token,name:'Checkout guest '+serial,phone:'912380'+String(serial).padStart(4,'0'),items:[{itemId:menuId,quantity:2}]}}
const input=(v:Awaited<ReturnType<typeof visit>>,extra={})=>({items:v.items,name:v.name,phone:v.phone,...extra});
const quote=(v:Awaited<ReturnType<typeof visit>>,extra={})=>s.guestCheckoutQuote(db,v.table.public_key,v.token,v.device,input(v,extra));
const submit=(v:Awaited<ReturnType<typeof visit>>,extra={},request=key())=>s.guestSubmit(db,v.table.public_key,v.token,v.device,request,input(v,extra),true);
async function counts(){return db.transaction(owner.restroId,async tx=>{const result:any={};for(const table of ['orders','order_rounds','order_items','coupons','loyalty_reservations','payment_attempts','stock_movements'])result[table]=(await tx.query('SELECT count(*) AS count FROM '+table)).rows[0].count;return result})}

test('authoritative guest preview is read-only; first-bill charges, named tax rates, rounding and exact submission agree',async()=>{
 await settings();const v=await visit(),before=await counts(),preview=await quote(v);assert.equal(preview.subtotal,20000);assert.equal(preview.tax,1000);assert.equal(preview.chargesTotal,1275);assert.equal(preview.roundOff,25);assert.equal(preview.payable,22300);assert.deepEqual(preview.taxes,[{name:'CGST',rateBps:250,amount:500},{name:'SGST',rateBps:250,amount:500}]);assert.deepEqual(await counts(),before);
 const request=key(),payload={expectedPayable:preview.payable},order=await submit(v,payload,request);assert.equal(Number(order.rounds[0].payable),preview.payable);assert.deepEqual(order.rounds[0].charges,preview.charges);assert.equal(Number(order.rounds[0].items[0].tax_bps),500);assert.deepEqual(JSON.parse(JSON.stringify(await submit(v,payload,request))),JSON.parse(JSON.stringify(order)));
 const secondQuote=await quote(v);assert.equal(secondQuote.chargesTotal,0);const second=await submit(v,{expectedPayable:secondQuote.payable,version:order.version});assert.equal(second.rounds.length,2);assert.equal(Number(second.rounds[1].charges_total),0);
 const staff=await s.getOrder(db,owner,order.id);await settings({charges:[{name:'New fee',amount:5000}]});assert.deepEqual(await s.getOrder(db,owner,order.id),staff);
 const native=await s.createRound(db,owner,key(),{outletId:w.outletId,type:'TAKEAWAY',items:v.items},false);assert.equal(Number(native.rounds[0].charges_total),0);assert.equal(native.rounds[0].rounding_enabled,false);
 const staffNew=await s.createRound(db,owner,key(),{outletId:w.outletId,type:'TAKEAWAY',items:v.items},true);assert.equal(Number(staffNew.rounds[0].charges_total),5000);
 const brand=await s.saveRecord(db,owner,key(),'brands',{outletId:w.outletId,title:'Checkout store',data:{active:true,description:'Synthetic checkout store'}});await s.saveStorefront(db,owner,key(),{outletId:w.outletId,brandId:brand.id,slug:'checkout-defaults-store',published:true});const storeDevice=key(),storeVisit=await s.connectStorefront(db,'checkout-defaults-store',storeDevice,key()),catalog=await s.storefrontCatalog(db,'checkout-defaults-store',storeVisit.token,storeDevice);assert.deepEqual(catalog.billDefaults.charges,[{name:'New fee',amount:5000}]);assert.equal(catalog.billDefaults.roundingMode,'UP');const storeOrder=await s.submitStorefrontOrder(db,'checkout-defaults-store',storeVisit.token,storeDevice,key(),{name:'Checkout store guest',phone:'9123899901',items:v.items});assert.deepEqual((await s.getOrder(db,owner,storeOrder.id)).rounds[0].charges,catalog.billDefaults.charges);
 assert.equal((await s.verifyAudit(db,owner)).valid,true);
});

test('coupon preview consumes no use; concurrent guest claims reserve once and retain the recorded code and discounted taxes',async()=>{
 const code='QR-'+key().toUpperCase();await settings({createCoupons:[{code,amount:725,validUntil:date(),maxUses:1}]});const a=await visit(),b=await visit(),before=await counts(),pa=await quote(a,{couponCode:code.toLowerCase()}),pb=await quote(b,{couponCode:code});assert.equal(pa.discount,725);assert.deepEqual(await counts(),before);
 const results=await Promise.allSettled([submit(a,{couponCode:code,expectedPayable:pa.payable}),submit(b,{couponCode:code,expectedPayable:pb.payable})]);assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(results.filter(result=>result.status==='rejected'&&result.reason.code==='COUPON_EXHAUSTED').length,1);
 const won=(results.find(result=>result.status==='fulfilled') as PromiseFulfilledResult<any>).value,round=won.rounds[0];assert.equal(round.coupon_code,code);assert.equal(Number(round.discount),725);assert.equal(Number(round.tax),pa.tax);assert.equal(Number(round.payable),pa.payable);assert.equal(Number((await s.getWebBillSettings(db,owner,w.outletId)).coupons.find(c=>c.code===code)!.held),1);
});

test('invalid, stale or changed totals roll back the full order, and grant/device/native and feature boundaries hold',async()=>{
 await settings();const v=await visit(),before=await counts(),p=await quote(v);
 await assert.rejects(submit(v,{expectedPayable:p.payable+1}),{code:'QUOTE_CHANGED'});await assert.rejects(quote(v,{couponCode:'NOT-VALID'}),{code:'COUPON_NOT_FOUND'});await assert.rejects(quote(v,{items:[{itemId:menuId,quantity:1,price:1}]}));await assert.rejects(quote(v,{loyaltyAmount:1,couponCode:'OTHER'}),{code:'STACKING_NOT_ALLOWED'});
 await assert.rejects(s.guestCheckoutQuote(db,v.table.public_key,v.token,key(),input(v)));const other=await visit();await assert.rejects(s.guestCheckoutQuote(db,other.table.public_key,v.token,v.device,input(v)));
 await assert.rejects(s.guestSubmit(db,v.table.public_key,v.token,v.device,key(),input(v,{expectedPayable:p.payable}),false),{code:'APPLICATION_FORBIDDEN'});
 await settings({charges:[{name:'Changed fee',amount:1}]});await assert.rejects(submit(v,{expectedPayable:p.payable}),{code:'QUOTE_CHANGED'});assert.deepEqual(await counts(),before);
 await db.query("INSERT INTO platform_records(id,kind,name,tenant_id,data) VALUES($1,'FEATURE_CONTROL','Checkout test',$2,'{\"coupons\":false}'::jsonb)",[key(),owner.restroId]);
 try{await assert.rejects(quote(v,{couponCode:'ANY'}),{code:'FEATURE_DISABLED'})}finally{await db.query("DELETE FROM platform_records WHERE kind='FEATURE_CONTROL' AND tenant_id=$1 AND name='Checkout test'",[owner.restroId])}
});

test('guest rewards require recognized identity, respect reservations and per-bill caps, and never stack or verify a phone',async()=>{
 await settings();const v=await visit(),base=await quote(v),first=await submit(v,{expectedPayable:base.payable}),staff=await s.getOrder(db,owner,first.id);
 await db.transaction(owner.restroId,tx=>tx.query("INSERT INTO loyalty_ledger(id,restro_id,outlet_id,customer_id,order_id,round_id,state,points,reason) VALUES($1,$2,$3,$4,$5,$6,'EARNED',1000,'Synthetic checkout rewards')",[key(),owner.restroId,w.outletId,staff.customer_id,first.id,first.rounds[0].id]));
 const recognized=await quote(v);assert.equal(recognized.rewards.recognized,true);assert.equal(recognized.rewards.maxAmount,5000);
 const stranger=await visit();stranger.name=v.name;stranger.phone=v.phone;const hidden=await quote(stranger);assert.equal(hidden.rewards.recognized,false);assert.equal(hidden.rewards.availableAmount,0);await assert.rejects(quote(stranger,{loyaltyAmount:100}),{code:'LOYALTY_IDENTITY_REQUIRED'});
 await assert.rejects(quote(v,{loyaltyAmount:5100}),{code:'REDEMPTION_CAP'});const preview=await quote(v,{loyaltyAmount:3000}),claimed=await submit(v,{version:first.version,loyaltyAmount:3000,expectedPayable:preview.payable});assert.equal(Number(claimed.rounds[1].discount),3000);assert.equal(Number(claimed.rounds[1].payable),preview.payable);assert.equal(claimed.rounds[1].reward_name,'Loyalty');assert.equal((await quote(v)).rewards.maxAmount,2000);
 const customer=(await db.query('SELECT otp_verified FROM customers WHERE id=$1',[staff.customer_id])).rows[0];assert.equal(customer.otp_verified,false);assert.equal((await s.verifyAudit(db,owner)).valid,true);
});

test('fixed charge settings enforce owner, tenant, sums, uniqueness and stale atomic saves',async()=>{
 await settings();const current=await s.getWebBillSettings(db,owner,w.outletId),payload={outletId:w.outletId,version:current.version,loyaltyCap:5000,roundingMode:'NONE',createCoupons:[],removeCoupons:[],charges:[{name:'Packaging',amount:100}]};
 for(const actor of [{...owner,role:'CASHIER' as const},{...owner,role:'MANAGER' as const},foreign,{...owner,application:'POS' as const}])await assert.rejects(s.saveWebBillSettings(db,actor,key(),payload));
 for(const charges of [[{name:'',amount:1}],[{name:'Fee',amount:0}],[{name:'Fee',amount:1.5}],[{name:'Fee',amount:1000000000},{name:'Other',amount:1}],[{name:'Fee',amount:1},{name:'fee',amount:2}]])await assert.rejects(s.saveWebBillSettings(db,owner,key(),{...payload,charges}));
 assert.deepEqual(await s.getWebBillSettings(db,owner,w.outletId),current);
 const request=key(),saved=await s.saveWebBillSettings(db,owner,request,payload);assert.deepEqual(saved.charges,payload.charges);assert.deepEqual(await s.saveWebBillSettings(db,owner,request,payload),saved);await assert.rejects(s.saveWebBillSettings(db,owner,key(),{...payload,loyaltyCap:1}),{code:'VERSION_CONFLICT'});
 const after=await s.getWebBillSettings(db,owner,w.outletId);await assert.rejects(s.saveWebBillSettings(db,owner,key(),{...payload,version:after.version,charges:[],removeCoupons:[key()]}));assert.deepEqual(await s.getWebBillSettings(db,owner,w.outletId),after);
 const manager={...owner,role:'MANAGER' as const};assert.equal((await s.getWebBillSettings(db,manager,w.outletId)).canManageCharges,false);const {charges,...noCharges}=payload;await s.saveWebBillSettings(db,manager,key(),{...noCharges,version:after.version});assert.deepEqual((await s.getWebBillSettings(db,owner,w.outletId)).charges,charges);
});


test('nearest guest preview and submission agree below and at the half-rupee boundary',async()=>{
 for(const fee of [1249,1250]){
  await settings({roundingMode:'NEAREST',charges:[{name:'Boundary fee',amount:fee}]});const v=await visit(),preview=await quote(v),expected=fee===1249?22200:22300;
  assert.equal(preview.payable,expected);assert.equal(preview.roundOff,fee===1249?-49:50);const order=await submit(v,{expectedPayable:expected});assert.equal((await s.getOrder(db,owner,order.id)).rounds[0].rounding_mode,'NEAREST');assert.equal(Number(order.rounds[0].payable),expected);assert.equal(Number(order.rounds[0].round_off),preview.roundOff);
 }
});
