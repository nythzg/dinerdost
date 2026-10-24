import type {Sql} from '@dinerdost/database';
import {ensure,type Actor} from '@dinerdost/core';
import {id,num,one,type Row} from './shared';

/** Coupon definitions are immutable apart from activation; each use is a separate token. */
export async function reserveWebDiscountCoupon(tx:Sql,actor:Pick<Actor,'restroId'|'application'>,outletId:string,definitionId:string,customerId:string){
 ensure(!actor.application||actor.application==='MASTER','APPLICATION_FORBIDDEN','Discount coupon codes are available in the web app only.',403);
 const definition=await one(tx,'SELECT *,expires_at>clock_timestamp() AS unexpired FROM web_discount_coupons WHERE id=$1 AND outlet_id=$2 FOR UPDATE',[definitionId,outletId]);
 ensure(definition.active&&definition.unexpired,'COUPON_INELIGIBLE','This coupon is expired or has been removed.',409);
 const used=await one(tx,"SELECT count(*) AS count FROM coupons WHERE web_discount_coupon_id=$1 AND (state IN ('LOCKED','REDEEMED') OR (state='RESERVED' AND reserved_until>clock_timestamp()))",[definitionId]);
 ensure(num(used.count)<num(definition.max_uses),'COUPON_EXHAUSTED','This coupon has no uses remaining.',409);
 const available=(await tx.query<Row>("SELECT id FROM coupons WHERE web_discount_coupon_id=$1 AND (state='AVAILABLE' OR (state='RESERVED' AND reserved_until<=clock_timestamp())) ORDER BY id LIMIT 1 FOR UPDATE",[definitionId])).rows[0];
 const couponId=available?.id??id();
 if(available)await tx.query("UPDATE coupons SET customer_id=$2,state='AVAILABLE',round_id=NULL,round_version=NULL,reserved_until=NULL WHERE id=$1",[couponId,customerId]);
 else await tx.query('INSERT INTO coupons(id,restro_id,outlet_id,code,discount_amount,expires_at,customer_id,web_discount_coupon_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[couponId,actor.restroId,outletId,'WEB_USE:'+couponId,definition.discount_amount,definition.expires_at,customerId,definitionId]);
 return couponId as string;
}

/** Lock definitions before tokens, matching claim/deactivation lock order. */
export async function lockWebCouponDefinition(tx:Sql,roundId:string){
 const token=(await tx.query<Row>("SELECT web_discount_coupon_id FROM coupons WHERE round_id=$1 AND state IN ('RESERVED','LOCKED')",[roundId])).rows[0];
 if(!token?.web_discount_coupon_id)return;
 return one(tx,'SELECT *,expires_at>clock_timestamp() AS unexpired FROM web_discount_coupons WHERE id=$1 FOR UPDATE',[token.web_discount_coupon_id]);
}
