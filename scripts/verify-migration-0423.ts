import assert from 'node:assert/strict';
import {readdir,writeFile} from 'node:fs/promises';
import {createPostgresDatabase} from '@dinerdost/database';
process.loadEnvFile('.env.production.local');
const connection=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL_UNPOOLED||process.env.POSTGRES_URL_NON_POOLING||process.env.DATABASE_URL;assert(connection);
const db=createPostgresDatabase(connection),migrations=['047_web_kitchen_policy.sql'];
async function frozen(){const result:Record<string,{id:string;digest:string}[]>={};for(const [name,sql] of [
 ['invoices','SELECT id::text AS id,md5(snapshot::text) AS digest FROM invoices'],
 ['itemCosts','SELECT order_item_id::text AS id,md5(row_to_json(c)::text) AS digest FROM order_item_costs c'],
 ['stockMovements','SELECT id::text AS id,md5(row_to_json(m)::text) AS digest FROM stock_movements m'],
 ['preparedMovements','SELECT id::text AS id,md5(row_to_json(m)::text) AS digest FROM prepared_food_movements m'],
 ['ingredientUnitsAndRates',"SELECT id::text AS id,md5(jsonb_build_object('unit',unit,'purchase_rate',purchase_rate)::text) AS digest FROM ingredients"],
 ['stockBatches','SELECT id::text AS id,md5(to_jsonb(b)::text) AS digest FROM stock_batches b'],
 ['preparedFood','SELECT id::text AS id,md5(row_to_json(p)::text) AS digest FROM prepared_food_batches p'],
 ['orderRounds',"SELECT id::text AS id,md5((to_jsonb(r)-'web_kitchen_stages_enabled')::text) AS digest FROM order_rounds r"],
 ['outletPolicies',"SELECT id::text AS id,md5((to_jsonb(o)-'web_kitchen_stages_enabled')::text) AS digest FROM outlets o"]
])result[name]=(await db.query<{id:string;digest:string}>(sql)).rows;return result}
try{
 const applied=(await db.query('SELECT name FROM schema_migrations')).rows.map(row=>String(row.name));
 const pending=(await readdir('packages/database/migrations')).filter(name=>name.endsWith('.sql')&&!applied.includes(name));assert.deepEqual(pending,migrations.filter(name=>!applied.includes(name)),'Only the reviewed future-web-round kitchen policy fields may be added.');
 const gateBefore=(await db.query("SELECT md5(pg_get_functiondef('kot_authority_gate()'::regprocedure)) AS digest")).rows[0].digest;
 const before=await frozen();await db.migrate();const after=await frozen(),preserved:Record<string,unknown>={};
 for(const name of Object.keys(before)){const current=new Map(after[name].map(row=>[row.id,row.digest]));assert(before[name].every(row=>current.get(row.id)===row.digest),name+' changed');preserved[name]={priorCount:before[name].length,preserved:true}}
 for(const table of ['order_rounds','outlets']){const policy=(await db.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass",[table])).rows[0];assert(policy.relrowsecurity&&policy.relforcerowsecurity);}assert.equal((await db.query('SELECT count(*)::int AS n FROM order_rounds WHERE id=ANY($1::uuid[]) AND web_kitchen_stages_enabled IS NOT NULL',[before.orderRounds.map(r=>r.id)])).rows[0].n,0);assert.equal((await db.query('SELECT count(*)::int AS n FROM outlets WHERE web_kitchen_stages_enabled IS DISTINCT FROM true')).rows[0].n,0);
 const gate=(await db.query("SELECT tgenabled FROM pg_trigger WHERE tgname='enforce_kot_authority'")).rows[0];assert.equal(gate.tgenabled,'O');assert.equal((await db.query("SELECT md5(pg_get_functiondef('kot_authority_gate()'::regprocedure)) AS digest")).rows[0].digest,gateBefore);
 const grants=(await db.query("SELECT privilege_type FROM information_schema.role_table_grants WHERE grantee='dinerdost_app' AND table_name='order_pins' ORDER BY privilege_type")).rows.map(row=>row.privilege_type);assert.deepEqual(grants,['INSERT','SELECT','UPDATE']);
 const remaining=(await db.query("SELECT count(*)::int AS count FROM pg_database WHERE datname LIKE 'dd_verify_%'")).rows[0].count;assert.equal(remaining,0);
 await writeFile('verification/production-migration-0423.json',JSON.stringify({checkedAt:new Date().toISOString(),migrations,pendingBefore:pending,applied:true,immutableHistory:preserved,tenantRlsEnforced:true,kotGateEnabled:true,kotGateDefinitionUnchanged:true,grants,isolatedVerificationDatabases:remaining,migrationScope:'Add outlet default true and nullable round policy snapshot. Existing rounds remain NULL; no historical monetary/stock fields or KOT authority function changed.'},null,2)+'\n');console.log('Kitchen policy fields added; existing rounds, history and KOT authorization preserved.');
}finally{await db.close()}
