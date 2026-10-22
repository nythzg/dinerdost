import {floorObjectCorners,fitFloorObject,objectInArea,type FloorPlanObject,type FloorPlanSize} from './floor-plan';
import {floorEllipse,floorOutline,objectInFloor,type FloorPoint} from './floor-outline';

export const floorCoordinateLimit=10000;
export const isFloorGate=(o:FloorPlanObject)=>o.kind==='ENTRY'||o.kind==='EXIT';
export const floorAllowsOutside=(o:FloorPlanObject)=>isFloorGate(o)||(o.kind==='TABLE'&&o.allowOutside===true);
export const floorFixtureLabel=(o:FloorPlanObject)=>isFloorGate(o)&&['Entry','Exit'].includes(o.label)?'Entry/Exit':o.label;

/** Separating-axis test on the actual rotated rectangles; touching edges are allowed. */
export function floorObjectsOverlap(a:FloorPlanObject,b:FloorPlanObject){
 const ac=floorObjectCorners(a),bc=floorObjectCorners(b);
 for(const points of [ac,bc])for(let i=0;i<2;i++){
  const edge={x:points[i+1].x-points[i].x,y:points[i+1].y-points[i].y};
  const length=Math.hypot(edge.x,edge.y),axis={x:-edge.y/length,y:edge.x/length};
  const project=(corners:FloorPoint[])=>corners.map(p=>p.x*axis.x+p.y*axis.y),ap=project(ac),bp=project(bc);
  if(Math.max(...ap)<=Math.min(...bp)+1e-6||Math.max(...bp)<=Math.min(...ap)+1e-6)return false;
 }
 return true;
}

/** Matching quadratic SVG path and sampled polygon for rounded boundary validation. */
export function roundedFloorBoundary(points:FloorPoint[],roundness:number){
 if(!roundness||floorEllipse(points))return {path:'M'+points.map(p=>p.x+','+p.y).join(' L')+' Z',points};
 const corners=points.map((p,i)=>{
  const previous=points[(i+points.length-1)%points.length],next=points[(i+1)%points.length];
  const before=Math.hypot(previous.x-p.x,previous.y-p.y),after=Math.hypot(next.x-p.x,next.y-p.y),d=Math.min(roundness,before/2,after/2);
  return {p,start:{x:p.x+(previous.x-p.x)*d/before,y:p.y+(previous.y-p.y)*d/before},end:{x:p.x+(next.x-p.x)*d/after,y:p.y+(next.y-p.y)*d/after}};
 });
 const sampled:FloorPoint[]=[];let path='M'+corners[0].start.x+','+corners[0].start.y;
 for(const {p,start,end} of corners){
  path+=' L'+start.x+','+start.y+' Q'+p.x+','+p.y+' '+end.x+','+end.y;
  for(let i=0;i<=12;i++){const t=i/12,u=1-t;sampled.push({x:u*u*start.x+2*u*t*p.x+t*t*end.x,y:u*u*start.y+2*u*t*p.y+t*t*end.y});}
 }
 return {path:path+' Z',points:sampled};
}
export function floorObjectAllowed(o:FloorPlanObject,area:FloorPlanSize,outline:FloorPoint[]|null,roundness=0){
 if(!Number.isFinite(o.x)||!Number.isFinite(o.y)||Math.abs(o.x)>floorCoordinateLimit||Math.abs(o.y)>floorCoordinateLimit)return false;
 return floorAllowsOutside(o)||(objectInArea(o,area)&&objectInFloor(o,roundedFloorBoundary(outline??floorOutline('Rectangle',area),roundness).points));
}
export function fitFloorPlacement(o:FloorPlanObject,area:FloorPlanSize){
 if(!floorAllowsOutside(o))return fitFloorObject(o,area);
 const thin=o.kind==='WALL'||o.kind==='FENCE';
 return {...o,x:Math.max(-floorCoordinateLimit,Math.min(floorCoordinateLimit,Math.round(o.x/10)*10)),y:Math.max(-floorCoordinateLimit,Math.min(floorCoordinateLimit,Math.round(o.y/10)*10)),width:Math.max(thin?10:60,Math.min(2000,Math.round(o.width/10)*10)),height:Math.max(thin?10:50,Math.min(2000,Math.round(o.height/10)*10))};
}
/** Find free space without resizing the fixture or changing existing objects. */
export function placeFloorFixture(o:FloorPlanObject,area:FloorPlanSize,outline:FloorPoint[]|null,existing:FloorPlanObject[],roundness=0):FloorPlanObject|null{
 const clear=(next:FloorPlanObject)=>floorObjectAllowed(next,area,outline,roundness)&&!existing.some(other=>floorObjectsOverlap(next,other));
 const desired=fitFloorPlacement(o,area);if(clear(desired))return desired;
 const outside=floorAllowsOutside(o),margin=outside?Math.max(o.width,o.height)+100:0;
 for(let y=-margin;y<=area.height+margin-o.height;y+=20)for(let x=-margin;x<=area.width+margin-o.width;x+=20){const next={...o,x,y};if(clear(next))return next;}
 return null;
}
/** Bound a draft change; legacy collisions can be separated without allowing new pairs. */
export function constrainFloorChange(before:FloorPlanObject,target:FloorPlanObject,others:FloorPlanObject[],area:FloorPlanSize,outline:FloorPoint[]|null,roundness=0){
 const oldCollisions=new Set(others.filter(o=>floorObjectsOverlap(before,o)).map(o=>o.id));
 const valid=(o:FloorPlanObject)=>floorObjectAllowed(o,area,outline,roundness)&&others.every(other=>!floorObjectsOverlap(o,other)||oldCollisions.has(other.id));
 if(valid(target))return target;
 if(!valid(before))return before;
 const at=(t:number)=>({...target,x:before.x+(target.x-before.x)*t,y:before.y+(target.y-before.y)*t,width:before.width+(target.width-before.width)*t,height:before.height+(target.height-before.height)*t});
 // Rotation changes are atomic; interpolating dimensions must not alter the rotation anchor.
 if(before.rotation!==target.rotation)return before;
 let lo=0,hi=1;for(let i=0;i<45;i++){const mid=(lo+hi)/2;if(valid(at(mid)))lo=mid;else hi=mid;}
 return at(Math.max(0,lo-1e-7));
}
