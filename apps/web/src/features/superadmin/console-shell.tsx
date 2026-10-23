"use client";
import {useEffect,useRef,useState,type ReactNode,type KeyboardEvent} from 'react';
import Link from 'next/link';
import {Icon,Logo,Modal} from '@/components/ui';
import {label,request,type Row} from '@/lib/client';
import {consoleNavigation as navigation} from './console-navigation';

type Props={data:Row;section:string;refreshing:boolean;busy:boolean;modalOpen:boolean;onNavigate:(id:string)=>void;onRefresh:()=>void;onRestaurant:(row:Row)=>void;children:ReactNode};
export function ConsoleShell({data,section,refreshing,busy,modalOpen,onNavigate,onRefresh,onRestaurant,children}:Props){
 const [compact,setCompact]=useState(false),[mobileOpen,setMobileOpen]=useState(false),[searchOpen,setSearchOpen]=useState(false),[query,setQuery]=useState('');
 const sidebar=useRef<HTMLElement>(null),trigger=useRef<HTMLButtonElement>(null);
 const allowed=navigation.filter(item=>item.permissions.some(p=>data.admin.permissions.includes(p)));
 const active=navigation.find(item=>item.id===section);
 const navigate=(id:string)=>{setMobileOpen(false);setSearchOpen(false);setQuery('');onNavigate(id)};
 useEffect(()=>{try{setCompact(localStorage.getItem('dd-sa-compact')==='true')}catch{}},[]);
 useEffect(()=>{const wide=matchMedia('(min-width: 821px)'),change=()=>{if(wide.matches)setMobileOpen(false)};wide.addEventListener('change',change);return()=>wide.removeEventListener('change',change)},[]);
 useEffect(()=>{const key=(event:globalThis.KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'&&!modalOpen){event.preventDefault();setMobileOpen(false);setSearchOpen(value=>!value);setQuery('')}};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key)},[modalOpen]);
 useEffect(()=>{
  if(!mobileOpen)return;
  const prior=document.body.style.overflow;document.body.style.overflow='hidden';sidebar.current?.querySelector<HTMLButtonElement>('nav button')?.focus();
  const key=(event:globalThis.KeyboardEvent)=>{if(event.key==='Escape'){setMobileOpen(false);trigger.current?.focus()}
   if(event.key==='Tab'){const controls=Array.from(sidebar.current?.querySelectorAll<HTMLElement>('button,a[href]')??[]).filter(e=>e.getClientRects().length);if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls.at(-1)?.focus()}else if(!event.shiftKey&&document.activeElement===controls.at(-1)){event.preventDefault();controls[0]?.focus()}}};
  document.addEventListener('keydown',key);return()=>{document.body.style.overflow=prior;document.removeEventListener('keydown',key);if(!document.querySelector('[role=dialog]'))trigger.current?.focus()};
 },[mobileOpen]);
 const toggleCompact=()=>setCompact(value=>{try{localStorage.setItem('dd-sa-compact',String(!value))}catch{}return !value});
 const lower=query.trim().toLowerCase();
 const commands=[...allowed.map(item=>({id:item.id,title:item.title,detail:item.group,icon:item.icon,keywords:item.keywords,run:()=>navigate(item.id)})),
  ...(data.admin.permissions.includes('tenants')?data.tenants.map((row:Row)=>({id:row.id,title:row.name,detail:'Restaurant settings',icon:'outlets',keywords:row.slug??'',run:()=>{setSearchOpen(false);setMobileOpen(false);navigate('tenants');onRestaurant(row)}})):[])].filter(item=>(item.title+' '+item.detail+' '+item.keywords).toLowerCase().includes(lower)).slice(0,12);
 const results=useRef<HTMLDivElement>(null);
 const commandKey=(event:KeyboardEvent<HTMLElement>)=>{if(!['ArrowDown','ArrowUp'].includes(event.key))return;event.preventDefault();const controls=Array.from(results.current?.querySelectorAll<HTMLButtonElement>('button')??[]),index=controls.indexOf(document.activeElement as HTMLButtonElement);const down=event.key==='ArrowDown',next=index<0?(down?0:controls.length-1):(index+(down?1:-1)+controls.length)%controls.length;controls[next]?.focus()};
 return <div className="sa-shell" data-compact={compact} data-menu-open={mobileOpen}>
  <a className="sa-skip" href="#sa-main-content">Skip to content</a>
  {mobileOpen&&<button className="sa-scrim" aria-label="Dismiss navigation" onClick={()=>{setMobileOpen(false);trigger.current?.focus()}}/>}
  <aside id="sa-sidebar" ref={sidebar} className="sa-sidebar">
   <div className="sa-brand"><Logo/><span className="sa-brand-caption">Administration</span><button className="sa-mobile-close" aria-label="Close navigation" onClick={()=>{setMobileOpen(false);trigger.current?.focus()}}><Icon name="close"/></button></div>
   <div className="sa-workspace-tag"><span className="sa-workspace-monogram">DD</span><span><strong>Platform workspace</strong><small>Diner Dost management</small></span><Icon name="chevron"/></div>
   <nav aria-label="Superadmin navigation">{['Workspace','Management','Governance'].map(group=>{const items=allowed.filter(item=>item.group===group);return items.length?<div className="sa-nav-group" key={group}><span className="sa-nav-group-title">{group}</span>{items.map(item=><button key={item.id} type="button" aria-label={item.title} title={compact?item.title:undefined} aria-current={section===item.id?'page':undefined} onClick={()=>navigate(item.id)}><Icon name={item.icon}/><span className="sa-nav-label">{item.title}</span>{section===item.id&&<span className="sa-nav-active" aria-hidden="true"/>}</button>)}</div>:null})}</nav>
   <Link className="sa-workspace-link" href="/app/overview" title="Restaurant workspace"><Icon name="outlets"/><span>Restaurant workspace</span><Icon name="chevron"/></Link>
   <div className="sa-account"><span className="sa-avatar" aria-hidden="true">{String(data.admin.name).split(' ').map((part:string)=>part[0]).slice(0,2).join('')}</span><div><strong>{data.admin.name}</strong><span>{label(data.admin.role)}</span></div><button type="button" title="Sign out" aria-label="Sign out" onClick={async()=>{await request('/api/superadmin/auth',{method:'POST',body:JSON.stringify({action:'logout'})});location.assign('/superadmin/signin')}}><Icon name="logout"/></button></div>
  </aside>
  <div className="sa-main" inert={mobileOpen}>
   <header className="sa-topbar"><button ref={trigger} className="sa-icon-button sa-mobile-trigger" aria-label="Open navigation" aria-expanded={mobileOpen} aria-controls="sa-sidebar" onClick={()=>setMobileOpen(true)}><Icon name="navigation"/></button><button className="sa-icon-button sa-collapse-trigger" aria-label={compact?'Expand navigation':'Collapse navigation'} aria-expanded={!compact} aria-controls="sa-sidebar" onClick={toggleCompact}><Icon name="navigation"/></button><div className="sa-breadcrumb"><span>Platform</span><Icon name="chevron"/><strong>{active?.title}</strong></div><button className="sa-search-trigger" aria-label="Search console" onClick={()=>{setQuery('');setSearchOpen(true)}}><Icon name="search"/><span>Search console…</span><kbd>Ctrl K</kbd></button><span className="sa-environment"><i/>Local</span><button className="button sa-refresh" disabled={busy||refreshing} aria-busy={refreshing} onClick={onRefresh}><Icon name="refresh"/>Refresh</button></header>
   {children}
   <footer className="sa-page-footer"><span>Diner Dost · Platform administration</span><span>Updated {new Date(data.readAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'})} IST</span></footer>
  </div>
  {searchOpen&&<Modal title="Search console" onClose={()=>setSearchOpen(false)}><div className="sa-dialog sa-command" onKeyDown={commandKey}><label>Find a page or restaurant<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Pages, billing, restaurants…" autoComplete="off" onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();commands[0]?.run()}}}/></label><div className="sa-command-results" ref={results}>{commands.length?commands.map(item=><button key={item.id} aria-label={item.title} onClick={item.run}><span className="sa-command-icon"><Icon name={item.icon}/></span><span><strong>{item.title}</strong><small>{item.detail}</small></span><Icon name="chevron"/></button>):<p className="sa-empty">No matching pages or restaurants.</p>}</div><p className="sa-command-help">Use ↑ ↓ to move · Enter to open · Esc to close</p></div></Modal>}
 </div>;
}
