"use client";

import {useEffect,useId,useRef,useState} from 'react';
import {Icon} from './ui';
import './upload-field.css';

type Props={
 label:string;accept:string;help:string;maxBytes:number;name?:string;required?:boolean;
 busy?:boolean;completed?:boolean;error?:string;savedValue?:string;
 uploadFile?:(file:File,signal:AbortSignal)=>Promise<void>;
 onBusyChange?:(busy:boolean)=>void;onClear?:()=>void;
};
const extensions:Record<string,string[]>={'image/jpeg':['jpg','jpeg'],'image/png':['png'],'image/webp':['webp'],'application/pdf':['pdf']};
const fileSize=(bytes:number)=>bytes<1000?bytes+' B':bytes<1000000?(bytes/1000).toFixed(1)+' KB':(bytes/1000000).toFixed(1)+' MB';
function Paper({small=false}:{small?:boolean}){
 return <svg className={small?'dd-upload-paper is-small':'dd-upload-paper'} viewBox="0 0 96 100" fill="none" aria-hidden="true"><rect x="13" y="9" width="62" height="79" rx="6" transform="rotate(-8 13 9)" className="dd-upload-paper-back"/><path d="M29 9h35l17 17v62a5 5 0 0 1-5 5H29a5 5 0 0 1-5-5V14a5 5 0 0 1 5-5Z" className="dd-upload-paper-front"/><path d="M64 9v13a4 4 0 0 0 4 4h13" className="dd-upload-paper-fold"/><path d="M36 39h30M36 49h22M36 59h26" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity=".35"/><circle cx="68" cy="77" r="17" className="dd-upload-paper-seal"/><path d="M68 85V69m-6 6 6-6 6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

/** Native file input remains the source of truth for manual multipart forms. */
export function UploadField({label,accept,help,maxBytes,name,required=false,busy=false,completed=false,error:remoteError='',savedValue,uploadFile,onBusyChange,onClear}:Props){
 const id=useId(),input=useRef<HTMLInputElement>(null),browse=useRef<HTMLButtonElement>(null),controller=useRef<AbortController|null>(null),pending=useRef(false),mounted=useRef(true),depth=useRef(0);
 const [selected,setSelected]=useState<File|null>(null),[phase,setPhase]=useState<'idle'|'ready'|'uploading'|'uploaded'|'failed'>('idle'),[localError,setLocalError]=useState(''),[dragging,setDragging]=useState(false),[valid,setValid]=useState(false);
 const uploading=busy||phase==='uploading',error=localError||remoteError;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.current?.abort()}},[]);
 useEffect(()=>{if(savedValue!==undefined&&!savedValue&&phase==='uploaded'){setSelected(null);setPhase('idle')}},[savedValue,phase]);
 const blocked=()=>busy||pending.current||!!input.current?.matches(':disabled');
 async function send(file:File){
  if(!uploadFile||blocked())return;
  pending.current=true;controller.current=new AbortController();setPhase('uploading');setLocalError('');onBusyChange?.(true);
  try{await uploadFile(file,controller.current.signal);if(mounted.current)setPhase('uploaded')}
  catch(issue){if(mounted.current&&!controller.current?.signal.aborted){setLocalError(issue instanceof Error?issue.message:'Upload failed. Please try again.');setPhase('failed')}}
  finally{pending.current=false;controller.current=null;onBusyChange?.(false);if(input.current)input.current.value=''}
 }
 function choose(files:FileList|null){
  if(blocked())return;
  const file=files?.[0]??null;setSelected(file);setLocalError('');setValid(false);input.current?.setCustomValidity('');
  if(!file){setPhase('idle');return}
  const suffix=file.name.split('.').at(-1)?.toLowerCase();
  const supported=accept.split(',').some(type=>file.type===type||!file.type&&!!suffix&&extensions[type]?.includes(suffix));
  const problem=files!.length!==1?'Choose one file at a time.':!file.size?'Choose a file with some content.':!supported?'This file type is not supported. '+help:file.size>maxBytes?'Use a file no larger than '+(maxBytes===2097152?'2 MiB':'3.5 MB')+'.':'';
  if(problem){setLocalError(problem);setPhase('failed');if(input.current){input.current.value='';input.current.setCustomValidity(problem)}return}
  setValid(true);setPhase('ready');if(uploadFile)void send(file);
 }
 function clear(){
  if(blocked())return;
  if(phase==='uploaded')onClear?.();
  if(input.current){input.current.value='';input.current.setCustomValidity('');input.current.dispatchEvent(new Event('change',{bubbles:true}))}
  setSelected(null);setLocalError('');setPhase('idle');setValid(false);browse.current?.focus();
 }
 const state=error?'failed':uploading?'uploading':completed||phase==='uploaded'?'uploaded':selected?'ready':'idle';
 return <div className="dd-upload" role="group" aria-label={'Upload control: '+label} data-state={state} aria-busy={uploading}>
  <label className="dd-upload-label" htmlFor={id}>{label}</label>
  <input className="dd-upload-input" ref={input} id={id} type="file" name={name} accept={accept} required={required} disabled={uploading} tabIndex={-1} aria-describedby={id+'-help'+(error?' '+id+'-error':'')} aria-invalid={!!error} onChange={event=>choose(event.target.files)} onInvalid={event=>{event.preventDefault();setLocalError('Choose a valid file before uploading.');browse.current?.focus()}}/>
  <div className="dd-upload-dropzone" data-dragging={dragging} onDragEnter={event=>{event.preventDefault();if(!blocked()&&event.dataTransfer.types.includes('Files')){depth.current++;setDragging(true)}}} onDragOver={event=>{event.preventDefault();event.dataTransfer.dropEffect=blocked()?'none':'copy'}} onDragLeave={event=>{event.preventDefault();depth.current=Math.max(0,depth.current-1);if(!depth.current)setDragging(false)}} onDrop={event=>{event.preventDefault();depth.current=0;setDragging(false);if(blocked()||!event.dataTransfer.files.length)return;if(input.current){input.current.files=event.dataTransfer.files;input.current.dispatchEvent(new Event('change',{bubbles:true}))}}}>
   <Paper/><p className="dd-upload-title">{dragging?'Drop your file here':'Drop your file here, or'}</p><button ref={browse} type="button" className="dd-upload-browse" aria-label={'Browse files for '+label} disabled={uploading} onClick={()=>input.current?.click()}>Browse</button><p className="dd-upload-help" id={id+'-help'}>{help}</p>
  </div>
  {selected&&<div className="dd-upload-row"><Paper small/><div className="dd-upload-file"><strong title={selected.name}>{selected.name}</strong><span>{fileSize(selected.size)} · {selected.name.split('.').at(-1)?.toUpperCase()??'FILE'}</span><span className="dd-upload-status" role="status">{state==='uploading'?<><i className="dd-upload-spinner"/>Uploading…</>:state==='uploaded'?<><span aria-hidden="true">✓</span><span>Uploaded</span></>:state==='failed'?'Upload not completed':'Ready to upload'}</span>{state==='uploading'&&<progress aria-label={'Uploading '+selected.name}/>}</div><button type="button" className="dd-upload-remove" aria-label="Remove selected file" disabled={uploading} onClick={clear}><Icon name="close"/></button></div>}
  {error&&<div className="dd-upload-error"><p id={id+'-error'} role="alert">{error}</p>{uploadFile&&selected&&valid&&!uploading&&<button type="button" className="dd-upload-retry" onClick={()=>void send(selected)}>Try again</button>}</div>}
 </div>;
}
