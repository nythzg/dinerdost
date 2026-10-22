"use client";
import {useState} from 'react';
import {wholeUnit} from '@dinerdost/core';
import {DataTable} from '@/components/ui';
import {label,request,type Row} from '@/lib/client';
import {useDesk} from '../workspace/context';
import {csv} from './inventory-csv';
type Line={itemId:string;quantity:string;variant:string;modifiers:string[];channel:string};
export function IngredientPlanner(){
 const {data}=useDesk(),menu:Row[]=(data.menu??[]).filter((i:Row)=>i.active&&!i.ready_food_batch_id);
 const fresh=(itemId=menu[0]?.id??''):Line=>({itemId,quantity:'1',variant:'',modifiers:[],channel:'DINE_IN'});
 const [lines,setLines]=useState<Line[]>([fresh()]),[result,setResult]=useState<Row|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const change=(index:number,patch:Partial<Line>)=>{setLines(old=>old.map((l,at)=>at===index?{...l,...patch}:l));setResult(null)};
 return <div className="inventory-tool-form"><p>Choose dishes, sizes, add-ons and channels to calculate current ingredient and packaging needs.</p>
  <form className="form" onSubmit={async e=>{e.preventDefault();setError('');setBusy(true);try{setResult(await request('/api/inventory-tools',{method:'POST',body:JSON.stringify({outletId:data.outletId,items:lines.map(l=>({itemId:l.itemId,quantityMilli:Math.round(Number(l.quantity)*1000),variant:l.variant||undefined,modifiers:l.modifiers,channel:l.channel}))})}))}catch(issue){setError((issue as Error).message)}finally{setBusy(false)}}}>
   <fieldset disabled={busy} className="form">{lines.map((line,index)=>{const item=menu.find(m=>m.id===line.itemId);return <div className="panel form" key={index}>
    <label className="field">Dish<select aria-label={'Planned dish '+(index+1)} value={line.itemId} required onChange={e=>change(index,{itemId:e.target.value,variant:'',modifiers:[]})}>{menu.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
    <label className="field">Quantity ({item?.unit??'sell unit'})<input aria-label={'Planned quantity '+(index+1)} required type="number" min={wholeUnit(item?.unit)?1:0.001} step={wholeUnit(item?.unit)?1:0.001} max="1000000" value={line.quantity} onChange={e=>change(index,{quantity:e.target.value})}/></label>
    {!!item?.variants?.length&&<label className="field">Size<select aria-label={'Planned size '+(index+1)} value={line.variant} onChange={e=>change(index,{variant:e.target.value})}><option value="">Default size</option>{item.variants.map((v:Row)=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label>}
    <label className="field">Order channel<select aria-label={'Planned channel '+(index+1)} value={line.channel} onChange={e=>change(index,{channel:e.target.value})}>{['DINE_IN','TAKEAWAY','DELIVERY'].map(v=><option key={v} value={v}>{label(v)}</option>)}</select></label>
    {(item?.modifiers??[]).map((m:Row)=><label className="field checkbox-field" key={m.id}><span>{m.name}</span><input aria-label={'Planned add-on '+(index+1)+' '+m.name} type="checkbox" checked={line.modifiers.includes(m.id)} onChange={e=>change(index,{modifiers:e.target.checked?[...line.modifiers,m.id]:line.modifiers.filter(id=>id!==m.id)})}/></label>)}
    <button type="button" className="button" aria-label={'Remove planned dish '+(index+1)} disabled={lines.length===1} onClick={()=>{setLines(old=>old.filter((_,at)=>at!==index));setResult(null)}}>Remove</button>
   </div>})}<div className="inline-actions"><button type="button" className="button" disabled={lines.length>=100||!menu.length} onClick={()=>{setLines(old=>[...old,fresh(menu.find(m=>!old.some(l=>l.itemId===m.id))?.id)]);setResult(null)}}>Add dish</button><button className="button primary" disabled={!menu.length}>Calculate ingredients</button></div></fieldset>
  </form>{error&&<p className="error" role="alert">{error}</p>}{result&&<><h3>Ingredient plan</h3>{!result.complete&&<p className="error" role="alert">Recipe missing or incomplete: {result.missing.map((i:Row)=>i.name).join(', ')}. The plan below excludes those dishes.</p>}<DataTable headers={['Ingredient','Needed','Usable stock','Shortfall']} rows={result.ingredients.map((i:Row)=>[i.name,Number(i.required)/1000+' '+i.unit,Number(i.available)/1000+' '+i.unit,Number(i.shortfall)/1000+' '+i.unit])}/><button className="button" onClick={()=>csv('ingredient-plan.csv',[['Ingredient','Unit','Needed','Usable stock','Shortfall','Plan complete'],...result.ingredients.map((i:Row)=>[i.name,i.unit,Number(i.required)/1000,Number(i.available)/1000,Number(i.shortfall)/1000,result.complete?'Yes':'No'])])}>Export ingredient plan</button><p className="muted">{result.basis}</p></>}
 </div>;
}
