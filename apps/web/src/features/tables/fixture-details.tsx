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
  WASHROOM:'M7 4h.01 M17 4h.01 M7 8v13 M3 10l4-2 4 2 M17 8l-4 8h8z M17 16v5',
  STAIRS:'M2 21h5v-5h5v-5h5V6h5 M3 12 16 2 M11 2h5v5',
  SMOKING_ROOM:'M2 15h20v5H2z M17 15v5 M8 11V9c0-3 5-2 5-5V2 M17 11V8',
  LIQUOR_ROOM:'M7 3h10l-2 8-3 3-3-3z M12 14v7 M7 21h10',
  PRIVATE_ROOM:'M4 21V3h16v18 M8 21V7h8v14 M12 14h.01',
 };
 return <svg className="fixture-detail-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[kind]??paths.PRIVATE_ROOM}/></svg>;
}
type Size={width:number;height:number};
type LabelPosition={x:number;y:number;inside:boolean};
type LabelBox=Size&{x:number;y:number};
const intersects=(a:LabelBox,b:LabelBox)=>a.x<b.x+b.width+5&&a.x+a.width+5>b.x&&a.y<b.y+b.height+5&&a.y+a.height+5>b.y;

/** Label boxes avoid each other; they may overlap physical objects as requested. */
export function FixtureLabels({objects,zoom,reserved=[],viewport,occupiedIds=[]}:{objects:FloorPlanObject[];zoom:number;reserved?:FloorPlanObject[];viewport?:LabelBox;occupiedIds?:string[]}){
 const [sizes,setSizes]=useState<Record<string,Size>>({});
 const measured=useCallback((id:string,size:Size)=>setSizes(old=>old[id]&&Math.abs(old[id].width-size.width)<.1&&Math.abs(old[id].height-size.height)<.1?old:{...old,[id]:size}),[]);
 const occupied:LabelBox[]=[],positions=new Map<string,LabelPosition>();
 const details=objects.map(object=>{
  const size=sizes[object.id]??{width:120,height:24},angle=(object.rotation??0)*Math.PI/180,c=Math.abs(Math.cos(angle)),s=Math.abs(Math.sin(angle));
  const inside=!!sizes[object.id]&&(size.width*c+size.height*s+16)<=object.width*zoom&&(size.width*s+size.height*c+16)<=object.height*zoom;
  return {object,size,inside};
 });
 // Reserve inside text first, so callouts cannot hide another fixture's details.
 for(const {object,size,inside} of details)if(inside){const x=(object.x+object.width/2)*zoom,y=(object.y+object.height/2)*zoom,box={x:x-size.width/2,y:y-size.height/2,...size};if(!occupied.some(other=>intersects(box,other))){occupied.push(box);positions.set(object.id,{x:x/zoom,y:y/zoom,inside:true});}}
 // Keep outside annotations clear of the selected object's resize knobs and table text.
 for(const object of reserved){const corners=floorObjectCorners(object),xs=corners.map(p=>p.x*zoom),ys=corners.map(p=>p.y*zoom);occupied.push({x:Math.min(...xs)-10,y:Math.min(...ys)-10,width:Math.max(...xs)-Math.min(...xs)+20,height:Math.max(...ys)-Math.min(...ys)+20});}
 for(const {object,size} of details){
  if(positions.has(object.id))continue;
  const corners=floorObjectCorners(object),left=Math.min(...corners.map(p=>p.x))*zoom,right=Math.max(...corners.map(p=>p.x))*zoom,top=Math.min(...corners.map(p=>p.y))*zoom,bottom=Math.max(...corners.map(p=>p.y))*zoom;
  const width=size.width+16,height=size.height+12,cx=(left+right)/2,cy=(top+bottom)/2;
  const candidates=[{x:cx-width/2,y:bottom+10},{x:cx-width/2,y:top-height-10},{x:right+10,y:cy-height/2},{x:left-width-10,y:cy-height/2}];
  const clear=(point:{x:number;y:number})=>!occupied.some(other=>intersects({...point,width,height},other));
  const visible=viewport&&left<viewport.x+viewport.width&&right>viewport.x&&top<viewport.y+viewport.height&&bottom>viewport.y;
  const inView=(point:{x:number;y:number})=>!visible||!viewport||(point.x>=viewport.x+5&&point.y>=viewport.y+5&&point.x+width<=viewport.x+viewport.width-5&&point.y+height<=viewport.y+viewport.height-5);
  let candidate=candidates.find(point=>inView(point)&&clear(point));
  if(!candidate&&visible&&viewport){
   const grid:{x:number;y:number}[]=[];
   for(let y=viewport.y+6;y+height<=viewport.y+viewport.height-6;y+=12)for(let x=viewport.x+6;x+width<=viewport.x+viewport.width-6;x+=12)grid.push({x,y});
   grid.sort((a,b)=>Math.hypot(a.x+width/2-cx,a.y+height/2-cy)-Math.hypot(b.x+width/2-cx,b.y+height/2-cy));candidate=grid.find(clear);
  }
  for(let ring=1;!candidate&&ring<=objects.length+1;ring++)for(const sign of [-1,1]){
   candidate=[{x:cx-width/2+sign*ring*(width+8),y:bottom+10},{x:cx-width/2,y:bottom+10+sign*ring*(height+8)}].find(clear);if(candidate)break;
  }
  candidate??={x:Math.max(right,...occupied.map(box=>box.x+box.width))+10,y:bottom+10};
  occupied.push({...candidate,width,height});positions.set(object.id,{x:(candidate.x+width/2)/zoom,y:candidate.y/zoom,inside:false});
 }
 return <>
  <svg className="fixture-label-connectors" aria-hidden="true">{objects.map(object=>{const p=positions.get(object.id)!;return p.inside?null:<line key={object.id} x1={object.x+object.width/2} y1={object.y+object.height/2} x2={p.x} y2={p.y} vectorEffect="non-scaling-stroke"/>})}</svg>
  {objects.map(object=><FixtureDetails key={object.id} object={object} zoom={zoom} position={positions.get(object.id)!} measured={measured} occupied={occupiedIds.includes(object.id)}/>)}
 </>;
}
function FixtureDetails({object,zoom,position,measured,occupied}:{object:FloorPlanObject;zoom:number;position:LabelPosition;measured:(id:string,size:Size)=>void;occupied:boolean}){
 const content=useRef<HTMLSpanElement>(null),label=floorFixtureLabel(object);
 useLayoutEffect(()=>{
  const element=content.current;if(!element)return;
  const measure=()=>{const rect=element.getBoundingClientRect();measured(object.id,{width:rect.width,height:rect.height});};
  measure();const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect();
 },[object.id,label,zoom,measured]);
 const {x,y,inside}=position;
 return <span className={'fixture-detail '+(inside?'is-inside':'is-outside')+(inside&&occupied?' is-occupied':'')} data-fixture-id={object.id} data-label-placement={inside?'inside':'outside'} style={{left:x,top:y,transform:`translate(-50%,${inside?'-50%':'0'}) scale(${1/zoom})`,transformOrigin:inside?'center':'top center'}}>
  <span ref={content} className="fixture-detail-content">{object.kind!=='TABLE'&&<FixtureIcon kind={object.kind}/>}<strong className={object.kind==='TABLE'?'plan-table-name':undefined} style={object.kind==='TABLE'?{fontSize:Math.max(12,22*zoom)}:undefined}>{label}</strong></span>
 </span>;
}
