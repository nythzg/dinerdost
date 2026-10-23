"use client";
import {useCallback,useLayoutEffect,useRef,useState} from 'react';
import {floorObjectCorners,floorObjectCornerRadius,floorFixtureLabel,type FloorPlanObject} from '@dinerdost/core';

function tableIconShape(seats?:number){
 const count=typeof seats==='number'&&Number.isInteger(seats)&&seats>=1&&seats<=100?seats:0;
 // Two end seats, then balanced long sides: 2/4 are compact, 6/8/12 grow longer.
 const counts=count===1?[1,0,0,0]:[Math.ceil(Math.max(0,count-2)/2),count>=2?1:0,Math.floor(Math.max(0,count-2)/2),count>=2?1:0];
 return {count,counts,width:24+Math.max(0,Math.max(counts[0],counts[2])-1)*8,height:24};
}
function TableIcon({seats}:{seats?:number}){
 const {count,counts,width,height}=tableIconShape(seats);
 return <svg className="fixture-detail-icon table-detail-icon" data-seat-count={count} aria-hidden="true" viewBox={`0 0 ${width} ${height}`} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
  <rect x="6" y="6" width={width-12} height="12" rx="2.5"/>
  {counts.flatMap((total,side)=>Array.from({length:total},(_,index)=>{
   const edge=side%2?12:width-12,spacing=edge/(total+1),center=6+(index+1)*spacing,half=total===1?3:Math.min(3,Math.max(.5,(spacing-3)/2));
   return <path key={side+'-'+index} data-table-chair="" data-chair-side={side} d={side===0?`M${center-half} 2h${2*half}`:side===2?`M${center-half} 22h${2*half}`:side===1?`M${width-2} ${center-half}v${2*half}`:`M2 ${center-half}v${2*half}`}/>;
  }))}
 </svg>;
}
export function FixtureIcon({kind,seats}:{kind:FloorPlanObject['kind'];seats?:number}){
 if(kind==='TABLE')return <TableIcon seats={seats}/>;
 if(kind==='PRIVATE_ROOM')return <svg className="fixture-detail-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 21V3h14v18 M3 21h18 M9 11V8a3 3 0 0 1 6 0v3"/><rect x="8" y="11" width="8" height="7" rx="1"/><circle cx="12" cy="14" r=".8" fill="currentColor" stroke="none"/><path d="M12 14.8v1.4"/></svg>;
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
  PRIVATE_ROOM:'M5 21V3h14v18 M3 21h18 M9 12V9a3 3 0 0 1 6 0v3 M8 12h8v6H8z M12 15v.5',
 };
 return <svg className="fixture-detail-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{kind==='WASHROOM'&&<><circle cx="6" cy="3.5" r="1.7"/><circle cx="17" cy="3.5" r="1.7"/></>}<path d={paths[kind]??paths.PRIVATE_ROOM}/></svg>;
}
type Size={width:number;height:number};
type LabelPosition={x:number;y:number;inside:boolean;iconOffset?:number;nearby?:boolean};
type LabelBox=Size&{x:number;y:number;fixtureId?:string};
const intersects=(a:LabelBox,b:LabelBox)=>a.x<b.x+b.width+5&&a.x+a.width+5>b.x&&a.y<b.y+b.height+5&&a.y+a.height+5>b.y;

