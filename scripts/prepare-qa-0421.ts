import {randomBytes,randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {createPostgresDatabase} from '@dinerdost/database';
import * as s from '@dinerdost/services';
process.loadEnvFile('.env.production.local');
const db=createPostgresDatabase(process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL_UNPOOLED||process.env.POSTGRES_URL_NON_POOLING||process.env.DATABASE_URL!);
try{const nonce=randomUUID(),email=`ui-release-${nonce}@example.test`,password=randomBytes(30).toString('base64url');await s.signup(db,{name:'UI release QA',email,password,restaurant:'UI release isolated QA',outlet:'Main',qrEnabled:true,demo:true},'qa-fixture-0421-'+nonce);await writeFile('verification/.qa-production-0421-fixture.json',JSON.stringify({email,password})+'\n',{mode:0o600});console.log('Fresh isolated UI QA tenant prepared.');}finally{await db.close()}
