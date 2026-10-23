import {constrainFloorChange,floorObjectCorners,floorOutline,floorEllipse,ellipseOutline,resizeFloorObject,rotateFloorPoint,type FloorPlanObject,type FloorPlanSize,type FloorPoint,type FloorResizeDirection} from '@dinerdost/core';
import {moveFloorSelection,resizeFloorArea,type FloorAreaDraft} from './floor-editor-state';

export type Point=FloorPoint;
export type GuideLine={type:'vertical'|'horizontal';position:number};
export type VectorSegmentGuide={p1:Point;p2:Point};
export type SnapConfig={enabled?:boolean;screenTolerancePx:number;zoomFactor:number;snapToPixel:boolean;snapToGrid:boolean;gridSize:number;smartGuides:boolean};
export type SnapSettings=Omit<SnapConfig,'zoomFactor'>;
export type SnapGuide=GuideLine&{source:string};
export type SnapResult={snappedPoint:Point;snappedX:boolean;snappedY:boolean;sourceX?:string;sourceY?:string;guides:SnapGuide[]};
export const defaultSnapSettings:SnapSettings={enabled:true,screenTolerancePx:4,snapToPixel:false,snapToGrid:true,gridSize:10,smartGuides:true};
export type SnapScene={rulers:GuideLine[];vectors:VectorSegmentGuide[];anchors:Point[]};
const finite=(point:Point)=>Number.isFinite(point.x)&&Number.isFinite(point.y);

/** Adapted from the user's supplied engine: screen-space tolerance and nearest targets.
 * Paired anchor/vector corrections stay atomic instead of mixing unrelated X/Y targets.
 */
export class IllustratorSnapEngine{
 static computeSnap(rawCursor:Point,draggedBoxPoints:Point[],rulerGuides:GuideLine[],customVectorGuides:VectorSegmentGuide[],sceneAnchors:Point[],config:SnapConfig):SnapResult{
  const none:SnapResult={snappedPoint:{...rawCursor},snappedX:false,snappedY:false,guides:[]};
  if(config.enabled===false||!finite(rawCursor)||!Number.isFinite(config.zoomFactor)||config.zoomFactor<=0||!Number.isFinite(config.screenTolerancePx)||config.screenTolerancePx<0)return none;
  const tolerance=config.screenTolerancePx/config.zoomFactor;
  let x:{delta:number;position:number;source:string}|undefined,y:typeof x;
  const offer=(axis:'x'|'y',delta:number,position:number,source:string)=>{
   const old=axis==='x'?x:y;
   if(Number.isFinite(delta)&&Math.abs(delta)<=tolerance&&(!old||Math.abs(delta)<Math.abs(old.delta)-1e-9)){
    const candidate={delta,position,source};if(axis==='x')x=candidate;else y=candidate;
   }
  };
  if(config.snapToGrid||config.snapToPixel){
   const step=config.snapToGrid?config.gridSize:1;
   if(Number.isFinite(step)&&step>0)for(const axis of ['x','y'] as const){const target=Math.round(rawCursor[axis]/step)*step;offer(axis,target-rawCursor[axis],target,config.snapToGrid?'Grid':'Pixel Grid');}
  }
  let pair:{dx:number;dy:number;distance:number;point:Point;source:string;axis:'x'|'y'|'both'}|undefined;
  const offerPair=(reference:Point,target:Point,source:string,axis:'x'|'y'|'both'='both')=>{
   const dx=target.x-reference.x,dy=target.y-reference.y,distance=Math.hypot(dx,dy);
   if(distance<=tolerance&&(!pair||distance<pair.distance-1e-9))pair={dx,dy,distance,point:target,source,axis};
  };
  for(const reference of draggedBoxPoints.filter(finite)){
   for(const anchor of sceneAnchors.filter(finite)){
    offerPair(reference,anchor,'Anchor Point');
    if(config.smartGuides){offer('x',anchor.x-reference.x,anchor.x,'Smart Guide (Vertical Alignment)');offer('y',anchor.y-reference.y,anchor.y,'Smart Guide (Horizontal Alignment)');}
   }
   for(const segment of customVectorGuides)if(finite(segment.p1)&&finite(segment.p2)){
    const target=this.closestPointOnSegment(reference,segment.p1,segment.p2);
    const withinY=reference.y>=Math.min(segment.p1.y,segment.p2.y)&&reference.y<=Math.max(segment.p1.y,segment.p2.y),withinX=reference.x>=Math.min(segment.p1.x,segment.p2.x)&&reference.x<=Math.max(segment.p1.x,segment.p2.x);
    offerPair(reference,target,'Custom Vector Guide',Math.abs(segment.p1.x-segment.p2.x)<1e-8&&withinY?'x':Math.abs(segment.p1.y-segment.p2.y)<1e-8&&withinX?'y':'both');
   }
   for(const guide of rulerGuides){const axis=guide.type==='vertical'?'x':'y';offer(axis,guide.position-reference[axis],guide.position,guide.type==='vertical'?'Vertical Ruler Guide':'Horizontal Ruler Guide');}
  }
  if(pair&&pair.distance<=Math.hypot(x?.delta??Infinity,y?.delta??Infinity)+1e-9){
   if(pair.axis!=='y'&&(!x||pair.axis==='both'||Math.abs(pair.dx)<=Math.abs(x.delta)))x={delta:pair.dx,position:pair.point.x,source:pair.source};
   if(pair.axis!=='x'&&(!y||pair.axis==='both'||Math.abs(pair.dy)<=Math.abs(y.delta)))y={delta:pair.dy,position:pair.point.y,source:pair.source};
  }
  const guides:SnapGuide[]=[];
  if(x&&!['Grid','Pixel Grid'].includes(x.source))guides.push({type:'vertical',position:x.position,source:x.source});
  if(y&&!['Grid','Pixel Grid'].includes(y.source))guides.push({type:'horizontal',position:y.position,source:y.source});
  return {snappedPoint:{x:rawCursor.x+(x?.delta??0),y:rawCursor.y+(y?.delta??0)},snappedX:!!x,snappedY:!!y,sourceX:x?.source,sourceY:y?.source,guides};
 }
 static closestPointOnSegment(p:Point,a:Point,b:Point):Point{
  const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;if(!length)return {...a};
  const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length));return {x:a.x+t*dx,y:a.y+t*dy};
 }
}

