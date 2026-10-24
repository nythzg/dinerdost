"use client";
import {useEffect,useRef,useState,type ReactNode,type KeyboardEvent} from 'react';
import Link from 'next/link';
import {Icon,Logo} from '@/components/ui';
import {StaffLanguage,T,useStaffTranslation} from '@/lib/staff-language';
import {label,request,type Row} from '@/lib/client';
import {SidebarProfile} from '@/components/sidebar-profile';
import {SupportNotifications} from './support-notifications';
import {consoleNavigation as navigation} from './console-navigation';

type Props={data:Row;section:string;refreshing:boolean;busy:boolean;modalOpen:boolean;onNavigate:(id:string)=>void;onRefresh:()=>void;onRestaurant:(row:Row)=>void;children:ReactNode};
export function ConsoleShell(props:Props){return <StaffLanguage account={'platform-'+props.data.admin.userId}><ConsoleShellContent {...props}/></StaffLanguage>}
function ConsoleShellContent({data,section,refreshing,busy,modalOpen,onNavigate,onRefresh,onRestaurant,children}:Props){
 const translate=useStaffTranslation();
 // This shell mounts after the client loads platform data; read the preference before its first render.
 const [compact,setCompact]=useState(()=>{try{return localStorage.getItem('dd-sa-compact')==='true'}catch{return false}}),[mobileOpen,setMobileOpen]=useState(false),[searchOpen,setSearchOpen]=useState(false),[query,setQuery]=useState('');
 const sidebar=useRef<HTMLElement>(null),trigger=useRef<HTMLButtonElement>(null);
 const closeSearch=()=>{setSearchOpen(false);document.querySelector<HTMLButtonElement>('.sa-topbar .header-search-trigger')?.focus()};
 useEffect(()=>{if(searchOpen)requestAnimationFrame(()=>document.querySelector<HTMLInputElement>('.sa-topbar .inline-search-content input')?.focus())},[searchOpen]);
 useEffect(()=>{if(!searchOpen)return;const outside=(event:PointerEvent)=>{if(!(event.target as Element).closest('.header-search'))setSearchOpen(false)};const escape=(event:globalThis.KeyboardEvent)=>{if(event.key==='Escape'&&!modalOpen)closeSearch()};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)}},[searchOpen,modalOpen]);
 const allowed=navigation.filter(item=>(item.id!=='features'||data.admin.role==='SUPERADMIN')&&item.permissions.some(p=>data.admin.permissions.includes(p)));
 const active=navigation.find(item=>item.id===section);
 const navigate=(id:string)=>{setMobileOpen(false);setSearchOpen(false);setQuery('');onNavigate(id)};
 useEffect(()=>{const wide=matchMedia('(min-width: 821px)'),change=()=>{if(wide.matches)setMobileOpen(false)};wide.addEventListener('change',change);return()=>wide.removeEventListener('change',change)},[]);
 useEffect(()=>{const key=(event:globalThis.KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'&&!modalOpen){event.preventDefault();setSearchOpen(value=>!value);setQuery('')}};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key)},[modalOpen]);
 useEffect(()=>{
  if(!mobileOpen)return;
  const prior=document.body.style.overflow;document.body.style.overflow='hidden';(sidebar.current?.querySelector<HTMLInputElement>('.sidebar-search-content input')??sidebar.current?.querySelector<HTMLButtonElement>('nav button'))?.focus();
  const key=(event:globalThis.KeyboardEvent)=>{if(event.key==='Escape'){setSearchOpen(false);setMobileOpen(false);trigger.current?.focus()}
   if(event.key==='Tab'){const controls=[...Array.from(sidebar.current?.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea')??[]),...Array.from(document.querySelectorAll<HTMLElement>('[data-sidebar-profile-panel] button,[data-sidebar-profile-panel] select'))].filter(e=>e.getClientRects().length);if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls.at(-1)?.focus()}else if(!event.shiftKey&&document.activeElement===controls.at(-1)){event.preventDefault();controls[0]?.focus()}}};
  document.addEventListener('keydown',key);return()=>{document.body.style.overflow=prior;document.removeEventListener('keydown',key);if(!document.querySelector('[role=dialog]'))trigger.current?.focus()};
 },[mobileOpen]);
 const toggleCompact=()=>{setSearchOpen(false);setCompact(value=>{try{localStorage.setItem('dd-sa-compact',String(!value))}catch{}return !value})};
 const lower=query.trim().toLowerCase();
 const commands=[...allowed.map(item=>({id:item.id,title:item.title,detail:item.group,icon:item.icon,keywords:item.keywords,run:()=>navigate(item.id)})),
  ...(data.admin.permissions.includes('tenants')?data.tenants.map((row:Row)=>({id:row.id,title:row.name,detail:'Restaurant settings',icon:'outlets',keywords:row.slug??'',run:()=>{setSearchOpen(false);setMobileOpen(false);navigate('tenants');onRestaurant(row)}})):[])].filter(item=>(item.title+' '+translate(item.title)+' '+item.detail+' '+item.keywords).toLowerCase().includes(lower)).slice(0,12);
 const results=useRef<HTMLDivElement>(null);
 const commandKey=(event:KeyboardEvent<HTMLElement>)=>{if(!['ArrowDown','ArrowUp'].includes(event.key))return;event.preventDefault();const controls=Array.from(results.current?.querySelectorAll<HTMLButtonElement>('button')??[]),index=controls.indexOf(document.activeElement as HTMLButtonElement);const down=event.key==='ArrowDown',next=index<0?(down?0:controls.length-1):(index+(down?1:-1)+controls.length)%controls.length;controls[next]?.focus()};
 return <div className="sa-shell" data-compact={compact} data-menu-open={mobileOpen}>
  <a className="sa-skip" href="#sa-main-content">Skip to content</a>
  {mobileOpen&&<button className="sa-scrim" aria-label="Dismiss navigation" onClick={()=>{setMobileOpen(false);trigger.current?.focus()}}/>}
  <aside id="sa-sidebar" ref={sidebar} className="sa-sidebar curved-sidebar">
   <div className="sa-brand"><Logo/><span className="sa-brand-caption"><T>Administration</T></span><button className="sa-mobile-close" aria-label="Close navigation" onClick={()=>{setMobileOpen(false);trigger.current?.focus()}}><Icon name="close"/></button></div>

   <nav aria-label="Superadmin navigation">{allowed.map(item=><button key={item.id} type="button" aria-label={item.title} title={compact?item.title:undefined} aria-current={section===item.id?'page':undefined} onClick={()=>navigate(item.id)}><Icon name={item.icon}/><span className="sa-nav-label"><T>{item.title}</T></span>{section===item.id&&<span className="sa-nav-active" aria-hidden="true"/>}</button>)}</nav>
   <SidebarProfile name={data.admin.name} role={label(data.admin.role)} properties={[{label:'Name',value:data.admin.name},{label:'Role',value:label(data.admin.role)},{label:'Email',value:data.admin.email},...(data.admin.region?[{label:'Region',value:data.admin.region}]:[])]} onSignOut={async()=>{await request('/api/superadmin/auth',{method:'POST',body:JSON.stringify({action:'logout'})});location.assign('/superadmin/signin')}}/>
  </aside>
  <div className="sa-main" inert={mobileOpen}>
   <header className="sa-topbar"><button ref={trigger} className="sa-icon-button sa-mobile-trigger" aria-label="Open navigation" aria-expanded={mobileOpen} aria-controls="sa-sidebar" onClick={()=>setMobileOpen(true)}><Icon name="navigation"/></button><button className="sa-icon-button sa-collapse-trigger" aria-label={compact?'Expand navigation':'Collapse navigation'} aria-expanded={!compact} aria-controls="sa-sidebar" onClick={toggleCompact}><Icon name="navigation"/></button><div className="header-search" data-open={searchOpen}><button type="button" className="header-search-trigger" aria-label="Search console" aria-expanded={searchOpen} aria-controls="platform-page-search" aria-keyshortcuts="Control+k Meta+k" disabled={busy||modalOpen} onClick={()=>{if(searchOpen)closeSearch();else{setQuery('');setSearchOpen(true)}}}><Icon name="search"/><span><T>Search</T></span><kbd>Ctrl K</kbd></button>{searchOpen&&<div id="platform-page-search" className="inline-search-content" role="region" aria-label="Console search" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeSearch()}}}><div className="sa-command" onKeyDown={commandKey}><label>Find a page or restaurant<input autoFocus aria-label="Find a page or restaurant" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Pages, billing, restaurants…" autoComplete="off" onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();commands[0]?.run()}}}/><button type="button" className="icon-button" aria-label="Close console search" onClick={closeSearch}><Icon name="close"/></button></label><div className="sa-command-results" ref={results}>{commands.length?commands.map(item=><button key={item.id} aria-label={item.title} onClick={item.run}><span className="sa-command-icon"><Icon name={item.icon}/></span><span><strong><T>{item.title}</T></strong><small>{item.detail}</small></span><Icon name="chevron"/></button>):<p className="sa-empty">No matching pages or restaurants.</p>}<p className="sa-command-help">Use ↑ ↓ to move · Enter to open · Esc to close</p></div></div></div>}</div><SupportNotifications key={data.admin.userId} data={data} navigate={navigate} section={section}/></header>
   {children}
   <footer className="sa-page-footer"><span>Diner Dost · Platform administration</span><span>Updated {new Date(data.readAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kolkata'})} IST</span></footer>
  </div>

 </div>;
}
