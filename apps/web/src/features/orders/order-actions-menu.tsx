"use client";
import {can} from "@dinerdost/core";
import {Refunds} from "./refunds";
import {useEffect,useLayoutEffect,useRef,useState,useId} from 'react';
import {createPortal} from 'react-dom';
import {type Row} from '@/lib/client';
import {useDesk} from '../workspace/context';
export function OrderActionsMenu({order,changed}:{order:Row;changed?:()=>void}){
 const desk=useDesk(),trigger=useRef<HTMLButtonElement>(null),popup=useRef<HTMLDivElement>(null),id=useId();
 const [open,setOpen]=useState(false),[position,setPosition]=useState({top:0,left:0});
 const closed=['SETTLED','VOIDED','REJECTED','CANCELLED'].includes(order.status);
 const close=(focus=false)=>{setOpen(false);if(focus)trigger.current?.focus()};
 useLayoutEffect(()=>{if(!open)return;const anchor=trigger.current?.getBoundingClientRect(),menu=popup.current?.getBoundingClientRect();if(!anchor||!menu)return;setPosition({left:Math.max(8,Math.min(anchor.right-menu.width,innerWidth-menu.width-8)),top:anchor.bottom+menu.height+8>innerHeight?Math.max(8,anchor.top-menu.height-6):anchor.bottom+6});popup.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()},[open]);
 useEffect(()=>{if(!open)return;const dismiss=(event:Event)=>{if(!popup.current?.contains(event.target as Node)&&!trigger.current?.contains(event.target as Node))close()};const reposition=()=>close();document.addEventListener('pointerdown',dismiss);document.addEventListener('focusin',dismiss);window.addEventListener('resize',reposition);window.addEventListener('scroll',reposition,true);return()=>{document.removeEventListener('pointerdown',dismiss);document.removeEventListener('focusin',dismiss);window.removeEventListener('resize',reposition);window.removeEventListener('scroll',reposition,true)}},[open]);
 return <><button ref={trigger} className="button small order-menu-trigger" aria-label={'Actions for order '+order.number} aria-haspopup="menu" aria-expanded={open} aria-controls={open?id:undefined} onClick={()=>setOpen(value=>!value)} onKeyDown={event=>{if(event.key==='ArrowDown'){event.preventDefault();setOpen(true)}}}><span aria-hidden="true">⋮</span></button>{open&&createPortal(<div ref={popup} id={id} className="order-actions-popup" role="menu" aria-label={'Order #'+order.number+' actions'} style={position} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();close(true)}if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const buttons=Array.from(popup.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[]),index=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus()}}}>
  <button role="menuitem" disabled={desk.busy||closed&&!order.pinned} onClick={()=>{close(true);void desk.run('orderPin',{pinned:!order.pinned,version:Number(order.pin_version??0)},{orderId:order.id}).then(()=>changed?.()).catch(()=>{})}}>{order.pinned?'Unpin order':'Pin VIP order'}</button>
  {closed&&!order.pinned&&<small>Only active orders can be pinned.</small>}
  {can(desk.data.actor,'payments')&&<button role="menuitem" disabled={desk.busy||Number(order.totals?.paid??order.paid??0)<=0} onClick={()=>{close(true);desk.modal('Refund taken',<Refunds orderId={order.id} changed={changed}/>)}}>Refund taken</button>}
 </div>,document.body)}</>
}
