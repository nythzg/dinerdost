import './platform-data-qa-fixture';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createEmbeddedDatabase} from '@dinerdost/database';
import {businessDate} from '@dinerdost/core';
import * as s from '@dinerdost/services';
const file='../work/platform-browser-fixture.json',fixture=JSON.parse(await readFile(file,'utf8'));
if(!/^\.data\/platform-qa-\d+$/.test(fixture.path))throw new Error('An isolated platform QA source is required.');
const db=await createEmbeddedDatabase(fixture.path),key=()=>randomUUID(),reason='Isolated operational browser setup';
try{
 const login=await s.login(db,{email:fixture.admin,password:fixture.password},'ops-fixture'),admin=await s.authenticate(db,login.token);
 const save=(kind:string,name:string,data:any,tenantId?:string)=>s.savePlatformRecord(db,admin,key(),{kind,name,data,tenantId,version:0,reason});
 const brand=(await save('BRAND','Operations QA brand',{legalName:'Synthetic business only'})).id;
 await s.savePlatformTenant(db,admin,key(),{tenantId:fixture.tenantId,version:0,status:'ACTIVE',kyc:'VERIFIED',brandId:brand,planId:null,businessType:'RESTAURANT',gstin:'',license:'',notes:'Synthetic fixture only',reason});
 const tax=(await save('TAX_TEMPLATE','Operations QA tax',{jurisdiction:'Synthetic only',taxName:'QA tax',rate:7.25})).id,tag=(await save('TAXONOMY','Operations QA tag',{type:'DIETARY',description:'Synthetic explicit classification'})).id,role=(await save('ROLE_TEMPLATE','Operations QA waiter',{role:'WAITER',notes:'Standard waiter permissions'})).id;
 const plan=(await save('PLAN','Operations QA monthly',{fee:100,cycle:'MONTHLY',features:['pos','qr','inventory','reports']})).id,subscription=(await save('SUBSCRIPTION','Operations QA contract',{planId:plan,status:'ACTIVE',start:businessDate()},fixture.tenantId)).id,ticket=(await save('TICKET','Operations QA case',{type:'SUPPORT',priority:'HIGH',status:'OPEN',description:'Synthetic browser support case'},fixture.tenantId)).id;
 const item=(await db.query<any>('SELECT id FROM menu_items WHERE restro_id=$1 AND outlet_id=$2 ORDER BY name LIMIT 1',[fixture.tenantId,fixture.outletId])).rows[0].id;
 const adminTenant=(await s.workspace(db,admin)).restaurant.id;
 await writeFile('../work/platform-operations-browser-fixture.json',JSON.stringify({...fixture,brand,tax,tag,role,subscription,ticket,item,adminTenant,operations:true}));
 console.log('Separate operational browser fixture prepared.');
}finally{await db.close()}
