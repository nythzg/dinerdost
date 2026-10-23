import {test,expect,type Page} from '@playwright/test';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
test.use({actionTimeout:15000});
async function register(page:Page){if(process.env.QA_FIXTURE_FILE){const f=JSON.parse(await readFile(process.env.QA_FIXTURE_FILE,'utf8'));await page.goto('/signin');await page.getByLabel('Email',{exact:true}).fill(f.email);await page.getByLabel('Password',{exact:true}).fill(f.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL('**/app/overview');return}await page.setExtraHTTPHeaders({'x-forwarded-for':'10.'+[...randomBytes(3)].join('.')});await page.goto('/signup');for(const [n,v] of [['Your name','Floor editor QA'],['Restaurant name','Floor editor isolated QA'],['First outlet','Main'],['Email','floor-editor-'+randomUUID()+'@example.test'],['Password',randomBytes(24).toString('base64url')]])await page.getByLabel(n,{exact:true}).fill(v);await page.getByLabel('Customer QR ordering').selectOption('on');await page.getByRole('button',{name:'Create workspace'}).click();await page.waitForURL('**/app/overview');}
async function workspace(page:Page){return(await page.request.get('/api/workspace')).json()}
async function command(page:Page,action:string,input:unknown){const r=await page.request.post('/api/commands',{headers:{Origin:new URL(page.url()).origin,'Idempotency-Key':randomUUID()},data:{action,input}}),b=await r.json();expect(r.ok(),JSON.stringify(b)).toBe(true);return b}

async function areaSize(page:Page){return page.locator('.floor-plan-canvas').evaluate(el=>({width:parseFloat((el as HTMLElement).style.width),height:parseFloat((el as HTMLElement).style.height)}));}
async function objectGeometry(page:Page){return page.locator('.plan-object').evaluateAll(elements=>elements.map(el=>{const s=(el as HTMLElement).style;return {label:el.getAttribute('aria-label'),x:parseFloat(s.left),y:parseFloat(s.top),width:parseFloat(s.width),height:parseFloat(s.height)}}));}
for(const width of [1440,390])test('drag all eight floor boundaries, protect furniture, undo/cancel and persist without numeric area inputs at '+width+'px',async({page})=>{
 test.setTimeout(240000);await page.setViewportSize({width,height:width===390?844:1000});await register(page);const w=await workspace(page),floor='Drag floor '+width+' '+randomUUID().slice(0,4);
 const table=await command(page,'table',{outletId:w.outletId,floor,label:'Boundary table '+width,seats:4});
 await command(page,'floorPlan',{outletId:w.outletId,floor,version:0,width:1200,height:800,objects:[
  {id:'table',kind:'TABLE',tableId:table.id,label:'Boundary table '+width,x:500,y:300,width:150,height:100,rotation:15},
  {id:'fence',kind:'FENCE',label:'Fence',x:150,y:150,width:240,height:20},
  {id:'legacy-exit',kind:'EXIT',label:'Exit',x:-80,y:550,width:80,height:60},
 ]});
 await page.goto('/app/floor-plan');await page.getByLabel('Floor plan floor',{exact:true}).selectOption(floor);const original=(await workspace(page)).floorPlans.find((p:any)=>p.floor===floor),tables=(await workspace(page)).tables,sessions=(await workspace(page)).sessions;
 await page.getByRole('button',{name:'Arrange',exact:true}).click();await expect(page.getByLabel('Fixture type',{exact:true}).locator('option[value="EXIT"]')).toHaveCount(0);await expect(page.locator('.plan-kind-exit')).toHaveCount(0);await expect(page.locator('.plan-kind-entry')).toHaveCount(1);
 const resize=page.getByRole('button',{name:'Resize area',exact:true});await resize.click();await expect(resize).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByLabel('Area width',{exact:true})).toHaveCount(0);await expect(page.getByLabel('Area height',{exact:true})).toHaveCount(0);await expect(page.locator('.floor-area-resize-handle')).toHaveCount(8);
 const target=page.getByRole('button',{name:'Table Boundary table '+width+' available',exact:true}),touch=width===390?await page.context().newCDPSession(page):null;
 const directions={nw:[-1,-1],n:[0,-1],ne:[1,-1],w:[-1,0],e:[1,0],sw:[-1,1],s:[0,1],se:[1,1]} as const;
 async function drag(direction:string,dx:number,dy:number){
  const handle=page.locator(`[data-area-resize-direction="${direction}"]`);await handle.scrollIntoViewIfNeeded();const box=(await handle.boundingBox())!,x=box.x+box.width/2,y=box.y+box.height/2,zoom=await page.locator('.floor-camera').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).a);
  if(touch){await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=6;i++)await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*zoom*i/6,y:y+dy*zoom*i/6}]});await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else{await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx*zoom,y+dy*zoom,{steps:6});await page.mouse.up();}
 }
 for(const [direction,[hx,hy]] of Object.entries(directions)){
  await page.getByLabel('Fit floor to view',{exact:true}).click();const before=await areaSize(page),box=(await target.boundingBox())!;
  await drag(direction,hx*40,hy*30);await expect.poll(()=>areaSize(page)).toEqual({width:before.width+(hx?40:0),height:before.height+(hy?30:0)});
  const after=(await target.boundingBox())!;expect(Math.abs(after.x-box.x)).toBeLessThan(.2);expect(Math.abs(after.y-box.y)).toBeLessThan(.2);expect(after.width).toBeCloseTo(box.width,1);expect(after.height).toBeCloseTo(box.height,1);
 }
 if(width===1440){const beforeCancel=await areaSize(page),beforeObjects=await objectGeometry(page),west=page.getByRole('button',{name:'Resize floor left edge',exact:true}),box=(await west.boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2-20,box.y+box.height/2,{steps:4});await page.keyboard.press('Escape');await page.mouse.up();expect(await areaSize(page)).toEqual(beforeCancel);expect(await objectGeometry(page)).toEqual(beforeObjects);await expect(resize).toHaveAttribute('aria-pressed','false');await resize.click();
 }
 const expanded=await areaSize(page),expandedObjects=await objectGeometry(page);expect(expanded).toEqual({width:1440,height:980});
 await page.getByLabel('Fit floor to view',{exact:true}).click();const originBox=(await target.boundingBox())!;await drag('w',-20,0);await page.getByLabel('Undo layout change',{exact:true}).click();expect(await areaSize(page)).toEqual(expanded);expect(await objectGeometry(page)).toEqual(expandedObjects);const restoredBox=(await target.boundingBox())!;expect(Math.abs(restoredBox.x-originBox.x)).toBeLessThan(.2);expect(Math.abs(restoredBox.y-originBox.y)).toBeLessThan(.2);
 await drag('e',-1440,0);const protectedSize=await areaSize(page);expect(protectedSize.width).toBeGreaterThan(400);expect(protectedSize.width).toBeLessThan(1440);expect((await objectGeometry(page)).map(o=>[o.width,o.height])).toEqual(expandedObjects.map(o=>[o.width,o.height]));await expect(page.getByRole('button',{name:'Save layout',exact:true})).toBeEnabled();
 await page.getByLabel('Undo layout change',{exact:true}).click();expect(await areaSize(page)).toEqual(expanded);expect(await objectGeometry(page)).toEqual(expandedObjects);await page.getByLabel('Redo layout change',{exact:true}).click();expect(await areaSize(page)).toEqual(protectedSize);await page.getByLabel('Undo layout change',{exact:true}).click();
 await page.getByLabel('Fit floor to view',{exact:true}).click();await page.screenshot({path:`verification/local-floor-area-drag-${width}.png`});
 expect((await workspace(page)).floorPlans.find((p:any)=>p.floor===floor)).toEqual(original);
 await page.getByRole('button',{name:'Save layout',exact:true}).click();await expect(page.getByRole('button',{name:'Arrange',exact:true})).toBeVisible();let saved=(await workspace(page)).floorPlans.find((p:any)=>p.floor===floor);expect(saved.width).toBe(1440);expect(saved.height).toBe(980);expect(saved.objects.find((o:any)=>o.id==='table').x).toBe(620);expect(saved.objects.find((o:any)=>o.id==='table').y).toBe(390);expect(saved.objects.find((o:any)=>o.id==='legacy-exit').kind).toBe('ENTRY');expect(saved.objects).toHaveLength(3);
 expect((await workspace(page)).tables).toEqual(tables);expect((await workspace(page)).sessions).toEqual(sessions);
 await page.reload();expect(await areaSize(page)).toEqual(expanded);await expect(page.locator('.floor-area-resize-handle')).toHaveCount(0);
 await page.getByRole('button',{name:'Arrange',exact:true}).click();await resize.click();const handle=page.getByRole('button',{name:'Resize floor left edge',exact:true});await handle.focus();await handle.press('ArrowLeft');expect((await areaSize(page)).width).toBe(1450);await page.getByRole('button',{name:'Cancel',exact:true}).click();expect(await areaSize(page)).toEqual(expanded);expect((await workspace(page)).floorPlans.find((p:any)=>p.floor===floor)).toEqual(saved);
 // Simplified presets retain manual editing and existing circular outlines.
 await page.getByRole('button',{name:'Arrange',exact:true}).click();await page.getByRole('button',{name:'Floor outline',exact:true}).click();const dialog=page.getByRole('dialog');for(const name of ['L-shaped','U-shaped','Rotate'])await expect(dialog.getByRole('button',{name,exact:true})).toHaveCount(0);await expect(dialog.getByRole('button',{name:'Rectangle',exact:true})).toBeVisible();await dialog.getByRole('button',{name:'Circle',exact:true}).click();await expect(dialog.getByRole('button',{name:'Resize right edge',exact:true})).toBeAttached();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await touch?.detach();
});


