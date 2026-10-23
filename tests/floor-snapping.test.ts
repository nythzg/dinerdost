import {test} from 'node:test';
import assert from 'node:assert/strict';
import {floorObjectAllowed,floorObjectsOverlap,floorOutline,validFloorOutline,type FloorPlanObject} from '@dinerdost/core';
import {IllustratorSnapEngine as Engine,defaultSnapSettings,snapPoint,snapAlongLine,snapFloorMove,snapFloorResize,snapFloorArea,snapFloorPlacement,snapOutlineCorner,snapOutlineEdge,objectResizePoint,type SnapConfig} from '../apps/web/src/features/tables/floor-snapping';
const config:SnapConfig={...defaultSnapSettings,zoomFactor:1};
const free={...config,snapToGrid:false,smartGuides:false};
const area={width:1200,height:800};
const room=(id:string,x:number,y:number,extra:Partial<FloorPlanObject>={}):FloorPlanObject=>({id,kind:'RECEPTION',label:id,x,y,width:120,height:80,...extra});
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);

test('snapping tolerance remains four screen pixels across zoom and supports grid, pixel and free motion',()=>{
 const at=(zoomFactor:number)=>Engine.computeSnap({x:103,y:147},[],[],[],[],{...config,zoomFactor});
 assert.deepEqual(at(1).snappedPoint,{x:100,y:150});assert.deepEqual(at(4).snappedPoint,{x:103,y:147});
 assert.deepEqual(Engine.computeSnap({x:12.6,y:10.2},[],[],[],[],{...config,snapToGrid:false,snapToPixel:true}).snappedPoint,{x:13,y:10});
 assert.deepEqual(at(.25).snappedPoint,{x:100,y:150});
 const off=Engine.computeSnap({x:103,y:147},[],[{type:'vertical',position:104}],[],[{x:104,y:147}],{...config,enabled:false});assert.deepEqual(off.snappedPoint,{x:103,y:147});assert.deepEqual(off.guides,[]);
});
test('nearest guides win per axis and refer to the dragged anchor rather than the cursor',()=>{
 const result=Engine.computeSnap({x:32,y:51},[{x:112,y:101}],[{type:'vertical',position:114}],[],[{x:115,y:400}],{...free,smartGuides:true});
 assert.deepEqual(result.snappedPoint,{x:34,y:51});assert.equal(result.sourceX,'Vertical Ruler Guide');assert.equal(result.guides[0].position,114);
 const outside=Engine.computeSnap({x:10,y:10},[{x:10,y:10}],[],[],[{x:14.01,y:100}],{...free,smartGuides:true});assert.equal(outside.snappedX,false);
});
test('exact anchor pairs and angled segment projections remain coherent, finite and clamped',()=>{
 const point={x:133.2,y:85.7},target={x:134,y:86};assert.deepEqual(Engine.computeSnap(point,[point],[],[],[target],free).snappedPoint,target);
 const p={x:22,y:18};assert.deepEqual(Engine.computeSnap(p,[p],[],[{p1:{x:0,y:0},p2:{x:40,y:40}}],[],free).snappedPoint,{x:20,y:20});
 assert.deepEqual(Engine.closestPointOnSegment({x:80,y:20},{x:0,y:0},{x:40,y:0}),{x:40,y:0});assert.deepEqual(Engine.closestPointOnSegment(p,target,target),target);
});
test('orthogonal vector constraints retain independent grid snapping on the tangent axis',()=>{
 const p={x:2,y:43};assert.deepEqual(Engine.computeSnap(p,[p],[],[{p1:{x:0,y:0},p2:{x:0,y:100}}],[],config).snappedPoint,{x:0,y:40});
});
test('invalid scales do not create infinite geometry and Alt bypasses every target source',()=>{
 for(const zoomFactor of [0,-1,Infinity,NaN])assert.deepEqual(Engine.computeSnap({x:3,y:4},[],[],[],[],{...config,zoomFactor}).snappedPoint,{x:3,y:4});
 const p={x:3,y:4},scene={rulers:[{type:'vertical' as const,position:0}],anchors:[{x:0,y:0}],vectors:[{p1:{x:0,y:0},p2:{x:0,y:10}}]};assert.deepEqual(snapPoint(p,[p],scene,config,true).snappedPoint,p);assert.deepEqual(snapAlongLine(p,{x:1,y:0},scene,config,true).guides,[]);
});
test('single and group smart movement preserve identities, dimensions and internal spacing',()=>{
 const objects=[room('a',100,100),room('b',300,200),room('reference',503,500)],copy=structuredClone(objects);
 const one=snapFloorMove(objects,['a'],401,0,area,null,0,{...config,snapToGrid:false});near(one.objects[0].x,503);assert.ok(one.guides.length);
 const group=snapFloorMove(objects,['a','b'],401,0,area,null,0,{...config,snapToGrid:false});near(group.objects[1].x-group.objects[0].x,200);near(group.objects[1].y-group.objects[0].y,100);
 assert.deepEqual(objects,copy);for(let i=0;i<3;i++)assert.deepEqual({...one.objects[i],x:objects[i].x,y:objects[i].y},objects[i]);
});
test('snapping cannot bypass collision/boundary limits or show an unreachable target guide',()=>{
 const objects=[room('a',100,100,{width:100,height:100}),room('block',303,100,{width:100,height:100})];
 const blocked=snapFloorMove(objects,['a'],150,0,area,null,0,{...config,snapToGrid:false});assert(!floorObjectsOverlap(blocked.objects[0],objects[1]));assert(blocked.objects[0].x<=203.00001);assert.deepEqual(blocked.guides,[]);
 const edge=snapFloorMove(objects,['a'],-200,-200,area,null,0,config);assert(floorObjectAllowed(edge.objects[0],area,null));
 const gate=room('gate',-100,200,{kind:'ENTRY'});assert(snapFloorMove([gate],['gate'],-20,0,area,null,0,config).objects[0].x<0);
});
test('rotated edge snapping follows its one-dimensional motion and fixes the opposite edge',()=>{
 const object=room('a',150,180,{rotation:30}),raw=snapFloorResize(object,'e',80,0,[object],area,null,0,free,true).object,p=objectResizePoint(raw,'e');
 const reference=room('reference',p.x+3,500),result=snapFloorResize(object,'e',80,0,[object,reference],area,null,0,{...config,snapToGrid:false});
 near(objectResizePoint(result.object,'e').x,p.x+3);near(objectResizePoint(result.object,'w').x,objectResizePoint(object,'w').x);near(objectResizePoint(result.object,'w').y,objectResizePoint(object,'w').y);near(result.object.height,object.height);
 assert(!floorObjectsOverlap(result.object,reference));assert(floorObjectAllowed(result.object,area,null));
});
test('every resize direction supports unquantized bypass while retaining its fixed opposite point',()=>{
 const object=room('a',450,300,{rotation:45}),opposite={n:'s',ne:'sw',e:'w',se:'nw',s:'n',sw:'ne',w:'e',nw:'se'} as const;
 for(const direction of ['n','ne','e','se','s','sw','w','nw'] as const){const result=snapFloorResize(object,direction,17.3,13.7,[object],area,null,0,config,true).object,a=objectResizePoint(object,opposite[direction]),b=objectResizePoint(result,opposite[direction]);near(a.x,b.x);near(a.y,b.y);assert(floorObjectAllowed(result,area,null));}
});
test('floor area snapping rebases top/left without changing physical furniture or outdoor flags',()=>{
 const before={area,outline:null,objects:[room('edge',103,203),room('outside',1300,200,{kind:'TABLE',allowOutside:true})]};
 const left=snapFloorArea(before,'w',101,0,0,{...config,snapToGrid:false});assert.equal(left.change.offset.x,103);assert.equal(left.change.area.width,1097);assert(left.guides.length);
 for(let i=0;i<2;i++){near(left.change.objects[i].x+left.change.offset.x,before.objects[i].x);assert.equal(left.change.objects[i].width,before.objects[i].width);assert.equal(left.change.objects[i].allowOutside,before.objects[i].allowOutside);}
 const blocked=snapFloorArea(before,'nw',900,700,0,config);assert(blocked.change.objects.every(o=>floorObjectAllowed(o,blocked.change.area,blocked.change.outline)));assert(Number.isInteger(blocked.change.area.width));
});
test('add/copy placement snaps only the new object and retains valid physical clearance',()=>{
 const other=room('reference',503,500),placed=room('new',501,100),result=snapFloorPlacement(placed,[other],area,null,0,{...config,snapToGrid:false});near(result.x,503);assert.equal(result.id,'new');assert(!floorObjectsOverlap(result,other));assert.equal(other.x,503);
});
test('outline corners, straight/angled edges and circular handles share snapping without changing topology',()=>{
 const points=[{x:100,y:100},{x:900,y:100},{x:900,y:700},{x:100,y:700}],reference=room('reference',503,400);
 const corner=snapOutlineCorner(points,0,{x:501,y:99},area,[reference],{...config,snapToGrid:false});assert.equal(corner.points[0].x,503);assert.equal(corner.points.length,4);assert.deepEqual(corner.points.slice(1),points.slice(1));assert(validFloorOutline(corner.points,area));
 const edge=snapOutlineEdge(points,0,0,297,area,[reference],{...config,snapToGrid:false});assert.equal(edge.points[0].y,400);assert.equal(edge.points[1].y,400);assert.deepEqual(edge.points.slice(2),points.slice(2));
 const circle=floorOutline('Circle',area),changed=snapOutlineEdge(circle,0,-37,0,area,[],config,true);assert.equal(changed.points.length,24);assert(validFloorOutline(changed.points,area));
});
