import {randomBytes,randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {createPostgresDatabase} from '@dinerdost/database';
import * as s from '@dinerdost/services';
process.loadEnvFile('.env.production.local');
const connection=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL_UNPOOLED||process.env.POSTGRES_URL_NON_POOLING||process.env.DATABASE_URL;if(!connection)throw Error('Production fixture connection missing');
const db=createPostgresDatabase(connection);
try{
 const nonce=randomUUID(),email=`priority-release-${nonce}@example.test`,password=randomBytes(30).toString('base64url');
 const account=await s.signup(db,{name:'Priority release QA',email,password,restaurant:'Priority release isolated QA',outlet:'Main',qrEnabled:true,demo:true},'qa-fixture-0420-'+nonce),actor=await s.authenticate(db,account.token),w=await s.workspace(db,actor);
 const legacy:Record<string,string>={};
 for(const [index,kind] of ['pendingOrderOnly','acceptedOrderOnly','acceptedPayment'].entries()){
  const outlet=(await s.workspace(db,actor)).outlets[0],mode=kind==='acceptedPayment'?'PAYMENT':'ORDER_ONLY';await s.saveOutlet(db,actor,randomUUID(),{id:outlet.id,version:outlet.version,name:outlet.name,code:outlet.code,address:outlet.address,gstin:outlet.gstin,qrEnabled:true,qrPaymentMode:mode,paymentPolicy:'PREPAID',taxBps:Number(outlet.tax_bps),earnBps:Number(outlet.earn_bps)});
  const table=w.tables[index+1],device=randomUUID();await s.openSession(db,actor,randomUUID(),{tableId:table.id,guests:1});const visit=await s.connectGuest(db,table.public_key,device,randomUUID());const guest=await s.guestSubmit(db,table.public_key,visit.token,device,randomUUID(),{name:'Legacy QR Release Guest',phone:'9123456714',items:[{itemId:w.menu[0].id,quantity:1}]});legacy[kind]=guest.id;
  if(kind!=='pendingOrderOnly'){const order=await s.getOrder(db,actor,guest.id);await s.decideRound(db,actor,randomUUID(),order.id,order.rounds[0].id,{version:order.rounds[0].version,decision:'ACCEPT'})}
 }
 await writeFile('verification/.qa-production-0420-fixture.json',JSON.stringify({email,password,legacy})+'\n',{mode:0o600});console.log('One isolated synthetic QA tenant prepared, including three legacy QR cases; normal UI sign-in will be used.');
}finally{await db.close()}
