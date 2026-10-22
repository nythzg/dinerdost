import assert from 'node:assert/strict';
import {readdir,writeFile} from 'node:fs/promises';
import {createPostgresDatabase} from '@dinerdost/database';
process.loadEnvFile('.env.production.local');
const connection=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL_UNPOOLED||process.env.POSTGRES_URL_NON_POOLING||process.env.DATABASE_URL;assert(connection);
const db=createPostgresDatabase(connection),migrations=['045_material_setup_and_packs.sql'];
async function frozen(){const result:Record<string,{id:string;digest:string}[]>={};for(const [name,sql] of [
 ['invoices','SELECT id::text AS id,md5(snapshot::text) AS digest FROM invoices'],
 ['itemCosts','SELECT order_item_id::text AS id,md5(row_to_json(c)::text) AS digest FROM order_item_costs c'],
 ['stockMovements','SELECT id::text AS id,md5(row_to_json(m)::text) AS digest FROM stock_movements m'],
 ['preparedMovements','SELECT id::text AS id,md5(row_to_json(m)::text) AS digest FROM prepared_food_movements m'],
 ['ingredientUnitsAndRates',"SELECT id::text AS id,md5(jsonb_build_object('unit',unit,'purchase_rate',purchase_rate)::text) AS digest FROM ingredients"],
 ['stockBatches',"SELECT id::text AS id,md5((to_jsonb(b)-'purchase_pack_snapshot')::text) AS digest FROM stock_batches b"],
 ['preparedFood','SELECT id::text AS id,md5(row_to_json(p)::text) AS digest FROM prepared_food_batches p']
])result[name]=(await db.query<{id:string;digest:string}>(sql)).rows;return result}
try{
 const applied=(await db.query('SELECT name FROM schema_migrations')).rows.map(row=>String(row.name));
 const pending=(await readdir('packages/database/migrations')).filter(name=>name.endsWith('.sql')&&!applied.includes(name));assert.deepEqual(pending,migrations.filter(name=>!applied.includes(name)),'Only reviewed material metadata, pack definitions and receipt snapshots may be added.');
 const before=await frozen();await db.migrate();const after=await frozen(),preserved:Record<string,unknown>={};
 for(const name of Object.keys(before)){const current=new Map(after[name].map(row=>[row.id,row.digest]));assert(before[name].every(row=>current.get(row.id)===row.digest),name+' changed');preserved[name]={priorCount:before[name].length,preserved:true}}
 const policy=(await db.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='ingredient_purchase_packs'::regclass")).rows[0];assert(policy.relrowsecurity&&policy.relforcerowsecurity);
 const gate=(await db.query("SELECT tgenabled FROM pg_trigger WHERE tgname='enforce_kot_authority'")).rows;assert.equal(gate[0].tgenabled,'O');
 const grants=(await db.query("SELECT privilege_type FROM information_schema.role_table_grants WHERE grantee='dinerdost_app' AND table_name='ingredient_purchase_packs' ORDER BY privilege_type")).rows.map(row=>row.privilege_type);assert.deepEqual(grants,['INSERT','SELECT','UPDATE']);
 const remaining=(await db.query("SELECT count(*)::int AS count FROM pg_database WHERE datname LIKE 'dd_verify_%'")).rows[0].count;assert.equal(remaining,0);
 await writeFile('verification/production-migration-0419.json',JSON.stringify({checkedAt:new Date().toISOString(),migrations,pendingBefore:pending,applied:true,immutableHistory:preserved,tenantRlsEnforced:true,kotGateEnabled:true,grants,isolatedVerificationDatabases:remaining,migrationScope:'Add optional material metadata and buying-pack definitions/snapshots; no base units, purchase rates, balances, costs, prepared deadlines, financial history or permission policy changed.'},null,2)+'\n');console.log('Material setup schema added with forced tenant RLS; prior units, rates, balances, deadlines and immutable history preserved.');
}finally{await db.close()}