export function boxAnchors(corners:Point[]):Point[]{
 return [...corners,...corners.map((p,i)=>({x:(p.x+corners[(i+1)%corners.length].x)/2,y:(p.y+corners[(i+1)%corners.length].y)/2})),{x:corners.reduce((sum,p)=>sum+p.x,0)/corners.length,y:corners.reduce((sum,p)=>sum+p.y,0)/corners.length}];
}
export function floorSnapScene(area:FloorPlanSize,outline:Point[]|null,objects:FloorPlanObject[],exclude:string[]=[],includeBoundary=true):SnapScene{
 const boundary=includeBoundary?(outline??floorOutline('Rectangle',area)):[];
 const paths=[...(boundary.length?[boundary]:[]),...objects.filter(o=>!exclude.includes(o.id)).map(floorObjectCorners)];
 return {
  rulers:includeBoundary?[{type:'vertical',position:0},{type:'vertical',position:area.width/2},{type:'vertical',position:area.width},{type:'horizontal',position:0},{type:'horizontal',position:area.height/2},{type:'horizontal',position:area.height}]:[],
  vectors:paths.flatMap(path=>path.map((p,i)=>({p1:p,p2:path[(i+1)%path.length]}))),
  anchors:paths.flatMap(boxAnchors),
 };
}
export function snapPoint(point:Point,references:Point[],scene:SnapScene,config:SnapConfig,bypass=false):SnapResult{
 return IllustratorSnapEngine.computeSnap(point,references,bypass?[]:scene.rulers,bypass?[]:scene.vectors,bypass?[]:scene.anchors,bypass?{...config,snapToGrid:false,snapToPixel:false,smartGuides:false}:config);
}
/** For edge handles, intersect targets with the permitted motion line before snapping.
 * Projecting an arbitrary snapped cursor afterward would lose alignment or move a fixed edge.
 */
