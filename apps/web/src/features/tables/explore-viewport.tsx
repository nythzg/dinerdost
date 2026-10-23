"use client";
import {useLayoutEffect,useRef,useState,type ReactNode} from 'react';

const minimum=140,gripHeight=12;

/** Resize only the viewing window; physical floor dimensions remain untouched. */
export function ExploreViewport({account,arranging,children}:{account:string;arranging:boolean;children:ReactNode}){
 const panel=useRef<HTMLDivElement>(null),selected=useRef<number|null>(null);
 const drag=useRef<{y:number;height:number;pointer:number}|null>(null);
 const [height,setHeight]=useState<number|null>(null),[maximum,setMaximum]=useState(minimum),[measured,setMeasured]=useState(minimum);
 const limit=useRef(minimum),key='dd-explore-viewport-'+account+(arranging?'-arrange':'-view');
 const apply=(value:number)=>{const next=Math.round(Math.max(minimum,Math.min(limit.current,value)));selected.current=next;setHeight(next);return next;};
 const store=(value:number|null)=>{try{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,String(value));}catch{/* Viewing remains available when storage is disabled. */}};
 useLayoutEffect(()=>{
  const element=panel.current!,parent=element.parentElement!;
  let stored:number|null=null;try{const value=Number(localStorage.getItem(key));if(Number.isFinite(value)&&value>=minimum)stored=value;}catch{}
  selected.current=stored;setHeight(stored);
  const measure=()=>{
   const siblings=Array.from(parent.children).filter(child=>child!==element),style=getComputedStyle(parent);
   const used=siblings.reduce((sum,child)=>{const css=getComputedStyle(child);return sum+child.getBoundingClientRect().height+(parseFloat(css.marginTop)||0)+(parseFloat(css.marginBottom)||0);},0);
   const available=Math.max(minimum,Math.floor(parent.clientHeight-(parseFloat(style.paddingTop)||0)-(parseFloat(style.paddingBottom)||0)-used-(parseFloat(style.rowGap)||0)*siblings.length-gripHeight));
   limit.current=available;setMaximum(available);
   if(selected.current!==null)setHeight(Math.min(selected.current,available));
   setMeasured(Math.max(minimum,Math.round(element.getBoundingClientRect().height-gripHeight)));
  };
  const observer=new ResizeObserver(measure);
  const observe=()=>{observer.disconnect();observer.observe(parent);for(const child of Array.from(parent.children))observer.observe(child);measure();};
  const mutations=new MutationObserver(observe);mutations.observe(parent,{childList:true});observe();
  return()=>{observer.disconnect();mutations.disconnect();drag.current=null;};
 },[key]);
 return <div ref={panel} className="explore-floor-viewport" style={height===null?undefined:{height:height+gripHeight,flex:'none'}}>
  {children}
  <div className="explore-header-edge explore-viewport-edge" role="separator" aria-label="Resize floor view" aria-orientation="horizontal" tabIndex={0} aria-valuemin={minimum} aria-valuemax={maximum} aria-valuenow={measured}
   onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();drag.current={y:event.clientY,height:panel.current!.getBoundingClientRect().height-gripHeight,pointer:event.pointerId};event.currentTarget.setPointerCapture(event.pointerId);}}
   onPointerMove={event=>{const active=drag.current;if(active?.pointer===event.pointerId){event.preventDefault();event.stopPropagation();apply(active.height+event.clientY-active.y);}}}
   onPointerUp={event=>{if(drag.current?.pointer!==event.pointerId)return;event.stopPropagation();store(selected.current);drag.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}
   onPointerCancel={()=>{drag.current=null;}}
   onLostPointerCapture={()=>{drag.current=null;}}
   onKeyDown={event=>{
    if(event.key==='Enter'){event.preventDefault();event.stopPropagation();selected.current=null;setHeight(null);store(null);return;}
    const current=height??measured,next=event.key==='ArrowUp'?current-10:event.key==='ArrowDown'?current+10:event.key==='Home'?minimum:event.key==='End'?limit.current:null;
    if(next!==null){event.preventDefault();event.stopPropagation();store(apply(next));}
   }}
  ><span/></div>
 </div>;
}
