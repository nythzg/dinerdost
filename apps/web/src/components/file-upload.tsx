"use client";
import {useState} from 'react';
import {request} from '@/lib/client';
import {UploadField} from './upload-field';
export function FileUpload({outletId,purpose,value,onChange,onBusy}:{outletId:string;purpose:'MENU'|'STAFF_PHOTO'|'STAFF_DOCUMENT'|'RECEIPT_LOGO';value:string;onChange:(value:string)=>void;onBusy?:(busy:boolean)=>void}){
 const [busy,setBusy]=useState(false);
 const label=purpose==='RECEIPT_LOGO'?'Bill logo':purpose==='MENU'?'Upload image':purpose==='STAFF_PHOTO'?'Staff photo':'Government document';
 return <div className="field file-upload"><UploadField label={label} accept={purpose==='STAFF_DOCUMENT'?'image/jpeg,image/png,image/webp,application/pdf':'image/jpeg,image/png,image/webp'} help={purpose==='STAFF_DOCUMENT'?'JPG, PNG or WebP up to 3.5 MB; PDF up to 2 MB.':'JPG, PNG or WebP · up to 3.5 MB'} maxBytes={3500000} savedValue={value} onClear={()=>onChange('')} onBusyChange={uploading=>{setBusy(uploading);onBusy?.(uploading)}} uploadFile={async(file,signal)=>{
  const saved=await request(`/api/uploads?outlet=${outletId}&purpose=${purpose}`,{method:'POST',body:file,signal,headers:{'Content-Type':file.type||'application/octet-stream'}});
  onChange(purpose==='MENU'?saved.url:saved.id);
 }}/>{value&&<div className="inline-actions">{purpose==='RECEIPT_LOGO'?<a className="text-button" href={'/api/receipt-images/'+value} target="_blank" rel="noreferrer">View logo</a>:purpose!=='MENU'?<a className="text-button" href={'/api/staff-files/'+value} target="_blank" rel="noreferrer">View file</a>:<span>Image ready</span>}<button type="button" className="text-button" disabled={busy} onClick={()=>onChange('')}>Remove</button></div>}</div>;
}
