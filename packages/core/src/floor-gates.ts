import {fitFloorObject,objectInArea,type FloorPlanObject,type FloorPlanSize} from './floor-plan';
import {floorOutline,objectInFloor,type FloorPoint} from './floor-outline';

/** Find the nearest usable boundary placement without changing the gate's rotation. */
export function snapFloorGate(object:FloorPlanObject,area:FloorPlanSize,outline:FloorPoint[]|null):FloorPlanObject|null{
 const shape=outline??floorOutline('Rectangle',area),base=fitFloorObject(object,area),angle=(base.rotation??0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
 let winding=0;for(let i=0;i<shape.length;i++){const a=shape[i],b=shape[(i+1)%shape.length];winding+=a.x*b.y-b.x*a.y;}
 const desired={x:object.x+object.width/2,y:object.y+object.height/2};let best:FloorPlanObject|null=null,bestDistance=Infinity;
 for(let i=0;i<shape.length;i++){
  const a=shape[i],b=shape[(i+1)%shape.length],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(!length)continue;
  const tx=dx/length,ty=dy/length,nx=-ty*(winding>=0?1:-1),ny=tx*(winding>=0?1:-1);
  const extent=(Math.abs(nx*c+ny*s)*base.width+Math.abs(-nx*s+ny*c)*base.height)/2;
  const along=(Math.abs(tx*c+ty*s)*base.width+Math.abs(-tx*s+ty*c)*base.height)/2;
  let u=Math.max(0,Math.min(1,((desired.x-a.x)*tx+(desired.y-a.y)*ty)/length));
  if(length>=along*2)u=Math.max(along/length,Math.min(1-along/length,u));
  const at=(extra:number)=>({...base,x:a.x+dx*u+nx*(extent+extra+0.001)-base.width/2,y:a.y+dy*u+ny*(extent+extra+0.001)-base.height/2});
  const valid=(o:FloorPlanObject)=>objectInArea(o,area)&&objectInFloor(o,shape);
  let found:FloorPlanObject|null=null,invalid=0;
  for(const extra of [0,1,2,4,8,16,32,64,128,256]){const candidate=at(extra);if(valid(candidate)){let high=extra,low=invalid;for(let step=0;step<12&&high>low;step++){const mid=(low+high)/2;if(valid(at(mid)))high=mid;else low=mid;}found=at(high);break;}invalid=extra;}
  if(!found)continue;const distance=(found.x+found.width/2-desired.x)**2+(found.y+found.height/2-desired.y)**2;
  if(distance<bestDistance){bestDistance=distance;best=found;}
 }
 return best;
}
