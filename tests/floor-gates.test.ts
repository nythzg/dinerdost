import {test} from 'node:test';
import assert from 'node:assert/strict';
import {snapFloorGate,objectInArea,objectInFloor,floorOutline,ellipseOutline,floorObjectCorners,type FloorPlanObject} from '@dinerdost/core';
const gate:FloorPlanObject={id:'entry',kind:'ENTRY',label:'Entry',x:400,y:200,width:150,height:60};
test('gates stay flush with the nearest rectangle boundary, remain draggable along it and preserve independent rotation',()=>{
 const area={width:1200,height:800};
 for(const rotation of [0,15,90,345])for(const [x,y] of [[300,-500],[600,-500],[-500,250],[1300,300],[300,1000]]){
  const result=snapFloorGate({...gate,x,y,rotation},area,null)!;assert(result);assert(objectInArea(result,area));assert.equal(result.rotation,rotation);assert.equal(result.id,gate.id);
  const corners=floorObjectCorners(result),distance=Math.min(...corners.flatMap(p=>[p.x,p.y,area.width-p.x,area.height-p.y]));assert(distance>=-0.00001&&distance<0.01);
 }
 const a=snapFloorGate({...gate,x:200,y:-200},area,null)!,b=snapFloorGate({...gate,x:700,y:-200},area,null)!;assert(b.x>a.x+400);assert(Math.abs(a.y-b.y)<0.00001);
});
test('gate placement respects concave and circular floors and both winding directions instead of crossing cut-outs',()=>{
 const area={width:1200,height:800};for(const shape of [floorOutline('L-shaped',area),floorOutline('U-shaped',area),ellipseOutline({x:0,y:0,width:1200,height:800})])for(const points of [shape,[...shape].reverse()])for(const rotation of [0,90]){
  const result=snapFloorGate({...gate,x:650,y:200,rotation},area,points);assert(result);assert(objectInArea(result,area));assert(objectInFloor(result,points));assert.equal(result.rotation,rotation);
 }
});
