'use client';
import {useDesk} from './context';
import type {Row} from '@/lib/client';

export function OutletOrderSwitch(){
 const {data,busy,run}=useDesk(),outlet=data.outlets.find((row:Row)=>row.id===data.outletId);
 if(!outlet)return null;
 const enabled=outlet.order_intake_enabled!==false,editable=['OWNER','MANAGER'].includes(data.actor.role)&&data.supportView?.mode!=='READ_ONLY';
 return <button type="button" className="outlet-order-switch" role="switch" aria-label={'Accept new orders for '+outlet.name} aria-checked={enabled} disabled={busy||!editable||!outlet.order_intake_version} title={enabled?'On · Accepting new orders from all sources':'Off · New orders from all sources are paused'} onClick={()=>void run('outletOrderIntake',{outletId:outlet.id,enabled:!enabled,version:outlet.order_intake_version}).catch(()=>{})}><span className="order-switch-thumb" aria-hidden="true"/><span>{enabled?'On':'Off'}</span></button>;
}
