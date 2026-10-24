"use client";
import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import Link from 'next/link';
import {Icon} from '@/components/ui';
import {restaurantFeatureEnabled,can} from '@dinerdost/core';
import {label,money,request,type Row} from '@/lib/client';
import {T} from '@/lib/staff-language';
import {useDesk} from './context';
import {OrderActionsMenu} from '../orders/order-actions-menu';
import {CalculatorDock} from './standard-calculator';

export function WorkspaceTools(){
 const {data}=useDesk();
 const tools=useRef<HTMLDivElement>(null);
 const [toolsTop,setToolsTop]=useState(78);
 useLayoutEffect(()=>{
  const header=document.querySelector('.topbar');if(!header)return;
  const measure=()=>setToolsTop(Math.max(8,Math.ceil(header.getBoundingClientRect().bottom)+8));
  const observer=new ResizeObserver(measure);observer.observe(header);measure();
  window.addEventListener('resize',measure);window.addEventListener('scroll',measure,{passive:true});
  return()=>{observer.disconnect();window.removeEventListener('resize',measure);window.removeEventListener('scroll',measure)};
 },[]);
 const [ordersOpen,setOrdersOpen]=useState(false);
 const [orders,setOrders]=useState<Row[]>([]),[orderPage,setOrderPage]=useState(0),[orderMore,setOrderMore]=useState(false),[ordersError,setOrdersError]=useState(''),[ordersLoading,setOrdersLoading]=useState(false);
 const allowed=can(data.actor,'orders')&&restaurantFeatureEnabled(data.featureFlags,'activeOrders');
 const latestOrders=useRef(0),visibleOrderPage=useRef(0);
 async function loadOrders(page=0,refresh=false){const generation=++latestOrders.current;setOrdersLoading(true);try{const pages=refresh?Array.from({length:visibleOrderPage.current+1},(_,index)=>index):[page];const results=await Promise.all(pages.map(index=>request('/api/active-orders?outletId='+data.outletId+'&page='+index)));if(generation!==latestOrders.current)return;const rows=results.flatMap(result=>result.rows);setOrders(old=>Array.from(new Map((page&&!refresh?[...old,...rows]:rows).map(order=>[order.id,order])).values()));const lastPage=pages.at(-1)!;visibleOrderPage.current=lastPage;setOrderPage(lastPage);setOrderMore(results.at(-1)!.more);setOrdersError('')}catch(issue){if(generation===latestOrders.current)setOrdersError((issue as Error).message)}finally{if(generation===latestOrders.current)setOrdersLoading(false)}}
 useEffect(()=>{setOrders([]);setOrderPage(0);visibleOrderPage.current=0;setOrderMore(false);latestOrders.current++},[data.outletId,data.actor.employeeId,allowed]);
 useEffect(()=>{if(!ordersOpen||!allowed)return;void loadOrders();const timer=setInterval(()=>void loadOrders(0,true),15000);return()=>{clearInterval(timer);latestOrders.current++}},[ordersOpen,data.outletId,allowed]);
 useEffect(()=>{if(!ordersOpen)return;function outside(event:PointerEvent){if(!tools.current?.contains(event.target as Node)&&!(event.target as Element)?.closest?.('.order-actions-popup'))setOrdersOpen(false)}function escape(event:KeyboardEvent){if(event.key==='Escape'&&!event.defaultPrevented)setOrdersOpen(false)}document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)}},[ordersOpen]);
 const closeTools=()=>{setOrdersOpen(false);tools.current?.querySelector<HTMLButtonElement>('.calculator-panel [aria-label="Minimize calculator"]')?.click()};
 return <div ref={tools} className="workspace-docks workspace-side-tabs" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();closeTools()}}} style={{'--workspace-tools-top':toolsTop+'px'} as CSSProperties}>
  <button type="button" className="icon-button workspace-mobile-close" aria-label="Close tools" onClick={closeTools}><Icon name="close"/></button>
  {restaurantFeatureEnabled(data.featureFlags,'calculator')&&<CalculatorDock key={data.actor.employeeId} employeeId={data.actor.employeeId}/> }
  {allowed&&<div className="active-orders-dock">
   {ordersOpen&&<section className="workspace-tool-panel active-orders-panel" role="region" aria-label="Active orders"><header><h2><T>Active orders</T></h2><button className="button small" aria-label="Minimize active orders" onClick={()=>setOrdersOpen(false)}>−</button></header><div className="tool-panel-body">{ordersError?<p role="alert">{ordersError}</p>:orders.map(order=><div className={'active-order-row'+(order.pinned?' vip-order':'')} key={order.id}><Link className="active-order-entry" href={'/app/orders/'+order.id} onClick={()=>setOrdersOpen(false)}><div><strong>{order.pinned&&<span className="vip-order-marker">VIP</span>}#{order.number} · {order.table_label??label(order.type)}</strong><strong>{money(Math.max(0,Number(order.payable)-Number(order.paid)))}</strong></div><span className="active-order-stage">{order.stages.length?order.stages.map((stage:string)=>label(stage)).join(' · '):label(order.status)}</span><small>Amount payable · Open order</small></Link><OrderActionsMenu order={order} changed={()=>void loadOrders(0,true)}/></div>)}{!orders.length&&!ordersError&&<p>{ordersLoading?'Loading orders…':'No active orders.'}</p>}{orderMore&&<button className="button" disabled={ordersLoading} onClick={()=>void loadOrders(orderPage+1)}>Load more orders</button>}</div></section>}
   <button type="button" className="workspace-dock-trigger" aria-expanded={ordersOpen} onClick={()=>setOrdersOpen(!ordersOpen)}><span className="workspace-tab-label"><T>Active orders</T></span><Icon name="orders"/></button>
  </div>}
 </div>
}
