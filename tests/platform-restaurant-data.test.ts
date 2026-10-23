import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createEmbeddedDatabase,type Database} from '@dinerdost/database';
import type {Actor} from '@dinerdost/core';
import * as s from '@dinerdost/services';

let db:Database,admin:Actor,owner:Actor,other:Actor,w:any,second:any;
const key=()=>randomUUID(),password='isolated-data-verification-123';
before(async()=>{
 db=await createEmbeddedDatabase();await db.migrate();
 const actors=[];
 for(let i=0;i<3;i++){
  const auth=await s.signup(db,{name:'Data QA '+i,email:'data-qa-'+i+'@example.test',password,restaurant:'Data QA '+i,outlet:'Main',qrEnabled:true,demo:i!==2},'directory-qa-'+i);
  actors.push(await s.authenticate(db,auth.token));
 }
 [admin,owner,other]=actors;await s.bootstrapPlatformAdmin(db,'data-qa-0@example.test');w=await s.workspace(db,owner);
 second=await s.saveOutlet(db,owner,key(),{name:'Second QA outlet',code:'SECOND',qrEnabled:false,taxBps:0});
 const o=await s.createRound(db,owner,key(),{outletId:w.outletId,type:'TAKEAWAY',items:[{itemId:w.menu[0].id,quantity:1}],customer:{name:'Private QA diner',phone:'9187654321'}},true);
 await s.recordPayment(db,owner,key(),o.id,o.rounds[0].id,{version:o.rounds[0].version,method:'CASH',amount:Number(o.rounds[0].payable)},true);
 await s.generateBill(db,owner,key(),o.id,{final:false});
});
after(async()=>db?.close());

test('dataset counts reconcile stored demo flags, unflagged records and actual activity without inferring live businesses',async()=>{
 const all=(await s.platformSnapshot(db,admin)).metrics!;
 assert.equal(Number(all.restaurants),3);assert.deepEqual(Object.fromEntries(Object.entries(all.datasets).map(([k,v])=>[k,Number(v)])),{all_records:3,demo:2,non_demo:1,with_orders:1});
 const demo=(await s.platformSnapshot(db,admin,'demo')).metrics!,standard=(await s.platformSnapshot(db,admin,'nonDemo')).metrics!,activity=(await s.platformSnapshot(db,admin,'withOrders')).metrics!;
 assert.equal(Number(demo.restaurants)+Number(standard.restaurants),3);assert.equal(Number(activity.restaurants),1);
 assert.equal(Number(standard.orders_30d),0);assert.equal(Number(demo.verified_receipts_30d),Number(all.verified_receipts_30d));assert.equal(Number(standard.verified_receipts_30d),0);
 assert.equal((await s.platformRestaurantDirectory(db,admin,{dataset:'withOrders'})).rows[0].id,owner.restroId);
 await assert.rejects(s.platformSnapshot(db,admin,'live'));await assert.rejects(s.platformRestaurantDirectory(db,admin,{page:-1}));
});

