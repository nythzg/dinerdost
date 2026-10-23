import {test,expect,type Page} from '@playwright/test';
import {randomBytes,randomUUID} from 'node:crypto';
async function workspace(page:Page){return(await page.request.get('/api/workspace')).json()}
async function command(page:Page,action:string,input:unknown){const r=await page.request.post('/api/commands',{headers:{Origin:new URL(page.url()).origin,'Idempotency-Key':randomUUID()},data:{action,input}}),b=await r.json();expect(r.ok(),JSON.stringify(b)).toBe(true);return b}
test('all floor roundness controls are green sliders with mouse/touch/keyboard, one-gesture undo, save/cancel and clear private-room art',async({page})=>{
 test.setTimeout(180000);await page.setExtraHTTPHeaders({'x-forwarded-for':'10.'+[...randomBytes(3)].join('.')});await page.goto('/signup');
 for(const [name,value] of [['Your name','Slider QA'],['Restaurant name','Slider isolated QA'],['First outlet','Main'],['Email','slider-'+randomUUID()+'@example.test'],['Password',randomBytes(24).toString('base64url')]])await page.getByLabel(name,{exact:true}).fill(value);
 await page.getByRole('button',{name:'Create workspace',exact:true}).click();await page.waitForURL('**/app/overview');const w=await workspace(page);
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===390?844:1000});const floor='Sliders '+width;
  const table=await command(page,'table',{outletId:w.outletId,floor,label:'Slider table '+width,seats:12});
  const objects=[{id:'kitchen',kind:'KITCHEN',label:'Kitchen',x:350,y:150,width:260,height:180},{id:'private',kind:'PRIVATE_ROOM',label:'Private room',x:350,y:510,width:260,height:180},{id:'table',kind:'TABLE',tableId:table.id,label:table.label,x:700,y:330,width:220,height:160}];
  await command(page,'floorPlan',{outletId:w.outletId,floor,version:0,width:1200,height:800,objects});
  await page.goto('/app/floor-plan');await page.getByLabel('Floor plan floor',{exact:true}).selectOption(floor);await page.getByLabel('Fit floor to view',{exact:true}).click();
  const before=await workspace(page),saved=before.floorPlans.find((p:any)=>p.floor===floor);
  await page.getByRole('button',{name:'Arrange',exact:true}).click();const boundary=page.getByRole('slider',{name:'Boundary roundness',exact:true});
  await expect(boundary).toHaveCSS('accent-color','rgb(40, 91, 69)');await expect(boundary).toHaveValue('0');await boundary.scrollIntoViewIfNeeded();
  const box=(await boundary.boundingBox())!;await page.mouse.move(box.x+8,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width*.7,box.y+box.height/2,{steps:12});await page.mouse.up();
  const dragged=await boundary.inputValue();expect(Number(dragged)).toBeGreaterThan(100);
  await page.getByLabel('Undo layout change',{exact:true}).click();await expect(boundary).toHaveValue('0');await page.getByLabel('Redo layout change',{exact:true}).click();await expect(boundary).toHaveValue(dragged);
  await boundary.press('End');await expect(boundary).toHaveValue('500');await boundary.press('Home');await expect(boundary).toHaveValue('0');await boundary.press('ArrowRight');await expect(boundary).toHaveValue('5');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();expect((await workspace(page)).floorPlans.find((p:any)=>p.floor===floor)).toEqual(saved);
  await page.getByRole('button',{name:'Arrange',exact:true}).click();await boundary.press('End');
  const kitchen=page.locator('[data-plan-object-id=kitchen]');await kitchen.focus();await kitchen.press('Enter');const corner=page.getByRole('slider',{name:'Corner roundness',exact:true});
  await expect(corner).toHaveAttribute('max','90');await corner.press('End');await expect(kitchen).toHaveCSS('border-radius','90px');await corner.press('Home');await expect(kitchen).toHaveCSS('border-radius','0px');
  if(width===390){
   await corner.scrollIntoViewIfNeeded();const r=(await corner.boundingBox())!,cdp=await page.context().newCDPSession(page);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+8,y:r.y+r.height/2}]});
   for(const fraction of [.2,.4,.6,.8])await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x+r.width*fraction,y:r.y+r.height/2}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();expect(Number(await corner.inputValue())).toBeGreaterThan(0);
   await page.getByLabel('Undo layout change',{exact:true}).click();await kitchen.focus();await kitchen.press('Enter');await expect(corner).toHaveValue('0');await corner.press('End');
  }
  await corner.press('End');
  if(width===1440){
   // Blurring an inactive slider must not end the other slider's new gesture.
   await boundary.press('Home');await corner.focus();const r=(await boundary.boundingBox())!;
   await page.mouse.move(r.x+8,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width*.6,r.y+r.height/2,{steps:10});await page.mouse.up();expect(Number(await boundary.inputValue())).toBeGreaterThan(100);
   await page.getByLabel('Undo layout change',{exact:true}).click();await expect(boundary).toHaveValue('0');await boundary.press('End');
  }
  await expect(page.locator('input[type=number][aria-label*="roundness" i]')).toHaveCount(0);
  const privateIcon=page.locator('[data-plan-object-id=private] .fixture-detail-icon');await expect(privateIcon.locator('rect')).toHaveCount(1);await expect(privateIcon.locator('circle')).toHaveAttribute('fill','currentColor');await expect(privateIcon.locator('rect')).toHaveAttribute('width','8');await page.locator('[data-plan-object-id=private]').screenshot({path:`verification/local-private-room-symbol-${width}.png`});
  await page.screenshot({path:`verification/local-roundness-sliders-${width}.png`});await page.getByRole('button',{name:'Save layout',exact:true}).click();await expect(page.getByRole('button',{name:'Arrange',exact:true})).toBeVisible();await page.reload();
  const after=await workspace(page),plan=after.floorPlans.find((p:any)=>p.floor===floor);expect(plan.boundary_roundness).toBe(500);expect(plan.objects.find((o:any)=>o.id==='kitchen').cornerRadius).toBe(90);
  for(const object of plan.objects){const old=saved.objects.find((o:any)=>o.id===object.id);for(const key of ['x','y','width','height','rotation','tableId'])expect(object[key]).toEqual(old[key]);}
  for(const key of ['tables','orders','sessions'])expect(after[key]).toEqual(before[key]);
 }
});
