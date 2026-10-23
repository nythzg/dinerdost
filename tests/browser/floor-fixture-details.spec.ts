import {test,expect,type Page,type Locator} from '@playwright/test';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
test.use({actionTimeout:15000});
async function register(page:Page){if(process.env.QA_FIXTURE_FILE){const f=JSON.parse(await readFile(process.env.QA_FIXTURE_FILE,'utf8'));await page.goto('/signin');await page.getByLabel('Email',{exact:true}).fill(f.email);await page.getByLabel('Password',{exact:true}).fill(f.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL('**/app/overview');return}await page.setExtraHTTPHeaders({'x-forwarded-for':'10.'+[...randomBytes(3)].join('.')});await page.goto('/signup');for(const [n,v] of [['Your name','Floor geometry QA'],['Restaurant name','Floor geometry isolated QA'],['First outlet','Main'],['Email','floor-geometry-'+randomUUID()+'@example.test'],['Password',randomBytes(24).toString('base64url')]])await page.getByLabel(n,{exact:true}).fill(v);await page.getByLabel('Customer QR ordering').selectOption('on');await page.getByLabel('Add a sample menu and 12 tables').press('Space');await page.getByRole('button',{name:'Create workspace'}).click();await page.waitForURL('**/app/overview');}
async function workspace(page:Page){return(await page.request.get('/api/workspace')).json()}
async function command(page:Page,action:string,input:unknown){const r=await page.request.post('/api/commands',{headers:{Origin:new URL(page.url()).origin,'Idempotency-Key':randomUUID()},data:{action,input}}),b=await r.json();expect(r.ok(),JSON.stringify(b)).toBe(true);return b}
async function geometry(node:Locator){return node.evaluate(el=>{const s=(el as HTMLElement).style;return {x:parseFloat(s.left),y:parseFloat(s.top),width:parseFloat(s.width),height:parseFloat(s.height),angle:Number(s.transform.match(/rotate\(([-.\d]+)/)?.[1]??0)}})}

test('small labels sit below fixtures without lines; interior icons, entry-exit, fence, outdoor tables, collisions and roundness persist on desktop and phone',async({page})=>{
 test.setTimeout(240000);await register(page);const w=await workspace(page);
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===390?844:1000});const floor='Fixture design '+width+' '+randomUUID().slice(0,4),table=await command(page,'table',{outletId:w.outletId,floor,label:'Outdoor '+width,seats:4});
  await command(page,'floorPlan',{outletId:w.outletId,floor,version:0,width:1200,height:800,objects:[
   {id:'kitchen',kind:'KITCHEN',label:'Kitchen',x:100,y:100,width:300,height:220,rotation:30},
   {id:'narrow',kind:'SMOKING_ROOM',label:'Smoking room',x:500,y:100,width:60,height:200},
   {id:'under-label',kind:'WASHROOM',label:'Washroom',x:480,y:330,width:120,height:80},
   {id:'fence',kind:'FENCE',label:'Fence',x:100,y:450,width:240,height:20},
   {id:'gate',kind:'ENTRY',label:'Entry',x:-40,y:300,width:80,height:60},
   {id:'wall',kind:'WALL',label:'Wall',x:700,y:100,width:20,height:230,rotation:15},
   {id:'table',kind:'TABLE',tableId:table.id,label:'Outdoor '+width,x:800,y:450,width:150,height:100},
  ]});
  await page.goto('/app/floor-plan');await page.getByLabel('Floor plan floor',{exact:true}).selectOption(floor);await page.getByRole('button',{name:'Arrange',exact:true}).click();await page.getByLabel('Fit floor to view',{exact:true}).click();
  const kitchenLabel=page.locator('[data-fixture-id="kitchen"]'),narrowLabel=page.locator('[data-fixture-id="narrow"]');
  if(width===390)for(let i=0;i<3;i++)await page.getByLabel('Zoom in floor plan',{exact:true}).click();
  await expect(kitchenLabel).toHaveAttribute('data-label-placement','below');await expect(narrowLabel).toHaveAttribute('data-label-placement','below');
  for(const label of await page.locator('.fixture-detail').all()){
   await expect(label.locator('strong')).toHaveCSS('font-size','10px');expect(await label.locator('strong').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
   expect((await label.locator('strong').boundingBox())!.height).toBeGreaterThan(12.9);
  }
  const labelBoxes=await page.locator('.fixture-detail').evaluateAll(elements=>elements.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}}));
  for(let i=0;i<labelBoxes.length;i++)for(let j=i+1;j<labelBoxes.length;j++){const a=labelBoxes[i],b=labelBoxes[j];expect(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y).toBe(false);}
  await expect(page.locator('[data-fixture-id="wall"]')).toHaveCount(0);await expect(page.locator('.fixture-label-connectors,.fixture-label-connectors line')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Washroom',exact:true}).locator('.fixture-symbol circle')).toHaveCount(2);
  expect(await page.locator('.fixture-detail').evaluateAll(labels=>labels.every(label=>{
   const object=document.querySelector('.plan-object[data-plan-object-id="'+label.getAttribute('data-fixture-id')+'"]');
   if(!object)return false;const body=object.getBoundingClientRect(),name=label.getBoundingClientRect();
   return name.top>=body.bottom+5&&Math.abs((name.left+name.right-body.left-body.right)/2)<1;
  }))).toBe(true);
  // Symbols remain inside the actual rotated fixture, while names stay below.
  await expect(page.locator('.plan-fixture .fixture-symbol')).toHaveCount(6);await expect(page.locator('.fixture-detail svg')).toHaveCount(0);
  expect(await page.locator('.fixture-symbol').evaluateAll(symbols=>{
   const zoom=new DOMMatrix(getComputedStyle(document.querySelector('.floor-camera')!).transform).a;
   return symbols.every(symbol=>{const body=symbol.parentElement!,r=symbol.getBoundingClientRect(),b=body.getBoundingClientRect(),angle=Number(body.style.transform.match(/rotate\(([-.\d]+)/)?.[1]??0)*Math.PI/180;
    return [r.left,r.right].every(x=>[r.top,r.bottom].every(y=>{const dx=x-(b.left+b.right)/2,dy=y-(b.top+b.bottom)/2;return Math.abs(dx*Math.cos(angle)+dy*Math.sin(angle))<=body.offsetWidth*zoom/2+.5&&Math.abs(-dx*Math.sin(angle)+dy*Math.cos(angle))<=body.offsetHeight*zoom/2+.5;}));
   });
  })).toBe(true);
  await page.screenshot({path:`verification/local-fixture-below-labels-detail-${width}.png`});
  await page.getByLabel('Boundary roundness',{exact:true}).fill('80');await expect(page.locator('.floor-boundary-shape')).toHaveAttribute('d',/ Q/);
  const gate=page.getByRole('button',{name:'Entry/Exit',exact:true});await expect(gate).toHaveCount(1);await expect(gate.locator('.fixture-symbol svg path')).toHaveAttribute('d',/M10 8h12.*M22 16H10/);
  await expect(page.getByLabel('Fixture type',{exact:true}).locator('option[value="ENTRY"]')).toHaveText('Entry/Exit');await expect(page.getByLabel('Fixture type',{exact:true}).locator('option[value="EXIT"]')).toHaveCount(0);
  await gate.focus();for(let i=0;i<10;i++)await gate.press('ArrowLeft');expect((await geometry(gate)).x).toBe(-140);
  const tableNode=page.getByRole('button',{name:'Table Outdoor '+width+' available',exact:true});await tableNode.focus();await tableNode.press('Enter');
  for(let i=0;i<60;i++)await tableNode.press('ArrowLeft');expect((await geometry(tableNode)).x).toBeCloseTo(340,2);
  await page.getByLabel('Allow outside floor',{exact:true}).check();await tableNode.focus();for(let i=0;i<110;i++)await tableNode.press('ArrowRight');expect((await geometry(tableNode)).x).toBeGreaterThan(1200);
  await page.getByLabel('Fit floor to view',{exact:true}).click();
  await expect.poll(async()=>{const boxes=await page.locator('.fixture-detail').evaluateAll(elements=>elements.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}}));return boxes.some((a,i)=>boxes.slice(i+1).some(b=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y));}).toBe(false);
  await page.screenshot({path:`verification/local-fixture-below-labels-${width}.png`});
  await page.getByRole('button',{name:'Save layout',exact:true}).click();await expect(page.getByRole('button',{name:'Arrange',exact:true})).toBeVisible();
  const saved=(await workspace(page)).floorPlans.find((p:any)=>p.floor===floor);expect(saved.boundary_roundness).toBe(80);expect(saved.objects.find((o:any)=>o.id==='table').allowOutside).toBe(true);expect(saved.objects.find((o:any)=>o.id==='table').x).toBeGreaterThan(1200);expect(saved.objects.find((o:any)=>o.id==='gate').x).toBe(-140);expect(saved.objects.some((o:any)=>o.kind==='FENCE')).toBe(true);
  await page.reload();await expect(page.getByRole('button',{name:'Entry/Exit',exact:true})).toBeAttached();await expect(page.locator('.floor-boundary-shape')).toHaveAttribute('d',/ Q/);await expect(page.locator('.fixture-detail')).toHaveCount(6);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});
