import assert from 'node:assert/strict';
import {readdir,writeFile} from 'node:fs/promises';
import {createPostgresDatabase} from '@dinerdost/database';
process.loadEnvFile('.env.production.local');
const connection=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL_UNPOOLED||process.env.POSTGRES_URL_NON_POOLING||process.env.DATABASE_URL;
assert(connection);const db=createPostgresDatabase(connection);
try{
 const applied=(await db.query('SELECT name FROM schema_migrations')).rows.map(row=>String(row.name));
 const pending=(await readdir('packages/database/migrations')).filter(name=>name.endsWith('.sql')&&!applied.includes(name));assert.deepEqual(pending,[]);
 const gate=(await db.query("SELECT tgenabled FROM pg_trigger WHERE tgname='enforce_kot_authority'")).rows;assert.equal(gate[0].tgenabled,'O');
 const isolated=(await db.query("SELECT count(*)::int AS count FROM pg_database WHERE datname LIKE 'dd_verify_%'")).rows[0].count;assert.equal(isolated,0);
 await writeFile('verification/production-schema-0416.json',JSON.stringify({checkedAt:new Date().toISOString(),pendingMigrations:pending,schemaChanged:false,kotGateEnabled:true,temporaryHostedDatabasesRemaining:isolated,lastApplied:applied.sort().at(-1)},null,2)+'\n');
 console.log('No schema migration; KOT authority intact; no disposable verification databases remain.');
}finally{await db.close()}
