import {z} from 'zod';
import type {Database,Sql} from '@dinerdost/database';
import {ensure,isManager,requireOutlet,requirePermission,type Actor} from '@dinerdost/core';
import {audit,command,expectedVersion,id,num,one,type Row} from './shared';

function access(actor:Actor,outletId:string){
 ensure(!actor.application||actor.application==='MASTER','APPLICATION_FORBIDDEN','Use web bill settings.',403);
 requirePermission(actor,'bill');ensure(isManager(actor),'FORBIDDEN','Only the restaurant owner or assigned outlet manager can save bill adjustments.',403);requireOutlet(actor,outletId);
}
async function readSettings(tx:Sql,outletId:string){
 const outlet=await one(tx,'SELECT * FROM outlets WHERE id=$1',[outletId]);
 const coupons=(await tx.query<Row>(`SELECT d.id,d.code,d.discount_amount,d.valid_until::text,d.max_uses,
 (SELECT count(*)::int FROM coupons c WHERE c.web_discount_coupon_id=d.id AND c.state='REDEEMED') AS redeemed,
 (SELECT count(*)::int FROM coupons c WHERE c.web_discount_coupon_id=d.id AND (c.state='LOCKED' OR (c.state='RESERVED' AND c.reserved_until>clock_timestamp()))) AS held
 FROM web_discount_coupons d WHERE d.outlet_id=$1 AND d.active ORDER BY d.created_at,d.id`,[outletId])).rows;
 return {outletId,version:num(outlet.version),loyaltyCap:num(outlet.web_loyalty_cap_paise),roundingMode:outlet.web_rounding_mode_default??(outlet.web_round_down_default?'DOWN':'NONE'),coupons};
}
export async function getWebBillSettings(db:Database,actor:Actor,outletId:string){access(actor,outletId);return db.transaction(actor.restroId,tx=>readSettings(tx,outletId));}
export async function saveWebBillSettings(db:Database,actor:Actor,key:string,input:unknown){
 const data=z.object({outletId:z.uuid(),version:z.number().int().positive(),loyaltyCap:z.number().int().min(0).max(1000000000),roundingMode:z.enum(['NONE','UP','DOWN']),createCoupons:z.array(z.object({code:z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{0,79}$/),amount:z.number().int().min(1).max(1000000000),validUntil:z.iso.date(),maxUses:z.number().int().min(1).max(1000000)}).strict()).max(100),removeCoupons:z.array(z.uuid()).max(100)}).strict().parse(input);
 access(actor,data.outletId);
 ensure(new Set(data.createCoupons.map(c=>c.code)).size===data.createCoupons.length,'COUPON_DUPLICATE','Each coupon must have a different code.');
 ensure(new Set(data.removeCoupons).size===data.removeCoupons.length,'COUPON_DUPLICATE','Remove a coupon only once.');
 return command(db,actor,key,'WEB_BILL_SETTINGS_CHANGED',data,async tx=>{
  const outlet=await one(tx,'SELECT * FROM outlets WHERE id=$1 FOR UPDATE',[data.outletId]);expectedVersion(outlet.version,data.version);
  for(const couponId of [...data.removeCoupons].sort()){
   const coupon=await one(tx,'SELECT * FROM web_discount_coupons WHERE id=$1 AND outlet_id=$2 FOR UPDATE',[couponId,data.outletId]);
   ensure(coupon.active,'COUPON_INELIGIBLE','This coupon was already removed.',409);
   await tx.query('UPDATE web_discount_coupons SET active=false WHERE id=$1',[couponId]);
  }
  const created:Row[]=[];
  for(const coupon of data.createCoupons){
   const expiresAt=new Date(new Date(coupon.validUntil+'T00:00:00+05:30').getTime()+86400000).toISOString();
   const current=await one(tx,'SELECT $1::timestamptz>clock_timestamp() AS future',[expiresAt]);ensure(current.future,'COUPON_EXPIRED','Choose a coupon expiry date that has not ended in India time.');
   const conflict=(await tx.query('SELECT id FROM web_discount_coupons WHERE outlet_id=$1 AND lower(code)=lower($2) UNION ALL SELECT id FROM coupons WHERE outlet_id=$1 AND web_discount_coupon_id IS NULL AND lower(code)=lower($2)',[data.outletId,coupon.code])).rows;
   ensure(!conflict.length,'COUPON_DUPLICATE','This coupon code has already been used. Choose a new code.',409);
   const couponId=id();await tx.query('INSERT INTO web_discount_coupons(id,restro_id,outlet_id,code,discount_amount,valid_until,expires_at,max_uses,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[couponId,actor.restroId,data.outletId,coupon.code,coupon.amount,coupon.validUntil,expiresAt,coupon.maxUses,actor.employeeId]);created.push({id:couponId,...coupon});
  }
  await tx.query('UPDATE outlets SET web_loyalty_cap_paise=$2,web_round_down_default=$3,web_rounding_mode_default=$4,version=version+1 WHERE id=$1',[data.outletId,data.loyaltyCap,data.roundingMode==='DOWN',data.roundingMode]);
  await audit(tx,actor,{action:'WEB_BILL_SETTINGS_CHANGED',entityType:'OUTLET',entityId:data.outletId,outletId:data.outletId,oldState:{loyaltyCap:num(outlet.web_loyalty_cap_paise),roundingMode:outlet.web_rounding_mode_default??(outlet.web_round_down_default?'DOWN':'NONE')},newState:{loyaltyCap:data.loyaltyCap,roundingMode:data.roundingMode,createdCoupons:created,removedCoupons:data.removeCoupons},reason:'Saved future web bill adjustments together; coupon removals stop new claims without deleting redemption history or changing existing bills'});
  return {ok:true,...await readSettings(tx,data.outletId)};
 });
}
