import {test} from 'node:test';
import assert from 'node:assert/strict';
import {floorObjectCorners,floorObjectAllowed,floorOutline,floorEllipse,validFloorOutline,type FloorPlanObject} from '@dinerdost/core';
import {moveFloorSelection,parseFloorView,floorViewKey,resizeFloorArea} from '../apps/web/src/features/tables/floor-editor-state';
test('group movement preserves identities and relative geometry while enforcing real rotated bounds',()=>{
 const objects:FloorPlanObject[]=[{id:'a',kind:'TABLE',tableId:'real-a',label:'A',x:100,y:100,width:120,height:80,rotation:30},{id:'b',kind:'PRIVATE_ROOM',label:'B',x:350,y:220,width:150,height:100,rotation:345},{id:'c',kind:'WALL',label:'C',x:30,y:30,width:100,height:10}];
 const before=structuredClone(objects),moved=moveFloorSelection(objects,['a','b'],900,700,{width:800,height:600},null);
 assert.deepEqual(objects,before);assert.equal(moved[2],objects[2]);
 for(const key of ['width','height','rotation','tableId','id','kind'] as const)for(let i=0;i<2;i++)assert.equal(moved[i][key],objects[i][key]);
 assert.ok(Math.abs((moved[0].x-objects[0].x)-(moved[1].x-objects[1].x))<1e-8);assert.ok(Math.abs((moved[0].y-objects[0].y)-(moved[1].y-objects[1].y))<1e-8);
 assert.ok(moved.flatMap(floorObjectCorners).every(p=>p.x>=-1e-6&&p.y>=-1e-6&&p.x<=800+1e-6&&p.y<=600+1e-6));
});
test('view preferences validate untrusted storage and isolate accounts, outlets and floors',()=>{
 const value={zoom:.55,pan:{x:120,y:-90},locked:true,manual:false};assert.deepEqual(parseFloorView(JSON.stringify(value)),value);
 for(const raw of ['bad','null',JSON.stringify({...value,zoom:0}),JSON.stringify({...value,zoom:9}),JSON.stringify({...value,pan:{x:999999,y:0}}),JSON.stringify({...value,locked:'true'})])assert.equal(parseFloorView(raw),null);
 assert.notEqual(floorViewKey('a','o','Main'),floorViewKey('b','o','Main'));assert.notEqual(floorViewKey('a','o','Main'),floorViewKey('a','p','Main'));assert.notEqual(floorViewKey('a','o','Main'),floorViewKey('a','o','Roof'));
});


test('all eight floor boundaries resize without moving world-space furniture, flags, identities or rotated geometry',()=>{
 const before={area:{width:1200,height:800},outline:null,objects:[{id:'table',kind:'TABLE' as const,tableId:'real-table',label:'Table',x:500,y:300,width:150,height:100,rotation:15},{id:'outside',kind:'TABLE' as const,allowOutside:true,label:'Outdoor',x:1300,y:500,width:120,height:90},{id:'entry',kind:'ENTRY' as const,label:'Entry/Exit',x:-100,y:200,width:80,height:60}]},copy=structuredClone(before);
 for(const direction of ['n','ne','e','se','s','sw','w','nw'] as const){
  const horizontal=direction.includes('w')||direction.includes('e'),vertical=direction.includes('n')||direction.includes('s');
  const next=resizeFloorArea(before,direction,direction.includes('w')?-80:80,direction.includes('n')?-60:60);
  assert.equal(next.area.width,1200+(horizontal?80:0));assert.equal(next.area.height,800+(vertical?60:0));
  assert.equal(next.offset.x,direction.includes('w')?-80:0);assert.equal(next.offset.y,direction.includes('n')?-60:0);
  for(let i=0;i<before.objects.length;i++){
   assert.deepEqual({...next.objects[i],x:before.objects[i].x,y:before.objects[i].y},before.objects[i]);
   const original=floorObjectCorners(before.objects[i]),corners=floorObjectCorners(next.objects[i]);
   for(let j=0;j<4;j++){assert(Math.abs(corners[j].x+next.offset.x-original[j].x)<1e-7);assert(Math.abs(corners[j].y+next.offset.y-original[j].y)<1e-7);}
  }
  assert.deepEqual(before,copy);
 }
});
test('dragging floor boundaries stops at furniture and respects size limits without shrinking or fitting the furniture',()=>{
 const before={area:{width:1200,height:800},outline:null,objects:[{id:'a',kind:'KITCHEN' as const,label:'Kitchen',x:100,y:100,width:200,height:100},{id:'b',kind:'TABLE' as const,label:'Table',x:850,y:600,width:200,height:100}]};
 for(const direction of ['n','ne','e','se','s','sw','w','nw'] as const){
  const next=resizeFloorArea(before,direction,direction.includes('w')?5000:-5000,direction.includes('n')?5000:-5000);
  assert(next.area.width>=400&&next.area.width<=5000);assert(next.area.height>=300&&next.area.height<=5000);assert(Number.isInteger(next.area.width)&&Number.isInteger(next.area.height));
  assert(next.objects.every(o=>floorObjectAllowed(o,next.area,next.outline)));assert.deepEqual(next.objects.map(o=>[o.width,o.height]),[[200,100],[200,100]]);
 }
 assert.equal(resizeFloorArea(before,'e',-5000,0).area.width,1050);assert.equal(resizeFloorArea(before,'w',5000,0).area.width,1100);assert.equal(resizeFloorArea(before,'s',0,-5000).area.height,700);assert.equal(resizeFloorArea(before,'n',0,5000).area.height,700);
 const empty={...before,objects:[]};assert.deepEqual(resizeFloorArea(empty,'se',9000,9000).area,{width:5000,height:5000});assert.deepEqual(resizeFloorArea(empty,'se',-9000,-9000).area,{width:400,height:300});
 for(const delta of [NaN,Infinity])assert.deepEqual(resizeFloorArea(before,'nw',delta,0),{...before,offset:{x:0,y:0}});
});
test('legacy concave and circular floor outlines remain valid and keep their shape when resized from a boundary',()=>{
 const area={width:1200,height:800};
 for(const shape of ['L-shaped','U-shaped','Circle'] as const){
  const before={area,outline:floorOutline(shape,area),objects:[{id:'room',kind:'KITCHEN' as const,label:'Kitchen',x:shape==='Circle'?500:100,y:shape==='Circle'?300:100,width:100,height:80}]};
  const next=resizeFloorArea(before,'se',120,80);assert.deepEqual(next.area,{width:1320,height:880});assert(validFloorOutline(next.outline!,next.area));assert(next.objects.every(o=>floorObjectAllowed(o,next.area,next.outline)));assert.deepEqual(next.objects,before.objects);assert.equal(!!floorEllipse(next.outline!),shape==='Circle');
 }
});
test('rounded floor resize validation preserves its existing corner clearance',()=>{
 const before={area:{width:1200,height:800},outline:null,objects:[{id:'room',kind:'KITCHEN' as const,label:'Kitchen',x:100,y:100,width:200,height:100}]};
 const next=resizeFloorArea(before,'nw',1000,1000,100);assert(next.objects.every(o=>floorObjectAllowed(o,next.area,next.outline,100)));assert(next.offset.x<100||next.offset.y<100);assert.equal(next.objects[0].width,200);assert.equal(next.objects[0].height,100);
});
