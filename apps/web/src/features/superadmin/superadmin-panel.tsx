"use client";

import {useCallback,useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';

import Link from 'next/link';

import {platformResources,platformPermissions,platformRolePermissions,platformFeatures,type PlatformField,type PlatformPermission} from '@dinerdost/core';

import {request,idempotentPost,money,date,label,type Row,ApiError} from '@/lib/client';

import {Logo,Icon,Modal} from '@/components/ui';

import {useQrImage,downloadQrCard} from '@/components/table-qr';

import {clientUuid} from '@/lib/browser-crypto';

import './superadmin.css';

const navigation=[{id:'overview',title:'Overview',icon:'overview',permissions:['overview']},{id:'tenants',title:'Restaurants',icon:'outlets',permissions:['tenants']},{id:'plans',title:'Plans & billing',icon:'payments',permissions:['plans']},{id:'ecosystem',title:'Dining & POS',icon:'floor',permissions:['ecosystem']},{id:'integrations',title:'Integrations',icon:'settings',permissions:['integrations']},{id:'team',title:'Internal team',icon:'team',permissions:['team']},{id:'audit',title:'Audit history',icon:'audit',permissions:['audit']},{id:'support',title:'Support & broadcasts',icon:'bell',permissions:['support','broadcasts']}];

type Dialog={type:'record'|'tenant'|'newTenant'|'member'|'support'|'qr'|'document'|'promo';kind?:string;row?:Row};

const amount=(value:unknown)=>value===null||value===undefined?'Not recorded':money(value);

const fieldValue=(form:FormData,key:string)=>String(form.get(key)??'').trim();

function Reason(){return <label>Reason for this change<textarea name="reason" minLength={5} maxLength={500} required rows={2}/></label>}

function Password({label:caption='Confirm your password',required=true}:{label?:string;required?:boolean}){return <label>{caption}<input name="adminPassword" type="password" autoComplete="current-password" required={required} maxLength={128}/></label>}

function SelectTenant({tenants,value,required=false,caption='Restaurant'}:{tenants:Row[];value?:string;required?:boolean;caption?:string}){return <label>{caption}<select name="tenantId" defaultValue={value??''} required={required}><option value="">{required?'Choose restaurant':'All restaurants'}</option>{tenants.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}

function Terms({row}:{row:Row}){return <dl className="sa-record-values">{Object.entries(row).filter(([key,value])=>value!==undefined&&value!==null&&value!==''&&!['password','adminPassword'].includes(key)).map(([key,value])=><div key={key}><dt>{label(key.replace(/([a-z])([A-Z])/g,'$1 $2'))}</dt><dd>{typeof value==='object'?Array.isArray(value)?value.map(v=>typeof v==='object'?JSON.stringify(v):String(v)).join(', '):JSON.stringify(value):typeof value==='boolean'?value?'Yes':'No':String(value)}</dd></div>)}</dl>}

export function SuperadminPanel(){

 const [data,setData]=useState<Row|null>(null),[section,setSection]=useState('overview'),[kind,setKind]=useState(''),[search,setSearch]=useState(''),[dialog,setDialog]=useState<Dialog|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[support,setSupport]=useState<Row|null>(null),[qr,setQr]=useState<Row[]>([]),[origin,setOrigin]=useState(''),[forbidden,setForbidden]=useState(false);

 const refresh=useCallback(async(signal?:AbortSignal)=>{try{const next=await request<Row>('/api/superadmin',{signal});if(signal?.aborted)return;setData(next);setForbidden(false);setError('');setSection(current=>navigation.some(item=>item.id===current&&item.permissions.some(p=>next.admin.permissions.includes(p)))?current:navigation.find(item=>item.permissions.some(p=>next.admin.permissions.includes(p)))?.id??'overview');}catch(issue){if(signal?.aborted)return;setError((issue as Error).message);if(issue instanceof ApiError&&issue.status===403){setForbidden(true);setData(null)}}},[]);

 useEffect(()=>{setOrigin(location.origin);const abort=new AbortController();void refresh(abort.signal);return()=>abort.abort()},[refresh]);

 useEffect(()=>{if(!support)return;const timeout=setTimeout(()=>{setSupport(null);setNotice('The temporary support view expired.')},Math.max(0,new Date(support.expiresAt).getTime()-Date.now()));return()=>clearTimeout(timeout)},[support]);
 const run=async(action:string,input:unknown)=>{setBusy(true);setError('');try{const result=await idempotentPost<Row>('/api/superadmin',{action,input});await refresh();setNotice('Changes saved.');return result;}catch(issue){setError((issue as Error).message);throw issue;}finally{setBusy(false)}};

 const submit=async(event:FormEvent<HTMLFormElement>,action:string,build:(form:FormData)=>unknown)=>{event.preventDefault();try{const result=await run(action,build(new FormData(event.currentTarget)));if(action==='startSupport'){setSupport({...await request<Row>('/api/superadmin/support?id='+result.id),id:result.id});setSection('support')}if(action==='bulkQr')setQr(result.tables);setDialog(null);}catch{}};

 if(!data)return <main className="sa-access"><Logo/><h1>Diner Dost superadmin</h1>{error?<><p role="alert">{error}</p><p>{forbidden?'Access is explicitly provisioned by a Diner Dost platform operator. Restaurant ownership does not grant superadmin access.':'Sign in with your provisioned platform account.'}</p><Link className="button primary" href="/superadmin/signin">Sign in</Link><Link className="button" href="/app/overview">Restaurant workspace</Link></>:<p role="status">Loading platform console…</p>}</main>;

 const allowed=navigation.filter(item=>item.permissions.some(p=>data.admin.permissions.includes(p))),can=(permission:PlatformPermission)=>data.admin.permissions.includes(permission);

 const resourceKinds=Object.keys(platformResources).filter(key=>{const permission=platformResources[key].permission;return can(permission)&&(section==='support'?['support','broadcasts'].includes(permission):permission===section)});

 const activeKind=resourceKinds.includes(kind)?kind:resourceKinds[0],records=(data.records as Row[]).filter(row=>row.kind===activeKind&&(!search||row.name.toLowerCase().includes(search.toLowerCase())));

 const tenants=(data.tenants as Row[]).filter(row=>!search||(row.name+' '+row.slug+' '+row.status).toLowerCase().includes(search.toLowerCase()));

 return <div className="sa-shell">

  <aside className="sa-sidebar"><Logo/><span className="sa-eyebrow">PLATFORM CONSOLE</span><nav aria-label="Superadmin navigation">{allowed.map(item=><button key={item.id} type="button" aria-current={section===item.id?'page':undefined} onClick={()=>{setSection(item.id);setKind('');setSearch('');setNotice('')}}><Icon name={item.icon}/>{item.title}</button>)}</nav><Link href="/app/overview">Restaurant workspace <span aria-hidden="true">↗</span></Link><div className="sa-account"><strong>{data.admin.name}</strong><span>{label(data.admin.role)}</span><button type="button" onClick={async()=>{await request('/api/superadmin/auth',{method:'POST',body:JSON.stringify({action:'logout'})});location.assign('/superadmin/signin')}}>Sign out</button></div></aside>

  <div className="sa-main"><header className="sa-topbar"><span>Local web administration</span><span className="sa-role">{label(data.admin.role)}</span><button className="button" type="button" disabled={busy} onClick={()=>void refresh()}>Refresh</button></header>

   <main className="sa-content"><div className="sa-heading"><div><span className="sa-eyebrow">DINER DOST</span><h1>{navigation.find(item=>item.id===section)?.title}</h1><p>Platform controls with explicit access and a recorded history.</p></div>{section==='tenants'&&<button className="button primary" onClick={()=>setDialog({type:'newTenant'})}><Icon name="plus"/>Create restaurant</button>}</div>

    {error&&<div className="error" role="alert">{error}</div>}{notice&&<div className="sa-notice" role="status">{notice}</div>}

    {section==='overview'&&data.metrics&&<Overview metrics={data.metrics}/>}

    {section==='tenants'&&<>{data.brandReports.length>0&&<div className="sa-card-grid">{data.brandReports.map((brand:Row)=><article className="sa-card" key={brand.id}><h2>{brand.name}</h2><Terms row={{restaurants:brand.restaurants,outlets:brand.outlets,ordersIn30Days:brand.orders_30d}}/></article>)}</div>}<div className="sa-toolbar"><label>Find a restaurant<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name or status"/></label><span>{tenants.length} restaurants shown</span></div><div className="sa-table-wrap"><table><thead><tr><th>Restaurant</th><th>Status / KYC</th><th>Outlets / staff</th><th>Orders · current / previous 7 days</th><th>Actions</th></tr></thead><tbody>{tenants.map(row=><tr key={row.id}><td><strong>{row.name}</strong><small>{row.slug}</small></td><td><span className={'sa-pill '+(row.status==='ACTIVE'?'is-active':'')}>{label(row.status)}</span><small>{label(row.kyc)}</small></td><td>{row.outlets} / {row.staff}</td><td>{row.current_orders} / {row.previous_orders}<small>{Number(row.previous_orders)?Math.round((Number(row.current_orders)-Number(row.previous_orders))*100/Number(row.previous_orders))+'% change':'No prior-week baseline'}</small></td><td><button className="button" onClick={()=>setDialog({type:'tenant',row})}>Manage</button> <button className="button" onClick={()=>setDialog({type:'document',row})}>KYC documents</button></td></tr>)}</tbody></table></div></>}

    {resourceKinds.length>0&&<section className="sa-resources"><div className="sa-resource-tabs" role="group" aria-label="Administration categories">{resourceKinds.map(key=><button type="button" className={activeKind===key?'is-current':''} key={key} onClick={()=>{setKind(key);setSearch('')}}>{platformResources[key].title}</button>)}</div><div className="sa-section-heading"><div><h2>{platformResources[activeKind].title}</h2><p>{platformResources[activeKind].description}</p></div><button className="button primary" onClick={()=>setDialog({type:'record',kind:activeKind})}>Add {activeKind==='BILLING'?'record':'new'}</button></div>

     {section==='integrations'&&<div className="sa-notice">Provider connections, secret keys, webhooks, payment routing and external dispatch remain unconfigured. These records do not activate a provider.</div>}

     <div className="sa-card-grid">{records.map(row=><article className="sa-card" key={row.id}><div className="sa-section-heading"><h3>{row.name}</h3><span className="sa-pill">{row.archived?'Archived':row.kind==='INTEGRATION'?'Not configured':row.kind==='DOMAIN'?'Ownership pending':row.kind==='FEE_RULE'?'Proposal':row.kind==='BILLING'?'Recorded':label(row.data.status??'Saved')}</span></div>{row.tenant_id&&<p>{data.tenants.find((tenant:Row)=>tenant.id===row.tenant_id)?.name??'Restaurant'}</p>}<Terms row={Object.fromEntries(Object.entries(row.data).filter(([key])=>!['planFee','planCycle'].includes(key)))}/><div className="sa-card-footer"><small>Version {row.version}</small>{row.kind!=='BILLING'&&<button type="button" className="button" onClick={()=>setDialog({type:'record',kind:activeKind,row})}>Edit</button>}</div></article>)}</div>{!records.length&&<div className="sa-empty">No {platformResources[activeKind].title.toLowerCase()} recorded yet.</div>}

    </section>}

    {section==='plans'&&<section className="sa-card"><div className="sa-section-heading"><div><h2>SaaS account balances</h2><p>Manual invoices less credits and recorded payments. These do not change diner payments or bank accounts.</p></div><button className="button" onClick={()=>setDialog({type:'promo'})}>Apply onboarding promotion</button></div>{data.balances.length?data.balances.map((b:Row)=><p key={b.id}>{b.name} <strong>{money(b.balance)}</strong></p>):<p>No subscription billing records yet.</p>}</section>}

    {section==='ecosystem'&&<section className="sa-card"><div className="sa-section-heading"><div><h2>Table QR provisioning</h2><p>Create an explicit batch of tables and independent QR keys in the selected outlet.</p></div><button className="button primary" onClick={()=>setDialog({type:'qr'})}>Create QR batch</button></div>{(qr.length>0||data.qrTables.length>0)&&<><p className="sa-help">{qr.length?'Latest created batch':'Current table QR codes · up to 200 shown'}</p><div className="sa-qr-grid">{(qr.length?qr:data.qrTables).map((row:Row)=><QrPreview key={row.id} table={row} origin={origin}/>)}</div></>}</section>}

    {section==='team'&&<section className="sa-card"><div className="sa-section-heading"><div><h2>Internal platform access</h2><p>Grant existing accounts a platform role. Tenant employee roles are separate.</p></div><button className="button primary" onClick={()=>setDialog({type:'member'})}>Grant access</button></div><div className="sa-table-wrap"><table><thead><tr><th>Name</th><th>Role</th><th>Permissions</th><th>State</th><th/></tr></thead><tbody>{data.members.map((row:Row)=><tr key={row.user_id}><td><strong>{row.name}</strong><small>{row.email}</small></td><td>{label(row.role)}</td><td>{row.permissions.map((p:string)=>label(p)).join(', ')}</td><td>{row.enabled?'Enabled':'Disabled'}</td><td><button className="button" onClick={()=>setDialog({type:'member',row})}>Edit access</button></td></tr>)}</tbody></table></div></section>}

    {section==='audit'&&<section className="sa-card"><div className="sa-section-heading"><div><h2>Immutable platform history</h2><p>Latest 100 events. Restaurant invoice and payment histories remain separate.</p></div><button className="button" disabled={busy} onClick={async()=>{try{const result=await run('verifyAudit',{});setNotice(result.valid?'Audit chain verified · '+result.count+' events.':'Audit chain verification failed.')}catch{}}}>Verify audit chain</button></div>{data.audits.map((row:Row)=><details className="sa-audit" key={row.id}><summary><strong>{label(row.action)}</strong><span>{row.actor_name} · {date(row.occurred_at)}</span></summary><p>{row.reason}</p><small>IP: {row.ip??'Local operator'} · Sequence {row.sequence}</small><div className="sa-audit-diff"><div><h3>Before</h3><Terms row={row.before_data??{state:'None'}}/></div><div><h3>After</h3><Terms row={row.after_data??{state:'None'}}/></div></div></details>)}</section>}

    {section==='support'&&can('support')&&<section className="sa-card"><div className="sa-section-heading"><div><h2>Temporary support view</h2><p>Read-only, bound to your session and limited to 15 minutes. Owner passwords are never used.</p></div><button className="button primary" onClick={()=>setDialog({type:'support'})}>Open support view</button></div>{support&&<><div className="sa-notice"><strong>{support.restaurant.name} · Read-only</strong><p>Expires {date(support.expiresAt)}</p><button className="button" onClick={async()=>{try{await run('endSupport',{id:support.id,reason:'Support review completed'});setSupport(null)}catch{}}}>End support view</button></div><h3>Menu</h3><div className="sa-table-wrap"><table><thead><tr><th>Item</th><th>Price</th><th>Status</th></tr></thead><tbody>{support.menu.map((row:Row)=><tr key={row.id}><td>{row.name}</td><td>{money(row.price)}</td><td>{row.active?'Active':'Inactive'}</td></tr>)}</tbody></table></div><h3>Recent order states</h3><p>{support.orders.length} orders · {support.invoices.length} issued bills shown</p>{support.orders.map((row:Row)=><p key={row.id}>{label(row.type)} · {label(row.status)} · {date(row.created_at)}</p>)}</>}</section>}

   </main>

  </div>

  {dialog&&<Modal title={dialog.type==='record'?(dialog.row?'Edit ':'New ')+platformResources[dialog.kind!].title:({tenant:'Manage restaurant',newTenant:'Create restaurant',member:'Internal platform access',support:'Open read-only support view',qr:'Create table QR batch',document:'Private KYC documents',promo:'Apply SaaS promotion'} as Row)[dialog.type]} onClose={()=>{if(!busy)setDialog(null)}}><div className="sa-dialog">{error&&<p className="error" role="alert">{error}</p>}

   {dialog.type==='record'&&<RecordForm dialog={dialog} data={data} busy={busy} submit={submit}/>}

   {dialog.type==='tenant'&&<form onSubmit={e=>submit(e,'saveTenant',form=>({tenantId:dialog.row!.id,version:dialog.row!.version,status:fieldValue(form,'status'),kyc:fieldValue(form,'kyc'),brandId:fieldValue(form,'brandId')||null,planId:fieldValue(form,'planId')||null,businessType:fieldValue(form,'businessType'),gstin:fieldValue(form,'gstin'),license:fieldValue(form,'license'),notes:fieldValue(form,'notes'),adminPassword:fieldValue(form,'adminPassword')||undefined,reason:fieldValue(form,'reason')}))}><fieldset disabled={busy}><strong>{dialog.row!.name}</strong><label>Account status<select name="status" defaultValue={dialog.row!.status}>{['ACTIVE','HOLD','SUSPENDED','TERMINATED'].map(value=><option key={value}>{value}</option>)}</select></label><p className="sa-help">Hold and suspension stop new web operations while keeping historical records readable. Termination cannot be reversed from this panel.</p><label>Business type<select name="businessType" defaultValue={dialog.row!.details?.businessType??'RESTAURANT'}>{['RESTAURANT','CLOUD_KITCHEN','FRANCHISE'].map(value=><option key={value}>{value}</option>)}</select></label><label>KYC review<select name="kyc" defaultValue={dialog.row!.kyc}>{['UNREVIEWED','VERIFIED','REJECTED'].map(value=><option key={value}>{value}</option>)}</select></label><label>GSTIN<input name="gstin" maxLength={30} defaultValue={dialog.row!.details?.gstin??''}/></label><label>Business license reference<input name="license" maxLength={100} defaultValue={dialog.row!.details?.license??''}/></label><label>Parent brand<select name="brandId" defaultValue={dialog.row!.brand_id??''}><option value="">Independent</option>{data.records.filter((r:Row)=>r.kind==='BRAND'&&!r.archived).map((r:Row)=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label>Web plan<select name="planId" defaultValue={dialog.row!.plan_id??''}><option value="">Existing unrestricted access</option>{data.records.filter((r:Row)=>r.kind==='PLAN'&&!r.archived).map((r:Row)=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><p className="sa-help">Saving applies the selected plan’s current limits. Existing assignments are not silently changed when a plan definition is edited.</p><label>Review notes<textarea name="notes" rows={3} maxLength={2000} defaultValue={dialog.row!.details?.notes??''}/></label><Password label="Your password · required only for termination" required={false}/><Reason/><button className="button primary">Save restaurant</button></fieldset></form>}

   {dialog.type==='newTenant'&&<form onSubmit={e=>submit(e,'createTenant',form=>({name:fieldValue(form,'name'),outlet:fieldValue(form,'outlet'),ownerName:fieldValue(form,'ownerName'),email:fieldValue(form,'email'),password:fieldValue(form,'password'),reason:fieldValue(form,'reason')}))}><fieldset disabled={busy}><p>Creates a new owner account on hold for review, with a blank menu and tax settings. Existing emails and accounts are never replaced.</p>{[['name','Restaurant name'],['outlet','First outlet'],['ownerName','Owner name'],['email','Owner email'],['password','Initial owner password']].map(([name,caption])=><label key={name}>{caption}<input name={name} type={name==='email'?'email':name==='password'?'password':'text'} autoComplete={name==='password'?'new-password':'off'} required minLength={name==='password'?12:2} maxLength={name==='password'?128:150}/></label>)}<Reason/><button className="button primary">Create restaurant on hold</button></fieldset></form>}

   {dialog.type==='member'&&<form onSubmit={e=>submit(e,'saveMember',form=>({email:fieldValue(form,'email'),role:fieldValue(form,'role'),permissions:form.getAll('permissions'),enabled:form.get('enabled')==='on',version:dialog.row?.version??0,reason:fieldValue(form,'reason'),adminPassword:fieldValue(form,'adminPassword')}))}><fieldset disabled={busy}><label>Existing account email<input name="email" type="email" defaultValue={dialog.row?.email??''} readOnly={!!dialog.row} required/></label><label>Platform role<select name="role" defaultValue={dialog.row?.role??'SUPPORT'}>{Object.keys(platformRolePermissions).map(value=><option key={value}>{value}</option>)}</select></label><fieldset><legend>Custom-role permissions</legend><p className="sa-help">Used only for Custom. Named roles use their defined permission set.</p>{platformPermissions.filter(p=>p!=='team').map(p=><label className="sa-check" key={p}><input name="permissions" type="checkbox" value={p} defaultChecked={dialog.row?.permissions.includes(p)}/>{label(p)}</label>)}</fieldset><label className="sa-check"><input name="enabled" type="checkbox" defaultChecked={dialog.row?.enabled??true}/>Enabled</label><Password/><Reason/><button className="button primary">Save platform access</button></fieldset></form>}

   {dialog.type==='support'&&<form onSubmit={e=>submit(e,'startSupport',form=>({tenantId:fieldValue(form,'tenantId'),reason:fieldValue(form,'reason'),adminPassword:fieldValue(form,'adminPassword')}))}><fieldset disabled={busy}><SelectTenant tenants={data.tenants} required/><Reason/><Password/><button className="button primary">Open 15-minute read-only view</button></fieldset></form>}

   {dialog.type==='document'&&<><p>{dialog.row!.name} · Documents are private, downloaded as attachments and recorded in the audit log.</p>{data.documents.filter((d:Row)=>d.restro_id===dialog.row!.id).map((doc:Row)=><p key={doc.id}><a href={'/api/superadmin/documents?id='+doc.id}>{doc.name}</a><small> · {date(doc.created_at)}</small></p>)}<KycUploadForm tenantId={dialog.row!.id} busy={busy} upload={async(form,key)=>{setBusy(true);setError('');try{const reply=await fetch('/api/superadmin/documents',{method:'POST',headers:{'Idempotency-Key':key},body:form}),result=await reply.json();if(!reply.ok)throw new Error(result.error?.message??'Document upload failed.');await refresh();setNotice('Private KYC document saved.');setDialog(null)}catch(issue){setError((issue as Error).message);throw issue}finally{setBusy(false)}}}/></>}

   {dialog.type==='promo'&&<form onSubmit={e=>submit(e,'redeemPromo',form=>({tenantId:fieldValue(form,'tenantId'),promoId:fieldValue(form,'promoId'),reason:fieldValue(form,'reason')}))}><fieldset disabled={busy}><p>Records one immutable SaaS account credit. A restaurant can use each onboarding promotion once; expiry and total-use limits are enforced.</p><SelectTenant tenants={data.tenants} required/><label>Promotion<select name="promoId" required><option value="">Choose promotion</option>{data.records.filter((r:Row)=>r.kind==='PROMO'&&!r.archived).map((r:Row)=><option key={r.id} value={r.id}>{r.name} · {r.data.code}</option>)}</select></label><Reason/><button className="button primary">Apply SaaS credit</button></fieldset></form>}

   {dialog.type==='qr'&&<form onSubmit={e=>submit(e,'bulkQr',form=>({outletId:fieldValue(form,'outletId'),prefix:fieldValue(form,'prefix'),floor:fieldValue(form,'floor'),start:Number(form.get('start')),count:Number(form.get('count')),seats:Number(form.get('seats')),reason:fieldValue(form,'reason')}))}><fieldset disabled={busy}><label>Outlet<select name="outletId" required><option value="">Choose outlet</option>{data.outlets.map((row:Row)=><option key={row.id} value={row.id}>{data.tenants.find((t:Row)=>t.id===row.restro_id)?.name} · {row.name}</option>)}</select></label><label>Table label prefix<input name="prefix" required maxLength={20}/></label><label>Floor name<input name="floor" required maxLength={80}/></label>{[['start','First number',1,100000],['count','Number of tables',1,50],['seats','Seats per table',1,100]].map(([name,caption,min,max])=><label key={name}>{caption}<input name={String(name)} type="number" min={Number(min)} max={Number(max)} required/></label>)}<Reason/><button className="button primary">Create tables and QR codes</button></fieldset></form>}

  </div></Modal>}

 </div>;

}

function RecordForm({dialog,data,busy,submit}:{dialog:Dialog;data:Row;busy:boolean;submit:(event:FormEvent<HTMLFormElement>,action:string,build:(form:FormData)=>unknown)=>Promise<void>}){

 const kind=dialog.kind!,spec=platformResources[kind],row=dialog.row;

 return <form onSubmit={e=>submit(e,'saveRecord',form=>{const values:Row={};for(const field of spec.fields){const value=fieldValue(form,field.key);if(field.type==='features')values[field.key]=form.getAll(field.key);else if(field.type==='checkbox')values[field.key]=form.get(field.key)==='on';else if(value!=='')values[field.key]=field.type==='number'?Number(value):field.type==='datetime-local'?new Date(value+':00+05:30').toISOString():value;}return {id:row?.id,kind,name:fieldValue(form,'name'),tenantId:fieldValue(form,'tenantId')||null,version:row?.version??0,data:values,archived:form.get('archived')==='on',reason:fieldValue(form,'reason')}})}><fieldset disabled={busy}><p>{spec.description}</p><label>Name<input name="name" required maxLength={150} defaultValue={row?.name??''}/></label>{(spec.tenant||kind==='BROADCAST')&&<SelectTenant tenants={data.tenants} value={row?.tenant_id} required={spec.tenant}/>} {spec.fields.map(field=><ResourceField key={field.key} field={field} value={row?.data[field.key]} data={data}/>)}{row&&<label className="sa-check"><input name="archived" type="checkbox" defaultChecked={row.archived}/>Archive definition</label>}<Reason/><button className="button primary">Save {kind==='BILLING'?'immutable record':'definition'}</button></fieldset></form>;

}

function ResourceField({field,value,data}:{field:PlatformField;value:any;data:Row}){

 if(field.type==='features')return <fieldset className="sa-feature-options"><legend>{field.label}</legend>{platformFeatures.map(feature=><label className="sa-check" key={feature}><input name={field.key} type="checkbox" value={feature} defaultChecked={value?.includes(feature)??false}/>{label(feature)}</label>)}</fieldset>;

 if(field.type==='checkbox')return <label className="sa-check"><input name={field.key} type="checkbox" defaultChecked={value??false}/>{field.label}</label>;

 let control:ReactNode;

 if(field.key==='planId')control=<select name={field.key} defaultValue={value??''} required><option value="">Choose plan</option>{data.records.filter((row:Row)=>row.kind==='PLAN'&&!row.archived).map((row:Row)=><option key={row.id} value={row.id}>{row.name}</option>)}</select>;

 else if(field.type==='select')control=<select name={field.key} defaultValue={value??''} required={field.required}><option value="">Choose</option>{field.options!.map(option=><option key={option}>{option}</option>)}</select>;

 else if(field.type==='textarea')control=<textarea name={field.key} required={field.required} maxLength={2000} rows={3} defaultValue={value??''}/>;

 else control=<input name={field.key} type={field.type??'text'} required={field.required} min={field.min} max={field.max} step={field.type==='number'?['fee','amount','rate'].includes(field.key)?'.01':'1':undefined} defaultValue={field.type==='datetime-local'&&value?new Date(new Date(value).getTime()+330*60000).toISOString().slice(0,16):value??''}/>;

 return <label>{field.label}{field.type==='datetime-local'?' · India time':''}{control}</label>;

}

function Overview({metrics:m}:{metrics:Row}){return <><div className="sa-metrics">{[['Restaurants',m.restaurants],['Outlets',m.outlets],['Active staff',m.staff],['Orders created · 30 days',m.orders_30d],['Verified diner receipts · 30 days',amount(m.verified_receipts_30d)],['Contracted MRR',amount(m.contractedMrr)],['Contracted ARR',amount(m.contractedArr)]].map(([name,value],index)=><article className={'sa-metric '+(!index?'is-primary':'')} key={name}><span>{name}</span><strong>{String(value)}</strong></article>)}</div><p className="sa-help">Verified receipts are gross recorded diner payments before refunds. Contracted recurring amounts come only from recorded active SaaS subscriptions; they are not collected revenue.</p><div className="sa-card-grid"><section className="sa-card"><h2>System health</h2><Terms row={{database:'Connected',lastDatabaseCheck:m.databaseLatencyMs+' ms',providerConnections:'Not configured'}}/><h3>Outbox events</h3>{m.queues.map((row:Row)=><p key={row.state}>{label(row.state)}: {row.count}</p>)}</section><section className="sa-card"><h2>Revenue measurement</h2><p>CAC, net revenue retention and churn are not yet recorded. No estimates are substituted for missing acquisition costs or subscription history.</p><p>Restaurant activity comparisons appear in Restaurants.</p></section></div></>}

function QrPreview({table,origin}:{table:Row;origin:string}){const url=origin+'/q/'+table.key,{image,error}=useQrImage(url);return <article><h3>{table.label}</h3>{error?<p role="alert">{error}</p>:image?<img src={image} width={180} height={180} alt={'QR for '+table.label}/>:<span>Preparing QR…</span>}<button className="button" disabled={!image} onClick={()=>void downloadQrCard({url,label:table.label},image)}>Download QR card</button></article>}



function KycUploadForm({tenantId,busy,upload}:{tenantId:string;busy:boolean;upload:(form:FormData,key:string)=>Promise<void>}){const requestKey=useRef('');return <form onChange={()=>{requestKey.current=''}} onSubmit={async event=>{event.preventDefault();const form=new FormData(event.currentTarget);requestKey.current||=clientUuid();try{await upload(form,requestKey.current)}catch{}}}><fieldset disabled={busy}><input type="hidden" name="tenantId" value={tenantId}/><label>Business license / KYC evidence<input name="file" type="file" accept="application/pdf,image/png,image/jpeg" required/></label><p className="sa-help">PDF, PNG or JPEG, up to 2 MiB. Upload authentic supplied evidence only.</p><Reason/><button className="button primary">Save private document</button></fieldset></form>}
