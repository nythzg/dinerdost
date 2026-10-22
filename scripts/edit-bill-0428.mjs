import {readFile,writeFile} from 'node:fs/promises';
async function edit(path,fn){const source=await readFile(path,'utf8');await writeFile(path,fn(source));}
const replace=(s,a,b)=>{if(!s.includes(a))throw new Error('Missing '+a.slice(0,100));return s.replace(a,b)};
for(const file of ['orders.ts','guest.ts','storefronts.ts'])await edit('packages/services/src/'+file,s=>{s="import {snapshotWebBillDefaults} from './web-bill-policy';\n"+s;return s.replace(/(await snapshotWebKitchenPolicy\(tx,([^;]+)\);)/g,'$1\n      await snapshotWebBillDefaults(tx,$2);')});
await edit('packages/services/src/index.ts',s=>s+"\nexport * from './web-bill-policy';\n");
for(const file of ['order-adjustments.ts','order-charges.ts'])await edit('packages/services/src/'+file,s=>{
 s="import {requireWebBillEditable} from './web-bill-policy';\n"+s;
 s=replace(s,'import { orderDetail, resetRewards } from "./orders";','import { orderDetail, resetRewards, evaluateEntitlements, releaseKot } from "./orders";');
 s=replace(s,'  input: unknown,\n) {','  input: unknown,\n  webFlow = false,\n) {');
 s=replace(s,'      ensure(\n        ["DRAFT", "PENDING", "ACCEPTED"].includes(round.status)',`      if(webFlow)await requireWebBillEditable(tx,actor,order,round);
      else { ensure(
        ["DRAFT", "PENDING", "ACCEPTED"].includes(round.status)`);
 const end=s.indexOf('      const items = (');if(end<0)throw new Error('Items');s=s.slice(0,end)+'      }\n'+s.slice(end);
 const before='      await resetRewards(tx, roundId);',payable=file==='order-adjustments.ts'?'beforeRounding + roundOff':'payable + roundOff';
 s=replace(s,before,`      ensure(${payable}>=num(round.paid),'PAYABLE_BELOW_RECEIVED','The new payable cannot be below the amount already received.',409);
${before}`);
 s=replace(s,'      await tx.query("UPDATE orders SET version=version+1 WHERE id=$1", [',`      if(webFlow){
        const nextPayable=${payable};
        await tx.query("UPDATE order_rounds SET payment_status=$2 WHERE id=$1",[roundId,num(round.paid)>0?(num(round.paid)===nextPayable?'PAID':'PARTIALLY_PAID'):'UNPAID']);
        if(order.customer_id)await evaluateEntitlements(tx,actor,orderId,roundId);
        if(num(round.paid)>0&&num(round.paid)===nextPayable)await releaseKot(tx,actor,order,await one(tx,'SELECT * FROM order_rounds WHERE id=$1',[roundId]));
      }
      await tx.query("UPDATE orders SET version=version+1 WHERE id=$1", [`);
 return s;
});
await edit('apps/web/src/app/api/commands/route.ts',s=>{
 for(const call of ['changeRoundAdjustments','changeRoundCharges']){const start=s.indexOf('result = await service.'+call+'('),end=s.indexOf('        );',start);if(start<0||end<0)throw new Error(call);s=s.slice(0,end)+'          !actor.application || actor.application === "MASTER",\n'+s.slice(end)}
 return replace(s,'      case "kitchenStages":','      case "billDefaults":\n        result=await service.saveBillDefaults(db,actor,key,data.input);\n        break;\n      case "kitchenStages":');
});
await edit('apps/web/src/features/orders/order-pages.tsx',s=>{
 s=replace(s,'  const chargeRounds =',`  const editableRound=(r:Row)=>['DRAFT','PENDING','ACCEPTED'].includes(r.status)&&r.payment_status!=='PAID'&&Number(r.paid)<Math.max(1,Number(r.payable))&&!order.invoices.some((invoice:Row)=>invoice.document_type==='FINAL_TAX_INVOICE')&&!r.payments.some((p:Row)=>['INITIATED','AWAITING_VERIFICATION','UNKNOWN'].includes(p.state));
  const chargeRounds =`);
 const from=s.indexOf('      ? liveRounds.filter('),to=s.indexOf('      : [];',from);if(from<0||to<0)throw new Error('Charge rounds');s=s.slice(0,from)+'      ? liveRounds.filter(editableRound)\n'+s.slice(to);
 const fromSome=s.indexOf('                order.rounds.some('),toSome=s.indexOf(') && (',fromSome);if(fromSome<0||toSome<0)throw new Error('Adjustment visibility');s=s.slice(0,fromSome)+'                order.rounds.some(editableRound'+s.slice(toSome);
 const fromFilter=s.indexOf('                          rounds={order.rounds.filter('),toFilter=s.indexOf('                          save={(roundId, input)',fromFilter);if(fromFilter<0||toFilter<0)throw new Error('Adjustment filter');s=s.slice(0,fromFilter)+'                          rounds={order.rounds.filter(editableRound)}\n'+s.slice(toFilter);
 s=replace(s,'              <h2>\n                <T>{"Bill summary"}</T>\n              </h2>',`              <h2>
                <T>{"Bill summary"}</T>
              </h2>
              {isManager(data.actor)&&<button className="text-button" onClick={()=>form('Future bill rounding',[{name:'roundDown',label:'Round down to ₹1 for new transactions',type:'select',value:outlet?.web_round_down_default?'on':'off',options:[{value:'off',label:'Off'},{value:'on',label:'On'}],help:'Outlet-wide. Applies to future web rounds only. Existing bills and discounts remain unchanged.'}],values=>run('billDefaults',{outletId:order.outlet_id,version:outlet.version,roundDown:values.roundDown==='on'}),'Save rounding default')}>Future rounding: {outlet?.web_round_down_default?'On':'Off'}</button>}`);
 return s;
});
console.log('Future rounding and guarded web bill editing implemented.');
