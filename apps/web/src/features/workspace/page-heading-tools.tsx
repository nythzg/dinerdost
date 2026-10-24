"use client";
import {useEffect,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
/** Keep the original control instance/state while placing it in the shared heading. */
export function PageHeadingTools({children,slot='tools'}:{children:ReactNode;slot?:'tools'|'subtitle'}){
 const [target,setTarget]=useState<HTMLElement|null>(null);
 useEffect(()=>setTarget(document.getElementById('workspace-heading-'+slot)),[slot]);
 return target?createPortal(children,target):null;
}
