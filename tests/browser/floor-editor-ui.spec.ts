import {test,expect,type Page} from '@playwright/test';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
test.use({actionTimeout:15000});
async function register(page:Page){if(process.env.QA_FIXTURE_FILE){const f=JSON.parse(await readFile(process.env.QA_FIXTURE_FILE,'utf8'));await page.goto('/signin');await page.getByLabel('Email',{exact:true}).fill(f.email);await page.getByLabel('Password',{exact:true}).fill(f.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL('**/app/overview');return}await page.setExtraHTTPHeaders({'x-forwarded-for':'10.'+[...randomBytes(3)].join('.')});await page.goto('/signup');for(const [n,v] of [['Your name','Floor editor QA'],['Restaurant name','Floor editor isolated QA'],['First outlet','Main'],['Email','floor-editor-'+randomUUID()+'@example.test'],['Password',randomBytes(24).toString('base64url')]])await page.getByLabel(n,{exact:true}).fill(v);await page.getByLabel('Customer QR ordering').selectOption('on');await page.getByRole('button',{name:'Create workspace'}).click();await page.waitForURL('**/app/overview');}
async function workspace(page:Page){return(await page.request.get('/api/workspace')).json()}
async function command(page:Page,action:string,input:unknown){const r=await page.request.post('/api/commands',{headers:{Origin:new URL(page.url()).origin,'Idempotency-Key':randomUUID()},data:{action,input}}),b=await r.json();expect(r.ok(),JSON.stringify(b)).toBe(true);return b}
const position=(page:Page,name:string)=>page.getByRole('button',{name,exact:true}).evaluate(el=>({x:parseFloat((el as HTMLElement).style.left),y:parseFloat((el as HTMLElement).style.top)}));
test('draft undo/redo groups gestures; Ctrl/touch multi-select moves together; scoped locked view survives navigation and reload',async({page})=>{
 test.setTimeout(240000);await register(page);const w=await workspace(page);
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===390?844:1000});const floor='Editor '+width+' '+randomUUID().slice(0,4);
  await command(page,'floorPlan',{outletId:w.outletId,floor,version:0,width:1000,height:700,objects:[{id:'a',kind:'RECEPTION',label:'Counter A',x:100,y:180,width:150,height:80},{id:'b',kind:'PRIVATE_ROOM',label:'Room B',x:400,y:300,width:180,height:100},{id:'c',kind:'KITCHEN',label:'Kitchen C',x:700,y:450,width:200,height:160}]});
  await page.goto('/app/floor-plan');await page.getByLabel('Floor plan floor',{exact:true}).selectOption(floor);await page.getByRole('button',{name:'Arrange',exact:true}).click();await page.getByLabel('Fit floor to view',{exact:true}).click();
  const a=page.getByRole('button',{name:'Counter A',exact:true}),b=page.getByRole('button',{name:'Room B',exact:true});
  if(width===390){await page.getByRole('button',{name:'Select multiple',exact:true}).click();await a.click();await b.click();await page.getByRole('button',{name:'Select multiple',exact:true}).click()}else{await a.click();await b.click({modifiers:['Control']})}
  await expect(a).toHaveAttribute('aria-pressed','true');await expect(b).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('status').filter({hasText:'2 selected'})).toBeVisible();
  const startA=await position(page,'Counter A'),startB=await position(page,'Room B'),startC=await position(page,'Kitchen C'),box=await b.boundingBox();
  await page.mouse.move(box!.x+box!.width/2,box!.y+box!.height/2);await page.mouse.down();await page.mouse.move(box!.x+box!.width/2+20,box!.y+box!.height/2+15,{steps:12});await page.mouse.up();
  const endA=await position(page,'Counter A'),endB=await position(page,'Room B');expect(endA.x).toBeGreaterThan(startA.x);expect(endA.x-startA.x).toBeCloseTo(endB.x-startB.x,5);expect(endA.y-startA.y).toBeCloseTo(endB.y-startB.y,5);expect(await position(page,'Kitchen C')).toEqual(startC);
  await page.getByLabel('Undo layout change',{exact:true}).click();expect(await position(page,'Counter A')).toEqual(startA);expect(await position(page,'Room B')).toEqual(startB);
  await page.getByLabel('Redo layout change',{exact:true}).click();expect(await position(page,'Counter A')).toEqual(endA);await a.focus();await page.keyboard.press('Control+z');expect(await position(page,'Counter A')).toEqual(startA);await page.keyboard.press('Control+Shift+z');expect(await position(page,'Counter A')).toEqual(endA);
  // A field's native undo is not intercepted by the layout history.
  await a.click();const label=page.getByLabel('Fixture label',{exact:true});await label.fill('Counter renamed');await label.press('Control+z');await expect(page.getByRole('button',{name:'Cancel',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();expect((await workspace(page)).floorPlans.find((p:any)=>p.floor===floor).objects[0].x).toBe(startA.x);
  await page.getByLabel('Fit floor to view',{exact:true}).click();await page.getByLabel('Lock floor view',{exact:true}).click();const transform=await page.locator('.floor-camera').getAttribute('style');
  await page.goto('/app/orders');await page.goto('/app/floor-plan');await expect(page.getByLabel('Floor plan floor',{exact:true})).toHaveValue(floor);await expect(page.getByLabel('Unlock floor view',{exact:true})).toBeVisible();expect(await page.locator('.floor-camera').getAttribute('style')).toBe(transform);
  await page.reload();await expect(page.getByLabel('Unlock floor view',{exact:true})).toBeVisible();await expect(page.getByLabel('Zoom in floor plan',{exact:true})).toBeDisabled();expect(await page.locator('.floor-camera').getAttribute('style')).toBe(transform);
  await page.screenshot({path:`verification/floor-editor-0427-${width}.png`});await page.getByLabel('Unlock floor view',{exact:true}).click();await expect(page.getByLabel('Zoom in floor plan',{exact:true})).toBeEnabled();
 }
});
