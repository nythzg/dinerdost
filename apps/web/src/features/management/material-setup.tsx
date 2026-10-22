"use client";
import {useState} from 'react';
import {quantityMilli} from '@dinerdost/core';
import type {Row} from '@/lib/client';
import {useDesk} from '../workspace/context';
export function MaterialSetup({item}:{item:Row}){
 const {data,run,close,busy}=useDesk();
 const [category,setCategory]=useState(item.material_category??''),[code,setCode]=useState(item.material_code??''),[hsn,setHsn]=useState(item.hsn_code??''),[yieldPercent,setYield]=useState(item.measured_yield_bps==null?'':String(Number(item.measured_yield_bps)/100));
 const [packs,setPacks]=useState<{id?:string;name:string;quantity:string}[]>((data.purchasePacks??[]).filter((pack:Row)=>pack.ingredient_id===item.id).map((pack:Row)=>({id:pack.id,name:pack.name,quantity:String(Number(pack.factor_milli)/1000)}))),[error,setError]=useState('');
 return <form className="form material-setup-form" onSubmit={async event=>{event.preventDefault();setError('');try{await run('materialSetup',{ingredientId:item.id,version:item.version,category,code,hsn,measuredYieldBps:yieldPercent===''?null:Math.round(Number(yieldPercent)*100),packs:packs.map(pack=>({id:pack.id,name:pack.name,factorMilli:quantityMilli(pack.quantity)}))});close()}catch(issue){setError((issue as Error).message)}}}>
  <p>Set up {item.name}. Stock remains in {item.unit}; previous receipts and costs stay unchanged.</p>
  <label className="field">Category (optional)<input aria-label="Material category" maxLength={80} value={category} onChange={event=>setCategory(event.target.value)} placeholder="Dairy, vegetables, packaging…"/></label>
  <label className="field">Material code (optional)<input aria-label="Material code" maxLength={40} value={code} onChange={event=>setCode(event.target.value)} placeholder="RM-001"/></label>
  <label className="field">HSN (optional)<input aria-label="Material HSN" maxLength={20} value={hsn} onChange={event=>setHsn(event.target.value)}/></label>
  <h3>Buying packs</h3><p className="muted">Example: one bag contains 5 {item.unit}. Receiving two bags adds 10 {item.unit}.</p>
  {packs.map((pack,index)=><div className="material-pack-row" key={pack.id??index}><label className="field">Pack name<input aria-label={'Pack name '+(index+1)} required maxLength={60} value={pack.name} onChange={event=>setPacks(old=>old.map((entry,at)=>at===index?{...entry,name:event.target.value}:entry))}/></label><label className="field">Contains ({item.unit})<input aria-label={'Pack contains '+(index+1)} required type="number" min="0.001" step="0.001" max="1000000" value={pack.quantity} onChange={event=>setPacks(old=>old.map((entry,at)=>at===index?{...entry,quantity:event.target.value}:entry))}/></label><button className="button" type="button" aria-label={'Remove pack '+(index+1)} onClick={()=>setPacks(old=>old.filter((_,at)=>at!==index))}>Remove</button></div>)}
  <button className="button" type="button" disabled={packs.length>=20||busy} onClick={()=>setPacks(old=>[...old,{name:'',quantity:'1'}])}>Add buying pack</button>
  <details><summary>Preparation reference (optional)</summary><label className="field">Measured usable yield (%)<input aria-label="Measured usable yield (%)" type="number" min="0.01" max="100" step="0.01" value={yieldPercent} onChange={event=>setYield(event.target.value)}/></label><p className="muted">A measured reference only. Saving it does not write off stock or change recipe quantities.</p></details>
  {error&&<p className="error" role="alert">{error}</p>}<button className="button primary" disabled={busy}>Save material setup</button>
 </form>
}
