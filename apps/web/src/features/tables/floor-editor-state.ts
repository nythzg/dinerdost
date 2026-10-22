import {floorObjectCorners,objectInArea,objectInFloor,snapFloorGate,type FloorPlanObject,type FloorPlanSize,type FloorPoint} from '@dinerdost/core';
export type FloorView={zoom:number;pan:{x:number;y:number};locked:boolean;manual:boolean};
export function floorViewKey(account:string,outlet:string,floor?:string){return 'dd-floor-view:'+JSON.stringify([account,outlet,...(floor===undefined?[]:[floor])]);}
export function parseFloorView(raw:string|null):FloorView|null{
 try{const v=JSON.parse(raw??'null');return v&&typeof v.zoom==='number'&&Number.isFinite(v.zoom)&&v.zoom>=.05&&v.zoom<=4&&v.pan&&['x','y'].every(k=>typeof v.pan[k]==='number'&&Number.isFinite(v.pan[k])&&Math.abs(v.pan[k])<=50000)&&typeof v.locked==='boolean'&&typeof v.manual==='boolean'?v:null;}catch{return null;}
}
/** One shared displacement preserves group spacing, dimensions, rotation and identities. */
export function moveFloorSelection(objects:FloorPlanObject[],ids:string[],dx:number,dy:number,area:FloorPlanSize,outline:FloorPoint[]|null){
 const selected=objects.filter(o=>ids.includes(o.id));if(!selected.length||!Number.isFinite(dx)||!Number.isFinite(dy))return objects;
 const points=selected.flatMap(floorObjectCorners),minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),maxY=Math.max(...points.map(p=>p.y));
 dx=Math.max(-minX,Math.min(area.width-maxX,dx));dy=Math.max(-minY,Math.min(area.height-maxY,dy));
 const respectOutline=!!outline&&selected.every(o=>objectInFloor(o,outline));
 const at=(fraction:number)=>selected.map(o=>({...o,x:o.x+dx*fraction,y:o.y+dy*fraction}));
 const valid=(moved:FloorPlanObject[])=>moved.every(o=>{if(!objectInArea(o,area)||(respectOutline&&!objectInFloor(o,outline!)))return false;if(o.kind==='ENTRY'||o.kind==='EXIT'){const gate=snapFloorGate(o,area,outline);return !!gate&&Math.abs(gate.x-o.x)<.001&&Math.abs(gate.y-o.y)<.001;}return true;});
 let moved=at(1);if(!valid(moved)){let lo=0,hi=1;for(let i=0;i<45;i++){const mid=(lo+hi)/2;if(valid(at(mid)))lo=mid;else hi=mid;}moved=at(lo);}
 const changes=new Map(moved.map(o=>[o.id,o]));return objects.map(o=>changes.get(o.id)??o);
}
