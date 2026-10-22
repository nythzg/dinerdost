import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createEmbeddedDatabase,createPostgresDatabase,type Database} from '@dinerdost/database';
import {calculate,type Actor} from '@dinerdost/core';
import * as s from '@dinerdost/services';
let db:Database,owner:Actor,foreign:Actor,manager:Actor,w:any;
const key=()=>randomUUID();
before(async()=>{
 db=process.env.TEST_DATABASE_URL?createPostgresDatabase(process.env.TEST_DATABASE_URL):await createEmbeddedDatabase();await db.migrate();await db.migrate();
 for(const index of [0,1]){const account=await s.signup(db,{name:'Tools QA',email:`tools-${index}@example.test`,password:'tools-test-password',restaurant:'Tools '+index,outlet:'Main',qrEnabled:true,demo:true},'tools-'+index);const actor=await s.authenticate(db,account.token);if(index)foreign=actor;else owner=actor}
 w=await s.workspace(db,owner);
 const invitation=await s.createStaffInvitation(db,owner,key(),{name:'Tools manager',email:'tools-manager@example.test',role:'MANAGER',outletIds:[w.outletId]});
 const account=await s.acceptStaffInvitation(db,invitation.token,{name:'Tools manager',password:'tools-manager-password'},'tools-manager');manager=await s.authenticate(db,account.token);
});
after(async()=>{await db?.close()});
async function financial(){return db.transaction(owner.restroId,async tx=>{const result:Record<string,unknown>={};for(const table of ['orders','order_rounds','invoices','payment_attempts','stock_movements','order_item_costs'])result[table]=(await tx.query(`SELECT * FROM ${table} ORDER BY ${table==='order_item_costs'?'order_item_id':'id'}`)).rows;return result})}
test('arithmetic handles precedence, brackets, unary, decimals and percentages without executing code',()=>{
 for(const [input,result] of [['125 × 2 + 50','300'],['(2+3)*4','20'],['-2 * (-3)','6'],['200*10%','20'],['.1+.2','0.3'],['10/4','2.5']])assert.equal(calculate(input),result);
 for(const input of ['','2+','1/0','2(3)','alert(1)','1e10','0x10','1..2','(2+3','9'.repeat(201),'('.repeat(41)+'1'+')'.repeat(41)])assert.throws(()=>calculate(input));
});
test('calculator recomputes server-side, is idempotent and never changes financial or stock records',async()=>{
 const before=await financial(),commandKey=key(),input={action:'calculate',expression:'125 × 2 + 50',note:'Kitchen estimate'};
 const entry=await s.calculatorAction(db,owner,commandKey,input);assert.equal(entry.result,'300');assert.equal((await s.calculatorAction(db,owner,commandKey,input)).id,entry.id);
 const rows=(await s.calculatorHistory(db,owner)).rows;assert.equal(rows.filter(row=>row.id===entry.id).length,1);assert.equal(rows[0].note,'Kitchen estimate');
 await assert.rejects(s.calculatorAction(db,owner,key(),{...input,result:'999'}));await assert.rejects(s.calculatorAction(db,owner,key(),{action:'calculate',expression:'1/0'}));assert.deepEqual(await financial(),before);
});
test('history and edited notes persist through authentication until explicitly deleted',async()=>{
 const entry=await s.calculatorAction(db,owner,key(),{action:'calculate',expression:'20+2'});
 await s.calculatorAction(db,owner,key(),{action:'note',id:entry.id,note:'Revised note'});
 const login=await s.login(db,{email:'tools-0@example.test',password:'tools-test-password'},'tools-relogin'),actor=await s.authenticate(db,login.token);
 assert.equal((await s.calculatorHistory(db,actor)).rows.find(row=>row.id===entry.id)?.note,'Revised note');
 await s.calculatorAction(db,actor,key(),{action:'delete',id:entry.id});assert(!(await s.calculatorHistory(db,owner)).rows.some(row=>row.id===entry.id));
});
test('calculator reads, note edits and deletion are isolated by employee and tenant',async()=>{
 const entry=await s.calculatorAction(db,owner,key(),{action:'calculate',expression:'40+3',note:'Private'});
 for(const actor of [manager,foreign]){assert(!(await s.calculatorHistory(db,actor)).rows.some(row=>row.id===entry.id));for(const action of ['note','delete'])await assert.rejects(s.calculatorAction(db,actor,key(),{action,id:entry.id,...(action==='note'?{note:'Denied'}:{})}))}
 assert.equal((await s.calculatorHistory(db,owner)).rows.find(row=>row.id===entry.id)?.note,'Private');
 await assert.rejects(s.calculatorAction(db,owner,key(),{action:'note',id:entry.id,note:'x'.repeat(501)}));
 for(const application of ['POS','COMMAND','KITCHEN'] as const)await assert.rejects(s.calculatorHistory(db,{...owner,application}));
 await db.transaction(foreign.restroId,async tx=>assert.equal((await tx.query('SELECT id FROM calculator_history WHERE id=$1',[entry.id])).rows.length,0));
});
test('history pagination retains older records and RLS is forced',async()=>{
 for(let i=0;i<26;i++)await s.calculatorAction(db,manager,key(),{action:'calculate',expression:`${i}+1`});
 const first=await s.calculatorHistory(db,manager),second=await s.calculatorHistory(db,manager,1);assert.equal(first.rows.length,25);assert(first.more);assert.equal(second.rows.length,1);assert(!second.more);assert.equal(new Set([...first.rows,...second.rows].map(row=>row.id)).size,26);
 await assert.rejects(s.calculatorHistory(db,manager,-1));
 const policy=(await db.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='calculator_history'::regclass")).rows[0];assert(policy.relrowsecurity&&policy.relforcerowsecurity);
});
test('active orders expose actual stages/outstanding and paginate beyond latest-200 workspace limitations without changing records',async()=>{
 const visit=await s.openSession(db,owner,key(),{tableId:w.tables[0].id,guests:1});
 const order=await s.createRound(db,owner,key(),{outletId:w.outletId,sessionId:visit.id,type:'DINE_IN',draft:true,items:[{itemId:w.menu[0].id,quantity:2}]},true);
 for(let i=0;i<26;i++)await s.createRound(db,owner,key(),{outletId:w.outletId,type:'TAKEAWAY',draft:true,items:[{itemId:w.menu[0].id,quantity:1}]},true);
 const before=await financial(),first=await s.activeOrderList(db,owner,w.outletId),second=await s.activeOrderList(db,owner,w.outletId,1);
 assert.equal(first.rows.length,25);assert(first.more);assert.equal(second.rows.length,2);assert(!second.more);assert.equal(new Set([...first.rows,...second.rows].map(row=>row.id)).size,27);
 const actual=[...first.rows,...second.rows].find(row=>row.id===order.id)!;assert.equal(actual.table_label,w.tables[0].label);assert.deepEqual(actual.stages,['HELD']);assert.equal(Number(actual.payable),Number(order.totals.payable));assert.equal(Number(actual.paid),0);assert.deepEqual(await financial(),before);
 const assigned=await s.activeOrderList(db,{...owner,role:'WAITER'},w.outletId);assert.equal(assigned.rows.length,1);assert.equal(assigned.rows[0].id,order.id);
 assert.equal((await s.activeOrderList(db,{...manager,role:'WAITER'},w.outletId)).rows.length,0);
});
test('active orders deny foreign tenants, unauthorized outlets/roles and deferred native apps',async()=>{
 await assert.rejects(s.activeOrderList(db,{...owner,role:'ACCOUNTANT'},w.outletId));
 await assert.rejects(s.activeOrderList(db,foreign,w.outletId));await assert.rejects(s.activeOrderList(db,{...manager,outletIds:[]},w.outletId));await assert.rejects(s.activeOrderList(db,{...owner,role:'KITCHEN'},w.outletId));await assert.rejects(s.activeOrderList(db,{...owner,application:'POS'},w.outletId));await assert.rejects(s.activeOrderList(db,owner,w.outletId,-1));
});
