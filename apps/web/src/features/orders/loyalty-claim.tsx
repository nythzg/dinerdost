"use client";
import {useState} from 'react';
import {isManager} from '@dinerdost/core';
import {money,type Row} from '@/lib/client';
import {showRewardApplied} from '@/lib/reward-applied';
import {useDesk} from '../workspace/context';
import {RewardEntry} from './reward-entry';

export function LoyaltyClaim({outlet,round,limit,save}:{outlet:Row;round:Row;limit:Row;save:(values:Row)=>Promise<Row>}){
 const {data,run}=useDesk();
 const [name,setName]=useState(String(outlet.web_loyalty_name??'Loyalty'));
 const [draft,setDraft]=useState(name),[version,setVersion]=useState(Number(outlet.version));
 const [saving,setSaving]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 const current=Number(round.loyalty_amount??0);
 return <div className="loyalty-claim">
  {isManager(data.actor)&&<details className="loyalty-name-settings">
   <summary>Edit reward name</summary>
   <form className="form" onSubmit={async event=>{
    event.preventDefault();if(saving)return;setSaving(true);setError('');setSaved(false);
    try{const result=await run('loyaltyName',{outletId:outlet.id,version,name:draft});setName(result.name);setDraft(result.name);setVersion(result.version);setSaved(true)}
    catch(issue){setError((issue as Error).message)}finally{setSaving(false)}
   }}>
    <label className="field">Reward name<input value={draft} onChange={event=>{setDraft(event.target.value);setSaved(false)}} required maxLength={80}/></label>
    <small>Saved for all future loyalty claims at this outlet. Earlier claims keep their name.</small>
    {error&&<p className="error" role="alert">{error}</p>}
    {saved&&<small role="status">Reward name saved.</small>}
    <button type="submit" className="button" disabled={saving||!draft.trim()}>{saving?'Saving…':'Save reward name'}</button>
   </form>
  </details>}
  <RewardEntry fields={[{name:'amount',label:name+' amount (₹)',type:'number',min:0,max:limit.maxRedemptionAmount/100,step:limit.pointValue/100,value:current/100,help:'Current '+(round.loyalty_name??name)+' claim: '+money(current)+'. Enter the total loyalty amount for this round. Maximum '+money(limit.maxRedemptionAmount)+' for this round; '+money(limit.remainingOrderCap)+' remains on this bill. Replaces any existing round reward or discount.'}]}
   save={values=>save({version:round.version,amount:Math.round(Number(values.amount)*100)})}
   onSuccess={applied=>showRewardApplied((applied as Row).order,round,'loyalty',name)}
   disabled={saving}
   submit={name==='Loyalty'?'Claim loyalty':'Claim '+name}/>
 </div>;
}
