"use client";
import { useEffect, useState, type FormEvent } from 'react';
import { amountPaise, quantityMilli, quote, roundAdjustment } from '@dinerdost/core';
import { money, request, type Row } from '@/lib/client';
import { useDesk } from '../workspace/context';
import { DishPicker } from '../workspace/dish-picker';

export function PaidReplacement({orderId}:{orderId:string}){
 const desk=useDesk(),[view,setView]=useState<Row|null>(null),[error,setError]=useState(''),[cart,setCart]=useState<Row[]>([]),[choice,setChoice]=useState<Row|null>(null),[discount,setDiscount]=useState('0'),[charges,setCharges]=useState<{name:string;amount:string}[]>([]),[roundDown,setRoundDown]=useState(false),[saving,setSaving]=useState(false);
 useEffect(()=>{const abort=new AbortController();void request('/api/order-replacements?orderId='+orderId,{signal:abort.signal}).then(v=>{setView(v);setRoundDown(!!v.outlet.web_round_down_default)}).catch(e=>{if(e.name!=='AbortError')setError(e.message)});return()=>abort.abort()},[orderId]);
 if(!view)return <p role={error?'alert':undefined}>{error||'Loading original payment and replacement eligibility…'}</p>;
 if(choice)return <div><button className="text-button" onClick={()=>setChoice(null)}>Back to replacement</button><h3>{choice.name}</h3><DishPicker item={choice} onClose={()=>setChoice(null)} onAdd={line=>setCart(rows=>[...rows,line])}/></div>;
 let preview:Row|null=null,issue='';
 try{const override=view.outlet.tax_components?.reduce((n:number,t:Row)=>n+Number(t.rateBps),0),total=quote(cart.map(i=>({unit_price:Number(i.price),quantity_milli:quantityMilli(String(i.quantity)),tax_bps:override??Number(i.tax_bps)})),amountPaise(discount)),chargeTotal=charges.reduce((n,c)=>n+amountPaise(c.amount),0),before=total.payable+chargeTotal,roundOff=roundAdjustment(before,roundDown,'DOWN');preview={...total,charges:chargeTotal,roundOff,payable:before+roundOff}}catch(e){issue=(e as Error).message}
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(!preview||saving)return;const form=new FormData(event.currentTarget);setError('');
  if(form.get('confirmed')!=='on'){setError('Confirm the payment credit before continuing.');return}
  setSaving(true);try{const result=await desk.run('paidReplacement',{version:view!.order.version,items:cart.map(i=>({itemId:i.id,quantity:String(i.quantity),...(i.variant?{variant:i.variant}:{}),modifiers:i.modifiers??[],note:i.note??''})),discount:amountPaise(discount),charges:charges.map(c=>({name:c.name,amount:amountPaise(c.amount)})),roundDown,reason:String(form.get('reason')??''),discardUnserved:form.get('discard')==='on',confirmed:true,expectedPayable:preview!.payable,fulfillment:String(form.get('fulfillment')??'ORIGINAL_VISIT')},{orderId});desk.close();desk.go('/app/orders/'+result.order.id);desk.notify('Replacement saved. Original receipts remain linked.')}catch(e){setError((e as Error).message);setSaving(false)}
 }
 return <div className="inventory-tool-form">
  <p>Original final payable: <strong>{money(view.order.totals.payable)}</strong> · Available payment credit: <strong>{money(view.credit)}</strong></p>
  <p>Choose equal or higher final payable. Only the extra balance is collected. Original invoices and receipts stay linked.</p>
  <label className="field">Add replacement dish<select aria-label="Add replacement dish" value="" disabled={saving} onChange={e=>setChoice(view.menu.find((m:Row)=>m.id===e.target.value)??null)}><option value="">Choose a dish…</option>{view.menu.map((m:Row)=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
  {cart.map((line,index)=><div className="refund-receipt" key={index}><span>{line.name}{line.variant?' · '+line.variant:''} × {line.quantity}</span><button className="text-button" disabled={saving} aria-label={'Remove '+line.name+' '+(index+1)} onClick={()=>setCart(rows=>rows.filter((_,i)=>i!==index))}>Remove</button></div>)}
  <form className="form" onSubmit={submit}><fieldset disabled={saving} style={{border:0,padding:0,minWidth:0,display:'grid',gap:16}}>
   {view.order.session_id&&<label className="field">Replacement service<select name="fulfillment" defaultValue={view.sessionOpen?'ORIGINAL_VISIT':'TAKEAWAY'}><option value="ORIGINAL_VISIT" disabled={!view.sessionOpen}>Original table visit{!view.sessionOpen?' (closed)':''}</option><option value="TAKEAWAY">Takeaway</option></select></label>}
   <label className="field">Replacement discount (₹)<input aria-label="Replacement discount (₹)" type="number" min="0" step="0.01" required value={discount} onChange={e=>setDiscount(e.target.value)}/></label>
   {desk.data.actor.role==='OWNER'&&<><button type="button" className="button" onClick={()=>setCharges(rows=>[...rows,{name:'',amount:''}])} disabled={charges.length>=20}>Add replacement charge</button>{charges.map((c,index)=><div key={index} style={{display:'grid',gap:8}}><label className="field">Charge name<input aria-label={'Charge name '+(index+1)} maxLength={60} required value={c.name} onChange={e=>setCharges(rows=>rows.map((r,i)=>i===index?{...r,name:e.target.value}:r))}/></label><label className="field">Charge amount (₹)<input aria-label={'Charge amount '+(index+1)} required type="number" min="0.01" step="0.01" value={c.amount} onChange={e=>setCharges(rows=>rows.map((r,i)=>i===index?{...r,amount:e.target.value}:r))}/></label><button type="button" className="text-button" onClick={()=>setCharges(rows=>rows.filter((_,i)=>i!==index))}>Remove charge</button></div>)}</>}
   <label className="field checkbox-field"><span>Round down to ₹1</span><input type="checkbox" checked={roundDown} onChange={e=>setRoundDown(e.target.checked)}/></label>
   {preview&&<div className="total-panel"><div className="total-row"><span>Subtotal</span><strong>{money(preview.subtotal)}</strong></div><div className="total-row"><span>Tax</span><strong>{money(preview.tax)}</strong></div><div className="total-row"><span>Replacement final payable</span><strong>{money(preview.payable)}</strong></div><div className="total-row"><span>Original payment credit</span><strong>{money(view.credit)}</strong></div><div className="total-row"><span>Extra to collect</span><strong>{money(Math.max(0,preview.payable-view.credit))}</strong></div></div>}
   {preview&&cart.length>0&&preview.payable<view.order.totals.payable&&<p role="alert">Replacement final payable must be at least {money(view.order.totals.payable)}.</p>}
   <label className="field">Replacement reason<textarea name="reason" aria-label="Replacement reason" required minLength={5} maxLength={500}/></label>
   {view.requiresDiscard&&<label className="field checkbox-field"><span>I confirm the original unserved food is discarded and cannot be served or resold</span><input name="discard" type="checkbox" required/></label>}
   <label className="field checkbox-field"><span>I confirm this payment credit and the extra balance; original receipts will not be collected again</span><input name="confirmed" type="checkbox"/></label>
   {(error||issue)&&<p role="alert" className="error">{error||issue}</p>}
   <button className="button primary" disabled={saving||!cart.length||!preview||preview.payable<view.order.totals.payable}>{saving?'Saving…':'Confirm paid replacement'}</button>
  </fieldset></form>
 </div>;
}
