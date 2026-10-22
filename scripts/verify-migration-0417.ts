import assert from 'node:assert/strict';
import {readdir,writeFile} from 'node:fs/promises';
import {createPostgresDatabase} from '@dinerdost/database';
process.loadEnvFile('.env.production.local');
const connection=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL_UNPOOLED||process.env.POSTGRES_URL_NON_POOLING||process.env.DATABASE_URL;assert(connection);
const db=createPostgresDatabase(connection),migrations=['044_calculator_history.sql'];
async function frozen(){const result:Record<string,{id:string;digest:string}[]>={};for(const [name,sql] of [
 ['invoices','SELECT id::text AS id,md5(snapshot::text) AS digest FROM invoices'],
 ['itemCosts','SELECT order_item_id::text AS id,md5(row_to_json(c)::text) AS digest FROM order_item_costs c'],
 ['stockMovements','SELECT id::text AS id,md5(row_to_json(m)::text) AS digest FROM stock_movements m'],
 ['preparedMovements','SELECT id::text AS id,md5(row_to_json(m)::text) AS digest FROM prepared_food_movements m']
])result[name]=(await db.query<{id:string;digest:string}>(sql)).rows;return result}
try{
 const applied=(await db.query('SELECT name FROM schema_migrations')).rows.map(row=>String(row.name));
 const pending=(await readdir('packages/database/migrations')).filter(name=>name.endsWith('.sql')&&!applied.includes(name));assert.deepEqual(pending,migrations.filter(name=>!applied.includes(name)),'Only the reviewed calculator-history table may be added.');
 const before=await frozen();await db.migrate();const after=await frozen(),preserved:Record<string,unknown>={};
 for(const name of Object.keys(before)){const current=new Map(after[name].map(row=>[row.id,row.digest]));assert(before[name].every(row=>current.get(row.id)===row.digest));preserved[name]={priorCount:before[name].length,preserved:true}}
 const policy=(await db.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='calculator_history'::regclass")).rows[0];assert(policy.relrowsecurity&&policy.relforcerowsecurity);
 const gate=(await db.query("SELECT tgenabled FROM pg_trigger WHERE tgname='enforce_kot_authority'")).rows;assert.equal(gate[0].tgenabled,'O');
 const grants=(await db.query("SELECT privilege_type FROM information_schema.role_table_grants WHERE grantee='dinerdost_app' AND table_name='calculator_history' ORDER BY privilege_type")).rows.map(row=>row.privilege_type);assert.deepEqual(grants,['DELETE','INSERT','SELECT','UPDATE']);
 const remaining=(await db.query("SELECT count(*)::int AS count FROM pg_database WHERE datname LIKE 'dd_verify_%'")).rows[0].count;assert.equal(remaining,0);
 await writeFile('verification/production-migration-0417.json',JSON.stringify({checkedAt:new Date().toISOString(),migrations,pendingBefore:pending,applied:true,immutableHistory:preserved,tenantRlsEnforced:true,kotGateEnabled:true,grants,isolatedVerificationDatabases:remaining,migrationScope:'Add only personal calculator history; no financial, stock, kitchen-policy, loyalty or adjustment-default data changed.'},null,2)+'\n');console.log('Calculator history table added with forced tenant RLS; prior immutable history preserved.');
}finally{await db.close()}
