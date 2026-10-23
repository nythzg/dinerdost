import {floorObjectAllowed,floorObjectsOverlap,floorEllipse,ellipseOutline,validFloorOutline,type FloorResizeDirection,type FloorPlanObject,type FloorPlanSize,type FloorPoint} from '@dinerdost/core';
export type FloorView={zoom:number;pan:{x:number;y:number};locked:boolean;manual:boolean};
export function floorViewKey(account:string,outlet:string,floor?:string){return 'dd-floor-view:'+JSON.stringify([account,outlet,...(floor===undefined?[]:[floor])]);}
export function parseFloorView(raw:string|null):FloorView|null{
 try{const v=JSON.parse(raw??'null');return v&&typeof v.zoom==='number'&&Number.isFinite(v.zoom)&&v.zoom>=.05&&v.zoom<=4&&v.pan&&['x','y'].every(k=>typeof v.pan[k]==='number'&&Number.isFinite(v.pan[k])&&Math.abs(v.pan[k])<=50000)&&typeof v.locked==='boolean'&&typeof v.manual==='boolean'?v:null;}catch{return null;}
}
/** One shared displacement preserves group spacing, dimensions, rotation and identities. */
export function moveFloorSelection(objects:FloorPlanObject[],ids:string[],dx:number,dy:number,area:FloorPlanSize,outline:FloorPoint[]|null,roundness=0){
 const selected=objects.filter(o=>ids.includes(o.id)),others=objects.filter(o=>!ids.includes(o.id));if(!selected.length||!Number.isFinite(dx)||!Number.isFinite(dy))return objects;
 const previousCollisions=new Set(selected.flatMap(o=>others.filter(other=>floorObjectsOverlap(o,other)).map(other=>o.id+':'+other.id)));
 const at=(fraction:number)=>selected.map(o=>({...o,x:o.x+dx*fraction,y:o.y+dy*fraction}));
 const valid=(moved:FloorPlanObject[])=>moved.every(o=>floorObjectAllowed(o,area,outline,roundness)&&others.every(other=>!floorObjectsOverlap(o,other)||previousCollisions.has(o.id+':'+other.id)));
 let moved=at(1);if(!valid(moved)){if(!valid(selected))return objects;let lo=0,hi=1;for(let i=0;i<45;i++){const mid=(lo+hi)/2;if(valid(at(mid)))lo=mid;else hi=mid;}moved=at(Math.max(0,lo-1e-7));}
 const changes=new Map(moved.map(o=>[o.id,o]));return objects.map(o=>changes.get(o.id)??o);
}

export type FloorAreaDraft={area:FloorPlanSize;outline:FloorPoint[]|null;objects:FloorPlanObject[]};
/** Resize the boundary, rebasing top/left coordinates while preserving world-space furniture. */
export function resizeFloorArea(before:FloorAreaDraft,direction:FloorResizeDirection,dx:number,dy:number,roundness=0){
 const unchanged={...before,offset:{x:0,y:0}};
 if(!Number.isFinite(dx)||!Number.isFinite(dy))return unchanged;
 const east=direction.includes('e'),west=direction.includes('w'),south=direction.includes('s'),north=direction.includes('n');
 const width=east||west?Math.max(400,Math.min(5000,before.area.width+Math.round((west?-dx:dx)/10)*10)):before.area.width;
 const height=north||south?Math.max(300,Math.min(5000,before.area.height+Math.round((north?-dy:dy)/10)*10)):before.area.height;
 const at=(fraction:number)=>{
  const area={width:Math.round(before.area.width+(width-before.area.width)*fraction),height:Math.round(before.area.height+(height-before.area.height)*fraction)};
  const offset={x:west?before.area.width-area.width:0,y:north?before.area.height-area.height:0};
  const oval=before.outline?floorEllipse(before.outline):null;
  const outline=oval?ellipseOutline({x:oval.x*area.width/before.area.width,y:oval.y*area.height/before.area.height,width:oval.width*area.width/before.area.width,height:oval.height*area.height/before.area.height}):before.outline?.map(p=>({x:Math.round(p.x*area.width/before.area.width),y:Math.round(p.y*area.height/before.area.height)}))??null;
  return {area,outline,offset,objects:before.objects.map(o=>({...o,x:o.x-offset.x,y:o.y-offset.y}))};
 };
 const valid=(next:FloorAreaDraft)=>(!next.outline||validFloorOutline(next.outline,next.area))&&next.objects.every(o=>floorObjectAllowed(o,next.area,next.outline,roundness));
 const target=at(1);if(valid(target))return target;if(!valid(before))return unchanged;
 let lo=0,hi=1;for(let i=0;i<40;i++){const mid=(lo+hi)/2;if(valid(at(mid)))lo=mid;else hi=mid;}
 return at(lo);
}