function fitsInsideFixture(object:FloorPlanObject,zoom:number,width:number,height:number,dx=0,padding=0){
 const angle=(object.rotation??0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
 const hw=object.width*zoom/2-padding,hh=object.height*zoom/2-padding,r=Math.max(0,floorObjectCornerRadius(object)*zoom-padding);
 return [-width/2,width/2].every(x=>[-height/2,height/2].every(y=>{
  const px=Math.abs((x+dx)*c+y*s),py=Math.abs(-(x+dx)*s+y*c);
  return px<=hw&&py<=hh&&Math.hypot(Math.max(0,px-(hw-r)),Math.max(0,py-(hh-r)))<=r+.001;
 }));
}
type FixtureVisual=FloorPlanObject&{seats?:number};
function fixtureIconSize(object:FixtureVisual,zoom:number,compact=false){
 const angle=(object.rotation??0)*Math.PI/180;
 const shape=object.kind==='TABLE'?tableIconShape(object.seats):{width:24,height:24},aspect=shape.width/shape.height;
 const original=Math.min(compact?12:18,Math.min(object.width,object.height)*zoom*(compact&&object.kind==='TABLE'?.4:.8)/(Math.abs(Math.cos(angle))+Math.abs(Math.sin(angle))));
 if(fitsInsideFixture(object,zoom,original*aspect,original))return {width:original*aspect,height:original};
 // Preserve original icon sizing unless newly rounded corners would clip it.
 let low=0,high=original;for(let i=0;i<16;i++){const mid=(low+high)/2;if(fitsInsideFixture(object,zoom,mid*aspect,mid))low=mid;else high=mid;}return {width:low*aspect,height:low};
}

/** Symbols stay upright and contained in their physical fixture at every zoom. */
export function FixtureSymbol({object,zoom,offset=0,seats,compact=false}:{object:FloorPlanObject;zoom:number;offset?:number;seats?:number;compact?:boolean}){
 const size=fixtureIconSize({...object,seats},zoom,compact),angle=(object.rotation??0)*Math.PI/180;
 return <span className="fixture-symbol" aria-hidden="true" style={{...size,left:`calc(50% + ${offset*Math.cos(angle)/zoom}px)`,top:`calc(50% + ${-offset*Math.sin(angle)/zoom}px)`,transform:`translate(-50%,-50%) rotate(${-(object.rotation??0)}deg) scale(${1/zoom})`}}><FixtureIcon kind={object.kind} seats={seats}/></span>;
}

/** Share measured text placement with physical symbols so the pair stays centered. */
export function useFixtureLayout(objects:FixtureVisual[],zoom:number,reserved:FloorPlanObject[]=[],compact=false,viewport?:LabelBox){
 const [sizes,setSizes]=useState<Record<string,Size>>({});
 const measured=useCallback((id:string,size:Size)=>setSizes(old=>old[id]&&Math.abs(old[id].width-size.width)<.1&&Math.abs(old[id].height-size.height)<.1?old:{...old,[id]:size}),[]);
 const occupied:LabelBox[]=objects.map(object=>{
  const size=fixtureIconSize(object,zoom,compact);
  return {x:(object.x+object.width/2)*zoom-size.width/2,y:(object.y+object.height/2)*zoom-size.height/2,...size,fixtureId:object.id};
 });
 const positions=new Map<string,LabelPosition>(),named=objects.filter(object=>object.kind!=='WALL');
 // Fit both upright boxes within the real rotated shape, with text beside its icon.
 for(const object of named){
  const size=sizes[object.id];if(!size)continue;
  const gap=compact?2:6,icon=fixtureIconSize(object,zoom,compact),offset=(icon.width+gap)/2,iconOffset=-(size.width+gap)/2;
  const fitsBox=(width:number,height:number,dx:number)=>fitsInsideFixture(object,zoom,width,height,dx,compact?1:4);
  const cx=(object.x+object.width/2)*zoom,cy=(object.y+object.height/2)*zoom,box={x:cx+offset-size.width/2,y:cy-size.height/2,...size},symbol={x:cx+iconOffset-icon.width/2,y:cy-icon.height/2,...icon,fixtureId:object.id};
  const fits=fitsBox(size.width,size.height,offset)&&fitsBox(icon.width,icon.height,iconOffset);
  if(fits&&!occupied.some(other=>other.fixtureId!==object.id&&(intersects(box,other)||intersects(symbol,other)))){
   const ownIcon=occupied.findIndex(other=>other.fixtureId===object.id);if(ownIcon>=0)occupied[ownIcon]=symbol;
   occupied.push(box);positions.set(object.id,{x:(cx+offset)/zoom,y:cy/zoom,inside:true,iconOffset});
  }
 }
 for(const object of reserved){
  const corners=floorObjectCorners(object),xs=corners.map(p=>p.x*zoom),ys=corners.map(p=>p.y*zoom);
  occupied.push({x:Math.min(...xs)-10,y:Math.min(...ys)-10,width:Math.max(...xs)-Math.min(...xs)+20,height:Math.max(...ys)-Math.min(...ys)+20});
 }
 for(const object of named){
  if(positions.has(object.id))continue;
  const size=sizes[object.id]??{width:compact?80:120,height:13},width=size.width+(compact?(object.kind==='TABLE'?6:8):12),height=size.height+(compact?(object.kind==='TABLE'?2:6):8);
  let x=(object.x+object.width/2)*zoom-width/2;
  const bottom=Math.max(...floorObjectCorners(object).map(p=>p.y))*zoom;
  let y=bottom+(compact?3:6);
  if(compact){
   const gap=2,near=(a:LabelBox,b:LabelBox)=>a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;
   const corners=floorObjectCorners(object),left=Math.min(...corners.map(p=>p.x))*zoom,right=Math.max(...corners.map(p=>p.x))*zoom,top=Math.min(...corners.map(p=>p.y))*zoom;
   const onScreen=viewport&&right>=viewport.x&&left<=viewport.x+viewport.width&&bottom>=viewport.y&&top<=viewport.y+viewport.height;
   const minX=onScreen?viewport.x:-Infinity,maxX=onScreen?viewport.x+viewport.width-width:Infinity;
   const clampX=(value:number)=>Math.max(minX,Math.min(maxX,value));
   const originX=x,originY=y,candidates:({x:number;y:number;score:number})[]=[];
   // Search beside neighbouring labels as well as below. Never cascade a
   // narrow row of table numbers down the entire phone screen.
   const xs=[...new Set([x,left-width-gap,right+gap,...occupied.flatMap(box=>[box.x-width-gap,box.x+box.width+gap]),...(onScreen?[minX,maxX]:[])].map(clampX))].sort((a,b)=>Math.abs(a-originX)-Math.abs(b-originX)).slice(0,96);
   const ys=[...new Set([y,...occupied.map(box=>box.y+box.height+gap)].filter(value=>value>=originY&&value<=originY+100&&(!onScreen||(value>=viewport.y&&value+height<=viewport.y+viewport.height))))].sort((a,b)=>a-b).slice(0,48);
   const search=(rows:number[])=>{for(const cy of rows)for(const cx of xs){
    if(onScreen&&(cy<viewport.y||cy+height>viewport.y+viewport.height))continue;
    const score=(cx-originX)**2+2*(cy-originY)**2;if(candidates[0]&&score>=candidates[0].score)continue;
    const box={x:cx,y:cy,width,height};if(occupied.some(other=>near(box,other)))continue;
    candidates.splice(0,1,{x:cx,y:cy,score});
   }};
   search(ys);
   // Short landscape viewports may have no room below. Keep those labels
   // beside/above their source rather than pushing them beyond the canvas.
   if(onScreen&&(!candidates.length||Math.min(...candidates.map(candidate=>candidate.score))>3600))search([...new Set([(top+bottom-height)/2,top-height-gap,...occupied.flatMap(box=>[box.y-height-gap,box.y+box.height+gap])].filter(value=>value>=viewport.y&&value+height<=viewport.y+viewport.height))].sort((a,b)=>Math.abs(a-originY)-Math.abs(b-originY)).slice(0,48));
   candidates.sort((a,b)=>a.score-b.score||a.y-b.y||a.x-b.x);
   if(candidates.length){x=candidates[0].x;y=candidates[0].y;occupied.push({x,y,width,height});positions.set(object.id,{x:(x+width/2)/zoom,y:y/zoom,inside:false,nearby:y<bottom});continue;}
   x=clampX(x);
  }
  // Keep the name centered below its source, moving down only when blocked.
  for(let attempt=0;attempt<=occupied.length;attempt++){
   const blockers=occupied.filter(other=>intersects({x,y,width,height},other));
   if(!blockers.length)break;
   y=Math.max(...blockers.map(other=>other.y+other.height))+6;
  }
  occupied.push({x,y,width,height});positions.set(object.id,{x:(x+width/2)/zoom,y:y/zoom,inside:false});
 }
 return {positions,measured,compact};
}
/** Names sit beside an interior icon when they fit; otherwise beneath at the same size. */
export function FixtureLabels({objects,zoom,layout,occupiedIds=[]}:{objects:FloorPlanObject[];zoom:number;layout:ReturnType<typeof useFixtureLayout>;occupiedIds?:string[]}){
 return <>{objects.filter(object=>object.kind!=='WALL').map(object=><FixtureDetails key={object.id} object={object} zoom={zoom} position={layout.positions.get(object.id)!} measured={layout.measured} occupied={occupiedIds.includes(object.id)} compact={layout.compact}/>)}</>;
}
function FixtureDetails({object,zoom,position,measured,occupied,compact}:{object:FloorPlanObject;zoom:number;position:LabelPosition;measured:(id:string,size:Size)=>void;occupied:boolean;compact:boolean}){
 const content=useRef<HTMLSpanElement>(null),label=floorFixtureLabel(object);
 useLayoutEffect(()=>{
  const element=content.current;if(!element)return;
  const measure=()=>{const rect=element.getBoundingClientRect();measured(object.id,{width:rect.width,height:rect.height});};
  measure();const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect();
 },[object.id,label,zoom,measured]);
 const {x,y,inside,nearby}=position;
 return <span className={'fixture-detail '+(inside?'is-inside':'is-outside')+(inside&&occupied?' is-occupied':'')+(compact?' is-compact':'')+(object.kind==='TABLE'?' is-table':'')} data-fixture-id={object.id} data-label-placement={inside?'inside':nearby?'nearby':'below'} style={{left:x,top:y,transform:`translate(-50%,${inside?'-50%':'0'}) scale(${1/zoom})`,transformOrigin:inside?'center':'top center'}}>
  <span ref={content} className="fixture-detail-content"><strong className={object.kind==='TABLE'?'plan-table-name':undefined}>{label}</strong></span>
 </span>;
}
