import {test} from 'node:test';
import assert from 'node:assert/strict';
import {floorObjectCorners,type FloorPlanObject} from '@dinerdost/core';
import {moveFloorSelection,parseFloorView,floorViewKey} from '../apps/web/src/features/tables/floor-editor-state';
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
