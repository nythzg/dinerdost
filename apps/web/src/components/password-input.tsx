"use client";
import {useState,type InputHTMLAttributes} from 'react';
export function PasswordInput({label='password',...props}:Omit<InputHTMLAttributes<HTMLInputElement>,'type'>&{label?:string}){
 const [visible,setVisible]=useState(false);
 return <span className="password-input"><input {...props} type={visible?'text':'password'}/><button type="button" disabled={props.disabled} aria-label={(visible?'Hide ':'Show ')+label} aria-pressed={visible} onClick={()=>setVisible(value=>!value)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{visible&&<path d="m3 3 18 18"/>}</svg></button></span>;
}
