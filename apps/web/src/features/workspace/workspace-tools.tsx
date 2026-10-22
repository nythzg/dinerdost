"use client";
import {confirmAction} from "@/lib/confirm-action";
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {calculate,can} from '@dinerdost/core';
import {date,idempotentPost,label,money,request,type Row} from '@/lib/client';
import {T} from '@/lib/staff-language';
import {useDesk} from './context';
import {OrderActionsMenu} from '../orders/order-actions-menu';

function HistoryNote({entry,save,remove,busy}:{entry:Row;save:(note:string)=>void;remove:()=>void;busy:boolean}){
 const [note,setNote]=useState(entry.note);
 return <article className="calculator-entry"><div><span>{entry.expression}</span><strong>= {entry.result}</strong></div><small>{date(entry.created_at)}</small><label>Note<textarea aria-label={'Note for '+entry.expression} maxLength={500} value={note} onChange={event=>setNote(event.target.value)}/></label><div className="inline-actions"><button className="button small" disabled={busy||note===entry.note} onClick={()=>save(note)}>Save note</button><button className="button small" disabled={busy} onClick={remove}>Delete</button></div></article>
}
export function WorkspaceTools(){
 const {data}=useDesk();
 const pathname=usePathname();
 const [summaryPosition,setSummaryPosition]=useState<{left:number;width:number}|null>(null);
 useEffect(()=>{let anchor:Element|null=null;const measure=()=>{if(!anchor)return;const rect=anchor.getBoundingClientRect(),width=Math.min(rect.width,window.innerWidth-24),left=Math.max(12,Math.min(rect.left,window.innerWidth-width-12));setSummaryPosition(old=>old&&old.left===left&&old.width===width?old:{left,width});};const size=new ResizeObserver(measure);const find=()=>{const next=document.querySelector(".total-panel");if(next===anchor)return;if(anchor)size.unobserve(anchor);anchor=next;if(anchor){size.observe(anchor);measure()}else setSummaryPosition(null);};const mutation=new MutationObserver(find);mutation.observe(document.querySelector(".main-content")??document.body,{childList:true,subtree:true});find();window.addEventListener("resize",measure);window.addEventListener("scroll",measure,true);return()=>{mutation.disconnect();size.disconnect();window.removeEventListener("resize",measure);window.removeEventListener("scroll",measure,true);};},[pathname]);
 const [calculatorOpen,setCalculatorOpen]=useState(false),[ordersOpen,setOrdersOpen]=useState(false);
 const [expression,setExpression]=useState(''),[note,setNote]=useState(''),[history,setHistory]=useState<Row[]>([]),[historyPage,setHistoryPage]=useState(0),[historyMore,setHistoryMore]=useState(false);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false);
 const [historyOpen,setHistoryOpen]=useState(false),[preview,setPreview]=useState<{expression:string;result:string}|null>(null),[saved,setSaved]=useState(false);
 const [orders,setOrders]=useState<Row[]>([]),[orderPage,setOrderPage]=useState(0),[orderMore,setOrderMore]=useState(false),[ordersError,setOrdersError]=useState(''),[ordersLoading,setOrdersLoading]=useState(false);
 const ordersBox=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null);
 const allowed=can(data.actor,'orders');
 // This component belongs to Workspace, outside route content, so navigation never closes the calculator.
 useEffect(()=>{try{setCalculatorOpen(sessionStorage.getItem('dd-calculator-open-'+data.actor.employeeId)==='1')}catch{}},[data.actor.employeeId]);
 function openCalculator(value:boolean){setCalculatorOpen(value);try{sessionStorage.setItem('dd-calculator-open-'+data.actor.employeeId,value?'1':'0')}catch{}}
 async function loadHistory(page=0){const result=await request('/api/calculator?page='+page);setHistory(old=>page?[...old,...result.rows]:result.rows);setHistoryPage(page);setHistoryMore(result.more);setLoaded(true)}
 useEffect(()=>{if(calculatorOpen&&historyOpen)void loadHistory().catch(issue=>setError(issue.message))},[calculatorOpen,historyOpen]);
 async function mutate(payload:Row){setBusy(true);setError('');try{await idempotentPost('/api/calculator',payload);await loadHistory().catch(issue=>setError('Saved. History could not refresh: '+issue.message));return true}catch(issue){setError((issue as Error).message);return false}finally{setBusy(false)}}
 function editExpression(value:string){setExpression(value.replace(/[^0-9\s.+*/%()×÷-]/g,""));setPreview(null);setSaved(false);setError('')}
 function calculateNow(){setError('');setSaved(false);try{setPreview({expression,result:calculate(expression)})}catch(issue){setPreview(null);setError((issue as Error).message)}}
 async function saveCalculation(){if(preview&&preview.expression===expression&&await mutate({action:'calculate',expression:preview.expression,note}))setSaved(true)}
 const latestOrders=useRef(0),visibleOrderPage=useRef(0);
 async function loadOrders(page=0,refresh=false){const generation=++latestOrders.current;setOrdersLoading(true);try{const pages=refresh?Array.from({length:visibleOrderPage.current+1},(_,index)=>index):[page];const results=await Promise.all(pages.map(index=>request('/api/active-orders?outletId='+data.outletId+'&page='+index)));if(generation!==latestOrders.current)return;const rows=results.flatMap(result=>result.rows);setOrders(old=>Array.from(new Map((page&&!refresh?[...old,...rows]:rows).map(order=>[order.id,order])).values()));const lastPage=pages.at(-1)!;visibleOrderPage.current=lastPage;setOrderPage(lastPage);setOrderMore(results.at(-1)!.more);setOrdersError('')}catch(issue){if(generation===latestOrders.current)setOrdersError((issue as Error).message)}finally{if(generation===latestOrders.current)setOrdersLoading(false)}}
 useEffect(()=>{setOrders([]);setOrderPage(0);visibleOrderPage.current=0;setOrderMore(false);latestOrders.current++},[data.outletId,data.actor.employeeId,allowed]);
 useEffect(()=>{if(!ordersOpen||!allowed)return;void loadOrders();const timer=setInterval(()=>void loadOrders(0,true),15000);return()=>{clearInterval(timer);latestOrders.current++}},[ordersOpen,data.outletId,allowed]);
 useEffect(()=>{if(!ordersOpen)return;function outside(event:PointerEvent){if(!ordersBox.current?.contains(event.target as Node)&&!(event.target as Element)?.closest?.('.order-actions-popup'))setOrdersOpen(false)}function escape(event:KeyboardEvent){if(event.key==='Escape'&&!event.defaultPrevented)setOrdersOpen(false)}document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)}},[ordersOpen]);
 return <div className={"workspace-docks"+(summaryPosition?" summary-aligned":"")} style={summaryPosition?{left:summaryPosition.left,width:summaryPosition.width,right:"auto"}:undefined}>
  <div className="calculator-dock">
   {calculatorOpen&&<section className="workspace-tool-panel calculator-panel" role="region" aria-label="Calculator">
    <header><h2><T>{historyOpen?'Calculator history':'Calculator'}</T></h2><div className="calculator-header-actions"><button className="button small" aria-label={historyOpen?'Back to calculator':'Show calculator history'} aria-pressed={historyOpen} onClick={()=>{setHistoryOpen(!historyOpen);setError('')}}>{historyOpen?'←':<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 5v5h5M3 10a9 9 0 1 1 2 8M12 7v5l3 2"/></svg>}</button><button className="button small" onClick={()=>openCalculator(false)} aria-label="Minimize calculator">×</button></div></header>
    <div className="tool-panel-body">{historyOpen?<div className="calculator-history-view"><p className="muted">Saved to your account until you delete it.</p>{loaded&&!history.length&&<p>No calculations yet.</p>}{history.map(entry=><HistoryNote key={entry.id+entry.note} entry={entry} busy={busy} save={value=>void mutate({action:'note',id:entry.id,note:value})} remove={()=>{void confirmAction('Delete this calculation from your history?','Delete calculation').then(confirmed=>{if(confirmed)void mutate({action:'delete',id:entry.id})})}}/>)}{historyMore&&<button className="button" disabled={busy} onClick={()=>void loadHistory(historyPage+1).catch(issue=>setError(issue.message))}>Load older calculations</button>}</div>:<form onSubmit={event=>{event.preventDefault();calculateNow()}}>
    <label>Calculation<input ref={input} aria-label="Calculation" maxLength={200} inputMode="text" disabled={busy} value={expression} onChange={event=>editExpression(event.target.value)} onKeyDown={event=>{if(event.key==="="){event.preventDefault();calculateNow()}}} placeholder="125 × 2 + 50"/></label>
    <div className="calculator-keypad">{['7','8','9','÷','4','5','6','×','1','2','3','-','0','.','%','+','(',')','⌫','C','='].map(key=><button key={key} type="button" disabled={busy} className="button" aria-label={key==='⌫'?'Backspace':key==='C'?'Clear calculation':key} onClick={()=>{if(key==='=')calculateNow();else editExpression(key==='C'?'':key==='⌫'?expression.slice(0,-1):(expression+key).slice(0,200));input.current?.focus()}}>{key}</button>)}</div>
    <button className="button primary" disabled={busy||!expression.trim()}>Calculate</button>
    {preview&&<><output className="calculator-result" aria-label="Calculation result" aria-live="polite">= {preview.result}</output><label>Note (optional)<textarea aria-label="Calculation note" disabled={busy} maxLength={500} value={note} onChange={event=>{setNote(event.target.value);setSaved(false)}}/></label><button type="button" className="button primary" disabled={busy||saved} onClick={()=>void saveCalculation()}>{saved?'Saved to history':'Save calculation'}</button></>}
    </form>}{error&&<p role="alert">{error}</p>}</div>
   </section>}
   <button className="workspace-dock-trigger" aria-expanded={calculatorOpen} onClick={()=>openCalculator(!calculatorOpen)}><span aria-hidden="true">▦</span><T>Calculator</T></button>
  </div>
  {allowed&&<div className="active-orders-dock" ref={ordersBox}>
   {ordersOpen&&<section className="workspace-tool-panel active-orders-panel" role="region" aria-label="Active orders"><header><h2><T>Active orders</T></h2><button className="button small" aria-label="Minimize active orders" onClick={()=>setOrdersOpen(false)}>−</button></header><div className="tool-panel-body">{ordersError?<p role="alert">{ordersError}</p>:orders.map(order=><div className={'active-order-row'+(order.pinned?' vip-order':'')} key={order.id}><Link className="active-order-entry" href={'/app/orders/'+order.id} onClick={()=>setOrdersOpen(false)}><div><strong>{order.pinned&&<span className="vip-order-marker">VIP · </span>}#{order.number} · {order.table_label??label(order.type)}</strong><strong>{money(Math.max(0,Number(order.payable)-Number(order.paid)))}</strong></div><span>{order.stages.length?order.stages.map((stage:string)=>label(stage)).join(' · '):label(order.status)}</span><small>Amount payable · Open order</small></Link><OrderActionsMenu order={order} changed={()=>void loadOrders(0,true)}/></div>)}{!orders.length&&!ordersError&&<p>{ordersLoading?'Loading orders…':'No active orders.'}</p>}{orderMore&&<button className="button" disabled={ordersLoading} onClick={()=>void loadOrders(orderPage+1)}>Load more orders</button>}</div></section>}
   <button className="workspace-dock-trigger" aria-expanded={ordersOpen} onClick={()=>setOrdersOpen(!ordersOpen)}><T>Active orders</T></button>
  </div>}
 </div>
}
