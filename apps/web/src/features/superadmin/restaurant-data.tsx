"use client";

import {useEffect,useState} from 'react';
import {request,money,date,label,type Row} from '@/lib/client';

export const datasets=[['all','All stored records'],['demo','Demo flag on'],['nonDemo','Demo flag off'],['withOrders','Has recorded orders']] as const;

export function DatasetFilter({value,onChange}:{value:string;onChange:(value:string)=>void}){
 return <label>Restaurant dataset<select value={value} onChange={e=>onChange(e.target.value)}>{datasets.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>;
}

export function DatasetExplanation({counts}:{counts:Row}){
 return <p className="sa-help sa-dataset-note">{counts.all_records} stored {Number(counts.all_records)===1?'restaurant':'restaurants'} · {counts.demo} demo flag on · {counts.non_demo} demo flag off · {counts.with_orders} with orders. Counts use saved database records and demo flags. Demo/QA registrations are included when present. The demo flag does not establish whether a restaurant is a real business. Filters change the view; they preserve every record.</p>;
}

export function RestaurantDirectory({dataset,onDataset,revision,onManage,onDocuments}:{dataset:string;onDataset:(value:string)=>void;revision:string;onManage:(row:Row)=>void;onDocuments:(row:Row)=>void}){
 const [search,setSearch]=useState(''),[page,setPage]=useState(1),[data,setData]=useState<Row|null>(null),[error,setError]=useState(''),[selected,setSelected]=useState<Row|null>(null),[retry,setRetry]=useState(0);
 useEffect(()=>{
  const abort=new AbortController();
  setData(null);setError('');
  const timer=setTimeout(()=>{
   const query=new URLSearchParams({view:'directory',dataset,search,page:String(page)});
   void request<Row>('/api/superadmin?'+query,{signal:abort.signal}).then(result=>{if(!abort.signal.aborted)setData(result)}).catch(issue=>{if(!abort.signal.aborted)setError((issue as Error).message)});
  },180);
  return()=>{clearTimeout(timer);abort.abort()};
 },[dataset,search,page,revision,retry]);
 if(selected)return <RestaurantData key={selected.id} tenantId={selected.id} revision={revision} onBack={()=>setSelected(null)}/>;
 return <section aria-label="Restaurant directory">
  <div className="sa-toolbar"><DatasetFilter value={dataset} onChange={value=>{setPage(1);onDataset(value)}}/><label>Find a restaurant<input type="search" value={search} onChange={e=>{setPage(1);setSearch(e.target.value)}} placeholder="Restaurant, owner or status" maxLength={150}/></label></div>
  {error?<div role="alert" className="error">{error} <button className="button" onClick={()=>setRetry(value=>value+1)}>Retry</button></div>:!data?<p role="status">Loading restaurant records…</p>:<>
   <DatasetExplanation counts={data.datasets}/>
   <p role="status">{data.total} matching {Number(data.total)===1?'restaurant':'restaurants'} · page {data.page} of {data.pages}</p>
   <div className="sa-table-wrap"><table><thead><tr><th>Restaurant</th><th>Status / KYC</th><th>Outlets / staff</th><th>Orders · all time / last 7 days</th><th>Actions</th></tr></thead><tbody>{data.rows.map((row:Row)=><tr key={row.id}>
    <td><strong>{row.name}</strong><small>{row.slug}</small>{row.owner_names&&<small>Owner: {row.owner_names}</small>}<span className="sa-pill">{row.is_demo?'Demo flag on':'Demo flag off'}</span></td>
    <td><span className={'sa-pill '+(row.status==='ACTIVE'?'is-active':'')}>{label(row.status)}</span><small>{label(row.kyc)}</small></td>
    <td>{row.outlets} / {row.staff}</td><td>{row.orders} / {row.current_orders}</td>
    <td><div className="sa-row-actions"><button className="button primary" onClick={()=>setSelected(row)}>View data</button><button className="button" onClick={()=>onManage(row)}>Manage</button><button className="button" onClick={()=>onDocuments(row)}>KYC documents</button></div></td>
   </tr>)}</tbody></table></div>
   {!data.rows.length&&<p>No restaurants match these filters.</p>}
   <div className="sa-toolbar"><button className="button" disabled={data.page<=1} onClick={()=>setPage(data.page-1)}>Previous page</button><button className="button" disabled={data.page>=data.pages} onClick={()=>setPage(data.page+1)}>Next page</button></div>
   <p className="sa-help">Read from this app’s database · {date(data.readAt)}. Use Refresh to retrieve current data.</p>
  </>}
 </section>;
}

function RestaurantData({tenantId,revision,onBack}:{tenantId:string;revision:string;onBack:()=>void}){
 const [outletId,setOutletId]=useState(''),[result,setResult]=useState<{key:string;data:Row}|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const selection=tenantId+':'+outletId+':'+revision+':'+retry;
 useEffect(()=>{
  const abort=new AbortController();setError('');
  const query=new URLSearchParams({view:'restaurant',tenantId,...(outletId?{outletId}:{})});
  void request<Row>('/api/superadmin?'+query,{signal:abort.signal}).then(data=>{if(!abort.signal.aborted)setResult({key:selection,data})}).catch(issue=>{if(!abort.signal.aborted)setError((issue as Error).message)});
  return()=>abort.abort();
 },[tenantId,outletId,selection]);
 const data=result?.key===selection?result.data:null;
 const outletName=(id:string)=>data?.outlets.find((row:Row)=>row.id===id)?.name??id;
 return <section aria-label="Restaurant data"><button className="button" onClick={onBack}>Back to restaurants</button>
  {error?<div role="alert" className="error">{error} <button className="button" onClick={()=>setRetry(value=>value+1)}>Retry</button></div>:!data?<p role="status">Loading linked restaurant data…</p>:<>
   <div className="sa-heading"><div><h2>{data.restaurant.name}</h2><p>{data.restaurant.slug} · {data.restaurant.is_demo?'Demo flag on':'Demo flag off'}</p></div><label>Outlet data<select value={outletId} onChange={e=>setOutletId(e.target.value)}><option value="">All outlets ({data.outlets.length})</option>{data.outlets.map((row:Row)=><option key={row.id} value={row.id}>{row.name} · {row.code}</option>)}</select></label></div>
   <p className="sa-help">Read-only restaurant records · all time · {date(data.readAt)}. Selecting an outlet scopes every count and recent record below. Staff counts use saved outlet assignments.</p>
   <div className="sa-metrics">{[['Orders',data.summary.orders],['Active staff',data.summary.active_staff],['Active menu items',data.summary.active_menu_items],['Active tables',data.summary.tables],['Ingredients',data.summary.ingredients],['Issued bill documents',data.summary.issued_documents],['Verified payments',data.summary.verified_payments],['Gross verified receipts',money(data.summary.gross_verified_receipts)]].map(([name,value])=><article className="sa-metric" key={name}><span>{name}</span><strong>{String(value)}</strong></article>)}</div>
   <p className="sa-help">Receipts are recorded verified diner payments before refunds and replacement credits, not net sales or SaaS revenue. Bill documents include issued document types; original invoice snapshots and payment logs are preserved. Customer contact details and credentials are not exposed here.</p>
   <h3>Recent orders</h3><p className="sa-help">Latest {data.recentOrders.length}{data.moreOrders?' of more than 20':''} · all statuses, including voided orders.</p>
   <div className="sa-table-wrap"><table><thead><tr><th>Order</th><th>Outlet</th><th>Type / source</th><th>Status</th><th>Created</th></tr></thead><tbody>{data.recentOrders.map((row:Row)=><tr key={row.id}><td>#{row.number}</td><td>{outletName(row.outlet_id)}</td><td>{label(row.type)}<small>{label(row.source)}</small></td><td>{label(row.status)}</td><td>{date(row.created_at)}</td></tr>)}</tbody></table></div>{!data.recentOrders.length&&<p>No orders recorded.</p>}
   <h3>Recent bill documents</h3><p className="sa-help">Latest {data.recentInvoices.length}{data.moreInvoices?' of more than 20':''} issued records.</p>
   <div className="sa-table-wrap"><table><thead><tr><th>Document number</th><th>Outlet</th><th>Type</th><th>Issued</th></tr></thead><tbody>{data.recentInvoices.map((row:Row)=><tr key={row.id}><td>{row.number}</td><td>{outletName(row.outlet_id)}</td><td>{label(row.document_type)}</td><td>{date(row.created_at)}</td></tr>)}</tbody></table></div>{!data.recentInvoices.length&&<p>No bill documents recorded.</p>}
  </>}
 </section>;
}
