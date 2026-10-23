import {test,expect,type Page} from '@playwright/test';
import {randomBytes,randomUUID} from 'node:crypto';
async function workspace(page:Page){return(await page.request.get('/api/workspace')).json()}
async function command(page:Page,action:string,input:unknown){const r=await page.request.post('/api/commands',{headers:{Origin:new URL(page.url()).origin,'Idempotency-Key':randomUUID()},data:{action,input}}),b=await r.json();expect(r.ok(),JSON.stringify(b)).toBe(true);return b}
test('dense phone floor labels remain readable, nearby, unclipped and stable through zoom, rotation and resize without editing saved data',async({page})=>{
 test.setTimeout(180000);await page.setExtraHTTPHeaders({'x-forwarded-for':'10.'+[...randomBytes(3)].join('.')});await page.goto('/signup');
 for(const [name,value] of [['Your name','Phone labels QA'],['Restaurant name','Phone labels isolated QA'],['First outlet','Main'],['Email','phone-labels-'+randomUUID()+'@example.test'],['Password',randomBytes(24).toString('base64url')]])await page.getByLabel(name,{exact:true}).fill(value);
 await page.getByRole('button',{name:'Create workspace',exact:true}).click();await page.waitForURL('**/app/overview');
 const w=await workspace(page),floor='Dense phone layout';
 const objects:any[]=[
  {id:'entry',kind:'ENTRY',label:'Entry/Exit',x:90,y:0,width:60,height:180},
  {id:'kitchen',kind:'KITCHEN',label:'Kitchen',x:250,y:30,width:300,height:180},
  {id:'reception',kind:'RECEPTION',label:'Reception',x:110,y:230,width:250,height:60},
  {id:'private',kind:'PRIVATE_ROOM',label:'Private Room',x:100,y:380,width:230,height:160},
  {id:'smoking',kind:'SMOKING_ROOM',label:'Smoking room',x:15,y:300,width:70,height:250},
  {id:'handwash',kind:'WASHROOM',label:'Handwash',x:590,y:230,width:60,height:180},
  {id:'washroom-a',kind:'WASHROOM',label:'Washroom',x:590,y:450,width:60,height:90},
  {id:'washroom-b',kind:'WASHROOM',label:'Washroom',x:670,y:450,width:60,height:90},
  {id:'fence',kind:'WALL',label:'Wall',x:740,y:440,width:200,height:20},
 ];
 const placements=[[170,30,60,60],[390,260,140,60],[470,340,60,60],[420,480,120,80],[680,240,180,140],[1050,170,70,150],[930,30,180,90],[1050,360,70,150],[1000,550,120,60],[850,550,120,60],[700,550,120,60],[890,250,150,180],[580,30,160,140],[760,30,160,140]];
 for(const [i,[x,y,width,height]] of placements.entries()){const table=await command(page,'table',{outletId:w.outletId,floor,label:String(i+1),seats:[2,4,6,8,12][i%5]});objects.push({id:'table-'+i,kind:'TABLE',tableId:table.id,label:table.label,x,y,width,height});}
 await command(page,'floorPlan',{outletId:w.outletId,floor,version:0,width:1200,height:650,objects});const before=await workspace(page);
 for(const width of [390,320,650,844,1440]){
  await page.setViewportSize({width,height:width===844?390:844});await page.goto('/app/floor-plan');await page.getByLabel('Floor plan floor',{exact:true}).selectOption(floor);await page.getByLabel('Fit floor to view',{exact:true}).click();
  await expect(page.locator('.fixture-detail')).toHaveCount(objects.length-1);
  await expect.poll(async()=>page.locator('.fixture-detail strong').evaluateAll(labels=>labels.every(el=>getComputedStyle(el).fontSize==='10px'&&el.scrollWidth<=el.clientWidth+1))).toBe(true);
  if(width<=650||width===844){
   await expect(page.locator('.fixture-detail.is-compact')).toHaveCount(objects.length-1);
   const geometry=()=>page.locator('.fixture-detail').evaluateAll(labels=>{
    const frame=document.querySelector('.floor-plan-scroll')!.getBoundingClientRect();
    return labels.map(label=>{const r=label.getBoundingClientRect(),body=document.querySelector('[data-plan-object-id="'+label.getAttribute('data-fixture-id')+'"]')!.getBoundingClientRect();return {id:label.getAttribute('data-fixture-id'),x:r.x,y:r.y,right:r.right,bottom:r.bottom,inside:label.getAttribute('data-label-placement')==='inside',drift:Math.hypot((r.left+r.right-body.left-body.right)/2,Math.max(0,r.top-body.bottom)),clipped:r.left<frame.left||r.right>frame.right||r.top<frame.top||r.bottom>frame.bottom}});
   });
   await expect.poll(async()=>(await geometry()).filter(r=>r.clipped),{message:'Clipped phone labels at width '+width}).toEqual([]);
   const boxes=await geometry();const outside=boxes.filter(r=>!r.inside);expect(Math.max(...outside.map(r=>r.drift))).toBeLessThan(width===844?120:100);expect(outside.reduce((sum,r)=>sum+r.drift,0)/Math.max(1,outside.length)).toBeLessThan(60);
   for(const [i,a] of boxes.entries())for(const b of boxes.slice(i+1))expect(a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y).toBe(false);
   expect(boxes.filter(r=>r.inside).length).toBeGreaterThanOrEqual(width===844?1:6);
   if(width===844){await page.locator('.main-content.explore-content').evaluate(el=>{el.scrollTop=el.scrollHeight});expect((await geometry()).every(r=>r.y>=0&&r.bottom<=390)).toBe(true)}
   await page.screenshot({path:`verification/local-phone-floor-labels-${width}.png`});
   for(let i=0;i<3;i++)await page.getByLabel('Zoom in floor plan',{exact:true}).click();await page.getByLabel('Fit floor to view',{exact:true}).click();
   await expect.poll(async()=>(await geometry()).filter(r=>r.clipped),{message:'Clipped phone labels at width '+width}).toEqual([]);
  }else await expect(page.locator('.fixture-detail.is-compact')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 const after=await workspace(page);for(const key of ['floorPlans','tables','sessions','orders'])expect(after[key]).toEqual(before[key]);
});
