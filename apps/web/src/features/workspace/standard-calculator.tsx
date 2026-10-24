'use client';
import {useEffect,useLayoutEffect,useMemo,useRef,useState,type KeyboardEvent,type CSSProperties,type PointerEvent} from 'react';
import {calculate} from '@dinerdost/core';
import {date,idempotentPost,request,type Row} from '@/lib/client';
import {confirmAction} from '@/lib/confirm-action';
import {T} from '@/lib/staff-language';
import {calculatorDisplay,calculatorExpression,plainCalculatorResult} from './calculator-display';

function HistoryNote({entry,busy,save,remove}:{entry:Row;busy:boolean;save:(note:string)=>void;remove:()=>void}){
 const [note,setNote]=useState(entry.note);
 return <article className="calculator-entry"><div><span>{entry.expression}</span><strong>= {entry.result}</strong></div><small>{date(entry.created_at)}</small><label>Note<textarea aria-label={'Note for '+entry.expression} maxLength={500} disabled={busy} value={note} onChange={e=>setNote(e.target.value)}/></label><div className="inline-actions"><button type="button" className="button small" disabled={busy||note===entry.note} onClick={()=>save(note)}>Save note</button><button type="button" className="button small" disabled={busy} onClick={remove}>Delete</button></div></article>;
}
export function CalculatorDock({employeeId}:{employeeId:string}){
 const [open,setOpen]=useState(false),[present,setPresent]=useState(false),[historyOpen,setHistoryOpen]=useState(false),[preferredScale,setPreferredScale]=useState(1);
 const [space,setSpace]=useState({limit:1,top:88,bottom:864});
 const dock=useRef<HTMLDivElement>(null),drag=useRef<{id:number;x:number;y:number;scale:number}|null>(null);
 const scale=Math.min(preferredScale,space.limit),panelOffset=Math.max(0,600*scale+space.top-space.bottom);
 useLayoutEffect(()=>{const host=dock.current;if(!host)return;const fit=()=>{const top=Math.max(24,Math.ceil(document.querySelector('.topbar')?.getBoundingClientRect().bottom??64)+24);setSpace({top,bottom:host.getBoundingClientRect().bottom,limit:Math.max(.1,Math.min(1.5,(innerWidth-48)/280,(innerHeight-top-16)/600))})};const observer=new ResizeObserver(fit);observer.observe(document.querySelector('.topbar')??host);if(host.parentElement)observer.observe(host.parentElement);window.addEventListener('resize',fit);window.addEventListener('scroll',fit,{passive:true});fit();return()=>{observer.disconnect();window.removeEventListener('resize',fit);window.removeEventListener('scroll',fit)}},[]);
 useEffect(()=>{if(open){setPresent(true);return}const timer=setTimeout(()=>setPresent(false),280);return()=>clearTimeout(timer)},[open]);
 function resize(value:number){const next=Math.max(.55,Math.min(1.5,space.limit,value));setPreferredScale(next);try{localStorage.setItem('dd-calculator-size-'+employeeId,String(next))}catch{}}
 function resizeStart(event:PointerEvent<HTMLButtonElement>){if(event.button!==0)return;event.preventDefault();event.currentTarget.focus();event.currentTarget.setPointerCapture(event.pointerId);drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,scale}}
 function resizeMove(event:PointerEvent<HTMLButtonElement>){const start=drag.current;if(!start||start.id!==event.pointerId)return;const x=(start.x-event.clientX)/280,y=(start.y-event.clientY)/600;resize(start.scale+(Math.abs(x)>Math.abs(y)?x:y))}
 const [expression,setExpression]=useState(''),[note,setNote]=useState('');
 const [preview,setPreview]=useState<{expression:string;result:string}|null>(null);
 const [savedId,setSavedId]=useState<string|null>(null),[savedNote,setSavedNote]=useState('');
 const [error,setError]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
 const [history,setHistory]=useState<Row[]>([]),[historyPage,setHistoryPage]=useState(0),[historyMore,setHistoryMore]=useState(false),[loaded,setLoaded]=useState(false);
 const input=useRef<HTMLInputElement>(null),locked=useRef(false),generation=useRef(0),caret=useRef<number|null>(null);
 const live=useMemo(()=>{if(!expression.trim())return null;try{return calculate(expression)}catch{return null}},[expression]);
 useLayoutEffect(()=>{if(caret.current===null||!input.current)return;const position=calculatorDisplay(expression.slice(0,caret.current)).length;input.current.focus();input.current.setSelectionRange(position,position);caret.current=null},[expression,preview]);
 useEffect(()=>{try{const stored=sessionStorage.getItem('dd-calculator-open-'+employeeId)==='1',size=Number(localStorage.getItem('dd-calculator-size-'+employeeId));setOpen(stored);setPresent(stored);if(Number.isFinite(size)&&size>=.55&&size<=1.5)setPreferredScale(size)}catch{}},[employeeId]);
 function toggle(value:boolean){if(value)setPresent(true);setOpen(value);try{sessionStorage.setItem('dd-calculator-open-'+employeeId,value?'1':'0')}catch{}}
 function edit(value:string,clearNote=false){
  if(savedId||clearNote)setNote(''); // A new calculation must not inherit a saved note.
  setExpression(calculatorExpression(value).slice(0,200));setPreview(null);setSavedId(null);setSavedNote('');setError('');setStatus('');
 }
 function selection(){const field=input.current;return {start:field?field.value.slice(0,field.selectionStart??field.value.length).replace(/,/g,'').length:expression.length,end:field?field.value.slice(0,field.selectionEnd??field.value.length).replace(/,/g,'').length:expression.length}}
 function backspace(forward=false){const {start,end}=selection(),from=Math.max(0,start-(start===end&&!forward?1:0)),to=end+(start===end&&forward?1:0);caret.current=from;edit(expression.slice(0,from)+expression.slice(to))}
 function insert(value:string){
  let base=expression,{start,end}=selection(),fresh=false;
  if(preview){fresh=!['+','-','×','÷','%'].includes(value);base=fresh?'':plainCalculatorResult(preview.result);start=end=base.length;if(base.length+value.length>200){setError('Start a new calculation to use this result.');return}}
  if(['+','×','÷'].includes(value)&&start===base.length&&/[+×÷*/-]$/.test(base)){start--;}
  if(!base&&['+','×','÷','%'].includes(value)){base='0';start=end=1}
  if(value==='.'&&!/[0-9]$/.test(base.slice(0,start)))value='0.';
  const next=base.slice(0,start)+value+base.slice(end);
  if(next.split(/[+×÷%()\s-]/).some(number=>(number.match(/\./g)?.length??0)>1))return;
  caret.current=start+value.length;edit(next,fresh);
 }
 function keyDown(event:KeyboardEvent<HTMLFormElement>){
  if(event.target!==input.current&&!(event.target as HTMLElement).closest('.calculator-keypad'))return;
  if(event.ctrlKey||event.metaKey||event.altKey)return;
  if(event.key==='='||(event.key==='Enter'&&event.target===input.current)){event.preventDefault();calculateNow();return}
  if(event.key==='Backspace'||event.key==='Delete'){event.preventDefault();backspace(event.key==='Delete');return}
  if(/^[0-9.+*/%()-]$/.test(event.key)){event.preventDefault();insert(event.key==='*'?'×':event.key==='/'?'÷':event.key)}
 }
 async function loadHistory(page=0){
  const version=++generation.current,result=await request('/api/calculator?page='+page);
  if(version!==generation.current)return;
  setHistory(old=>page?[...old,...result.rows]:result.rows);setHistoryPage(page);setHistoryMore(result.more);setLoaded(true);
 }
 useEffect(()=>{
  if(!open||!historyOpen)return;
  const refresh=()=>void loadHistory().catch(e=>setError(e.message));refresh();
  const timer=setInterval(refresh,60000);
  return()=>{generation.current++;clearInterval(timer)};
 },[open,historyOpen]);
 async function mutate(payload:Row):Promise<Row|undefined>{
  if(locked.current)return;locked.current=true;setBusy(true);setError('');
  try{const result=await idempotentPost('/api/calculator',payload);await loadHistory().catch(e=>setError('Saved. History could not refresh: '+e.message));return result}
  catch(e){setError((e as Error).message)}finally{locked.current=false;setBusy(false)}
 }
 async function calculateNow(){
  if(locked.current)return;
  setError('');setStatus('');
  try{
   const result=calculate(expression);setPreview({expression,result});
   if(savedId)return savedId; // Repeated equals must not duplicate this completed calculation.
   const entry=await mutate({action:'calculate',expression});
   if(entry){setSavedId(entry.id);setSavedNote('');setStatus('Calculation saved to history.');return entry.id as string}
  }catch(e){setPreview(null);setError((e as Error).message)}
 }
 async function save(){
  if(locked.current)return;
  if(!expression.trim()){setError('Enter a calculation before saving a note.');setStatus('');return}
  const entryId=savedId??await calculateNow();if(!entryId)return;
  if((savedId?savedNote:'')===note){setError('');setStatus('Note saved.');return}
  if(await mutate({action:'note',id:entryId,note})){setSavedNote(note);setStatus('Note saved.')}
 }
 async function updateNote(entryId:string,value:string){if(await mutate({action:'note',id:entryId,note:value})){if(entryId===savedId){setNote(value);setSavedNote(value)}}}
 async function remove(entryId:string){if(!await confirmAction('Delete this calculation from your history?','Delete calculation'))return;if(await mutate({action:'delete',id:entryId})){if(entryId===savedId){setSavedId(null);setSavedNote('')}}}
 return <div ref={dock} className="calculator-dock" data-open={open} style={{'--calculator-width':280*scale+'px','--calculator-height':600*scale+'px','--calculator-scale':scale,'--calculator-offset':panelOffset+'px'} as CSSProperties}>
 <div className="calculator-slide" data-open={open}><div className="calculator-frame" aria-hidden={!open} inert={!open}>
 {present&&<section className={'workspace-tool-panel calculator-panel'+(historyOpen?' is-history':'')} role="region" aria-label="Calculator">
  <header><h2><T>{historyOpen?'Calculator history':'Calculator'}</T></h2><div className="calculator-header-actions"><button type="button" className="button small" aria-label={historyOpen?'Back to calculator':'Show calculator history'} aria-pressed={historyOpen} onClick={()=>{setHistoryOpen(!historyOpen);setError('')}}>{historyOpen?'←':<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M3 5v5h5M3 10a9 9 0 1 1 2 8M12 7v5l3 2"/></svg>}</button><button type="button" className="button small" onClick={()=>toggle(false)} aria-label="Minimize calculator">×</button></div></header>
  <div className="tool-panel-body">
  {historyOpen?<div className="calculator-history-view"><p className="muted">Calculations and notes are automatically deleted after 7 days.</p>{!loaded&&<p>Loading history…</p>}{loaded&&!history.length&&<p>No calculations yet.</p>}{history.map(entry=><HistoryNote key={entry.id+entry.note} entry={entry} busy={busy} save={value=>void updateNote(entry.id,value)} remove={()=>void remove(entry.id)}/>)}{historyMore&&<button type="button" className="button" disabled={busy} onClick={()=>void loadHistory(historyPage+1).catch(e=>setError(e.message))}>Load older calculations</button>}</div>:
   <form onSubmit={e=>{e.preventDefault();calculateNow()}} onKeyDown={keyDown}>
    <div className={'calculator-display'+(preview?' is-complete':'')}>
     <label><span className="calculator-input-label">Calculation</span><input ref={input} aria-label="Calculation" maxLength={270} inputMode="none" autoComplete="off" spellCheck={false} disabled={busy} value={calculatorDisplay(expression)} onChange={e=>edit(e.target.value)} placeholder="0"/></label>
     {preview?<output className="calculator-result" aria-label="Calculation result" aria-live="polite">{calculatorDisplay(plainCalculatorResult(preview.result))}</output>:<output className="calculator-live-result" aria-label="Calculation preview" aria-live="polite">{live!==null&&/[+×÷*/%()-]/.test(expression)?calculatorDisplay(plainCalculatorResult(live)):''}</output>}
    </div>
    <div className="calculator-keypad">{['AC','%','⌫','÷','7','8','9','×','4','5','6','-','1','2','3','+','00','0','.','='].map((k,i)=><button key={k} type="button" disabled={busy} className={'button'+(i<4?' calculator-function':'')+([3,7,11,15].includes(i)?' calculator-operator':'')+(k==='='?' calculator-equals':'')} aria-label={k==='⌫'?'Backspace':k==='AC'?'Clear calculation':k==='-'?'−':k} onClick={()=>{if(k==='=')calculateNow();else if(k==='AC')edit('',true);else if(k==='⌫')backspace();else insert(k)}}>{k==='⌫'?<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H9l-7-7z"/><path d="m12 9 6 6m0-6-6 6"/></svg>:k==='-'?'−':k}</button>)}</div>
    <label>Note (optional)<textarea aria-label="Calculation note" disabled={busy} maxLength={500} value={note} onChange={e=>{setNote(e.target.value);setStatus('')}}/></label>
    <button type="button" className="button primary" disabled={busy} onClick={()=>void save()}>Save note</button>
    <span className="calculator-input-label" role="status" aria-label="Calculation save status">{status}</span>
   </form>}
  {error&&<p role="alert">{error}</p>}
  </div>
 </section>}
 {present&&<button type="button" className="calculator-resize" aria-label={'Resize calculator, '+Math.round(scale*100)+' percent'} title="Drag or use arrow keys to resize" onPointerDown={resizeStart} onPointerMove={resizeMove} onPointerUp={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null}} onLostPointerCapture={()=>{drag.current=null}} onKeyDown={event=>{if(['ArrowUp','ArrowLeft','ArrowDown','ArrowRight','Home'].includes(event.key)){event.preventDefault();resize(event.key==='Home'?1:scale+(['ArrowUp','ArrowLeft'].includes(event.key)?.05:-.05))}}}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 14V4h10M4 4l16 16m0-10v10H10"/></svg></button>}
 </div><button type="button" className="workspace-dock-trigger" aria-expanded={open} onClick={()=>toggle(!open)}><span className="workspace-tab-label"><T>Calculator</T></span><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8M8 10h1m3 0h1m3 0h0M8 14h1m3 0h1m3 0h0M8 18h1m3 0h1m3-4v4"/></svg></button>
 </div></div>;
}
