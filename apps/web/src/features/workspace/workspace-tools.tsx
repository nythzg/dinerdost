"use client";
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {can} from '@dinerdost/core';
import {label,money,request,type Row} from '@/lib/client';
import {T} from '@/lib/staff-language';
import {useDesk} from './context';
import {OrderActionsMenu} from '../orders/order-actions-menu';
import {CalculatorDock} from './standard-calculator';

export function WorkspaceTools(){
 const {data}=useDesk();
 const pathname=usePathname();
 const [summaryPosition,setSummaryPosition]=useState<{left:number;width:number}|null>(null);
 useEffect(()=>{let anchor:Element|null=null;const measure=()=>{if(!anchor)return;const rect=anchor.getBoundingClientRect(),width=Math.min(rect.width,window.innerWidth-24),left=Math.max(12,Math.min(rect.left,window.innerWidth-width-12));setSummaryPosition(old=>old&&old.left===left&&old.width===width?old:{left,width});};const size=new ResizeObserver(measure);const find=()=>{const next=document.querySelector(".total-panel");if(next===anchor)return;if(anchor)size.unobserve(anchor);anchor=next;if(anchor){size.observe(anchor);measure()}else setSummaryPosition(null);};const mutation=new MutationObserver(find);mutation.observe(document.querySelector(".main-content")??document.body,{childList:true,subtree:true});find();window.addEventListener("resize",measure);window.addEventListener("scroll",measure,true);return()=>{mutation.disconnect();size.disconnect();window.removeEventListener("resize",measure);window.removeEventListener("scroll",measure,true);};},[pathname]);
 const [ordersOpen,setOrdersOpen]=useState(false);
 const [orders,setOrders]=useState<Row[]>([]),[orderPage,setOrderPage]=useState(0),[orderMore,setOrderMore]=useState(false),[ordersError,setOrdersError]=useState(''),[ordersLoading,setOrdersLoading]=useState(false);
 const ordersBox=useRef<HTMLDivElement>(null);
 const allowed=can(data.actor,'orders');
 const latestOrders=useRef(0),visibleOrderPage=useRef(0);
 async function loadOrders(page=0,refresh=false){const generation=++latestOrders.current;setOrdersLoading(true);try{const pages=refresh?Array.from({length:visibleOrderPage.current+1},(_,index)=>index):[page];const results=await Promise.all(pages.map(index=>request('/api/active-orders?outletId='+data.outletId+'&page='+index)));if(generation!==latestOrders.current)return;const rows=results.flatMap(result=>result.rows);setOrders(old=>Array.from(new Map((page&&!refresh?[...old,...rows]:rows).map(order=>[order.id,order])).values()));const lastPage=pages.at(-1)!;visibleOrderPage.current=lastPage;setOrderPage(lastPage);setOrderMore(results.at(-1)!.more);setOrdersError('')}catch(issue){if(generation===latestOrders.current)setOrdersError((issue as Error).message)}finally{if(generation===latestOrders.current)setOrdersLoading(false)}}
 useEffect(()=>{setOrders([]);setOrderPage(0);visibleOrderPage.current=0;setOrderMore(false);latestOrders.current++},[data.outletId,data.actor.employeeId,allowed]);
 useEffect(()=>{if(!ordersOpen||!allowed)return;void loadOrders();const timer=setInterval(()=>void loadOrders(0,true),15000);return()=>{clearInterval(timer);latestOrders.current++}},[ordersOpen,data.outletId,allowed]);
 useEffect(()=>{if(!ordersOpen)return;function outside(event:PointerEvent){if(!ordersBox.current?.contains(event.target as Node)&&!(event.target as Element)?.closest?.('.order-actions-popup'))setOrdersOpen(false)}function escape(event:KeyboardEvent){if(event.key==='Escape'&&!event.defaultPrevented)setOrdersOpen(false)}document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)}},[ordersOpen]);
 return <div className={"workspace-docks"+(summaryPosition?" summary-aligned":"")} style={summaryPosition?{left:summaryPosition.left,width:summaryPosition.width,right:"auto"}:undefined}>
  <CalculatorDock key={data.actor.employeeId} employeeId={data.actor.employeeId}/>
  {allowed&&<div className="active-orders-dock" ref={ordersBox}>
   {ordersOpen&&<section className="workspace-tool-panel active-orders-panel" role="region" aria-label="Active orders"><header><h2><T>Active orders</T></h2><button className="button small" aria-label="Minimize active orders" onClick={()=>setOrdersOpen(false)}>−</button></header><div className="tool-panel-body">{ordersError?<p role="alert">{ordersError}</p>:orders.map(order=><div className={'active-order-row'+(order.pinned?' vip-order':'')} key={order.id}><Link className="active-order-entry" href={'/app/orders/'+order.id} onClick={()=>setOrdersOpen(false)}><div><strong>{order.pinned&&<span className="vip-order-marker">VIP · </span>}#{order.number} · {order.table_label??label(order.type)}</strong><strong>{money(Math.max(0,Number(order.payable)-Number(order.paid)))}</strong></div><span>{order.stages.length?order.stages.map((stage:string)=>label(stage)).join(' · '):label(order.status)}</span><small>Amount payable · Open order</small></Link><OrderActionsMenu order={order} changed={()=>void loadOrders(0,true)}/></div>)}{!orders.length&&!ordersError&&<p>{ordersLoading?'Loading orders…':'No active orders.'}</p>}{orderMore&&<button className="button" disabled={ordersLoading} onClick={()=>void loadOrders(orderPage+1)}>Load more orders</button>}</div></section>}
   <button className="workspace-dock-trigger" aria-expanded={ordersOpen} onClick={()=>setOrdersOpen(!ordersOpen)}><T>Active orders</T></button>
  </div>}
 </div>
}