export function snapAlongLine(point:Point,unit:Point,scene:SnapScene,config:SnapConfig,bypass=false):SnapResult{
 if(bypass||config.enabled===false)return snapPoint(point,[point],scene,{...config,enabled:false},true);
 const targets:Point[]=[],tolerance=config.screenTolerancePx/config.zoomFactor;
 const add=(distance:number)=>{if(Number.isFinite(distance)&&Math.abs(distance)<=tolerance)targets.push({x:point.x+unit.x*distance,y:point.y+unit.y*distance});};
 const axis=(key:'x'|'y',position:number)=>{if(Math.abs(unit[key])>1e-8)add((position-point[key])/unit[key]);};
 if(config.snapToGrid||config.snapToPixel){const step=config.snapToGrid?config.gridSize:1;if(step>0)for(const key of ['x','y'] as const)axis(key,Math.round(point[key]/step)*step);}
 for(const guide of scene.rulers)axis(guide.type==='vertical'?'x':'y',guide.position);
 for(const anchor of scene.anchors){
  if(config.smartGuides){axis('x',anchor.x);axis('y',anchor.y);}
  const distance=(anchor.x-point.x)*unit.x+(anchor.y-point.y)*unit.y;
  if(Math.hypot(point.x+distance*unit.x-anchor.x,point.y+distance*unit.y-anchor.y)<1e-6)add(distance);
 }
 for(const {p1,p2} of scene.vectors){
  const vx=p2.x-p1.x,vy=p2.y-p1.y,den=unit.x*vy-unit.y*vx;
  if(Math.abs(den)<1e-8)continue;
  const dx=p1.x-point.x,dy=p1.y-point.y,distance=(dx*vy-dy*vx)/den,t=(dx*unit.y-dy*unit.x)/den;
  if(t>=0&&t<=1)add(distance);
 }
 return snapPoint(point,[point],{rulers:[],vectors:[],anchors:targets},{...config,snapToGrid:false,snapToPixel:false,smartGuides:false});
}
export function snapFloorMove(objects:FloorPlanObject[],ids:string[],dx:number,dy:number,area:FloorPlanSize,outline:Point[]|null,roundness:number,config:SnapConfig,bypass=false){
 const selected=objects.filter(o=>ids.includes(o.id));if(!selected.length)return {objects,guides:[] as SnapGuide[]};
 const corners=selected.flatMap(floorObjectCorners),left=Math.min(...corners.map(p=>p.x)),right=Math.max(...corners.map(p=>p.x)),top=Math.min(...corners.map(p=>p.y)),bottom=Math.max(...corners.map(p=>p.y));
 const references=(selected.length===1?boxAnchors(floorObjectCorners(selected[0])):boxAnchors([{x:left,y:top},{x:right,y:top},{x:right,y:bottom},{x:left,y:bottom}])).map(p=>({x:p.x+dx,y:p.y+dy}));
 const origin={x:selected[0].x+dx,y:selected[0].y+dy},snap=snapPoint(origin,references,floorSnapScene(area,outline,objects,ids),config,bypass);
 const next=moveFloorSelection(objects,ids,dx+snap.snappedPoint.x-origin.x,dy+snap.snappedPoint.y-origin.y,area,outline,roundness);
 const actual=next.find(o=>o.id===selected[0].id)!;
 return {objects:next,guides:Math.hypot(actual.x-snap.snappedPoint.x,actual.y-snap.snappedPoint.y)<1e-5?snap.guides:[]};
}
export const resizeVector:Record<FloorResizeDirection,[number,number]>={nw:[-1,-1],n:[0,-1],ne:[1,-1],w:[-1,0],e:[1,0],sw:[-1,1],s:[0,1],se:[1,1]};
export function objectResizePoint(object:FloorPlanObject,direction:FloorResizeDirection){const [x,y]=resizeVector[direction];return rotateFloorPoint(object,{x:object.x+(x+1)*object.width/2,y:object.y+(y+1)*object.height/2});}
export function snapFloorResize(object:FloorPlanObject,direction:FloorResizeDirection,dw:number,dh:number,objects:FloorPlanObject[],area:FloorPlanSize,outline:Point[]|null,roundness:number,config:SnapConfig,bypass=false){
 const raw=resizeFloorObject(object,area,direction,dw,dh,true,0),point=objectResizePoint(raw,direction),[hx,hy]=resizeVector[direction],angle=(object.rotation??0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),scene=floorSnapScene(area,outline,objects,[object.id]);
 const snap=hx&&hy?snapPoint(point,[point],scene,config,bypass):snapAlongLine(point,hx?{x:c,y:s}:{x:-s,y:c},scene,config,bypass);
 const dx=snap.snappedPoint.x-point.x,dy=snap.snappedPoint.y-point.y;
 const target=resizeFloorObject(object,area,direction,raw.width-object.width+hx*(dx*c+dy*s),raw.height-object.height+hy*(-dx*s+dy*c),true,0);
 const next=constrainFloorChange(object,target,objects.filter(o=>o.id!==object.id),area,outline,roundness),actual=objectResizePoint(next,direction);
 return {object:next,guides:Math.hypot(actual.x-snap.snappedPoint.x,actual.y-snap.snappedPoint.y)<1e-5?snap.guides:[]};
}
export function snapFloorArea(before:FloorAreaDraft,direction:FloorResizeDirection,dx:number,dy:number,roundness:number,config:SnapConfig,bypass=false){
 const [hx,hy]=resizeVector[direction],start={x:(hx+1)*before.area.width/2,y:(hy+1)*before.area.height/2},raw={x:start.x+(hx?dx:0),y:start.y+(hy?dy:0)},scene=floorSnapScene(before.area,null,before.objects,[],false);
 const snap=hx&&hy?snapPoint(raw,[raw],scene,config,bypass):snapAlongLine(raw,hx?{x:1,y:0}:{x:0,y:1},scene,config,bypass);
 const change=resizeFloorArea(before,direction,snap.snappedPoint.x-start.x,snap.snappedPoint.y-start.y,roundness,1);
 const actual={x:hx===-1?change.offset.x:hx===1?change.area.width:before.area.width/2,y:hy===-1?change.offset.y:hy===1?change.area.height:before.area.height/2};
 return {change,guides:Math.hypot(actual.x-snap.snappedPoint.x,actual.y-snap.snappedPoint.y)<1e-5?snap.guides.map(guide=>({...guide,position:guide.position-(guide.type==='vertical'?change.offset.x:change.offset.y)})):[]};
}
export function snapFloorPlacement(object:FloorPlanObject,others:FloorPlanObject[],area:FloorPlanSize,outline:Point[]|null,roundness:number,config:SnapConfig){
 return snapFloorMove([...others,object],[object.id],0,0,area,outline,roundness,config).objects.at(-1)!;
}

