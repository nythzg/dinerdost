"use client";
import {useEffect,useState} from 'react';
import {normalizePhone,quantityMilli,wholeUnit} from '@dinerdost/core';
import {Icon} from '@/components/ui';
import {CustomerFields} from '../customers/customer-fields';
import {clientUuid} from '@/lib/browser-crypto';
import {money,request,type Row} from '@/lib/client';
import {GuestBillBreakdown} from './guest-bill-breakdown';
export type GuestRewardChoice={couponCode:string;loyaltyAmount:number};
export function GuestCheckout({data,tableKey,cart,name,phone,identityLocked,busy,choice,onChoice,onIdentity,onQuantity,onRemove,onSubmit}:{data:Row;tableKey:string;cart:Row[];name:string;phone:string;identityLocked:boolean;busy:boolean;choice:GuestRewardChoice;onChoice:(value:GuestRewardChoice)=>void;onIdentity:(name:string,phone:string)=>void;onQuantity:(cartId:string,value:number)=>void;onRemove:(cartId:string)=>void;onSubmit:(value:Row)=>Promise<unknown>}){
 const [coupon,setCoupon]=useState(choice.couponCode),[bill,setBill]=useState<Row|null>(null),[checking,setChecking]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 const count=cart.reduce((sum,item)=>sum+Number(item.quantity),0);
 const items=JSON.stringify(cart.map(item=>({itemId:item.id,quantity:String(item.quantity),...(item.variant?{variant:item.variant}:{}),modifiers:item.modifiers??[],note:item.note??''})));
 let normalizedPhone='';try{if(phone.trim())normalizedPhone=normalizePhone(phone)}catch{}
 const identityName=normalizedPhone?name:'';
 useEffect(()=>{
  const abort=new AbortController();setChecking(true);setError('');setBill(null);
  const timer=setTimeout(()=>{void request('/api/guest/'+tableKey,{method:'POST',headers:{'Idempotency-Key':clientUuid()},body:JSON.stringify({action:'quote',input:{items:JSON.parse(items),name:identityName,phone:normalizedPhone,...(choice.couponCode?{couponCode:choice.couponCode}:{}),loyaltyAmount:choice.loyaltyAmount}}),signal:abort.signal}).then(setBill).catch(issue=>{if(issue.name!=='AbortError')setError(issue.message)}).finally(()=>{if(!abort.signal.aborted)setChecking(false)})},200);
  return()=>{clearTimeout(timer);abort.abort()};
 },[tableKey,items,identityName,normalizedPhone,choice.couponCode,choice.loyaltyAmount,revision]);
 return <section className="panel guest-cart" id="guest-cart" aria-label="Your cart">
  <header className="guest-checkout-heading"><div><span>Review your order</span><h2>Your cart</h2></div><span className="guest-checkout-count">{count} {count===1?'item':'items'}</span></header>
  <div className="guest-checkout-items">{cart.map((item,index)=>{const priced=bill?.items?.[index];return <article className="guest-checkout-item" key={item.cartId}><div><strong>{item.name}</strong>{item.variant&&<small>{item.variant}</small>}{item.note&&<small>{item.note}</small>}<span>{money(priced?.unitPrice??item.price)} each</span></div><label className="guest-checkout-quantity"><input type="number" aria-label={item.name+' quantity'} min={wholeUnit(item.unit)?1:.001} max="10000" step={wholeUnit(item.unit)?1:.001} value={item.quantity} disabled={busy} onChange={event=>{const value=Number(event.target.value);if(Number.isFinite(value)&&value>0&&value<=10000&&(!wholeUnit(item.unit)||Number.isInteger(value))){try{quantityMilli(event.target.value);onQuantity(item.cartId,value)}catch{}}}}/></label><strong>{money(priced?.subtotal??Math.round(item.price*item.quantity))}</strong><button type="button" className="icon-button" aria-label={'Remove '+item.name} disabled={busy} onClick={()=>onRemove(item.cartId)}><Icon name="close"/></button></article>})}</div>
  <form id="guest-order-form" className="guest-checkout-form" onSubmit={event=>{event.preventDefault();if(!bill||checking||busy)return;setError('');void onSubmit({...(choice.couponCode?{couponCode:choice.couponCode}:{}),...(choice.loyaltyAmount?{loyaltyAmount:choice.loyaltyAmount}:{}),expectedPayable:bill.payable}).catch(issue=>{setError(issue.message);setRevision(value=>value+1)})}}>
   <section className="guest-checkout-details"><h3><Icon name="customers"/>Your details</h3><CustomerFields known={data.identities} required readOnlyName={identityLocked} name={name} phone={phone} onChange={onIdentity}/></section>
   <section className="guest-checkout-rewards" aria-label="Offers and rewards"><h3><Icon name="gift"/>Offers & rewards</h3><label htmlFor="guest-coupon">Coupon code</label><div className="guest-coupon-entry"><input id="guest-coupon" aria-label="Coupon code" placeholder="Enter coupon code" maxLength={80} value={coupon} disabled={busy} onChange={event=>setCoupon(event.target.value)}/><button type="button" className="button" disabled={busy||!coupon.trim()} onClick={()=>onChoice({couponCode:coupon.trim().toUpperCase(),loyaltyAmount:0})}>Apply</button></div>
    {choice.couponCode&&<div className="guest-applied-offer"><span>{choice.couponCode}</span><button type="button" className="icon-button" aria-label="Remove coupon" onClick={()=>{setCoupon('');onChoice({couponCode:'',loyaltyAmount:0})}}><Icon name="close"/></button></div>}
    <div className="guest-loyalty-choice"><div><strong>{bill?.rewards?.name??'Loyalty rewards'}</strong><small>{bill?.rewards?.recognized?'Up to '+money(bill.rewards.maxAmount)+' available for this bill':'Use your recognized customer details to check rewards.'}</small></div>{choice.loyaltyAmount?<button type="button" className="button" disabled={busy} onClick={()=>onChoice({couponCode:'',loyaltyAmount:0})}>Remove reward</button>:<button type="button" className="button" disabled={busy||checking||!bill?.rewards?.maxAmount} onClick={()=>{setCoupon('');onChoice({couponCode:'',loyaltyAmount:bill!.rewards.maxAmount})}}>Claim rewards</button>}</div><small className="guest-reward-rule">Choose a coupon or loyalty rewards for this order.</small>
   </section>
   <section className="guest-checkout-bill"><h3>Bill summary</h3>{bill?<GuestBillBreakdown bill={bill}/>:<p role="status">{checking?'Checking your total…':'Update your details or offer to refresh the total.'}</p>}</section>
   {error&&<p className="error" role="alert">{error}</p>}
   <button className="button primary guest-place-order" disabled={busy||checking||!bill||data.activationRequired||data.orderingEnabled===false}>{data.orderingEnabled===false?'Ordering paused':busy?'Sending…':checking?'Checking total…':'Place order · '+money(bill?.payable??0)}<Icon name="chevron"/></button>
  </form>
 </section>;
}
