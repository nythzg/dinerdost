"use client";

import {createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {usePathname} from 'next/navigation';
import Link from 'next/link';
import './working-interface.css';
import './working-alerts.css';
import './selected-refinements.css';

export const DESIGN_PREVIEW_KEY='dd-working-design-preview';
const COMPACT_KEY='dd-working-design-compact';
const DENSITY_KEY='dd-working-design-density';
type Appearance={active:boolean;compact:boolean;setEnabled:(value:boolean)=>void;toggleCompact:()=>void};
const AppearanceContext=createContext<Appearance>({active:false,compact:false,setEnabled:()=>{},toggleCompact:()=>{}});
const excluded=/^\/(?:invoice|refund|kot|replacement|design-preview)(?:\/|$)/;

/** Appearance preference only. Authentication, permissions and API state remain in existing screens. */
export function DesignPreviewProvider({children}:{children:ReactNode}){
 const path=usePathname();
 const [enabled,setPreference]=useState(false),[compact,setCompact]=useState(false),[density,setDensity]=useState<'comfortable'|'compact'>('comfortable');
 const options=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{const close=(event:PointerEvent)=>{if(options.current&&!options.current.contains(event.target as Node))options.current.open=false};const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&options.current?.open){options.current.open=false;options.current.querySelector('summary')?.focus()}};document.addEventListener('pointerdown',close);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key)}},[]);
 useEffect(()=>{
  const read=()=>{try{setPreference(localStorage.getItem(DESIGN_PREVIEW_KEY)==='on');setCompact(localStorage.getItem(COMPACT_KEY)==='true');setDensity(localStorage.getItem(DENSITY_KEY)==='comfortable'?'comfortable':'compact')}catch{}};
  read();window.addEventListener('storage',read);window.addEventListener('dd-working-design-preview-change',read);
  return()=>{window.removeEventListener('storage',read);window.removeEventListener('dd-working-design-preview-change',read)};
 },[]);
 const setEnabled=useCallback((value:boolean)=>{try{localStorage.setItem(DESIGN_PREVIEW_KEY,value?'on':'off')}catch{}setPreference(value)},[]);
 const toggleCompact=useCallback(()=>setCompact(value=>{try{localStorage.setItem(COMPACT_KEY,String(!value))}catch{}return !value}),[]);
 const active=enabled&&!excluded.test(path);
 useEffect(()=>{document.body.classList.toggle('dd-working-preview',active);if(active)document.body.dataset.workingDensity=density;else delete document.body.dataset.workingDensity;return()=>{document.body.classList.remove('dd-working-preview');delete document.body.dataset.workingDensity}},[active,density]);
 const value=useMemo(()=>({active,compact,setEnabled,toggleCompact}),[active,compact,setEnabled,toggleCompact]);
 return <AppearanceContext.Provider value={value}>{active&&<div className="working-preview-bar" role="region" aria-label="Working design preview"><span><i/>Design preview <strong>Local working data · Changes save normally</strong></span><nav aria-label="Preview workspaces"><Link href="/app/overview">Restaurant</Link><Link href="/superadmin">Superadmin</Link><Link href="/app/qr">QR & customer links</Link></nav><details ref={options} className="working-layout-options"><summary>Layout options<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></summary><fieldset><legend>Display density</legend>{(['comfortable','compact'] as const).map(option=><label key={option}><input type="radio" name="working-display-density" value={option} checked={density===option} onChange={()=>{setDensity(option);try{localStorage.setItem(DENSITY_KEY,option)}catch{}}}/>{option==='comfortable'?'Comfortable':'Compact'}</label>)}<p>Only spacing changes. Every field and action stays available.</p></fieldset></details><button type="button" onClick={()=>setEnabled(false)} title="Leave preview styling without changing your data">Exit design preview</button></div>}{children}</AppearanceContext.Provider>;
}
export function useDesignPreview(){return useContext(AppearanceContext)}