function outlineScene(points:Point[],moving:number[],area:FloorPlanSize,objects:FloorPlanObject[]):SnapScene{
 const scene=floorSnapScene(area,null,objects);
 return {...scene,anchors:[...scene.anchors,...points.filter((_,i)=>!moving.includes(i))],vectors:[...scene.vectors,...points.flatMap((p,i)=>moving.includes(i)||moving.includes((i+1)%points.length)?[]:[{p1:p,p2:points[(i+1)%points.length]}])]};
}
export function snapOutlineCorner(points:Point[],index:number,target:Point,area:FloorPlanSize,objects:FloorPlanObject[],config:SnapConfig,bypass=false){
 const snap=snapPoint(target,[target],outlineScene(points,[index],area,objects),config,bypass);
 const point={x:Math.max(0,Math.min(area.width,Math.round(snap.snappedPoint.x))),y:Math.max(0,Math.min(area.height,Math.round(snap.snappedPoint.y)))};
 return {points:points.map((p,i)=>i===index?point:p),guides:Math.hypot(point.x-snap.snappedPoint.x,point.y-snap.snappedPoint.y)<.75?snap.guides:[]};
}
export function snapOutlineEdge(points:Point[],index:number,dx:number,dy:number,area:FloorPlanSize,objects:FloorPlanObject[],config:SnapConfig,bypass=false){
 const oval=floorEllipse(points),next=(index+1)%points.length,a=points[index],b=points[next];
 const unit=oval?{x:index===0||index===12?1:0,y:index===6||index===18?1:0}:(()=>{const length=Math.hypot(b.x-a.x,b.y-a.y);return {x:-(b.y-a.y)/length,y:(b.x-a.x)/length};})();
 const start=oval?a:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},distance=dx*unit.x+dy*unit.y,raw={x:start.x+distance*unit.x,y:start.y+distance*unit.y};
 const snap=snapAlongLine(raw,unit,outlineScene(points,oval?points.map((_,i)=>i).filter(i=>i%6!==0||i===index):[index,next],area,objects),config,bypass);
 let mx=Math.round(snap.snappedPoint.x-start.x),my=Math.round(snap.snappedPoint.y-start.y);
 if(oval){
  let {x,y,width,height}=oval;
  if(index===0)width=Math.max(200,Math.min(area.width-x,width+mx));
  if(index===6)height=Math.max(200,Math.min(area.height-y,height+my));
  if(index===12){const value=Math.max(0,Math.min(x+width-200,x+mx));width+=x-value;x=value;}
  if(index===18){const value=Math.max(0,Math.min(y+height-200,y+my));height+=y-value;y=value;}
  const changed=ellipseOutline({x,y,width,height}),actual=changed[index];
  return {points:changed,guides:Math.hypot(actual.x-snap.snappedPoint.x,actual.y-snap.snappedPoint.y)<.75?snap.guides:[]};
 }
 mx=Math.max(-Math.min(a.x,b.x),Math.min(area.width-Math.max(a.x,b.x),mx));my=Math.max(-Math.min(a.y,b.y),Math.min(area.height-Math.max(a.y,b.y),my));
 return {points:points.map((p,i)=>i===index||i===next?{x:p.x+mx,y:p.y+my}:p),guides:Math.hypot(start.x+mx-snap.snappedPoint.x,start.y+my-snap.snappedPoint.y)<.75?snap.guides:[]};
}