test('thin floor boundaries resolve overlapping phone touch targets by the visible resize knob',async({page})=>{
 test.setTimeout(90000);await page.setViewportSize({width:390,height:844});await register(page);const w=await workspace(page),floor='Thin floor '+randomUUID().slice(0,4);
 await command(page,'floorPlan',{outletId:w.outletId,floor,version:0,width:5000,height:300,objects:[]});await page.goto('/app/floor-plan');await page.getByLabel('Floor plan floor',{exact:true}).selectOption(floor);await page.getByRole('button',{name:'Arrange',exact:true}).click();await page.getByRole('button',{name:'Resize area',exact:true}).click();await page.getByLabel('Fit floor to view',{exact:true}).click();
 const top=page.getByRole('button',{name:'Resize floor top edge',exact:true}),knob=(await top.locator('span').boundingBox())!,x=knob.x+knob.width/2,y=knob.y+knob.height/2+4;
 const zoom=await page.locator('.floor-camera').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).a),touch=await page.context().newCDPSession(page);
 await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-40*zoom}]});await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await expect.poll(()=>areaSize(page)).toEqual({width:5000,height:340});await expect(top).toBeFocused();await top.press('ArrowUp');expect(await areaSize(page)).toEqual({width:5000,height:350});await touch.detach();
});
