"use client";
import {useEffect,useState} from 'react';
import {Icon,Modal} from '@/components/ui';
import {type Row,date,request,ApiError} from '@/lib/client';
export function SupportNotifications({data,navigate,section}:{data:Row;navigate:(id:string)=>void;section:string}){
 const allowed=data.admin.permissions.includes('support');
 const [open,setOpen]=useState(false),[snapshot,setSnapshot]=useState<Row|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[alert,setAlert]=useState<{title:string;item:Row|null}|null>(null);
 useEffect(()=>{
  if(!allowed)return;
  const controller=new AbortController();let revision=0,previous:Map<string,string>|null=null,watermark=0;
  const accept=(value:Row)=>{
   const events=new Map<string,string>(),changes:Row[]=[];
   for(const item of value.items){const event=String(item.last_request_id??item.version)+':'+String(item.incoming_call_id??''),at=new Date(item.last_request_at??item.updated_at).getTime();events.set(item.id,event);const changedMessage=previous?.get(item.id)?.split(':')[0]!==event.split(':')[0],incomingChanged=!!item.incoming_call_id&&previous?.get(item.id)!==event;if(previous&&(changedMessage||incomingChanged)&&(previous.has(item.id)||at>=watermark||item.incoming_call_id))changes.push(item)}
   setSnapshot(value);setError('');setAlert(prior=>(prior?.item&&!value.items.some((item:Row)=>item.id===prior.item!.id))||!value.total?null:prior);
   if(!previous&&value.total>0)setAlert({title:'Support requests awaiting attention',item:null});
   else if(changes.length){const item=changes[0];setAlert({title:item.incoming_call_id?'Incoming support call':previous?.has(item.id)?'New support message':'New support request',item})}
   previous=events;watermark=Math.max(watermark,...value.items.map((item:Row)=>new Date(item.last_request_at??item.updated_at).getTime()));
  };
  const load=async()=>{const current=++revision;try{
   const value=await request('/api/superadmin/support-chat?notifications=1',{signal:controller.signal});if(controller.signal.aborted||current!==revision)return;
   accept(value);
  }catch(issue){if(!controller.signal.aborted&&current===revision){setError((issue as Error).message);if(issue instanceof ApiError&&[401,403].includes(issue.status)){setSnapshot(null);setAlert(null);setOpen(false);controller.abort()}}}};
  const refresh=()=>{if(!document.hidden&&!controller.signal.aborted)void load()};
  const source=typeof EventSource==='undefined'?null:new EventSource('/api/superadmin/support-chat?notifications=1&live=1');
  if(source){source.onmessage=event=>{if(!controller.signal.aborted){++revision;accept(JSON.parse(event.data))}};source.addEventListener('support-error',()=>{source.close();setSnapshot(null);setAlert(null);setOpen(false);refresh()});controller.signal.addEventListener('abort',()=>source.close(),{once:true})}
  void load();const timer=setInterval(refresh,5000);
  document.addEventListener('visibilitychange',refresh);window.addEventListener('focus',refresh);window.addEventListener('dd-support-updated',refresh);
  return()=>{controller.abort();source?.close();clearInterval(timer);document.removeEventListener('visibilitychange',refresh);window.removeEventListener('focus',refresh);window.removeEventListener('dd-support-updated',refresh)};
 },[allowed,data.admin.userId,retry]);
 if(!allowed)return null;
 const total=Number(snapshot?.total??0),items:Row[]=snapshot?.items??[];
 const visit=(item:Row|null)=>{setAlert(null);setOpen(false);if(item?.conversation){sessionStorage.setItem('dd-return-support-thread',item.id);const url=new URL(location.href);url.searchParams.set('supportChat',item.id);history.replaceState(null,'',url);navigate('messages');window.dispatchEvent(new CustomEvent('dd-open-support-thread',{detail:item.id}))}else navigate(item?'support':'messages')};
 return <><button className="sa-icon-button sa-support-bell" aria-label={'Support notifications · '+total+' unresolved'} title={error?'Support notifications could not refresh':'Support notifications'} onClick={()=>setOpen(true)}><Icon name="bell"/>{total>0&&<span>{total>99?'99+':total}</span>}</button>
  {alert&&!(section==='messages'&&!alert.item)&&<aside className="sa-notice sa-toast sa-support-toast" role="status" aria-label="New support alert" aria-atomic="true"><Icon name="bell"/><div><strong>{alert.title}</strong><p>{alert.item?.name??total+' unresolved support requests'}</p><button className="text-button" onClick={()=>visit(alert.item)}>{alert.item?.conversation?'Open conversation':'Open support inbox'}</button></div><button className="icon-button" aria-label="Dismiss support alert" onClick={()=>setAlert(null)}><Icon name="close"/></button></aside>}
  {open&&<Modal className="sa-support-notifications-modal" title="Support notifications" onClose={()=>setOpen(false)}><div className="sa-dialog"><p>Live support requests, requester replies and incoming calls. {total} unresolved.</p>{error&&<p className="error" role="alert">{error}<button className="button" onClick={()=>setRetry(value=>value+1)}>Retry</button></p>}{!snapshot&&!error&&<p role="status">Loading support notifications…</p>}{items.map(item=><button className="sa-support-notification" key={item.id} onClick={()=>visit(item)}><strong>{item.name}</strong><span>{item.incoming_call_id?'Incoming call · ':''}{item.queue??item.priority} · {item.status.replaceAll('_',' ')} · {date(item.updated_at)}</span>{item.restaurant&&<small>{item.restaurant}</small>}</button>)}{snapshot&&!items.length&&<p>No support alerts.</p>}{total>items.length&&<button className="button" onClick={()=>visit(null)}>View all {total} requests in the support inbox</button>}</div></Modal>}
 </>;
}
