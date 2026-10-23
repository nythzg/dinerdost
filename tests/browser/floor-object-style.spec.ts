import {setRangeValue} from "./roundness-helpers";
import {test,expect,type Page} from '@playwright/test';
import {randomBytes,randomUUID} from 'node:crypto';
test.use({actionTimeout:15000});
async function workspace(page:Page){return(await page.request.get('/api/workspace')).json()}
async function command(page:Page,action:string,input:unknown){const r=await page.request.post('/api/commands',{headers:{Origin:new URL(page.url()).origin,'Idempotency-Key':randomUUID()},data:{action,input}}),b=await r.json();expect(r.ok(),JSON.stringify(b)).toBe(true);return b}
async function register(page:Page){
 await page.setExtraHTTPHeaders({'x-forwarded-for':'10.'+[...randomBytes(3)].join('.')});await page.goto('/signup');
 for(const [name,value] of [['Your name','Object style QA'],['Restaurant name','Object style isolated QA'],['First outlet','Main'],['Email','object-style-'+randomUUID()+'@example.test'],['Password',randomBytes(24).toString('base64url')]])await page.getByLabel(name,{exact:true}).fill(value);
 await page.getByRole('button',{name:'Create workspace',exact:true}).click();await page.waitForURL('**/app/overview');
}
test('table chairs follow saved seat changes and rounded fixtures keep icons/labels inside or below on desktop and phone',async({page})=>{
 test.setTimeout(240000);await register(page);let w=await workspace(page);
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===390?844:1000});const floor='Rounded '+width+' '+randomUUID().slice(0,4);
  const table=await command(page,'table',{outletId:w.outletId,floor,label:'Seats '+width,seats:4});
  await command(page,'floorPlan',{outletId:w.outletId,floor,version:0,width:1200,height:800,objects:[
   {id:'seats',kind:'TABLE',tableId:table.id,label:table.label,x:120,y:130,width:200,height:160},
   {id:'private',kind:'PRIVATE_ROOM',label:'Private room',x:650,y:150,width:260,height:180,rotation:30},
   {id:'small',kind:'RECEPTION',label:'Reception with a long name',x:420,y:350,width:60,height:60,cornerRadius:30},
   {id:'wall',kind:'WALL',label:'Wall',x:120,y:550,width:260,height:20},
   {id:'fence',kind:'FENCE',label:'Fence',x:600,y:550,width:240,height:20},
  ]});
  await page.goto('/app/floor-plan');await page.getByLabel('Floor plan floor',{exact:true}).selectOption(floor);await page.getByLabel('Fit floor to view',{exact:true}).click();
  const body=page.locator('[data-plan-object-id="seats"]'),icon=body.locator('.table-detail-icon');
  await expect(icon).toHaveAttribute('data-seat-count','4');await expect(icon.locator('[data-table-chair]')).toHaveCount(4);
  for(const seats of [2,4,6,8,12,1,100,4]){
   w=await workspace(page);const current=w.tables.find((t:any)=>t.id===table.id);const plans=w.floorPlans;
   await command(page,'tableCapacity',{tableId:table.id,version:current.version,seats,floor});await page.reload();
   await expect(icon).toHaveAttribute('data-seat-count',String(seats));await expect(icon.locator('[data-table-chair]')).toHaveCount(seats);if([2,4,6,8,12].includes(seats))await expect(icon).toHaveAttribute('viewBox','0 0 '+({2:24,4:24,6:32,8:40,12:56} as Record<number,number>)[seats]+' 24');
   if([2,4,6,8,12].includes(seats)){const b=(await body.locator('.fixture-symbol').boundingBox())!;expect(b.width/b.height).toBeCloseTo(({2:1,4:1,6:32/24,8:40/24,12:56/24} as Record<number,number>)[seats],1);expect(await icon.evaluate(svg=>{
    const stroke=Number(svg.getAttribute('stroke-width'));return ['0','2'].every(side=>{const bars=Array.from(svg.querySelectorAll<SVGPathElement>('[data-chair-side="'+side+'"]')).map(path=>path.getBBox()).sort((a,b)=>a.x-b.x);return bars.every((bar,i)=>!i||bar.x-bars[i-1].x-bars[i-1].width>stroke);});
   })).toBe(true);await body.screenshot({path:`verification/local-table-symbol-${seats}-${width}.png`});}
   const after=await workspace(page);expect(after.floorPlans).toEqual(plans);expect(after.sessions).toEqual(w.sessions);expect(after.orders).toEqual(w.orders);
  }
  const before=await workspace(page),saved=before.floorPlans.find((p:any)=>p.floor===floor);
  await page.getByRole('button',{name:'Arrange',exact:true}).click();await body.focus();await body.press('Enter');
  await setRangeValue(page.getByLabel('Corner roundness',{exact:true}),35);await expect(body).toHaveCSS('border-radius','35px');
  await page.getByLabel('Undo layout change',{exact:true}).click();await expect(body).toHaveCSS('border-radius','14px');
  await page.getByLabel('Redo layout change',{exact:true}).click();await expect(body).toHaveCSS('border-radius','35px');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();expect((await workspace(page)).floorPlans.find((p:any)=>p.floor===floor)).toEqual(saved);
  await page.getByRole('button',{name:'Arrange',exact:true}).click();
  for(const [id,value,effective] of [['seats',1000,80],['private',90,90],['small',30,30],['wall',10,10],['fence',0,0]] as const){
   const object=page.locator(`[data-plan-object-id="${id}"]`);await object.focus();await object.press('Enter');
   const input=page.getByLabel('Corner roundness',{exact:true});await expect(input).toHaveAttribute("type","range");await setRangeValue(input,value);await expect(object).toHaveCSS('border-radius',effective+'px');
  }
  await page.screenshot({path:`verification/local-object-corner-controls-${width}.png`});
  await page.getByRole('button',{name:'Save layout',exact:true}).click();await expect(page.getByRole('button',{name:'Arrange',exact:true})).toBeVisible();
  await page.reload();await page.getByLabel('Fit floor to view',{exact:true}).click();
  const after=await workspace(page),plan=after.floorPlans.find((p:any)=>p.floor===floor);
  expect(plan.objects.map((o:any)=>o.cornerRadius)).toEqual([80,90,30,10,0]);expect(after.tables).toEqual(before.tables);expect(after.sessions).toEqual(before.sessions);expect(after.orders).toEqual(before.orders);
  for(const object of plan.objects){const original=saved.objects.find((o:any)=>o.id===object.id);for(const key of ['x','y','width','height','rotation','tableId'])expect(object[key]).toEqual(original[key]);}
  await expect(page.locator('[data-fixture-id=small]')).toHaveAttribute('data-label-placement','below');
  for(const label of await page.locator('.fixture-detail strong').all())await expect(label).toHaveCSS('font-size','10px');
  // Inspect actual rounded shapes, including a rotated room and a circular fixture.
  expect(await page.locator('.fixture-symbol,.fixture-detail[data-label-placement=inside]').evaluateAll(symbols=>{
   const zoom=new DOMMatrix(getComputedStyle(document.querySelector('.floor-camera')!).transform).a;
   return symbols.every(symbol=>{
    const body=(symbol.matches('.fixture-symbol')?symbol.parentElement:document.querySelector('[data-plan-object-id="'+symbol.getAttribute('data-fixture-id')+'"]')) as HTMLElement,b=body.getBoundingClientRect(),r=symbol.getBoundingClientRect(),style=getComputedStyle(body),radius=parseFloat(style.borderRadius)*zoom;
    const angle=Number(body.style.transform.match(/rotate\(([-.\d]+)/)?.[1]??0)*Math.PI/180,hw=body.offsetWidth*zoom/2,hh=body.offsetHeight*zoom/2;
    return [r.left,r.right].every(x=>[r.top,r.bottom].every(y=>{const dx=x-(b.left+b.right)/2,dy=y-(b.top+b.bottom)/2,px=Math.abs(dx*Math.cos(angle)+dy*Math.sin(angle)),py=Math.abs(-dx*Math.sin(angle)+dy*Math.cos(angle));return px<=hw+.5&&py<=hh+.5&&Math.hypot(Math.max(0,px-(hw-radius)),Math.max(0,py-(hh-radius)))<=radius+.5;}));
   });
  })).toBe(true);
  await page.screenshot({path:`verification/local-table-chairs-rounded-fixtures-${width}.png`});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Arrange',exact:true}).click();await body.focus();await body.press('Enter');await page.getByRole('button',{name:'Copy',exact:true}).click();await page.getByRole('button',{name:'Paste',exact:true}).click();
  const copy=page.locator('.plan-table.is-selected');await expect(copy).toHaveCSS('border-radius','80px');await expect(copy.locator('[data-table-chair]')).toHaveCount(4);
  await page.getByRole('button',{name:'Save layout',exact:true}).click();await expect(page.getByRole('button',{name:'Arrange',exact:true})).toBeVisible();
  const copiedWorkspace=await workspace(page),copiedPlan=copiedWorkspace.floorPlans.find((p:any)=>p.floor===floor),copiedObject=copiedPlan.objects.find((o:any)=>o.kind==='TABLE'&&o.tableId!==table.id),copiedTable=copiedWorkspace.tables.find((t:any)=>t.id===copiedObject.tableId);
  expect(copiedObject.cornerRadius).toBe(80);expect(copiedTable.seats).toBe(4);expect(copiedTable.public_key).not.toBe(table.public_key);expect(copiedTable.is_occupied).toBe(false);
  // Occupancy changes icon contrast, never chair capacity or the saved geometry.
  await command(page,'openSession',{tableId:table.id,guests:2});await page.reload();await expect(body).toHaveClass(/occupied/);await expect(body.locator('.fixture-symbol')).toHaveCSS('color','rgb(255, 255, 255)');await expect(icon.locator('[data-table-chair]')).toHaveCount(4);
 }
});
