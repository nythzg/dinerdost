"use client";
import {clientUuid} from "@/lib/browser-crypto";
import {useEffect,useState,type FormEvent} from 'react';
import {amountPaise} from '@dinerdost/core';
import {useUnsavedChanges} from "@/lib/unsaved-changes";
import {Icon} from '@/components/ui';
import {money,request,type Row} from '@/lib/client';

type DraftCoupon={id:string;code:string;amount:string;validUntil:string;maxUses:string};
export function AdjustmentsEditor({outletId,save}:{outletId:string;save:(input:Row)=>Promise<unknown>}){
 const [settings,setSettings]=useState<Row|null>(null),[cap,setCap]=useState(''),[rounding,setRounding]=useState('NONE'),[coupons,setCoupons]=useState<DraftCoupon[]>([]),[charges,setCharges]=useState<{name:string;amount:string}[]>([]),[removed,setRemoved]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0);
 useEffect(()=>{const abort=new AbortController();setError('');void request('/api/bill-settings?outletId='+encodeURIComponent(outletId),{signal:abort.signal}).then(value=>{setSettings(value);setCap(String(value.loyaltyCap/100));setRounding(value.roundingMode==='UP'?'NEAREST':value.roundingMode);setCharges((value.charges??[]).map((charge:Row)=>({name:charge.name,amount:String(charge.amount/100)})))}).catch(issue=>{if(issue.name!=='AbortError')setError(issue.message)});return()=>abort.abort()},[outletId,reload]);
 const [dirty,setDirty]=useState(false);
 useUnsavedChanges(dirty);
 if(!settings)return <div>{error?<><p className="error" role="alert">{error}</p><button className="button" onClick={()=>setReload(n=>n+1)}>Retry</button></>:<p>Loading bill adjustments…</p>}</div>;
 const change=(id:string,values:Partial<DraftCoupon>)=>setCoupons(rows=>rows.map(row=>row.id===id?{...row,...values}:row));
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;setError('');
  try{const input={outletId,version:settings!.version,loyaltyCap:amountPaise(cap),roundingMode:rounding,createCoupons:coupons.map(c=>({code:c.code,amount:amountPaise(c.amount),validUntil:c.validUntil,maxUses:Number(c.maxUses)})),removeCoupons:removed,...(settings!.canManageCharges?{charges:charges.map(charge=>({name:charge.name.trim(),amount:amountPaise(charge.amount)}))}:{})};setBusy(true);await save(input);setDirty(false)}catch(issue){setError((issue as Error).message)}finally{setBusy(false)}
 }
 return <form className="form future-bill-adjustments" data-unsaved-changes={dirty} onChange={()=>setDirty(true)} onClick={event=>{if((event.target as Element).closest('button[type="button"]'))setDirty(true)}} onSubmit={submit}><fieldset disabled={busy}>
  <section className="bill-coupon-settings" aria-label="Discount coupons">
   <button type="button" className="button" disabled={coupons.length>=100} onClick={()=>setCoupons(rows=>[...rows,{id:clientUuid(),code:'DD-'+clientUuid().replaceAll('-','').slice(0,8).toUpperCase(),amount:'',validUntil:'',maxUses:''}])}>Generate discount coupon</button>
   {settings.coupons.map((coupon:Row)=><article className={'bill-coupon-row'+(removed.includes(coupon.id)?' is-removed':'')} key={coupon.id}><div><strong>{coupon.code}</strong><span>{money(coupon.discount_amount)} discount</span><small>Valid through {coupon.valid_until} · {Number(coupon.redeemed)+Number(coupon.held)}/{coupon.max_uses} uses used or reserved</small>{removed.includes(coupon.id)&&<small>Will be removed when you save.</small>}</div>{removed.includes(coupon.id)?<button type="button" className="text-button" onClick={()=>setRemoved(ids=>ids.filter(id=>id!==coupon.id))}>Undo removal</button>:<button type="button" className="icon-button" aria-label={'Delete coupon '+coupon.code} title="Delete coupon" onClick={()=>setRemoved(ids=>[...ids,coupon.id])}><Icon name="trash"/></button>}</article>)}
   {coupons.map((coupon,index)=><article className="bill-coupon-draft" key={coupon.id} aria-label={'New coupon '+(index+1)}>
    <div className="bill-coupon-title"><strong>Coupon {index+1}</strong><button type="button" className="icon-button" aria-label={'Delete new coupon '+(index+1)} onClick={()=>setCoupons(rows=>rows.filter(row=>row.id!==coupon.id))}><Icon name="trash"/></button></div>
    <label className="field">Coupon code<input aria-label={'Coupon code '+(index+1)} required maxLength={80} pattern="[A-Z0-9][A-Z0-9_\-]*" value={coupon.code} onChange={e=>change(coupon.id,{code:e.target.value.toUpperCase()})}/></label>
    <label className="field">Discount amount (₹)<input aria-label={'Coupon discount amount (₹) '+(index+1)} required type="number" min="0.01" max="10000000" step="0.01" value={coupon.amount} onChange={e=>change(coupon.id,{amount:e.target.value})}/></label>
    <label className="field">Valid through<input aria-label={'Coupon valid through '+(index+1)} required type="date" value={coupon.validUntil} onChange={e=>change(coupon.id,{validUntil:e.target.value})}/></label>
    <label className="field">Total uses<input aria-label={'Coupon total uses '+(index+1)} required type="number" min="1" max="1000000" step="1" value={coupon.maxUses} onChange={e=>change(coupon.id,{maxUses:e.target.value})}/></label>
   </article>)}
   <small className="muted">Coupons are applied by code. Total uses are shared across bills; expiry is at the end of the selected day in India time.</small>
  </section>
  <section className="future-charge-settings" aria-label="Future bill charges"><h3>Other charges</h3><p className="muted">Fixed rupee amounts, added once to each new web bill.</p>
   {charges.map((charge,index)=><div className="future-charge-row" key={index}><label className="field">Charge name<input aria-label={'Charge name '+(index+1)} required maxLength={60} readOnly={!settings.canManageCharges} value={charge.name} onChange={event=>setCharges(rows=>rows.map((row,i)=>i===index?{...row,name:event.target.value}:row))}/></label><label className="field">Amount (₹)<input aria-label={'Charge amount (₹) '+(index+1)} required type="number" min="0.01" max="10000000" step="0.01" readOnly={!settings.canManageCharges} value={charge.amount} onChange={event=>setCharges(rows=>rows.map((row,i)=>i===index?{...row,amount:event.target.value}:row))}/></label>{settings.canManageCharges&&<button type="button" className="icon-button" aria-label={'Remove charge '+(index+1)} onClick={()=>setCharges(rows=>rows.filter((_,i)=>i!==index))}><Icon name="trash"/></button>}</div>)}
   {settings.canManageCharges?<button type="button" className="button" disabled={charges.length>=20} onClick={()=>setCharges(rows=>[...rows,{name:'',amount:''}])}><Icon name="plus"/>Add charge</button>:<small className="muted">The restaurant owner can save these charges.</small>}
  </section>
  <label className="field">Loyalty cap per bill (₹)<input aria-label="Loyalty cap per bill (₹)" required type="number" min="0" max="10000000" step="0.01" value={cap} onChange={e=>setCap(e.target.value)}/></label>
  <div className="bill-rounding-options" role="group" aria-label="Future bill rounding">
   <label className="adjustment-toggle"><input type="checkbox" role="switch" checked={rounding==='NEAREST'} onChange={e=>setRounding(e.target.checked?'NEAREST':'NONE')}/>Auto round to nearest whole number</label>
   <label className="adjustment-toggle"><input type="checkbox" role="switch" checked={rounding==='DOWN'} onChange={e=>setRounding(e.target.checked?'DOWN':'NONE')}/>Auto round down</label>
  </div>
  <small className="muted">Nearest rounding: ₹100.49 → ₹100; ₹100.50 → ₹101. Applies after saving.</small>
  <small className="muted">Applies to future transactions and reward claims at this outlet. Saving does not change the current bill.</small>
  {error&&<p className="error" role="alert">{error}</p>}
  <button className="button primary full-width">{busy?'Saving…':'Save adjustment'}</button>
 </fieldset></form>;
}
