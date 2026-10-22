import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createEmbeddedDatabase,createPostgresDatabase,type Database} from '@dinerdost/database';
import {calculate,type Actor} from '@dinerdost/core';
import * as s from '@dinerdost/services';
import {calculatorDisplay,calculatorExpression,plainCalculatorResult} from '../apps/web/src/features/workspace/calculator-display';
let db:Database,owner:Actor,foreign:Actor,manager:Actor,w:any;
const key=()=>randomUUID();
test('calculator grouping and scientific output expansion preserve arithmetic values and input operators',()=>{
 assert.equal(calculatorDisplay('1125÷5'),'1,125÷5');assert.equal(calculatorDisplay('12345.678-5'),'12,345.678−5');assert.equal(calculatorExpression(calculatorDisplay('12345.678-5')),'12345.678-5');
 assert.equal(plainCalculatorResult('1e-7'),'0.0000001');assert.equal(plainCalculatorResult('-1.25e+4'),'-12500');assert.equal(calculatorExpression('abc12 + xyz3'),'12 + 3');assert.equal(calculatorExpression('00'),'0');
});
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
test('unexpired history and edited notes persist through authentication until explicitly deleted',async()=>{
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

test('standard calculator relative percentages preserve compound arithmetic and reject unsupported modes',()=>{
 for(const [expression,result] of [['200+10%','220'],['200-10%','180'],['200*10%','20'],['200/10%','2000'],['10%','0.1'],['200+10%+10%','242'],['200-10%+10%','198'],['(200+10%)*2','440'],['200+10%*2','200.2'],['200+(10%)','200.1'],['200+-10%','199.9'],['0+10%','0']])assert.equal(calculate(expression),result,expression);
 for(const expression of ['sin(30)','2^3','sqrt(9)','2(3)','1e10','200+10000000000000000%'])assert.throws(()=>calculate(expression),expression);
});
test('new percentage saves and optional notes leave old recorded results and financial history intact',async()=>{
 const oldId=key();await db.transaction(owner.restroId,tx=>tx.query('INSERT INTO calculator_history(id,restro_id,employee_id,expression,result,note) VALUES($1,$2,$3,$4,$5,$6)',[oldId,owner.restroId,owner.employeeId,'200+10%','200.1','Original saved result']));
 const before=await financial();const entry=await s.calculatorAction(db,owner,key(),{action:'calculate',expression:'200+10%'});assert.equal(entry.result,'220');assert.equal(entry.note,'');
 await s.calculatorAction(db,owner,key(),{action:'note',id:entry.id,note:'Optional note'});
 const history=(await s.calculatorHistory(db,owner)).rows;assert.equal(history.find(r=>r.id===entry.id)?.note,'Optional note');assert.equal(history.find(r=>r.id===oldId)?.result,'200.1');assert.equal(history.find(r=>r.id===oldId)?.note,'Original saved result');assert.deepEqual(await financial(),before);
 for(const input of [{action:'tool',tool:{kind:'UNIT',category:'length',from:'m',to:'cm',value:'1'}},{action:'calculate',expression:'200+10%',angle:'DEG'},{action:'calculate',expression:'200+10%',result:'999'}])await assert.rejects(s.calculatorAction(db,owner,key(),input));
});
test('concurrent calculator saves retain one entry and notes remain scoped to their calculation and employee',async()=>{
 const requestKey=key(),input={action:'calculate',expression:'200-10%',note:'Concurrent note'};
 const [first,second]=await Promise.all([s.calculatorAction(db,owner,requestKey,input),s.calculatorAction(db,owner,requestKey,input)]);assert.equal(first.id,second.id);assert.equal(first.result,'180');
 await assert.rejects(s.calculatorAction(db,owner,requestKey,{...input,note:'Conflicting payload'}));
 for(const actor of [manager,foreign]){await assert.rejects(s.calculatorAction(db,actor,key(),{action:'note',id:first.id,note:'Denied'}));assert(!(await s.calculatorHistory(db,actor)).rows.some(r=>r.id===first.id))}
 const other=await s.calculatorAction(db,owner,key(),{action:'calculate',expression:'7+3',note:'Other calculation'});await s.calculatorAction(db,owner,key(),{action:'note',id:first.id,note:'Updated specific note'});
 const history=(await s.calculatorHistory(db,owner)).rows;assert.equal(history.filter(r=>r.id===first.id).length,1);assert.equal(history.find(r=>r.id===first.id)?.note,'Updated specific note');assert.equal(history.find(r=>r.id===other.id)?.note,'Other calculation');
});

test('calculator retention keeps the exact seven-day boundary and deletes strictly older calculations with their notes',async()=>{
 const before=await financial(),old=key(),boundary=key(),recent=key();
 await db.transaction(owner.restroId,async tx=>{
  for(const [entryId,age] of [[old,"interval '168 hours 0.001 seconds'"],[boundary,"interval '168 hours'"],[recent,"interval '167 hours 59 minutes'"]])await tx.query(`INSERT INTO calculator_history(id,restro_id,employee_id,expression,result,note,created_at) VALUES($1,$2,$3,'1+2','3','Expiry fixture',now()-${age})`,[entryId,owner.restroId,owner.employeeId]);
  await s.expireCalculatorData(tx,owner.employeeId);
  const rows=(await tx.query('SELECT id,note FROM calculator_history WHERE id=ANY($1::uuid[])',[[old,boundary,recent]])).rows;
  assert.deepEqual(rows.map(r=>r.id).sort(),[boundary,recent].sort());assert(rows.every(r=>r.note==='Expiry fixture'));
 });
 assert.deepEqual(await financial(),before);
});
test('expired calculator contents are removed from history and retry responses without resurrecting entries or altering audit/financial history',async()=>{
 const requestKey=key(),input={action:'calculate',expression:'81+19',note:'Expired private note'},entry=await s.calculatorAction(db,owner,requestKey,input);
 await db.transaction(owner.restroId,async tx=>{
  await tx.query("UPDATE calculator_history SET created_at=now()-interval '8 days' WHERE id=$1",[entry.id]);
  await tx.query("UPDATE idempotency_keys SET response=jsonb_set(response,'{created_at}',to_jsonb(now()-interval '8 days')) WHERE key=$1",[requestKey]);
 });
 const before=await financial(),auditBefore=(await db.query('SELECT * FROM audit_events ORDER BY id')).rows;
 assert(!(await s.calculatorHistory(db,owner)).rows.some(r=>r.id===entry.id));
 const cached=(await db.query('SELECT response FROM idempotency_keys WHERE restro_id=$1 AND key=$2',[owner.restroId,requestKey])).rows[0].response;
 assert.deepEqual(cached,{id:entry.id,expired:true});
 await assert.rejects(s.calculatorAction(db,owner,requestKey,input),(e:any)=>e.code==='CALCULATION_EXPIRED'&&e.status===410);
 assert.equal((await db.query('SELECT id FROM calculator_history WHERE id=$1',[entry.id])).rows.length,0);
 assert.deepEqual((await db.query('SELECT * FROM audit_events ORDER BY id')).rows,auditBefore);assert.deepEqual(await financial(),before);
});
test('account cleanup respects employee/tenant/native boundaries and concurrent note edits cannot extend an expired entry',async()=>{
 const ids=await Promise.all([owner,manager,foreign].map(async actor=>{
  const entry=await s.calculatorAction(db,actor,key(),{action:'calculate',expression:'2+8',note:'Scoped expiry'});
  await db.transaction(actor.restroId,tx=>tx.query("UPDATE calculator_history SET created_at=now()-interval '8 days' WHERE id=$1",[entry.id]));return entry.id;
 }));
 for(const application of ['POS','COMMAND','KITCHEN'] as const)await assert.rejects(s.calculatorHistory(db,{...owner,application}));
 assert.equal((await db.query('SELECT id FROM calculator_history WHERE id=ANY($1::uuid[])',[ids])).rows.length,3);
 const [read,edit]=await Promise.allSettled([s.calculatorHistory(db,owner),s.calculatorAction(db,owner,key(),{action:'note',id:ids[0],note:'Do not revive'})]);
 assert.equal(read.status,'fulfilled');assert.equal(edit.status,'rejected');
 assert.deepEqual((await db.query('SELECT id FROM calculator_history WHERE id=ANY($1::uuid[])',[ids])).rows.map(r=>r.id).sort(),ids.slice(1).sort());
});
test('local maintenance removes expired accounts even while inactive, including retry copies of manually deleted calculations',async()=>{
 const requestKey=key(),entry=await s.calculatorAction(db,owner,requestKey,{action:'calculate',expression:'75+25',note:'Deleted private note'});
 await s.calculatorAction(db,owner,key(),{action:'delete',id:entry.id});
 await db.transaction(owner.restroId,tx=>tx.query("UPDATE idempotency_keys SET response=jsonb_set(response,'{created_at}',to_jsonb(now()-interval '8 days')) WHERE key=$1",[requestKey]));
 const unrelatedKey=key();await db.query("INSERT INTO idempotency_keys(restro_id,key,actor_id,fingerprint,response) VALUES($1,$2,$3,'untouched',$4::jsonb)",[owner.restroId,unrelatedKey,owner.employeeId,JSON.stringify({id:key(),expression:'Unrelated business data',result:'Keep',created_at:'not a timestamp'})]);
 const before=await financial(),unrelated=(await db.query('SELECT response FROM idempotency_keys WHERE key=$1',[unrelatedKey])).rows[0].response;
 await db.transaction(null,tx=>s.expireCalculatorData(tx));
 assert.equal((await db.query("SELECT id FROM calculator_history WHERE created_at < now()-interval '168 hours'")).rows.length,0);
 assert.deepEqual((await db.query('SELECT response FROM idempotency_keys WHERE key=$1',[requestKey])).rows[0].response,{id:entry.id,expired:true});
 assert.deepEqual((await db.query('SELECT response FROM idempotency_keys WHERE key=$1',[unrelatedKey])).rows[0].response,unrelated);assert.deepEqual(await financial(),before);
});
