"use client";

import {useCallback,useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';

import Link from 'next/link';
import {useUrlState} from '@/lib/use-url-state';

import {platformResources,platformPermissions,platformRolePermissions,platformFeatures,type PlatformField,type PlatformPermission} from '@dinerdost/core';

import {request,idempotentPost,money,date,label,type Row,ApiError} from '@/lib/client';

import {Logo,Icon,Modal} from '@/components/ui';



import {clientUuid} from '@/lib/browser-crypto';

import './superadmin.css';
import {OperationsPanel} from './operations-panel';
import {SupportCenter} from '@/features/support/support-center';
import {UploadField} from '@/components/upload-field';
import {RestaurantDirectory,DatasetFilter} from './restaurant-data';

import {consoleNavigation as navigation} from './console-navigation';
import {ConsoleShell} from './console-shell';
import {FeatureControls} from './feature-controls';
import {ConsoleOverview} from './console-overview';

type Dialog={type:'record'|'tenant'|'newTenant'|'member'|'support'|'qr'|'document'|'promo';kind?:string;row?:Row};



const fieldValue=(form:FormData,key:string)=>String(form.get(key)??'').trim();

function Reason(){return <label>Reason for this change<textarea name="reason" minLength={5} maxLength={500} required rows={2}/></label>}

function Password({label:caption='Confirm your password',required=true}:{label?:string;required?:boolean}){return <label>{caption}<input name="adminPassword" type="password" autoComplete="current-password" required={required} maxLength={128}/></label>}

function SelectTenant({tenants,value,required=false,caption='Restaurant'}:{tenants:Row[];value?:string;required?:boolean;caption?:string}){return <label>{caption}<select name="tenantId" defaultValue={value??''} required={required}><option value="">{required?'Choose restaurant':'All restaurants'}</option>{tenants.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}

function Terms({row}:{row:Row}){return <dl className="sa-record-values">{Object.entries(row).filter(([key,value])=>value!==undefined&&value!==null&&value!==''&&!['password','adminPassword'].includes(key)).map(([key,value])=><div key={key}><dt>{label(key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/([a-zA-Z])(\d)/g,'$1 $2').replace(/(\d)([a-zA-Z])/g,'$1 $2'))}</dt><dd>{typeof value==='object'?Array.isArray(value)?value.map(v=>typeof v==='object'?JSON.stringify(v):String(v)).join(', '):JSON.stringify(value):typeof value==='boolean'?value?'Yes':'No':String(value)}</dd></div>)}</dl>}

const consoleDefaults={section:'overview',kind:'',search:'',recordState:'all',dataset:'all'};
export function SuperadminPanel(){
 const [urlState,updateUrl]=useUrlState(consoleDefaults);
 const {kind,search,recordState,dataset}=urlState;
 const setSearch=(search:string)=>updateUrl({search},true);
 const setRecordState=(recordState:string)=>updateUrl({recordState},true);
 const setDataset=(dataset:string)=>updateUrl({dataset},true);


 const [refreshing,setRefreshing]=useState(false);
 const refreshSequence=useRef(0);
 const [data,setData]=useState<Row|null>(null),[dialog,setDialog]=useState<Dialog|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[qr,setQr]=useState<Row[]>([]),[origin,setOrigin]=useState(''),[forbidden,setForbidden]=useState(false);
 const section=navigation.some(item=>item.id===urlState.section&&(!data||item.permissions.some(p=>data.admin.permissions.includes(p)))&&(item.id!=='features'||!data||data.admin.role==='SUPERADMIN'))?urlState.section:'overview';

 const refresh=useCallback(async(signal?:AbortSignal)=>{const sequence=++refreshSequence.current;setRefreshing(true);try{const next=await request<Row>('/api/superadmin?dataset='+dataset,{signal});if(signal?.aborted||sequence!==refreshSequence.current)return;setData(next);setForbidden(false);setError('');}catch(issue){if(signal?.aborted||sequence!==refreshSequence.current)return;setError((issue as Error).message);if(issue instanceof ApiError&&issue.status===403){setForbidden(true);setData(null)}}finally{if(sequence===refreshSequence.current)setRefreshing(false)}},[dataset]);

 useEffect(()=>{if(new URLSearchParams(location.search).get('supportChat')||sessionStorage.getItem('dd-return-support-thread'))updateUrl({section:'messages'},true);setOrigin(location.origin);const abort=new AbortController();void refresh(abort.signal);return()=>abort.abort()},[refresh]);

 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),7000);return()=>clearTimeout(timer)},[notice]);
 const changeSection=(id:string)=>{if(!updateUrl({section:id,kind:'',search:'',recordState:'all'}))return false;setNotice('');return true};
 const run=async(action:string,input:unknown)=>{setBusy(true);setError('');try{const result=await idempotentPost<Row>('/api/superadmin',{action,input});await refresh();setNotice('Changes saved.');return result;}catch(issue){setError((issue as Error).message);throw issue;}finally{setBusy(false)}};

 const submit=async(event:FormEvent<HTMLFormElement>,action:string,build:(form:FormData)=>unknown)=>{event.preventDefault();try{const result=await run(action,build(new FormData(event.currentTarget)));if(action==='startSupport'){setBusy(true);try{await request('/api/superadmin/support-view',{method:'POST',body:JSON.stringify({action:'start',id:result.id})});location.assign('/app/overview');return}finally{setBusy(false)}}setDialog(null);}catch{}};

 if(!data)return <main className="sa-access"><Logo/><h1>Diner Dost superadmin</h1>{error?<><p role="alert">{error}</p><p>{forbidden?'Access is explicitly provisioned by a Diner Dost platform operator. Restaurant ownership does not grant superadmin access.':'Sign in with your provisioned platform account.'}</p><Link className="button primary" href="/superadmin/signin">Sign in</Link><Link className="button" href="/app/overview">Restaurant workspace</Link></>:<p role="status">Loading platform console…</p>}</main>;

 const can=(permission:PlatformPermission)=>data.admin.permissions.includes(permission);

 const resourceKinds=Object.keys(platformResources).filter(key=>{const permission=platformResources[key].permission;return can(permission)&&(section==='support'?['support','broadcasts'].includes(permission):permission===section)});

 const activeKind=resourceKinds.includes(kind)?kind:resourceKinds[0],records=(data.records as Row[]).filter(row=>row.kind===activeKind&&(recordState==='all'||row.archived===(recordState==='archived'))&&(!search||row.name.toLowerCase().includes(search.toLowerCase())));

 const tenants=(data.tenants as Row[]).filter(row=>!search||(row.name+' '+row.slug+' '+row.status).toLowerCase().includes(search.toLowerCase()));

 return <ConsoleShell data={data} section={section} refreshing={refreshing} busy={busy} modalOpen={!!dialog} onNavigate={changeSection} onRefresh={()=>void refresh()} onRestaurant={row=>setDialog({type:'tenant',row})}>
   <main id="sa-main-content" tabIndex={-1} className="sa-content"><div className="sa-heading"><div><span className="sa-section-label">{navigation.find(item=>item.id===section)?.group}</span><h1>{navigation.find(item=>item.id===section)?.title}</h1><p>{navigation.find(item=>item.id===section)?.description}</p></div>{section==='tenants'&&data.admin.tenantScope===null&&<button className="button primary" onClick={()=>setDialog({type:'newTenant'})}><Icon name="plus"/>Create restaurant</button>}</div>

    {section==='messages'&&can('support')&&<SupportCenter platform/>}
    {error&&<div className="error" role="alert">{error}</div>}{notice&&<div className="sa-notice sa-toast" role="status"><Icon name="check"/>{notice}<button aria-label="Dismiss notification" onClick={()=>setNotice('')}>×</button></div>}

    {section==='features'&&data.admin.role==='SUPERADMIN'&&<FeatureControls data={data} refresh={()=>refresh()}/>}
    {section==='overview'&&data.metrics&&<><div className="sa-toolbar"><DatasetFilter value={dataset} onChange={setDataset}/>{can('tenants')&&<button className="button primary" onClick={()=>changeSection('tenants')}>Browse restaurant data</button>}</div><ConsoleOverview data={data} onNavigate={changeSection}/></>}

    {section==='tenants'&&<>{data.brandReports.length>0&&<div className="sa-card-grid">{data.brandReports.map((brand:Row)=><article className="sa-card" key={brand.id}><h2>{brand.name}</h2><p className="sa-help">Brand totals · all stored records</p><Terms row={{restaurants:brand.restaurants,outlets:brand.outlets,ordersIn30Days:brand.orders_30d}}/></article>)}</div>}<RestaurantDirectory dataset={dataset} onDataset={setDataset} revision={data.readAt} onManage={row=>setDialog({type:'tenant',row})} onDocuments={row=>setDialog({type:'document',row})}/></>}


    {resourceKinds.length>0&&<section className="sa-resources"><div className="sa-resource-tabs" role="group" aria-label="Administration categories">{resourceKinds.map(key=><button type="button" className={activeKind===key?'is-current':''} key={key} aria-label={platformResources[key].title} aria-pressed={activeKind===key} onClick={()=>{updateUrl({kind:key,search:'',recordState:'all'})}}>{platformResources[key].title}</button>)}</div><div className="sa-section-heading"><div><h2>{platformResources[activeKind].title}</h2><p>{platformResources[activeKind].description}</p></div><button className="button primary" onClick={()=>setDialog({type:'record',kind:activeKind})}>Add {activeKind==='BILLING'?'record':'new'}</button></div>

     {section==='integrations'&&<div className="sa-notice">Provider connections, secret keys, webhooks, payment routing and external dispatch remain unconfigured. These records do not activate a provider.</div>}

     <div className="sa-toolbar sa-record-filters"><label>Find a definition<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search this category…"/></label><label>Record visibility<select value={recordState} onChange={e=>setRecordState(e.target.value)}><option value="all">All records</option><option value="active">Current records</option><option value="archived">Archived records</option></select></label><span>{records.length} {records.length===1?'record':'records'}</span></div><div className="sa-card-grid">{records.map(row=><article className="sa-card" key={row.id}><div className="sa-section-heading"><h3>{row.name}</h3><span className="sa-pill">{row.archived?'Archived':row.kind==='INTEGRATION'?'Not configured':row.kind==='DOMAIN'?'Ownership pending':row.kind==='FEE_RULE'?'Proposal':row.kind==='BILLING'?'Recorded':label(row.data.status??'Saved')}</span></div>{row.tenant_id&&<p>{data.tenants.find((tenant:Row)=>tenant.id===row.tenant_id)?.name??'Restaurant'}</p>}<Terms row={Object.fromEntries(Object.entries(row.data).filter(([key])=>!['planFee','planCycle'].includes(key)))}/><div className="sa-card-footer"><small>Version {row.version}</small>{row.kind!=='BILLING'&&<button type="button" className="button" onClick={()=>setDialog({type:'record',kind:activeKind,row})}>Edit</button>}</div></article>)}</div>{!records.length&&<div className="sa-empty">{search||recordState!=='all'?'No records match these filters.':'No '+platformResources[activeKind].title.toLowerCase()+' recorded yet.'}</div>}

    </section>}

    {section==='plans'&&<section className="sa-card"><div className="sa-section-heading"><div><h2>SaaS account balances</h2><p>Manual invoices less credits and recorded payments. These do not change diner payments or bank accounts.</p></div><button className="button" onClick={()=>setDialog({type:'promo'})}>Apply onboarding promotion</button></div>{data.balances.length?data.balances.map((b:Row)=><p key={b.id}>{b.name} <strong>{money(b.balance)}</strong></p>):<p>No subscription billing records yet.</p>}</section>}

    {section==='team'&&<section className="sa-card"><div className="sa-section-heading"><div><h2>Internal platform access</h2><p>Grant existing accounts a platform role. Tenant employee roles are separate.</p></div><button className="button primary" onClick={()=>setDialog({type:'member'})}>Grant access</button></div><div className="sa-table-wrap"><table><thead><tr><th>Name</th><th>Role</th><th>Permissions</th><th>State</th><th/></tr></thead><tbody>{data.members.map((row:Row)=><tr key={row.user_id}><td><strong>{row.name}</strong><small>{row.email}</small></td><td>{label(row.role)}</td><td>{row.permissions.map((p:string)=>label(p)).join(', ')}</td><td>{row.enabled?'Enabled':'Disabled'}</td><td><button className="button" onClick={()=>setDialog({type:'member',row})}>Edit access</button></td></tr>)}</tbody></table></div></section>}

    {section==='audit'&&<section className="sa-card sa-audit-panel" aria-label="Recorded actions"><div className="sa-section-heading"><div><span className="sa-section-label">Activity register</span><h2>Recorded actions</h2><p>Latest 100 actions. Reads and refreshes are excluded. Earlier activity stays in the verified chain.</p></div><button className="button" disabled={busy} onClick={async()=>{try{const result=await run('verifyAudit',{});setNotice(result.valid?'Audit chain verified · '+result.count+' events.':'Audit chain verification failed.')}catch{}}}><Icon name="audit"/>Verify audit chain</button></div><div className="sa-audit-columns" aria-hidden="true"><span>Action</span><span>Administrator</span><span>Recorded at</span></div>{data.audits.map((row:Row)=><details className="sa-audit" key={row.id}><summary><div className="sa-audit-title"><Icon className="sa-audit-chevron" name="chevron"/><div><strong>{label(row.action==='PLATFORM_OWNER_ACTION'?row.after_data?.action??row.action:String(row.action).replace(/^PLATFORM_/,''))}</strong><small>{row.action==='PLATFORM_OWNER_ACTION'?'Owner support':'Platform action'}{data.tenants.find((r:Row)=>r.id===row.entity_id)?.name?' · '+data.tenants.find((r:Row)=>r.id===row.entity_id).name:''}</small></div></div><span className="sa-audit-actor">{row.actor_name}</span><time className="sa-audit-time" dateTime={new Date(row.occurred_at).toISOString()}>{date(row.occurred_at)}</time></summary><div className="sa-audit-body"><p>{row.reason}</p><div className="sa-audit-meta"><span>IP: {row.ip??'Local operator'}</span><span>Sequence {row.sequence}</span></div><div className="sa-audit-diff"><div><h3>Before</h3><Terms row={row.before_data??{state:'None'}}/></div><div><h3>After</h3><Terms row={row.after_data??{state:'None'}}/></div></div></div></details>)}{!data.audits.length&&<p className="sa-empty">No actions recorded yet.</p>}</section>}

    {section==='support'&&can('support')&&<section className="sa-card"><div className="sa-section-heading"><div><h2>Restaurant dashboard support</h2><p>Enter the restaurant’s full owner dashboard for 15 minutes. Read-only by default; Superadmin can explicitly enable real troubleshooting changes.</p></div><button className="button primary" onClick={()=>setDialog({type:'support'})}>Open restaurant dashboard</button></div></section>}


   {['overview','tenants','plans','support'].includes(section)&&<OperationsPanel section={section} snapshot={data} onRefresh={()=>refresh()}/>}</main>

  {dialog&&<Modal title={dialog.type==='record'?(dialog.row?'Edit ':'New ')+platformResources[dialog.kind!].title:({tenant:'Manage restaurant',newTenant:'Create restaurant',member:'Internal platform access',support:'Open restaurant dashboard',qr:'Create table QR batch',document:'Private KYC documents',promo:'Apply SaaS promotion'} as Row)[dialog.type]} onClose={()=>{if(!busy)setDialog(null)}}><div className="sa-dialog">{error&&<p className="error" role="alert">{error}</p>}

   {dialog.type==='record'&&<RecordForm dialog={dialog} data={data} busy={busy} submit={submit}/>}

   {dialog.type==='tenant'&&<form onSubmit={e=>submit(e,'saveTenant',form=>({tenantId:dialog.row!.id,version:dialog.row!.version,status:fieldValue(form,'status'),kyc:fieldValue(form,'kyc'),brandId:fieldValue(form,'brandId')||null,planId:fieldValue(form,'planId')||null,businessType:fieldValue(form,'businessType'),gstin:fieldValue(form,'gstin'),license:fieldValue(form,'license'),notes:fieldValue(form,'notes'),adminPassword:fieldValue(form,'adminPassword')||undefined,reason:fieldValue(form,'reason')}))}><fieldset disabled={busy}><strong>{dialog.row!.name}</strong><label>Account status<select name="status" defaultValue={dialog.row!.status}>{['ACTIVE','HOLD','SUSPENDED','TERMINATED'].map(value=><option key={value}>{value}</option>)}</select></label><p className="sa-help">Hold and suspension stop new web operations while keeping historical records readable. Termination cannot be reversed from this panel.</p><label>Business type<select name="businessType" defaultValue={dialog.row!.details?.businessType??'RESTAURANT'}>{['RESTAURANT','CLOUD_KITCHEN','FRANCHISE'].map(value=><option key={value}>{value}</option>)}</select></label><label>KYC review<select name="kyc" defaultValue={dialog.row!.kyc}>{['UNREVIEWED','VERIFIED','REJECTED'].map(value=><option key={value}>{value}</option>)}</select></label><label>GSTIN<input name="gstin" maxLength={30} defaultValue={dialog.row!.details?.gstin??''}/></label><label>Business license reference<input name="license" maxLength={100} defaultValue={dialog.row!.details?.license??''}/></label><label>Parent brand<select name="brandId" defaultValue={dialog.row!.brand_id??''}><option value="">Independent</option>{data.records.filter((r:Row)=>r.kind==='BRAND'&&!r.archived).map((r:Row)=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><label>Web plan<select name="planId" defaultValue={dialog.row!.plan_id??''}><option value="">Existing unrestricted access</option>{data.records.filter((r:Row)=>r.kind==='PLAN'&&!r.archived).map((r:Row)=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label><p className="sa-help">Saving applies the selected plan’s current limits. Existing assignments are not silently changed when a plan definition is edited.</p><label>Review notes<textarea name="notes" rows={3} maxLength={2000} defaultValue={dialog.row!.details?.notes??''}/></label><Password label="Your password · required only for termination" required={false}/><Reason/><button className="button primary">Save restaurant</button></fieldset></form>}

   {dialog.type==='newTenant'&&<form onSubmit={e=>submit(e,'createTenant',form=>({name:fieldValue(form,'name'),outlet:fieldValue(form,'outlet'),ownerName:fieldValue(form,'ownerName'),email:fieldValue(form,'email'),password:fieldValue(form,'password'),reason:fieldValue(form,'reason')}))}><fieldset disabled={busy}><p>Creates a new owner account on hold for review, with a blank menu and tax settings. Existing emails and accounts are never replaced.</p>{[['name','Restaurant name'],['outlet','First outlet'],['ownerName','Owner name'],['email','Owner email'],['password','Initial owner password']].map(([name,caption])=><label key={name}>{caption}<input name={name} type={name==='email'?'email':name==='password'?'password':'text'} autoComplete={name==='password'?'new-password':'off'} required minLength={name==='password'?12:2} maxLength={name==='password'?128:150}/></label>)}<Reason/><button className="button primary">Create restaurant on hold</button></fieldset></form>}

   {dialog.type==='member'&&<form onSubmit={e=>submit(e,'saveMember',form=>({email:fieldValue(form,'email'),role:fieldValue(form,'role'),tenantIds:form.get('restricted')==='on'?form.getAll('tenantIds'):null,region:fieldValue(form,'region'),permissions:form.getAll('permissions'),enabled:form.get('enabled')==='on',version:dialog.row?.version??0,reason:fieldValue(form,'reason'),adminPassword:fieldValue(form,'adminPassword')}))}><fieldset disabled={busy}><label>Existing account email<input name="email" type="email" defaultValue={dialog.row?.email??''} readOnly={!!dialog.row} required/></label><label>Platform role<select name="role" defaultValue={dialog.row?.role??'SUPPORT'}>{Object.keys(platformRolePermissions).map(value=><option key={value}>{value}</option>)}</select></label><label>Region / assignment label<input name="region" defaultValue={dialog.row?.region??''} maxLength={100}/></label><label className="sa-check"><input name="restricted" type="checkbox" defaultChecked={dialog.row?.tenant_scope!==null&&dialog.row?.tenant_scope!==undefined}/>Restrict this internal account to selected restaurants</label><label>Assigned restaurants<select name="tenantIds" multiple defaultValue={dialog.row?.tenant_scope??[]}>{data.tenants.map((t:Row)=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><fieldset><legend>Custom-role permissions</legend><p className="sa-help">Used only for Custom. Named roles use their defined permission set.</p>{platformPermissions.filter(p=>p!=='team').map(p=><label className="sa-check" key={p}><input name="permissions" type="checkbox" value={p} defaultChecked={dialog.row?.permissions.includes(p)}/>{label(p)}</label>)}</fieldset><label className="sa-check"><input name="enabled" type="checkbox" defaultChecked={dialog.row?.enabled??true}/>Enabled</label><Password/><Reason/><button className="button primary">Save platform access</button></fieldset></form>}

   {dialog.type==='support'&&<form onSubmit={e=>submit(e,'startSupport',form=>({tenantId:fieldValue(form,'tenantId'),reason:fieldValue(form,'reason'),adminPassword:fieldValue(form,'adminPassword'),mode:form.get('allowChanges')==='on'?'EDIT':'READ_ONLY',confirmedChanges:form.get('allowChanges')==='on'}))}><fieldset disabled={busy}><SelectTenant tenants={data.tenants} required/><Reason/><Password/>{data.admin.role==='SUPERADMIN'&&<label className="sa-check"><input type="checkbox" name="allowChanges"/>Enable changes for troubleshooting (affects real restaurant data)</label>}<button className="button primary">Open restaurant dashboard</button></fieldset></form>}

   {dialog.type==='document'&&<><p>{dialog.row!.name} · Documents are private, downloaded as attachments and recorded in the audit log.</p>{data.documents.filter((d:Row)=>d.restro_id===dialog.row!.id).map((doc:Row)=><p key={doc.id}><a href={'/api/superadmin/documents?id='+doc.id}>{doc.name}</a><small> · {date(doc.created_at)}</small></p>)}<KycUploadForm tenantId={dialog.row!.id} busy={busy} upload={async(form,key)=>{setBusy(true);setError('');try{const reply=await fetch('/api/superadmin/documents',{method:'POST',headers:{'Idempotency-Key':key},body:form}),result=await reply.json();if(!reply.ok)throw new Error(result.error?.message??'Document upload failed.');await refresh();setNotice('Private KYC document saved.');setDialog(null)}catch(issue){setError((issue as Error).message);throw issue}finally{setBusy(false)}}}/></>}

   {dialog.type==='promo'&&<form onSubmit={e=>submit(e,'redeemPromo',form=>({tenantId:fieldValue(form,'tenantId'),promoId:fieldValue(form,'promoId'),reason:fieldValue(form,'reason')}))}><fieldset disabled={busy}><p>Records one immutable SaaS account credit. A restaurant can use each onboarding promotion once; expiry and total-use limits are enforced.</p><SelectTenant tenants={data.tenants} required/><label>Promotion<select name="promoId" required><option value="">Choose promotion</option>{data.records.filter((r:Row)=>r.kind==='PROMO'&&!r.archived).map((r:Row)=><option key={r.id} value={r.id}>{r.name} · {r.data.code}</option>)}</select></label><Reason/><button className="button primary">Apply SaaS credit</button></fieldset></form>}

  </div></Modal>}

 </ConsoleShell>;

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

 else if(field.type==='select')control=<select name={field.key} defaultValue={value??''} required={field.required}><option value="">Choose</option>{field.options!.filter(option=>option!=='CLOSED'||data.admin.role==='SUPERADMIN'||value==='CLOSED').map(option=><option key={option}>{option}</option>)}</select>;

 else if(field.type==='textarea')control=<textarea name={field.key} required={field.required} maxLength={2000} rows={3} defaultValue={value??''}/>;

 else control=<input name={field.key} type={field.type??'text'} required={field.required} min={field.min} max={field.max} step={field.type==='number'?['fee','amount','rate'].includes(field.key)?'.01':'1':undefined} defaultValue={field.type==='datetime-local'&&value?new Date(new Date(value).getTime()+330*60000).toISOString().slice(0,16):value??''}/>;

 return <label>{field.label}{field.type==='datetime-local'?' · India time':''}{control}</label>;

}


function KycUploadForm({tenantId,busy,upload}:{tenantId:string;busy:boolean;upload:(form:FormData,key:string)=>Promise<void>}){const requestKey=useRef(''),[uploadError,setUploadError]=useState('');return <form onChange={()=>{requestKey.current='';setUploadError('')}} onSubmit={async event=>{event.preventDefault();setUploadError('');const form=new FormData(event.currentTarget);requestKey.current||=clientUuid();try{await upload(form,requestKey.current)}catch(issue){setUploadError((issue as Error).message)}}}><fieldset disabled={busy}><input type="hidden" name="tenantId" value={tenantId}/><UploadField label="Business license / KYC evidence" name="file" accept="application/pdf,image/png,image/jpeg" help="PDF, PNG or JPEG · up to 2 MiB" maxBytes={2097152} required busy={busy} error={uploadError}/><p className="sa-help">Upload authentic supplied evidence only.</p><Reason/><button className="button primary">Save private document</button></fieldset></form>}
