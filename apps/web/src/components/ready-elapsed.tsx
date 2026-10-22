"use client";
import {useEffect,useState} from 'react';
export function ReadyElapsed({at,label='Ready'}:{at:string|null;label?:string}){
 const [now,setNow]=useState<number|null>(null);
 useEffect(()=>{setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer)},[at]);
 const time=at?Date.parse(at):NaN;if(!Number.isFinite(time))return <small>Ready time unavailable</small>;
 const minutes=now===null?null:Math.max(0,Math.floor((now-time)/60000)),elapsed=minutes===null?'…':minutes<1?'just now':minutes<60?minutes+' min ago':Math.floor(minutes/60)+'h '+minutes%60+'m ago';
 return <small className="ready-elapsed" title={new Date(time).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}>{label} · {elapsed}</small>;
}
