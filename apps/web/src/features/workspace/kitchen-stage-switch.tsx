"use client";
import {T} from "@/lib/staff-language";
import {isManager,restaurantFeatureEnabled} from '@dinerdost/core';
import {useDesk} from './context';
export function KitchenStageSwitch(){
 const {data,run,busy}=useDesk(),outlet=data.outlets.find((o:{id:string})=>o.id===data.outletId),enabled=outlet?.web_kitchen_stages_enabled!==false;
 return <div className="kitchen-policy-control"><span><T>Kitchen stages</T></span><button type="button" className="feature-switch" role="switch" aria-label="Kitchen stages" aria-checked={enabled} disabled={busy||!isManager(data.actor)||!restaurantFeatureEnabled(data.featureFlags,'kitchenStages')} onClick={()=>void run('kitchenStages',{outletId:data.outletId,version:outlet.version,enabled:!enabled}).catch(()=>{})}><span><T>{enabled?'On':'Off'}</T></span></button>{!enabled&&<p>New authorized rounds go directly to Service. Existing tickets keep their workflow; staff must still mark food served.</p>}</div>;
}
