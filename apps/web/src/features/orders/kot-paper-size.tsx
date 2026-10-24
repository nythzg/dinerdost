"use client";
import {useEffect} from 'react';

export function applyKotPaperSize(doc:Document){
 const groups=Array.from(doc.querySelectorAll<HTMLElement>('.kot-group'));
 if(!groups.length)throw Error('Kitchen ticket unavailable. Retry Print KOT.');
 let style=doc.getElementById('kot-paper-size') as HTMLStyleElement|null;
 if(!style){style=doc.createElement('style');style.id='kot-paper-size';doc.head.append(style)}
 style.textContent=groups.map((group,index)=>{
  const height=Math.max(60,Math.ceil(group.scrollHeight*25.4/96+7));
  group.style.page='kitchenTicket'+index;
  return `@page kitchenTicket${index}{size:76.2mm ${height}mm;margin:3mm;}`;
 }).join('\n');
 doc.documentElement.dataset.kotPaperReady='true';
}
export function KotPaperSize(){
 useEffect(()=>{let active=true;void document.fonts.ready.then(()=>{if(active)applyKotPaperSize(document)});return()=>{active=false}},[]);
 return null;
}
