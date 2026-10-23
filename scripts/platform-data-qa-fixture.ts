import './platform-qa-fixture';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createEmbeddedDatabase} from '@dinerdost/database';
import * as s from '@dinerdost/services';

const file='../work/platform-browser-fixture.json',fixture=JSON.parse(await readFile(file,'utf8'));
if(!/^\.data\/platform-qa-\d+$/.test(fixture.path))throw new Error('Only a freshly created isolated QA database may be seeded.');
const db=await createEmbeddedDatabase(fixture.path),key=()=>randomUUID();
try{
 const login=await s.login(db,{email:fixture.owner,password:fixture.password},'data-browser-setup'),actor=await s.authenticate(db,login.token),w=await s.workspace(db,actor);
 const second=await s.saveOutlet(db,actor,key(),{name:'Empty QA outlet',code:'EMPTY',qrEnabled:false,taxBps:0});
 const order=await s.createRound(db,actor,key(),{outletId:w.outletId,type:'TAKEAWAY',items:[{itemId:w.menu[0].id,quantity:1}],customer:{name:'Private browser diner',phone:'9187654321'}},true);
 await s.recordPayment(db,actor,key(),order.id,order.rounds[0].id,{version:order.rounds[0].version,method:'CASH',amount:Number(order.rounds[0].payable)},true);
 await s.generateBill(db,actor,key(),order.id,{final:false});
 await s.signup(db,{name:'Unflagged QA owner',email:'unflagged-'+key()+'@example.test',password:fixture.password,restaurant:'Unflagged QA registration',outlet:'Empty main',qrEnabled:false,demo:false},'unflagged-qa');
 await writeFile(file,JSON.stringify({...fixture,secondOutletId:second.id,expectedReceipt:Number(order.rounds[0].payable)}));
 console.log('Isolated linked-data browser fixture prepared.');
}finally{await db.close()}
