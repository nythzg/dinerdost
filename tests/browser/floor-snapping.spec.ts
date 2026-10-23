import {test,expect,type Page} from '@playwright/test';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
test.use({actionTimeout:15000});
async function register(page:Page){if(process.env.QA_FIXTURE_FILE){const f=JSON.parse(await readFile(process.env.QA_FIXTURE_FILE,'utf8'));await page.goto('/signin');await page.getByLabel('Email',{exact:true}).fill(f.email);await page.getByLabel('Password',{exact:true}).fill(f.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL('**/app/overview');return}await page.setExtraHTTPHeaders({'x-forwarded-for':'10.'+[...randomBytes(3)].join('.')});await page.goto('/signup');for(const [n,v] of [['Your name','Floor editor QA'],['Restaurant name','Floor editor isolated QA'],['First outlet','Main'],['Email','floor-editor-'+randomUUID()+'@example.test'],['Password',randomBytes(24).toString('base64url')]])await page.getByLabel(n,{exact:true}).fill(v);await page.getByLabel('Customer QR ordering').selectOption('on');await page.getByRole('button',{name:'Create workspace'}).click();await page.waitForURL('**/app/overview');}
async function workspace(page:Page){return(await page.request.get('/api/workspace')).json()}
async function command(page:Page,action:string,input:unknown){const r=await page.request.post('/api/commands',{headers:{Origin:new URL(page.url()).origin,'Idempotency-Key':randomUUID()},data:{action,input}}),b=await r.json();expect(r.ok(),JSON.stringify(b)).toBe(true);return b}

async function geometry(node:import('@playwright/test').Locator){return node.evaluate(el=>{const s=(el as HTMLElement).style;return {x:parseFloat(s.left),y:parseFloat(s.top),width:parseFloat(s.width),height:parseFloat(s.height)}})}
for(const width of [1440,390])test('Explore snapping aligns movement, resize, floor area and outline with transient guides, bypass and persistence at '+width+'px',async({page})=>{
 test.setTimeout(180000);await page.setViewportSize({width,height:width===390?844:1000});await register(page);const w=await workspace(page),floor='Snapping '+width+' '+randomUUID().slice(0,4);
 await command(page,'floorPlan',{outletId:w.outletId,floor,version:0,width:1200,height:800,objects:[
  {id:'a',kind:'RECEPTION',label:'Move me',x:100,y:150,width:120,height:80},
  {id:'b',kind:'KITCHEN',label:'Reference',x:503,y:420,width:160,height:100},
  {id:'gate',kind:'ENTRY',label:'Entry/Exit',x:1323,y:500,width:80,height:60},
 ]});
 await page.goto('/app/floor-plan');await page.getByLabel('Floor plan floor',{exact:true}).selectOption(floor);await page.getByRole('button',{name:'Arrange',exact:true}).click();
 await page.locator('.floor-snapping-controls summary').click();await expect(page.getByLabel('Enable snapping',{exact:true})).toBeChecked();await page.getByLabel('Grid',{exact:true}).uncheck();await page.locator('.floor-snapping-controls summary').click();await page.getByLabel('Fit floor to view',{exact:true}).click();
 const touch=width===390?await page.context().newCDPSession(page):null;
 async function drag(node:import('@playwright/test').Locator,dx:number,dy:number,hold?:()=>Promise<void>){
  const box=(await node.boundingBox())!,zoom=await page.locator('.floor-camera').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).a),x=box.x+box.width/2,y=box.y+box.height/2;
  if(touch){await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*zoom,y:y+dy*zoom}]});if(hold)await hold();await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else{await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx*zoom,y+dy*zoom);if(hold)await hold();await page.mouse.up();}
 }
 const object=page.getByRole('button',{name:'Move me',exact:true});
 await drag(object,401,0,async()=>{await expect.poll(async()=>(await geometry(object)).x).toBeCloseTo(503,4);await expect(page.getByLabel('Snapping guides',{exact:true})).toBeAttached();await page.screenshot({path:`verification/local-explore-snapping-${width}.png`});});
 await expect(page.getByLabel('Snapping guides',{exact:true})).toHaveCount(0);await page.getByLabel('Undo layout change',{exact:true}).click();expect((await geometry(object)).x).toBe(100);await page.getByLabel('Redo layout change',{exact:true}).click();expect((await geometry(object)).x).toBeCloseTo(503,4);
 // Repeated keyboard moves can leave a snapped position, including at a small phone zoom.
 await object.focus();await object.press('Enter');await object.press('ArrowLeft');expect((await geometry(object)).x).toBeLessThan(503);await object.press('Alt+ArrowLeft');const beforeResize=await geometry(object);
 await drag(page.getByRole('button',{name:'Resize Move me width',exact:true}),663-(beforeResize.x+beforeResize.width)-2,0,async()=>{expect((await geometry(object)).x+(await geometry(object)).width).toBeCloseTo(663,4);});
 await page.getByRole('button',{name:'Resize area',exact:true}).click();await page.getByLabel('Fit floor to view',{exact:true}).click();
 await drag(page.getByRole('button',{name:'Resize floor right edge',exact:true}),121,0,async()=>{await expect(page.locator('.floor-plan-canvas')).toHaveCSS('width','1323px');await expect(page.getByLabel('Snapping guides',{exact:true})).toBeAttached();});
 await page.getByRole('button',{name:'Resize area',exact:true}).click();await page.getByRole('button',{name:'Save layout',exact:true}).click();await expect(page.getByRole('button',{name:'Arrange',exact:true})).toBeVisible();
 const saved=(await workspace(page)).floorPlans.find((p:any)=>p.floor===floor);expect(saved.width).toBe(1323);const savedObject=saved.objects.find((o:any)=>o.id==='a');expect(savedObject.x+savedObject.width).toBeCloseTo(663,4);
 await page.reload();expect((await geometry(object)).width).toBeCloseTo(savedObject.width,4);await page.getByRole('button',{name:'Arrange',exact:true}).click();await page.getByRole('button',{name:'Floor outline',exact:true}).click();
 const corner=page.getByRole('button',{name:'Corner 1',exact:true});await corner.scrollIntoViewIfNeeded();
 const start=await corner.evaluate(el=>{const c=el as SVGCircleElement,p=new DOMPoint(c.cx.baseVal.value,c.cy.baseVal.value).matrixTransform(c.getScreenCTM()!);return {x:p.x,y:p.y}}),target=await corner.evaluate(el=>{const p=new DOMPoint(501,421).matrixTransform((el as SVGCircleElement).getScreenCTM()!);return {x:p.x,y:p.y}});
 if(touch){await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[target]});}else{await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(target.x,target.y);}
 await expect.poll(async()=>page.locator('.outline-preview polygon').getAttribute('points')).toMatch(/^503,420 /);await expect(page.getByLabel('Snapping guides',{exact:true})).toBeAttached();
 if(touch)await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up();await expect(page.getByLabel('Snapping guides',{exact:true})).toHaveCount(0);
 // Do not apply this deliberately obstructed test outline: existing furniture is preserved.
 await page.getByRole('dialog').getByRole('button',{name:'Close dialog',exact:true}).click();await page.getByRole('button',{name:'Cancel',exact:true}).click();expect((await workspace(page)).floorPlans.find((p:any)=>p.floor===floor).outline).toEqual(saved.outline);
 await page.getByRole('button',{name:'Arrange',exact:true}).click();await page.locator('.floor-snapping-controls summary').click();await page.getByLabel('Enable snapping',{exact:true}).uncheck();await page.locator('.floor-snapping-controls summary').click();await page.getByLabel('Fit floor to view',{exact:true}).click();
 const freeStart=await geometry(object);await drag(object,13.7,0);expect((await geometry(object)).x).toBeCloseTo(freeStart.x+13.7,3);await expect(page.getByLabel('Snapping guides',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Cancel',exact:true}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
