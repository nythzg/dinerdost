import assert from 'node:assert/strict';
import {readdir,writeFile} from 'node:fs/promises';
import {createPostgresDatabase} from '@dinerdost/database';
process.loadEnvFile('.env.production.local');
const db=createPostgresDatabase(process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL_UNPOOLED||process.env.POSTGRES_URL_NON_POOLING||process.env.DATABASE_URL!);
const migrations=['048_web_bill_defaults.sql'];
async function frozen(){const result:Record<string,{id:string;digest:string}[]>={};for(const [name,sql] of [
 ['invoices','SELECT id::text AS id,md5(snapshot::text) AS digest FROM invoices'],
 ['payments','SELECT id::text AS id,md5(row_to_json(p)::text) AS digest FROM payment_attempts p'],
 ['itemCosts','SELECT order_item_id::text AS id,md5(row_to_json(c)::text) AS digest FROM order_item_costs c'],
 ['stockMovements','SELECT id::text AS id,md5(row_to_json(m)::text) AS digest FROM stock_movements m'],
 ['stockBatches','SELECT id::text AS id,md5(to_jsonb(b)::text) AS digest FROM stock_batches b'],
 ['rounds','SELECT id::text AS id,md5(to_jsonb(r)::text) AS digest FROM order_rounds r'],
 ['outlets',"SELECT id::text AS id,md5((to_jsonb(o)-'web_round_down_default')::text) AS digest FROM outlets o"]
])result[name]=(await db.query<{id:string;digest:string}>(sql)).rows;return result}
try{
 const applied=(await db.query('SELECT name FROM schema_migrations')).rows.map(r=>r.name),pending=(await readdir('packages/database/migrations')).filter(n=>n.endsWith('.sql')&&!applied.includes(n));assert.deepEqual(pending,migrations.filter(n=>!applied.includes(n)));
 const gateBefore=(await db.query("SELECT md5(pg_get_functiondef('kot_authority_gate()'::regprocedure)) AS digest")).rows[0].digest;
 const before=await frozen();await db.migrate();const after=await frozen(),preserved:Record<string,unknown>={};
 for(const name of Object.keys(before)){const values=new Map(after[name].map(row=>[row.id,row.digest]));assert(before[name].every(row=>values.get(row.id)===row.digest),name+' changed');preserved[name]={priorCount:before[name].length,preserved:true}}
 assert.equal((await db.query('SELECT count(*)::int AS n FROM outlets WHERE web_round_down_default IS DISTINCT FROM false')).rows[0].n,0);
 assert.equal((await db.query("SELECT md5(pg_get_functiondef('kot_authority_gate()'::regprocedure)) AS digest")).rows[0].digest,gateBefore);assert.equal((await db.query("SELECT tgenabled FROM pg_trigger WHERE tgname='enforce_kot_authority'")).rows[0].tgenabled,'O');
 const rls=(await db.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='outlets'::regclass")).rows[0];assert(rls.relrowsecurity&&rls.relforcerowsecurity);
 await writeFile('verification/production-migration-0428.json',JSON.stringify({checkedAt:new Date().toISOString(),migrations,pendingBefore:pending,applied:true,immutableHistory:preserved,kotAuthorityUnchanged:true,tenantRlsEnforced:true,scope:'Add only an outlet future-web-round preference defaulting false; no existing bill, receipt, round, stock or value changed.'},null,2)+'\n');console.log('Future rounding preference added; existing financial and stock records preserved.');
}finally{await db.close()}
