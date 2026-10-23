"use client";
import {useCallback,useLayoutEffect,useRef,useState} from 'react';
import {floorObjectCorners,floorFixtureLabel,type FloorPlanObject} from '@dinerdost/core';

export function FixtureIcon({kind}:{kind:FloorPlanObject['kind']}){
 const paths:Record<string,string>={
  ENTRY:'M5 3h9v18H5z M10 8h12m-3-3 3 3-3 3 M22 16H10m3-3-3 3 3 3',
  EXIT:'M5 3h9v18H5z M10 8h12m-3-3 3 3-3 3 M22 16H10m3-3-3 3 3 3',
  FENCE:'M3 21V6l3-3 3 3v15 M15 21V6l3-3 3 3v15 M1 10h22 M1 17h22',
  WALL:'M2 4h20v16H2z M2 9h20 M2 15h20 M8 4v5 M16 9v6 M9 15v5',
  KITCHEN:'M7 11a4 4 0 1 1 1-7 5 5 0 0 1 8 0 4 4 0 1 1 1 7v9H7z M7 16h10',
  RECEPTION:'M3 12h18v9H3z M6 12V7h12v5 M8 7V3h8v4 M10 16h4',
  WASHROOM:'M3 12V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v3 M4 8v7h4V8 M5 15v6 M7 15v6 M15 8l-3 8h10l-3-8z M15 16v5 M19 16v5',
  STAIRS:'M2 21h5v-5h5v-5h5V6h5 M3 12 16 2 M11 2h5v5',
  SMOKING_ROOM:'M2 15h20v5H2z M17 15v5 M8 11V9c0-3 5-2 5-5V2 M17 11V8',
  LIQUOR_ROOM:'M7 3h10l-2 8-3 3-3-3z M12 14v7 M7 21h10',
  PRIVATE_ROOM:'M4 21V3h16v18 M8 21V7h8v14 M12 14h.01',
 };
 return <svg className="fixture-detail-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{kind==='WASHROOM'&&<><circle cx="6" cy="3.5" r="1.7"/><circle cx="17" cy="3.5" r="1.7"/></>}<path d={paths[kind]??paths.PRIVATE_ROOM}/></svg>;
}
type Size={width:number;height:number};
type LabelPosition={x:number;y:number};
type LabelBox=Size&{x:number;y:number};
const intersects=(a:LabelBox,b:LabelBox)=>a.x<b.x+b.width+5&&a.x+a.width+5>b.x&&a.y<b.y+b.height+5&&a.y+a.height+5>b.y;

function fixtureIconSize(object:FloorPlanObject,zoom:number){
 const angle=(object.rotation??0)*Math.PI/180;
 return Math.min(18,Math.min(object.width,object.height)*zoom*.8/(Math.abs(Math.cos(angle))+Math.abs(Math.sin(angle))));
}

/** Symbols stay upright and contained in their physical fixture at every zoom. */
export function FixtureSymbol({object,zoom}:{object:FloorPlanObject;zoom:number}){
 const size=fixtureIconSize(object,zoom);
 return <span className="fixture-symbol" aria-hidden="true" style={{width:size,height:size,transform:`translate(-50%,-50%) rotate(${-(object.rotation??0)}deg) scale(${1/zoom})`}}><FixtureIcon kind={object.kind}/></span>;
}

/** Names sit beneath their objects, avoiding other names, icons and resize controls. */
export function FixtureLabels({objects,zoom,reserved=[]}:{objects:FloorPlanObject[];zoom:number;reserved?:FloorPlanObject[]}){
 const [sizes,setSizes]=useState<Record<string,Size>>({});
 const measured=useCallback((id:string,size:Size)=>setSizes(old=>old[id]&&Math.abs(old[id].width-size.width)<.1&&Math.abs(old[id].height-size.height)<.1?old:{...old,[id]:size}),[]);
 const occupied:LabelBox[]=objects.filter(object=>object.kind!=='TABLE').map(object=>{
  const size=fixtureIconSize(object,zoom);
  return {x:(object.x+object.width/2)*zoom-size/2,y:(object.y+object.height/2)*zoom-size/2,width:size,height:size};
 });
 const positions=new Map<string,LabelPosition>(),named=objects.filter(object=>object.kind!=='WALL');
 for(const object of reserved){
  const corners=floorObjectCorners(object),xs=corners.map(p=>p.x*zoom),ys=corners.map(p=>p.y*zoom);
  occupied.push({x:Math.min(...xs)-10,y:Math.min(...ys)-10,width:Math.max(...xs)-Math.min(...xs)+20,height:Math.max(...ys)-Math.min(...ys)+20});
 }
 for(const object of named){
  const size=sizes[object.id]??{width:120,height:13},width=size.width+12,height=size.height+8;
  const x=(object.x+object.width/2)*zoom-width/2;
  let y=Math.max(...floorObjectCorners(object).map(p=>p.y))*zoom+6;
  // Keep the name centered below its source, moving down only when blocked.
  for(let attempt=0;attempt<=occupied.length;attempt++){
   const blockers=occupied.filter(other=>intersects({x,y,width,height},other));
   if(!blockers.length)break;
   y=Math.max(...blockers.map(other=>other.y+other.height))+6;
  }
  occupied.push({x,y,width,height});positions.set(object.id,{x:(x+width/2)/zoom,y:y/zoom});
 }
 return <>{named.map(object=><FixtureDetails key={object.id} object={object} zoom={zoom} position={positions.get(object.id)!} measured={measured}/>)}</>;
}
function FixtureDetails({object,zoom,position,measured}:{object:FloorPlanObject;zoom:number;position:LabelPosition;measured:(id:string,size:Size)=>void}){
 const content=useRef<HTMLSpanElement>(null),label=floorFixtureLabel(object);
 useLayoutEffect(()=>{
  const element=content.current;if(!element)return;
  const measure=()=>{const rect=element.getBoundingClientRect();measured(object.id,{width:rect.width,height:rect.height});};
  measure();const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect();
 },[object.id,label,zoom,measured]);
 const {x,y}=position;
 return <span className="fixture-detail is-outside" data-fixture-id={object.id} data-label-placement="below" style={{left:x,top:y,transform:`translateX(-50%) scale(${1/zoom})`,transformOrigin:'top center'}}>
  <span ref={content} className="fixture-detail-content"><strong className={object.kind==='TABLE'?'plan-table-name':undefined}>{label}</strong></span>
 </span>;
}
