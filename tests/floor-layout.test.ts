import {test} from 'node:test';
import assert from 'node:assert/strict';
import {floorObjectsOverlap,floorObjectAllowed,fitFloorPlacement,placeFloorFixture,constrainFloorChange,roundedFloorBoundary,floorOutline,type FloorPlanObject} from '@dinerdost/core';
const area={width:1200,height:800},room:FloorPlanObject={id:'room',kind:'KITCHEN',label:'Kitchen',x:100,y:100,width:200,height:100};
test('physical overlap uses rotated geometry, allows touching edges and stops drag/resize at collisions',()=>{
 assert(floorObjectsOverlap(room,{...room,id:'other',x:290}));assert(!floorObjectsOverlap(room,{...room,id:'other',x:300}));
 const thin={...room,kind:'WALL' as const,width:300,height:10,rotation:45};assert(!floorObjectsOverlap(thin,{...thin,x:120,y:80}));
 const obstacle={...room,id:'obstacle',x:400},target={...room,x:350};
 const moved=constrainFloorChange(room,target,[obstacle],area,null);assert(!floorObjectsOverlap(moved,obstacle));assert(Math.abs(moved.x-200)<.001);
 const grown=constrainFloorChange(room,{...room,width:500},[obstacle],area,null);assert(!floorObjectsOverlap(grown,obstacle));assert(Math.abs(grown.width-300)<.001);
 assert.deepEqual(constrainFloorChange(room,{...room,x:200,rotation:45},[{...room,id:'other',x:350}],area,null),room);
});
test('gate positions and opted-in tables may cross or leave the floor while normal fixtures stay bounded',()=>{
 for(const kind of ['ENTRY','EXIT','TABLE'] as const)for(const [x,y] of [[-300,200],[1300,200],[100,-200],[100,900]]){
  const object={...room,kind,x,y,...(kind==='TABLE'?{allowOutside:true}:{})};assert(floorObjectAllowed(object,area,null));assert.equal(fitFloorPlacement(object,area).x,x);
 }
 assert(!floorObjectAllowed({...room,x:-10},area,null));assert(!floorObjectAllowed({...room,kind:'TABLE',x:-100},area,null));assert(!floorObjectAllowed({...room,kind:'ENTRY',x:10001},area,null));
 const rounded=roundedFloorBoundary(floorOutline('Rectangle',area),100);assert(rounded.path.includes(' Q'));assert(!floorObjectAllowed({...room,x:0,y:0},area,null,100));assert(floorObjectAllowed(room,area,null,100));
});
test('new fixtures and tables find free space without moving original furniture or considering label boxes',()=>{
 const existing=[room],copy=structuredClone(existing),placed=placeFloorFixture({...room,id:'new'},area,null,existing)!;
 assert(placed);assert(!floorObjectsOverlap(placed,room));assert.deepEqual(existing,copy);
 const blocked={...room,x:0,y:0,width:1200,height:800};assert.equal(placeFloorFixture({...room,id:'new'},area,null,[blocked]),null);
});
