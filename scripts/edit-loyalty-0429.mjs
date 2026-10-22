import {readFile,writeFile} from 'node:fs/promises';
const replace=(s,a,b)=>{if(!s.includes(a))throw new Error('Missing '+a.slice(0,90));return s.replace(a,b)};
async function edit(p,fn){await writeFile(p,fn(await readFile(p,'utf8')))}
await edit('packages/services/src/index.ts',s=>s+"\nexport * from './web-loyalty';\n");
await edit('packages/services/src/workspace.ts',s=>replace("import {isPlatformLoyaltyAdmin} from './web-loyalty';\n"+s,'      outletId: selected,','      outletId: selected,\n      ...(!actor.application||actor.application===\'MASTER\'?{platformLoyaltyAdmin:isPlatformLoyaltyAdmin(actor)}:{}),'));
await edit('packages/services/src/orders.ts',s=>{
 s="import {webLoyaltyLimit} from './web-loyalty';\n"+s;
 s=replace(s,'    estimatedEarn: points,','    ...(!actor.application||actor.application===\'MASTER\'?{webLoyalty:await webLoyaltyLimit(tx,order,round,outlet,Math.max(0,num(balance.points)-num(reserved.points)))}:{}),\n    estimatedEarn: points,');
 const start=s.indexOf('export async function applyEntitlement('),end=s.indexOf('export async function releaseKot(',start);let fn=s.slice(start,end);
 fn=replace(fn,'  input: unknown,\n) {','  input: unknown,\n  webFlow=false,\n) {');
 fn=replace(fn,'      couponId: z.uuid().nullable().optional(),','      couponId: z.uuid().nullable().optional(),\n      couponCode:z.string().trim().min(1).max(80).optional(),\n      amount:z.number().int().min(0).max(1000000000).optional(),');
 fn=replace(fn,'    .parse(input);','    .parse(input);\n  ensure(webFlow||(!data.couponCode&&data.amount===undefined),\'APPLICATION_FORBIDDEN\',\'Use the web reward workflow for rupee claims or coupon codes.\',403);\n  ensure(!webFlow||!actor.application||actor.application===\'MASTER\',\'APPLICATION_FORBIDDEN\',\'Use the application reward workflow.\',403);');
 fn=replace(fn,'      ensure(\n        !(data.couponId && data.points),',`      ensure(!(data.couponId&&data.couponCode),'INVALID_COUPON','Use a coupon code or a selected coupon, not both.');
      if(data.couponCode){const match=await one(tx,'SELECT id FROM coupons WHERE outlet_id=$1 AND lower(code)=lower($2)',[order.outlet_id,data.couponCode],'Coupon code not found.');data.couponId=String(match.id);}
      ensure(
        !(data.couponId && (data.points||data.amount)),`);
 fn=replace(fn,'      await resetRewards(tx, roundId);',`      if(data.amount!==undefined){const pointValue=num(outlet.point_value_paise);ensure(data.points===0&&pointValue>0&&data.amount%pointValue===0,'INVALID_REDEMPTION','Enter an amount in valid point-value increments.');data.points=data.amount/pointValue;}
      await resetRewards(tx, roundId);`);
 fn=replace(fn,'        discount = data.points * num(outlet.point_value_paise);',`        discount = data.points * num(outlet.point_value_paise);
        if(webFlow){const limit=await webLoyaltyLimit(tx,order,round,outlet,balance.spendablePoints);ensure(discount<=limit.maxRedemptionAmount,'REDEMPTION_CAP','The selected amount exceeds the remaining per-bill loyalty limit.',409);}`);
 s=s.slice(0,start)+fn+s.slice(end);
 s=replace(s,'    round.payments = (',`    if(!actor.application||actor.application==='MASTER')round.coupon_code=(await tx.query("SELECT code FROM coupons WHERE round_id=$1 AND state IN ('RESERVED','LOCKED','REDEEMED') LIMIT 1",[round.id])).rows[0]?.code??null;
    round.payments = (`);
 return s;
});
await edit('apps/web/src/app/api/commands/route.ts',s=>{
 s=replace(s,'      case "billDefaults":','      case "loyaltyCap":\n        result=await service.savePlatformLoyaltyCap(db,actor,key,data.input);\n        break;\n      case "billDefaults":');
 const start=s.indexOf('result = await service.applyEntitlement('),end=s.indexOf('        );',start);if(start<0||end<0)throw new Error('Reward command');return s.slice(0,end)+'          !actor.application || actor.application === "MASTER",\n'+s.slice(end);
});
await edit('apps/web/src/features/orders/order-pages.tsx',s=>{
 const start=s.indexOf('                      onClick={() =>\n                        form(\n                          "Claim loyalty points",'),end=s.indexOf('                    >\n                      <T>{"Claim loyalty points"}',start);if(start<0||end<0)throw new Error('Loyalty form');
 s=s.slice(0,start)+`                      onClick={()=>{void action('reviewRewards',{},extra).then(result=>{const limit=result.entitlements.webLoyalty;form('Claim loyalty points',[{name:'amount',label:'Loyalty amount (₹)',type:'number',min:0,max:limit.maxRedemptionAmount/100,step:limit.pointValue/100,value:0,help:'Maximum '+money(limit.maxRedemptionAmount)+' for this round; '+money(limit.remainingOrderCap)+' remains on this bill. Verified phone required. Replaces any coupon.'}],values=>action('reward',{version:result.order.rounds.find((r:Row)=>r.id===round.id).version,amount:Math.round(Number(values.amount)*100)},extra),'Claim loyalty')}).catch(()=>{})}}
`+s.slice(end);
 s=replace(s,'            <div className="total-row grand-total">',`            {order.rounds.some((r:Row)=>r.coupon_code)&&<div className="total-row"><span>Coupon</span><strong>{order.rounds.filter((r:Row)=>r.coupon_code).map((r:Row)=>r.coupon_code).join(', ')}</strong></div>}
            {!locked&&order.customer_id&&can(data.actor,'orders')&&order.rounds.some((r:Row)=>Number(r.paid)===0&&['PENDING','ACCEPTED'].includes(r.status)&&(r.kot_status==='HELD'||['STAFF','QR_ORDER_ONLY'].includes(r.payment_gate)))&&<button className="button full-width" onClick={()=>{const eligible=order.rounds.filter((r:Row)=>Number(r.paid)===0&&r.payment_status!=='PAID'&&['PENDING','ACCEPTED'].includes(r.status)&&(r.kot_status==='HELD'||['STAFF','QR_ORDER_ONLY'].includes(r.payment_gate)));if(!eligible.length)return;form('Apply coupon',[...(eligible.length>1?[{name:'roundId',label:'Round',type:'select' as const,value:eligible[0].id,options:eligible.map((r:Row)=>({value:r.id,label:'Round '+r.round_number}))}]:[]),{name:'code',label:'Coupon code',help:'Replaces any loyalty claim on this round.'}],values=>{const r=eligible.find((r:Row)=>r.id===(values.roundId??eligible[0].id));return action('reward',{version:r.version,couponCode:String(values.code).trim(),points:0},{roundId:r.id})},'Apply coupon')}}>Coupon</button>}
            <p className="muted">Loyalty cap: {money(outlet?.web_loyalty_cap_paise??5000)} per bill · managed by Diner Dost.</p>
            {data.platformLoyaltyAdmin&&<button className="text-button" onClick={()=>form('Platform loyalty limit',[{name:'limit',label:'Maximum per bill (₹)',type:'number',min:0,max:10000000,step:.01,value:Number(outlet.web_loyalty_cap_paise)/100,help:'Does not rewrite earlier claims.'}],v=>run('loyaltyCap',{outletId:outlet.id,version:outlet.version,limit:Math.round(v.limit*100)}),'Save loyalty limit')}>Configure loyalty cap</button>}
            <div className="total-row grand-total">`);
 return s;
});
console.log('Per-bill web loyalty cap, separate rupee claim and coupon-code entry implemented.');
