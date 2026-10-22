"use client";
import {useEffect,useState} from 'react';
import {DataTable} from '@/components/ui';
import {date,money,request,type Row} from '@/lib/client';
import {useDesk} from '../workspace/context';
import {RewardEntry} from './reward-entry';
export function Refunds({orderId,changed}:{orderId:string;changed?:()=>void}){
 const {run}=useDesk(),[view,setView]=useState<Row|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{const controller=new AbortController();void request('/api/order-refunds?orderId='+orderId,{signal:controller.signal}).then(setView).catch(e=>{if(e.name!=='AbortError')setError(e.message)});return()=>controller.abort()},[orderId,revision]);
 if(!view)return <p role={error?'alert':undefined}>{error||'Loading original receipts and refund records…'}</p>;
 return <div className="inventory-tool-form"><p>Record a refund already returned outside the app. No gateway transfer is sent. {view.canApprove?'Your approval records it immediately.':'Your request needs approval from an owner or manager.'}</p><p>Refunded: <strong>{money(view.refunded)}</strong> · Available from actual receipts: <strong>{money(view.available)}</strong></p>
  {view.available>0&&(!view.invoices.length?<><p>Create a bill reference before linking a refund.</p><button className="button" onClick={()=>void run('bill',{final:false},{orderId}).then(()=>setRevision(n=>n+1)).catch(()=>{})}>Create bill reference</button></>:<RewardEntry key={revision} fields={[
   {name:'invoiceId',label:'Original bill',type:'select',value:view.invoices[0].id,options:view.invoices.map((i:Row)=>({value:i.id,label:i.number}))},
   {name:'amount',label:'Refund amount (₹)',type:'number',min:.01,max:view.available/100,step:.01,value:view.available/100},
   {name:'mode',label:'Refund mode',type:'select',value:'CASH',options:['CASH','UPI','CARD','OTHER'].map(value=>({value,label:value}))},
   {name:'reference',label:'Refund reference',required:false},
   {name:'reason',label:'Refund reason',type:'textarea'},
   {name:'confirmed',label:'I confirm this is a manual refund record; no gateway payment is requested',type:'checkbox',value:false}
  ]} save={async values=>{if(!values.confirmed)throw new Error('Confirm the manual refund record before continuing.');const result=await run('webRefund',{...values,amount:Math.round(values.amount*100),version:view.order.version},{orderId});changed?.();return result}} submit={view.canApprove?'Record refund':'Request manager approval'} successMessage={view.canApprove?'Refund record saved.':'Refund request awaiting manager approval.'}/>)}
  <h3>Refund history</h3><DataTable headers={['Record','Amount','Mode','Reason','Recorded']} rows={view.refunds.map((r:Row)=>[<a className="text-button" href={'/refund/'+r.id} target="_blank" rel="noreferrer">{r.snapshot.number}</a>,money(r.amount),r.mode,r.reason,date(r.created_at)])} empty="No refunds recorded."/>
  {view.requests.length>0&&<><h3>Approval requests</h3><DataTable headers={['Requested by','Amount','State','Reason']} rows={view.requests.map((r:Row)=>[r.requested_name,money(r.amount),r.state,r.reason])}/></>}
 </div>;
}
export function RefundApprovals(){
 const {data,run,modal}=useDesk(),[rows,setRows]=useState<Row[]|null>(null),[error,setError]=useState('');
 const load=()=>request('/api/order-refunds?kind=pending&outletId='+data.outletId).then(setRows).catch(e=>setError(e.message));useEffect(()=>{void load()},[data.outletId]);
 return <div className="inventory-tool-form">{error&&<p role="alert" className="error">{error}</p>}{!rows?<p>Loading requests…</p>:<DataTable headers={['Order','Cashier','Amount','Reason','Actions']} rows={rows.map(r=>['#'+r.number,r.requested_name,money(r.amount),r.reason,<div className="inline-actions">{['APPROVE','REJECT'].map(decision=><button key={decision} className="button" onClick={()=>modal(decision==='APPROVE'?'Approve refund record':'Reject refund request',<RewardEntry fields={[{name:'note',label:'Manager note',type:'textarea'},{name:'confirmed',label:decision==='APPROVE'?'I confirm the manual refund and original receipts were checked':'I confirm rejection of this request',type:'checkbox',value:false}]} save={async values=>{const result=await run('webRefundDecision',{...values,version:r.version,decision},{id:r.id});await load();return result}} submit={decision==='APPROVE'?'Approve and record refund':'Reject request'}/>)}>{decision==='APPROVE'?'Approve':'Reject'}</button>)}</div>])} empty="No refund requests awaiting approval."/>}</div>;
}
