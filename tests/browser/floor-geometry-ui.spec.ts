import {test,expect,type Page,type Locator} from '@playwright/test';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
test.use({actionTimeout:15000});
async function register(page:Page){if(process.env.QA_FIXTURE_FILE){const f=JSON.parse(await readFile(process.env.QA_FIXTURE_FILE,'utf8'));await page.goto('/signin');await page.getByLabel('Email',{exact:true}).fill(f.email);await page.getByLabel('Password',{exact:true}).fill(f.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL('**/app/overview');return}await page.setExtraHTTPHeaders({'x-forwarded-for':'10.'+[...randomBytes(3)].join('.')});await page.goto('/signup');for(const [n,v] of [['Your name','Floor geometry QA'],['Restaurant name','Floor geometry isolated QA'],['First outlet','Main'],['Email','floor-geometry-'+randomUUID()+'@example.test'],['Password',randomBytes(24).toString('base64url')]])await page.getByLabel(n,{exact:true}).fill(v);await page.getByLabel('Customer QR ordering').selectOption('on');await page.getByLabel('Add a sample menu and 12 tables').press('Space');await page.getByRole('button',{name:'Create workspace'}).click();await page.waitForURL('**/app/overview');}
async function workspace(page:Page){return(await page.request.get('/api/workspace')).json()}
async function command(page:Page,action:string,input:unknown){const r=await page.request.post('/api/commands',{headers:{Origin:new URL(page.url()).origin,'Idempotency-Key':randomUUID()},data:{action,input}}),b=await r.json();expect(r.ok(),JSON.stringify(b)).toBe(true);return b}
async function geometry(node:Locator){return node.evaluate(el=>{const s=(el as HTMLElement).style;return {x:parseFloat(s.left),y:parseFloat(s.top),width:parseFloat(s.width),height:parseFloat(s.height),angle:Number(s.transform.match(/rotate\(([-.\d]+)/)?.[1]??0)}})}
const anchor=(o:{x:number;y:number;width:number;height:number;angle:number})=>{const r=o.angle*Math.PI/180;return{x:o.x+o.width/2-o.width/2*Math.cos(r)+o.height/2*Math.sin(r),y:o.y+o.height/2-o.width/2*Math.sin(r)-o.height/2*Math.cos(r)}};
test('rotated walls reach the edge, pointer and keyboard resize anchor correctly, clean map labels and saved geometry survive desktop/phone use',async({page})=>{
 test.setTimeout(300000);await register(page);const w=await workspace(page),floor='Geometry '+randomUUID().slice(0,5),name='Geometry table '+randomUUID().slice(0,5),table=await command(page,'table',{outletId:w.outletId,label:name,seats:4,floor});
 for(const width of [1440,390])for(const angle of [15,90,345]){await page.setViewportSize({width,height:width===390?844:1000});const plan=(await workspace(page)).floorPlans.find((p:any)=>p.floor===floor);await command(page,'floorPlan',{outletId:w.outletId,floor,version:plan?.version??0,width:1200,height:800,outline:null,objects:[{id:'table',kind:'TABLE',tableId:table.id,label:name,x:360,y:300,width:150,height:100,rotation:angle},{id:'edge-wall',kind:'WALL',label:'Edge wall',x:100,y:250,width:300,height:20,rotation:90},{id:'reception',kind:'RECEPTION',label:'Reception',x:700,y:200,width:160,height:70,rotation:0}]});await page.goto('/app/floor-plan');await page.getByLabel('Floor plan floor',{exact:true}).selectOption(floor);await page.getByRole('button',{name:'Arrange',exact:true}).click();await page.locator('.floor-snapping-controls summary').click();await page.getByLabel('Enable snapping',{exact:true}).uncheck();await page.locator('.floor-snapping-controls summary').click();await page.getByLabel('Fit floor to view',{exact:true}).click();const canvas=page.locator('.floor-plan-canvas'),stage=await canvas.boundingBox(),zoom=stage!.width/1200,wall=page.getByRole('button',{name:'Edge wall',exact:true});const wallBox=await wall.boundingBox();await page.mouse.move(wallBox!.x+wallBox!.width/2,wallBox!.y+wallBox!.height/2);await page.mouse.down();await page.mouse.move(stage!.x-10,wallBox!.y+wallBox!.height/2,{steps:8});await page.mouse.up();await expect.poll(async()=>(await geometry(wall)).x).toBeLessThan(0);expect(Math.abs((await wall.boundingBox())!.x-stage!.x)).toBeLessThan(1);
  const node=page.getByRole('button',{name:'Table '+name+' available',exact:true});await node.click();await expect(node.locator('small,.plan-table-state')).toHaveCount(0);await expect(node).toHaveAttribute('title',/4 seats/);await expect(page.locator('[data-fixture-id="table"] .plan-table-name')).toHaveText(name);expect(await page.locator('[data-fixture-id="table"] .plan-table-name').evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBe(10);const before=await geometry(node),fixed=anchor(before),handle=page.getByRole('button',{name:'Resize '+name+' corner',exact:true}),box=await handle.boundingBox(),r=angle*Math.PI/180;await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);await page.mouse.down();await page.mouse.move(box!.x+box!.width/2+(80*Math.cos(r)-60*Math.sin(r))*zoom,box!.y+box!.height/2+(80*Math.sin(r)+60*Math.cos(r))*zoom,{steps:8});await page.mouse.up();await expect.poll(async()=>(await geometry(node)).width).toBeGreaterThan(before.width);const resized=await geometry(node),moved=anchor(resized);expect(Math.hypot(moved.x-fixed.x,moved.y-fixed.y)).toBeLessThan(0.01);await handle.focus();await handle.press('ArrowRight');const keyed=await geometry(node),keyAnchor=anchor(keyed);expect(keyed.width).toBeCloseTo(resized.width+10,3);expect(Math.hypot(keyAnchor.x-fixed.x,keyAnchor.y-fixed.y)).toBeLessThan(0.01);await page.getByLabel('Rotate selected clockwise',{exact:true}).scrollIntoViewIfNeeded();expect(await page.getByLabel('Rotate selected clockwise',{exact:true}).evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})).toBe(true);await page.screenshot({path:`verification/floor-geometry-0425-${width}-${angle}.png`});await page.getByRole('button',{name:'Save layout',exact:true}).click();await expect(page.getByRole('button',{name:'Arrange',exact:true})).toBeVisible();const saved=(await workspace(page)).floorPlans.find((p:any)=>p.floor===floor);expect(saved.objects.find((o:any)=>o.id==='edge-wall').x).toBeLessThan(0);expect(saved.objects.find((o:any)=>o.id==='table').width).toBeCloseTo(keyed.width,3);expect((await workspace(page)).tables.find((t:any)=>t.id===table.id).label).toBe(name);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});


test('all eight resize handles support anchored mouse, touch and keyboard edits with saved desktop and phone geometry',async({page})=>{
 test.setTimeout(300000);await register(page);
 const w=await workspace(page),floor='Eight handles '+randomUUID().slice(0,5);
 const directions={nw:[-1,-1],n:[0,-1],ne:[1,-1],w:[-1,0],e:[1,0],sw:[-1,1],s:[0,1],se:[1,1]} as const;
 const opposite={n:[2,3],ne:[3],e:[0,3],se:[0],s:[0,1],sw:[1],w:[1,2],nw:[2]};
 const corners=(o:Awaited<ReturnType<typeof geometry>>)=>[[0,0],[1,0],[1,1],[0,1]].map(([x,y])=>{
  const r=o.angle*Math.PI/180,dx=(x-.5)*o.width,dy=(y-.5)*o.height;
  return {x:o.x+o.width/2+dx*Math.cos(r)-dy*Math.sin(r),y:o.y+o.height/2+dx*Math.sin(r)+dy*Math.cos(r)};
 });
 for(const width of [1440,390])for(const angle of [0,30]){
  await page.setViewportSize({width,height:width===390?844:1000});
  const existing=(await workspace(page)).floorPlans.find((p:any)=>p.floor===floor);
  await command(page,'floorPlan',{outletId:w.outletId,floor,version:existing?.version??0,width:1200,height:800,outline:null,objects:[{id:'kitchen',kind:'KITCHEN',label:'Resize kitchen',x:400,y:280,width:300,height:220,rotation:angle}]});
  await page.goto('/app/floor-plan');await page.getByLabel('Floor plan floor',{exact:true}).selectOption(floor);
  await page.getByRole('button',{name:'Arrange',exact:true}).click();await page.locator('.floor-snapping-controls summary').click();await page.getByLabel('Enable snapping',{exact:true}).uncheck();await page.locator('.floor-snapping-controls summary').click();await page.getByLabel('Fit floor to view',{exact:true}).click();
  const node=page.getByRole('button',{name:'Resize kitchen',exact:true});await node.click();
  await expect(page.locator('.plan-resize-handle')).toHaveCount(8);
  const zoom=(await page.locator('.floor-plan-canvas').boundingBox())!.width/1200;
  const touch=width===390?await page.context().newCDPSession(page):null;
  async function drag(direction:string,dx:number,dy:number){
   const handle=page.locator(`[data-resize-direction="${direction}"]`);await handle.scrollIntoViewIfNeeded();
   const b=(await handle.boundingBox())!,x=b.x+b.width/2,y=b.y+b.height/2,r=angle*Math.PI/180;
   const end={x:x+(dx*Math.cos(r)-dy*Math.sin(r))*zoom,y:y+(dx*Math.sin(r)+dy*Math.cos(r))*zoom};
   if(touch){await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=6;i++)await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+(end.x-x)*i/6,y:y+(end.y-y)*i/6}]});await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
   else{await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:6});await page.mouse.up();}
  }
  for(const [direction,[hx,hy]] of Object.entries(directions)){
   const before=await geometry(node),fixed=corners(before),handle=page.locator(`[data-resize-direction="${direction}"]`);
   await expect(handle).toHaveAccessibleName(/^Resize Resize kitchen /);
   await drag(direction,hx*40,hy*30);
   await expect.poll(async()=>[Math.round((await geometry(node)).width),Math.round((await geometry(node)).height)]).toEqual([before.width+(hx?40:0),before.height+(hy?30:0)]);
   const grown=await geometry(node),after=corners(grown);
   for(const i of opposite[direction as keyof typeof opposite])expect(Math.hypot(after[i].x-fixed[i].x,after[i].y-fixed[i].y)).toBeLessThan(.01);
   if(!hx)expect(grown.width).toBe(before.width);if(!hy)expect(grown.height).toBe(before.height);
   await drag(direction,-hx*40,-hy*30);
   await expect.poll(async()=>[Math.round((await geometry(node)).width),Math.round((await geometry(node)).height)]).toEqual([before.width,before.height]);
   await handle.focus();
   if(hx)await handle.press(hx<0?'ArrowLeft':'ArrowRight');if(hy)await handle.press(hy<0?'ArrowUp':'ArrowDown');
   const keyed=await geometry(node);expect(keyed.width).toBeCloseTo(before.width+(hx?10:0),5);expect(keyed.height).toBeCloseTo(before.height+(hy?10:0),5);
   const keyedCorners=corners(keyed);for(const i of opposite[direction as keyof typeof opposite])expect(Math.hypot(keyedCorners[i].x-fixed[i].x,keyedCorners[i].y-fixed[i].y)).toBeLessThan(.01);
   if(hx)await handle.press(hx<0?'ArrowRight':'ArrowLeft');if(hy)await handle.press(hy<0?'ArrowDown':'ArrowUp');
  }
  // One completed top-left drag is a single undoable gesture.
  const beforeUndo=await geometry(node);await drag('nw',-40,-30);const final=await geometry(node);
  await page.getByLabel('Undo layout change',{exact:true}).click();expect(await geometry(node)).toEqual(beforeUndo);
  await page.getByLabel('Redo layout change',{exact:true}).click();expect(await geometry(node)).toEqual(final);
  await node.click();await expect(page.locator('.plan-resize-handle')).toHaveCount(8);
  // Pan the selection into the compact phone viewport without changing saved geometry.
  if(width===390){const viewport=(await page.locator('.floor-plan-scroll').boundingBox())!,object=(await node.boundingBox())!;
   await page.mouse.move(viewport.x+viewport.width/2,viewport.y+viewport.height/2);
   await page.mouse.wheel(object.x+object.width/2-viewport.x-viewport.width/2,object.y+object.height/2-viewport.y-viewport.height/2);
   await expect.poll(async()=>{const box=(await node.boundingBox())!;return Math.abs(box.y+box.height/2-viewport.y-viewport.height/2)}).toBeLessThan(1);
   expect(await geometry(node)).toEqual(final);
  }
  await page.screenshot({path:`verification/local-eight-resize-handles-${width}-${angle}.png`});
  await page.getByRole('button',{name:'Save layout',exact:true}).click();await expect(page.getByRole('button',{name:'Arrange',exact:true})).toBeVisible();
  const saved=(await workspace(page)).floorPlans.find((p:any)=>p.floor===floor).objects[0];
  // Chromium rounds inline CSS coordinates; persisted geometry retains full precision.
  for(const field of ['x','y','width','height'] as const)expect(Math.abs(saved[field]-final[field])).toBeLessThan(.001);
  await page.reload();expect(await geometry(page.getByRole('button',{name:'Resize kitchen',exact:true}))).toEqual(final);
  await expect(page.locator('.plan-resize-handle')).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await touch?.detach();
 }
});
