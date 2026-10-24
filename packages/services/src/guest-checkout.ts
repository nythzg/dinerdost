import {z} from 'zod';
import type {Sql} from '@dinerdost/database';
import {customerName,normalizePhone,ensure,integer,quote,roundAdjustment,taxBreakdown} from '@dinerdost/core';
import {buildItems,roundInput} from './orders';
import {num,one,type Row} from './shared';
import {ownDeviceIdentities} from './public-identities';
import {guardPlatformCommand} from './platform-policy';
import {webLoyaltyLimit} from './web-loyalty';

export const guestCheckoutInput=z.object({items:roundInput.shape.items,name:z.string().max(200).default(''),phone:z.string().max(40).default(''),couponCode:z.string().trim().min(1).max(80).optional(),loyaltyAmount:z.number().int().min(0).max(1000000000).default(0)}).strict();
const emptyId='00000000-0000-0000-0000-000000000000';
/** Read-only preview. Ordering rechecks eligibility and reserves rewards in its own transaction. */
export async function quoteGuestCheckout(tx:Sql,grant:Row,data:z.infer<typeof guestCheckoutInput>){
 if(data.couponCode||data.loyaltyAmount)await guardPlatformCommand(tx,{role:'CUSTOMER',application:'MASTER'},data.couponCode?'COUPON_RESERVED':'LOYALTY_RESERVED',data);
 const outlet=await one(tx,'SELECT * FROM outlets WHERE id=$1',[grant.outlet_id]);
 const prior=grant.order_id?(await tx.query<Row>('SELECT * FROM orders WHERE id=$1 AND outlet_id=$2',[grant.order_id,grant.outlet_id])).rows[0]:null;
 const order=prior&&!['SETTLED','VOIDED','REJECTED'].includes(prior.status)?prior:null;
 let customer:Row|undefined;
 if(order?.customer_id)customer=await one(tx,'SELECT * FROM customers WHERE id=$1',[order.customer_id]);
 else if(data.name.trim()&&data.phone.trim())customer=(await tx.query<Row>('SELECT * FROM customers WHERE phone=$1 AND lower(name)=lower($2)',[normalizePhone(data.phone),customerName(data.name)])).rows[0];
 const recognized=!!customer&&(order?.customer_id===customer.id||(await ownDeviceIdentities(tx,grant.outlet_id,grant.device_hash)).some(identity=>identity.id===customer!.id));
 const components=order?order.tax_components:outlet.tax_components,override=order?order.tax_bps_override:components!==null?num(outlet.tax_bps):null;
 const items=await buildItems(tx,grant.outlet_id,data.items,override,true,'DINE_IN'),lines=items.map(item=>({unit_price:num(item.unit_price),quantity_milli:num(item.quantity_milli),tax_bps:num(item.tax_bps)})),base=quote(lines);
 const charges:Row[]=order?[]:(outlet.web_default_charges??[]),chargesTotal=integer(charges.reduce((sum,charge)=>sum+num(charge.amount),0),'Other charges');
 let spendable=0;
 if(recognized){const balance=await one(tx,`SELECT coalesce((SELECT sum(points) FROM loyalty_ledger WHERE customer_id=$1 AND state<>'PENDING_EARN'),0)-coalesce((SELECT sum(points) FROM loyalty_reservations WHERE customer_id=$1 AND state IN ('RESERVED','LOCKED') AND (reserved_until IS NULL OR reserved_until>now())),0) AS points`,[customer!.id]);spendable=Math.max(0,num(balance.points));}
 const limit=num(outlet.point_value_paise)>0?await webLoyaltyLimit(tx,order??{id:emptyId},{id:emptyId,subtotal:base.subtotal},outlet,spendable):{pointValue:1,maxRedemptionAmount:0};
 ensure(!(data.couponCode&&data.loyaltyAmount),'STACKING_NOT_ALLOWED','Choose either a coupon or loyalty rewards.');
 let discount=0,discountLabel='Discount';
 if(data.couponCode){
  const definitions=(await tx.query<Row>('SELECT *,expires_at>clock_timestamp() AS unexpired FROM web_discount_coupons WHERE outlet_id=$1 AND lower(code)=lower($2)',[grant.outlet_id,data.couponCode])).rows;
  const legacy=(await tx.query<Row>('SELECT * FROM coupons WHERE outlet_id=$1 AND web_discount_coupon_id IS NULL AND lower(code)=lower($2)',[grant.outlet_id,data.couponCode])).rows;
  ensure(definitions.length+legacy.length===1,'COUPON_NOT_FOUND','Enter an eligible coupon code.',422);
  const coupon=definitions[0]??legacy[0];
  if(definitions.length){ensure(coupon.active&&coupon.unexpired,'COUPON_INELIGIBLE','This coupon is expired or has been removed.',409);const used=await one(tx,"SELECT count(*) AS count FROM coupons WHERE web_discount_coupon_id=$1 AND (state IN ('LOCKED','REDEEMED') OR (state='RESERVED' AND reserved_until>clock_timestamp()))",[coupon.id]);ensure(num(used.count)<num(coupon.max_uses),'COUPON_EXHAUSTED','This coupon has no uses remaining.',409);}
  else {ensure(new Date(coupon.expires_at).getTime()>Date.now()&&(!coupon.customer_id||(recognized&&coupon.customer_id===customer!.id)),'COUPON_INELIGIBLE','This coupon is unavailable.',409);ensure(coupon.state==='AVAILABLE'||(coupon.state==='RESERVED'&&new Date(coupon.reserved_until).getTime()<Date.now()),'TOKEN_RESERVED','This coupon is reserved by another order.',409);ensure(base.subtotal>=num(coupon.minimum_amount),'MINIMUM_SPEND','This order does not meet the coupon minimum.');}
  discount=Math.min(base.subtotal,num(coupon.discount_amount));discountLabel='Coupon · '+data.couponCode.toUpperCase();
 }
 if(data.loyaltyAmount){ensure(recognized,'LOYALTY_IDENTITY_REQUIRED','Use customer details already recognized on this device or table visit to claim rewards.',403);ensure(data.loyaltyAmount%limit.pointValue===0,'INVALID_REDEMPTION','Enter an amount in valid point-value increments.');ensure(data.loyaltyAmount<=limit.maxRedemptionAmount,'REDEMPTION_CAP','The selected amount exceeds your available rewards or per-bill limit.',409);discount=data.loyaltyAmount;discountLabel=outlet.web_loyalty_name;}
 const total=quote(lines,discount),beforeRounding=integer(total.payable+chargesTotal,'Payable amount'),mode=outlet.web_rounding_mode_default??(outlet.web_round_down_default?'DOWN':'NONE'),roundOff=roundAdjustment(beforeRounding,mode!=='NONE',mode);
 return{...total,items:items.map(item=>({itemId:item.item_id,unitPrice:num(item.unit_price),subtotal:Math.round(num(item.unit_price)*num(item.quantity_milli)/1000)})),payable:integer(beforeRounding+roundOff,'Payable amount'),roundOff,charges,chargesTotal,taxes:taxBreakdown(total.tax,components),taxRates:[...new Set(items.map(item=>num(item.tax_bps)))],discountLabel,rewards:{recognized,availableAmount:spendable*limit.pointValue,maxAmount:recognized?limit.maxRedemptionAmount:0,pointValue:limit.pointValue,name:outlet.web_loyalty_name}};
}
