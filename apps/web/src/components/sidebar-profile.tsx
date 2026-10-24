"use client";
import {useCallback,useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Icon} from './ui';
import {LanguageSelect,T} from '@/lib/staff-language';

export function SidebarProfile({name,role,properties,onSignOut}:{name:string;role:string;properties:{label:string;value:string}[];onSignOut:()=>Promise<void>}){
 const [open,setOpen]=useState(false),[leaving,setLeaving]=useState(false),[error,setError]=useState('');
 const [position,setPosition]=useState({left:8,bottom:8,width:280,maxHeight:480});
 const trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null),id=useId();
 const initials=name.trim().split(/\s+/).map(part=>part[0]).slice(0,2).join('');
 const signOut=async()=>{setLeaving(true);setError('');try{await onSignOut()}catch(issue){setError((issue as Error).message);setLeaving(false)}};
 const close=useCallback(()=>{setOpen(false);trigger.current?.focus()},[]);
 useLayoutEffect(()=>{if(!open)return;const place=()=>{const box=trigger.current!.getBoundingClientRect(),width=Math.min(280,innerWidth-16);setPosition({left:Math.max(8,Math.min(box.left,innerWidth-width-8)),bottom:Math.max(8,innerHeight-box.top+8),width,maxHeight:Math.max(160,Math.min(480,box.top-16))})};place();panel.current?.querySelector<HTMLButtonElement>('button')?.focus();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true)}},[open]);
 useEffect(()=>{if(!open)return;const outside=(event:PointerEvent)=>{if(!panel.current?.contains(event.target as Node)&&!trigger.current?.contains(event.target as Node))setOpen(false)};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside)},[open]);
 return <div className="sidebar-profile">
  <div className="sidebar-profile-row">
  <button ref={trigger} type="button" className="sidebar-profile-trigger" disabled={leaving} aria-label="Open profile" aria-expanded={open} aria-controls={id} onClick={()=>{setError('');setOpen(value=>!value)}}>
   <span className="sidebar-profile-avatar" aria-hidden="true">{initials}</span><span className="sidebar-profile-copy"><strong>{name}</strong><small>{role}</small></span>
  </button>
  <button type="button" className="sidebar-profile-logout" aria-label="Sign out" title="Sign out" disabled={leaving} onClick={signOut}><Icon name="logout"/></button>
  </div>
  {!open&&error&&<p className="sidebar-profile-error" role="alert">{error}</p>}
  {open&&createPortal(<div ref={panel} id={id} className="sidebar-profile-panel" data-sidebar-profile-panel role="dialog" aria-modal="false" aria-label="Profile properties" style={position} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close()}}}>
   <header><div><span className="sidebar-profile-avatar" aria-hidden="true">{initials}</span><h2><T>Profile</T></h2></div><button type="button" className="icon-button" aria-label="Close profile" onClick={close}><Icon name="close"/></button></header>
   <dl>{properties.map(item=><div key={item.label}><dt><T>{item.label}</T></dt><dd>{item.value}</dd></div>)}</dl>
   <label className="profile-language"><span><T>Language</T></span><LanguageSelect/></label>
   {error&&<p role="alert">{error}</p>}
   <button type="button" className="button profile-signout" disabled={leaving} onClick={signOut}><T>Sign out</T></button>
  </div>,document.body)}
 </div>;
}
