"use client";
import {useEffect,useState} from 'react';
import {DataTable} from '@/components/ui';
import {command,label,request,type Row} from '@/lib/client';
import {useDesk} from '../workspace/context';

export function RecipeChoices(){
 const {data,refresh}=useDesk();
 const menu:Row[]=(data.menu??[]).filter((m:Row)=>!m.ready_food_batch_id&&m.unit!=='peg');
 const [itemId,setItem]=useState(menu[0]?.id??''),[listing,setListing]=useState<Row|null>(null),[kind,setKind]=useState('RECIPE'),[optionId,setOption]=useState(''),[channel,setChannel]=useState('ALL'),[quantities,setQuantities]=useState<Record<string,string>>({}),[active,setActive]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
 const item=menu.find(m=>m.id===itemId),profiles:Row[]=listing&&listing.item.id===itemId?listing.profiles:[],current=profiles.find(p=>p.kind===kind&&p.option_id===optionId&&p.channel===channel);
 const selection=[itemId,kind,optionId,channel,revision].join('|');
 useEffect(()=>{if(!itemId)return;const controller=new AbortController();setListing(null);setError('');void request('/api/recipe-profiles?itemId='+itemId,{signal:controller.signal}).then(setListing).catch(e=>{if(e.name!=='AbortError')setError(e.message)});return()=>controller.abort()},[itemId,revision]);
 useEffect(()=>{setQuantities(Object.fromEntries((current?.ingredients??[]).map((line:Row)=>[line.id,String(Number(line.quantityMilli)/1000)])));setActive(current?.active??true)},[selection,listing]);
 const options:Row[]=kind==='ADDON'?item?.modifiers??[]:kind==='RECIPE'?item?.variants??[]:[];
 return <div className="inventory-tool-form">
  <p>Enter measured quantities for the selected dish. Recipe choices replace its base recipe; add-ons and packaging add quantities per sell unit.</p>
  <label className="field">Recipe choice dish<select aria-label="Recipe choice dish" value={itemId} onChange={e=>{setItem(e.target.value);setOption('')}}>{menu.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
  <form className="form" onSubmit={async e=>{e.preventDefault();setError('');setBusy(true);try{await command('recipeProfile',{itemId,kind,optionId,channel,version:current?.version??0,active,ingredients:(data.ingredients??[]).filter((i:Row)=>Number(quantities[i.id]??0)>0).map((i:Row)=>({id:i.id,quantityMilli:Math.round(Number(quantities[i.id])*1000)}))});setRevision(n=>n+1);await refresh()}catch(issue){setError((issue as Error).message)}finally{setBusy(false)}}}>
   <fieldset disabled={busy||listing?.item.id!==itemId} className="form">
    <label className="field">Choice type<select aria-label="Recipe choice type" value={kind} onChange={e=>{setKind(e.target.value);setOption('')}}><option value="RECIPE">Size / channel recipe</option><option value="ADDON">Add-on ingredients</option><option value="PACKAGING">Packaging</option></select></label>
    {kind!=='PACKAGING'&&<label className="field">{kind==='ADDON'?'Add-on':'Size'}<select aria-label="Recipe choice option" value={optionId} required={kind==='ADDON'} onChange={e=>setOption(e.target.value)}><option value="">{kind==='ADDON'?'Choose an add-on…':'Default size'}</option>{options.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>}
    <label className="field">Order channel<select aria-label="Recipe choice channel" value={channel} onChange={e=>setChannel(e.target.value)}>{['ALL','DINE_IN','TAKEAWAY','DELIVERY'].map(v=><option key={v} value={v}>{v==='ALL'?'All channels':label(v)}</option>)}</select></label>
    <p className="muted">Size + channel takes priority, then size for all channels, then the default channel recipe, then the base recipe. Add-ons and packaging use their channel entry or all-channel fallback.</p>
    {(data.ingredients??[]).map((i:Row)=><label className="field" key={i.id}>{i.name} ({i.unit} per {item?.unit??'sell unit'})<input aria-label={'Recipe choice quantity '+i.name} type="number" min="0" max="10000" step="0.001" placeholder="0" value={quantities[i.id]??''} onChange={e=>setQuantities(old=>({...old,[i.id]:e.target.value}))}/></label>)}
    <label className="field checkbox-field"><span>Use this recipe choice</span><input aria-label="Use this recipe choice" type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/></label>
    <button className="button primary" disabled={!item||!Object.values(quantities).some(v=>Number(v)>0)}>{current?'Update recipe choice':'Save recipe choice'}</button>
   </fieldset>
  </form>
  {error&&<p className="error" role="alert">{error}</p>}
  <h3>Saved choices</h3><DataTable headers={['Type','Option / channel','Ingredients','State','']} rows={profiles.map(p=>[label(p.kind),((p.kind==='ADDON'?item?.modifiers:item?.variants)??[]).find((o:Row)=>o.id===p.option_id)?.name??'Default',p.ingredients.map((i:Row)=>i.name+' '+Number(i.quantityMilli)/1000+' '+i.unit).join(', '),(p.active?'Active':'Disabled')+' · '+label(p.channel),<button className="button small" onClick={()=>{setKind(p.kind);setOption(p.option_id);setChannel(p.channel)}}>Edit choice</button>])} empty="No additional recipes configured. Existing base recipes remain in use."/>
  <p className="muted">Saved orders retain their recipe snapshot and costs. Unconfigured base recipes remain unknown; entering packaging alone does not make the dish cost complete.</p>
 </div>;
}
