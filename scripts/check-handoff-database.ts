import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {dirname,resolve,sep} from 'node:path';
import {createPostgresDatabase} from '@dinerdost/database';

/** Read-only inventory/checksums. Never creates schema, seeds data, or runs migrations. */
async function main(){
 const option=(name:string)=>process.argv.slice(2).find(arg=>arg.startsWith(name+'='))?.slice(name.length+1);
 const env=option('--env');if(env)process.loadEnvFile(resolve(env));
 // Use the same runtime URL as the deployment. Never silently fall back to local/another database.
 const url=process.env.DATABASE_URL;assert(url,'DATABASE_URL is required.');
 const parsed=new URL(url);assert(['postgres:','postgresql:'].includes(parsed.protocol),'Expected PostgreSQL.');
 const output=resolve(option('--out')??'verification/database-handoff-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');
 const privateDirectory=resolve('verification');assert(output.startsWith(privateDirectory+sep),'Write the private report under the ignored verification directory.');
 const db=createPostgresDatabase(url);
 try{
  const sourceMigrations=(await readdir('packages/database/migrations')).filter(name=>name.endsWith('.sql')).sort();
  const state=await db.transaction(null,async tx=>{
   await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
   assert.equal((await tx.query('SHOW transaction_read_only')).rows[0].transaction_read_only,'on');
   const applied=(await tx.query<{name:string}>('SELECT name FROM schema_migrations ORDER BY name')).rows.map(row=>row.name);
   assert.deepEqual(applied,sourceMigrations,'Database migrations differ from this checkout; stop and review without auto-migrating.');
   const tables=(await tx.query<{name:string}>('SELECT tablename AS name FROM pg_tables WHERE schemaname=\'public\' ORDER BY tablename')).rows;
   const rows:Record<string,{count:number;digest:string}>={};
   for(const {name} of tables){assert.match(name,/^[a-z][a-z0-9_]*$/);const result=(await tx.query<{count:string;digest:string}>(`SELECT count(*)::text AS count,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' ORDER BY md5(to_jsonb(t)::text)),'')) AS digest FROM "${name}" t`)).rows[0];rows[name]={count:Number(result.count),digest:result.digest};}
   const protections=(await tx.query<{table_name:string;rls:boolean;forced:boolean}>("SELECT relname AS table_name,relrowsecurity AS rls,relforcerowsecurity AS forced FROM pg_class JOIN pg_namespace n ON n.oid=relnamespace WHERE n.nspname='public' AND relname IN ('invoices','payment_attempts','stock_batches','uploaded_assets','web_refunds') ORDER BY relname")).rows;
   assert.equal(protections.length,5);assert(protections.every(row=>row.rls&&row.forced),'Required tenant RLS is missing.');
   assert.equal((await tx.query("SELECT tgenabled FROM pg_trigger WHERE tgname='enforce_kot_authority'")).rows[0]?.tgenabled,'O','KOT authority gate must remain enabled.');
   await tx.query('SET LOCAL ROLE dinerdost_app');
   assert.equal((await tx.query('SELECT current_user AS role')).rows[0].role,'dinerdost_app');
   // No tenant is selected: an application role must not see invoices from every restaurant.
   assert.equal(Number((await tx.query('SELECT count(*) AS n FROM invoices')).rows[0].n),0,'Tenantless invoice access must be empty.');
   return{migrations:applied,tables:rows,tenantRls:protections,kotAuthorityEnabled:true,applicationRoleSwitchPassed:true,tenantlessInvoiceReadBlocked:true,readOnlyTransaction:true};
  });
  const identity=parsed.hostname.toLowerCase().replace(/-pooler(?=\.)/,'')+parsed.pathname;
  const fingerprint=createHash('sha256').update(identity).digest('hex');
  const comparePath=option('--compare');let comparison:undefined|{sameDatabaseEndpoint:boolean;allTableDataMatches:boolean;changedTables:string[]};
  if(comparePath){const prior=JSON.parse(await readFile(resolve(comparePath),'utf8'));const allTables=new Set([...Object.keys(prior.tables??{}),...Object.keys(state.tables)]);const changedTables=[...allTables].filter(name=>prior.tables?.[name]?.count!==state.tables[name]?.count||prior.tables?.[name]?.digest!==state.tables[name]?.digest);comparison={sameDatabaseEndpoint:prior.databaseEndpointFingerprint===fingerprint,allTableDataMatches:changedTables.length===0,changedTables};}
  const report={checkedAt:new Date().toISOString(),databaseEndpointFingerprint:fingerprint,...state,...(comparison?{comparison}:{}),notice:'Private aggregate checksums only; not a database backup. A comparison difference needs review and never authorizes resets/deletions.'};
  await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({report:output,migrations:state.migrations.length,tables:Object.keys(state.tables).length,readOnly:true,roleAndRlsChecked:true,...(comparison?{comparison}:{})}));
  if(comparison&&(!comparison.sameDatabaseEndpoint||!comparison.allTableDataMatches))process.exitCode=2;
 }finally{await db.close()}
}
main().catch(()=>{console.error('Read-only handoff check failed. No migrations, seeds or data writes were attempted. Check access/configuration privately.');process.exitCode=1});