test('linked restaurant and outlet reads agree with source records, protect financial history and omit customer credentials',async()=>{
 const before=(await db.query(`SELECT (SELECT jsonb_agg(p ORDER BY id) FROM payment_attempts p) AS payments,(SELECT jsonb_agg(i ORDER BY id) FROM invoices i) AS invoices,(SELECT jsonb_agg(s ORDER BY id) FROM stock_batches s) AS batches,(SELECT jsonb_agg(m ORDER BY id) FROM stock_movements m) AS movements`)).rows;
 const all=await s.platformRestaurantData(db,admin,{tenantId:owner.restroId}),main=await s.platformRestaurantData(db,admin,{tenantId:owner.restroId,outletId:w.outletId}),empty=await s.platformRestaurantData(db,admin,{tenantId:owner.restroId,outletId:second.id});
 assert.equal(all.outlets.length,2);assert.equal(Number(all.summary.orders),1);assert.equal(Number(main.summary.orders),1);assert.equal(Number(empty.summary.orders),0);
 assert.equal(Number(all.summary.gross_verified_receipts),Number(main.summary.gross_verified_receipts));assert.ok(Number(main.summary.gross_verified_receipts)>0);assert.equal(Number(empty.summary.gross_verified_receipts),0);
 assert.ok(Number(main.summary.active_menu_items)>0);assert.equal(Number(empty.summary.active_menu_items),0);assert.equal(main.recentInvoices.length,1);assert.equal(empty.recentOrders.length,0);
 await assert.rejects(s.platformRestaurantData(db,admin,{tenantId:owner.restroId,outletId:other.outletIds[0]}),{code:'NOT_FOUND'});
 await assert.rejects(s.platformRestaurantData(db,admin,{tenantId:key()}),{code:'NOT_FOUND'});
 assert.ok(!JSON.stringify(all).includes('9187654321'));assert.ok(!JSON.stringify(all).includes('password_hash'));
 const after=(await db.query(`SELECT (SELECT jsonb_agg(p ORDER BY id) FROM payment_attempts p) AS payments,(SELECT jsonb_agg(i ORDER BY id) FROM invoices i) AS invoices,(SELECT jsonb_agg(s ORDER BY id) FROM stock_batches s) AS batches,(SELECT jsonb_agg(m ORDER BY id) FROM stock_movements m) AS movements`)).rows;
 assert.deepEqual(after,before);
});

test('directory pagination reaches records beyond the old 500 limit and literal search never changes data',async()=>{
 await db.query("INSERT INTO restaurants(id,name,slug,is_demo) SELECT gen_random_uuid(),'Pagination QA '||g,'pagination-qa-'||g,false FROM generate_series(1,505) g");
 const first=await s.platformRestaurantDirectory(db,admin,{search:'Pagination QA'});assert.equal(first.total,505);assert.equal(first.rows.length,25);
 const seen=new Set<string>();
 for(let page=1;page<=first.pages;page++)for(const row of (await s.platformRestaurantDirectory(db,admin,{search:'Pagination QA',page})).rows)seen.add(row.id);
 assert.equal(seen.size,505);assert.equal((await s.platformRestaurantDirectory(db,admin,{search:"%' OR true --"})).total,0);
 assert.equal((await s.platformRestaurantDirectory(db,admin,{search:'Pagination QA',page:100})).page,first.pages);
 const active=await s.platformRestaurantDirectory(db,admin,{dataset:'withOrders'});assert.equal(active.total,1);assert.equal(active.rows[0].id,owner.restroId);
});

test('ordinary owners, analysts, stale sessions and revoked membership cannot read restaurant detail or directory',async()=>{
 const read=(a:Actor)=>s.platformRestaurantData(db,a,{tenantId:owner.restroId});
 await assert.rejects(read(owner),{code:'PLATFORM_FORBIDDEN'});await assert.rejects(s.platformRestaurantDirectory(db,owner),{code:'PLATFORM_FORBIDDEN'});
 await s.savePlatformMember(db,admin,key(),{email:'data-qa-2@example.test',role:'ANALYST',permissions:[],enabled:true,version:0,reason:'Isolated read permissions',adminPassword:password});
 await assert.rejects(read(other),{code:'PLATFORM_FORBIDDEN'});await assert.rejects(s.platformRestaurantDirectory(db,other),{code:'PLATFORM_FORBIDDEN'});
 assert.ok((await s.platformSnapshot(db,other)).metrics);
 await assert.rejects(read({...admin,sessionHash:'invalid-session'}),{code:'PLATFORM_FORBIDDEN'});
 await db.query('UPDATE platform_members SET enabled=false WHERE user_id=$1',[admin.userId]);
 await assert.rejects(read(admin),{code:'PLATFORM_FORBIDDEN'});await assert.rejects(s.platformRestaurantDirectory(db,admin),{code:'PLATFORM_FORBIDDEN'});
});
