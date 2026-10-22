import {randomBytes,randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {createPostgresDatabase} from '@dinerdost/database';
import {signup} from '@dinerdost/services';
process.loadEnvFile('.env.production.local');
const connection=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL_UNPOOLED||process.env.POSTGRES_URL_NON_POOLING||process.env.DATABASE_URL;
if(!connection)throw Error('Production fixture connection missing');
const db=createPostgresDatabase(connection);
try{
 const nonce=randomUUID(),email=`material-setup-release-${nonce}@example.test`,password=randomBytes(30).toString('base64url');
 await signup(db,{name:'Material setup release QA',email,password,restaurant:'Material setup release isolated QA',outlet:'Main',qrEnabled:true,demo:true},'qa-fixture-0419-'+nonce);
 await writeFile('verification/.qa-production-0419-fixture.json',JSON.stringify({email,password})+'\n',{mode:0o600});
 const count=(await db.query("SELECT count(*)::int AS count FROM pg_database WHERE datname LIKE 'dd_verify_%'")).rows[0].count;
 console.log(JSON.stringify({fixturePrepared:true,scope:'One synthetic QA tenant; normal UI sign-in; no public authentication/rate-limit changes',verificationDatabasesCurrentlyRunning:count}));
}finally{await db.close()}
