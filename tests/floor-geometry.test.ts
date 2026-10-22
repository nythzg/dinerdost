import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fitFloorObject,resizeFloorObject,floorObjectCorners,objectInArea,objectInFloor,floorOutline,type FloorPlanObject} from '@dinerdost/core';
const base:FloorPlanObject={id:'wall',kind:'WALL',label:'Wall',x:300,y:300,width:300,height:20};
test('rotated long walls reach actual edges without shrinking to an unrotated floor width',()=>{
 const area={width:400,height:1200},wall=fitFloorObject({...base,width:1100,rotation:90,x:-5000,y:-5000},area),corners=floorObjectCorners(wall);
 assert.equal(wall.width,1100);assert(wall.x<0);assert(objectInArea(wall,area));assert(Math.abs(Math.min(...corners.map(p=>p.x)))<0.00001);assert(Math.abs(Math.min(...corners.map(p=>p.y)))<0.00001);
});
test('all rotations fit by actual corners while preserving object identity and allowed dimensions',()=>{
 for(let rotation=0;rotation<360;rotation+=15)for(const [x,y] of [[-5000,-5000],[5000,5000],[20,700],[900,-20]]){
  const object=fitFloorObject({...base,x,y,rotation,width:1800,height:300},{width:1200,height:800});assert(objectInArea(object,{width:1200,height:800}),JSON.stringify(object));assert(objectInFloor(object,floorOutline('Rectangle',{width:1200,height:800})),JSON.stringify(object));assert.equal(object.id,base.id);assert.equal(object.label,base.label);assert(object.width<=2000&&object.height<=2000);
 }
});
test('rotated resizing holds the opposite world edge/corner, respects minimums, and stops inside real floor bounds',()=>{
 const area={width:1200,height:800};
 for(const rotation of [0,15,35,90,180,270,345])for(const direction of ['n','ne','e','se','s','sw','w','nw'] as const){
  const object={...base,kind:'TABLE' as const,width:150,height:100,rotation};
  const opposite={n:[2,3],ne:[3],e:[0,3],se:[0],s:[0,1],sw:[1],w:[1,2],nw:[2]}[direction];
  const anchor=(o:FloorPlanObject)=>{const points=opposite.map(i=>floorObjectCorners(o)[i]);return {x:points.reduce((n,p)=>n+p.x,0)/points.length,y:points.reduce((n,p)=>n+p.y,0)/points.length}},before=anchor(object);
  for(const [dw,dh] of [[80,60],[-90,-70],[5000,5000],[-5000,-5000]]){
   const resized=resizeFloorObject(object,area,direction,dw,dh),after=anchor(resized);assert(objectInArea(resized,area));assert(Math.hypot(after.x-before.x,after.y-before.y)<0.000001);assert(resized.width>=60&&resized.height>=50);assert.equal(resized.rotation,rotation);assert.equal(resized.id,object.id);
  }
 }
});


test('all eight handles change only their own axes without mutating the source, for rooms and thin walls',()=>{
 const area={width:5000,height:5000};
 for(const kind of ['TABLE','KITCHEN','WALL'] as const)for(const direction of ['n','ne','e','se','s','sw','w','nw'] as const){
  const object={...base,kind,width:300,height:200,x:2000,y:2000},original={...object};
  const resized=resizeFloorObject(object,area,direction,80,60),horizontal=direction.includes('e')||direction.includes('w'),vertical=direction.includes('n')||direction.includes('s');
  assert.equal(resized.width,300+(horizontal?80:0));assert.equal(resized.height,200+(vertical?60:0));
  assert.equal(resized.x,2000-(direction.includes('w')?80:0));assert.equal(resized.y,2000-(direction.includes('n')?60:0));assert.deepEqual(object,original);
  const minimum=resizeFloorObject(object,area,direction,-5000,-5000),maximum=resizeFloorObject(object,area,direction,5000,5000);
  assert.equal(minimum.width,horizontal?(kind==='WALL'?10:60):300);assert.equal(minimum.height,vertical?(kind==='WALL'?10:50):200);
  assert.equal(maximum.width,horizontal?2000:300);assert.equal(maximum.height,vertical?2000:200);assert(objectInArea(maximum,area));
 }
});
