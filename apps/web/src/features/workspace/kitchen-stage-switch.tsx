"use client";
import {T} from "@/lib/staff-language";
import {isManager} from '@dinerdost/core';
import {useDesk} from './context';
export function KitchenStageSwitch(){
 const {data,form,run,busy}=useDesk(),outlet=data.outlets.find((o:{id:string})=>o.id===data.outletId),enabled=outlet?.web_kitchen_stages_enabled!==false;
 return <div className="kitchen-policy-control">{isManager(data.actor)?<button className="button" disabled={busy} aria-label="Kitchen stage settings" onClick={()=>form('Kitchen workflow',[{name:'enabled',label:'Preparation stages for new rounds',type:'select',value:enabled?'on':'off',options:[{value:'on',label:'On · Released → Preparing → Ready'},{value:'off',label:'Off · Send authorized rounds to Service'}],help:'Existing rounds keep their saved workflow. Staff must still mark food served.'}],values=>run('kitchenStages',{outletId:data.outletId,version:outlet.version,enabled:values.enabled==='on'}),'Save kitchen workflow')}><T>Kitchen stages</T>: <T>{enabled?'On':'Off'}</T></button>:<span className="muted"><T>Kitchen stages</T>: <T>{enabled?'On':'Off'}</T></span>}{!enabled&&<p>New authorized rounds go directly to Service. Existing tickets below keep their workflow; staff must still mark food served.</p>}</div>;
}
