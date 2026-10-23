"use client";
import {useRef} from 'react';

export function RoundnessControl({label,value,max,step=1,disabled=false,change,start,finish}:{label:string;value:number;max:number;step?:number;disabled?:boolean;change:(value:number)=>void;start:()=>void;finish:()=>void}){
 const current=Math.max(0,Math.min(max,value)),percent=Math.round(current/max*100);
 const active=useRef(false);
 const begin=()=>{if(!active.current){active.current=true;start()}};
 const end=()=>{if(active.current){active.current=false;finish()}};
 return <label className="floor-roundness-control">
  <span>{label}</span>
  <span className="roundness-slider-track">
   <span className="roundness-end" aria-hidden="true"/>
   <input aria-label={label} aria-valuetext={current===0?'Square corners':current===max?'Fully rounded corners':percent+'% rounded'} type="range" min="0" max={max} step={step} value={current} disabled={disabled}
    onChange={event=>change(event.currentTarget.valueAsNumber)}
    onPointerDown={event=>{begin();event.currentTarget.setPointerCapture(event.pointerId)}} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}
    onKeyDown={event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','PageUp','PageDown','Home','End'].includes(event.key))begin()}}
    onKeyUp={event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','PageUp','PageDown','Home','End'].includes(event.key))end()}} onBlur={end}/>
   <span className="roundness-end is-round" aria-hidden="true"/>
  </span>
 </label>;
}
