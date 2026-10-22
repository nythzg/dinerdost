import {writeFile} from 'node:fs/promises';
import {createPostgresDatabase} from '@dinerdost/database';
process.loadEnvFile('.env.production.local');
const db=createPostgresDatabase(process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL_UNPOOLED||process.env.POSTGRES_URL_NON_POOLING||process.env.DATABASE_URL!);
try{const rows=(await db.query("SELECT t.label,t.floor,(t.retired_at IS NOT NULL) AS retired,o.code AS outlet_code FROM dining_tables t JOIN outlets o ON o.id=t.outlet_id AND o.restro_id=t.restro_id WHERE (o.code='N1' OR o.name='N1') AND t.label='3' ORDER BY t.floor,t.retired_at NULLS FIRST")).rows;const result={checkedAt:new Date().toISOString(),scope:"Read-only: label 3 within the previously pictured N1 outlet only. No session/order/customer/payment data queried or modified.",matches:rows};await writeFile('verification/table-name-115-triage.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));}finally{await db.close()}
