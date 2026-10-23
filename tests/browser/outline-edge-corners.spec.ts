import {test,expect,type Page} from '@playwright/test';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
test.use({actionTimeout:15000});
async function register(page:Page){if(process.env.QA_FIXTURE_FILE){const f=JSON.parse(await readFile(process.env.QA_FIXTURE_FILE,'utf8'));await page.goto('/signin');await page.getByLabel('Email',{exact:true}).fill(f.email);await page.getByLabel('Password',{exact:true}).fill(f.password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL('**/app/overview');return}await page.setExtraHTTPHeaders({'x-forwarded-for':'10.'+[...randomBytes(3)].join('.')});await page.goto('/signup');for(const [n,v] of [['Your name','Floor editor QA'],['Restaurant name','Floor editor isolated QA'],['First outlet','Main'],['Email','floor-editor-'+randomUUID()+'@example.test'],['Password',randomBytes(24).toString('base64url')]])await page.getByLabel(n,{exact:true}).fill(v);await page.getByLabel('Customer QR ordering').selectOption('on');await page.getByRole('button',{name:'Create workspace'}).click();await page.waitForURL('**/app/overview');}
async function workspace(page:Page){return(await page.request.get('/api/workspace')).json()}
async function command(page:Page,action:string,input:unknown){const r=await page.request.post('/api/commands',{headers:{Origin:new URL(page.url()).origin,'Idempotency-Key':randomUUID()},data:{action,input}}),b=await r.json();expect(r.ok(),JSON.stringify(b)).toBe(true);return b}

type Point={x:number;y:number};
async function outlinePoints(page:Page):Promise<Point[]>{return page.locator('.outline-preview polygon').evaluate(el=>(el.getAttribute('points')??'').trim().split(/\s+/).map(value=>{const [x,y]=value.split(',').map(Number);return {x,y}}));}
for(const width of [1440,390])test('selected outline edge inserts its midpoint with pointer/keyboard, preserves guards and persists at '+width+'px',async({page})=>{
 test.setTimeout(180000);await page.setViewportSize({width,height:width===390?844:1000});await register(page);
 const w=await workspace(page),floor='Edge corners '+width+' '+randomUUID().slice(0,4);
 await command(page,'floorPlan',{outletId:w.outletId,floor,version:0,width:1200,height:800,objects:[]});
 await page.goto('/app/floor-plan');await page.getByLabel('Floor plan floor',{exact:true}).selectOption(floor);await page.getByRole('button',{name:'Arrange',exact:true}).click();await page.getByRole('button',{name:'Floor outline',exact:true}).click();
 const dialog=page.getByRole('dialog'),add=dialog.getByRole('button',{name:'Add corner',exact:true}),remove=dialog.getByRole('button',{name:'Remove corner',exact:true});
 await expect(add).toBeDisabled();await expect(remove).toBeDisabled();
 const touch=width===390?await page.context().newCDPSession(page):null;
 async function chooseEdge(index:number,pointer=false){
  const edge=dialog.getByRole('button',{name:'Edge '+(index+1),exact:true});
  if(pointer){await edge.scrollIntoViewIfNeeded();const point=await edge.evaluate(element=>{const line=element as SVGLineElement;const point=new DOMPoint((line.x1.baseVal.value+line.x2.baseVal.value)/2,(line.y1.baseVal.value+line.y2.baseVal.value)/2).matrixTransform(line.getScreenCTM()!);return {x:point.x,y:point.y}});
   if(touch){await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}else await page.mouse.click(point.x,point.y);
  }else{await edge.focus();await edge.press(index%2?'Space':'Enter');}
  await expect(edge).toHaveAttribute('aria-pressed','true');await expect(dialog.locator('.outline-selected-edge')).toHaveCount(1);await expect(dialog.getByRole('status')).toContainText('Edge '+(index+1)+' selected');
 }
 async function insert(index:number,pointer=false){
  const before=await outlinePoints(page);await chooseEdge(index,pointer);await expect(add).toBeEnabled();
  const next=before[(index+1)%before.length],mid={x:Math.round((before[index].x+next.x)/2),y:Math.round((before[index].y+next.y)/2)};
  await add.click();expect(await outlinePoints(page)).toEqual([...before.slice(0,index+1),mid,...before.slice(index+1)]);
  await expect(dialog.getByRole('button',{name:'Corner '+(index+2),exact:true})).toHaveAttribute('aria-pressed','true');await expect(add).toBeDisabled();await expect(remove).toBeEnabled();
 }
 // Pick the short vertical edge, rather than the original longest horizontal edge.
 await insert(1,true);await remove.click();expect((await outlinePoints(page)).length).toBe(4);
 // The last edge connects the last corner back to the first.
 await insert(3,true);await remove.click();
 await insert(0);const indentation=dialog.getByRole('button',{name:'Corner 2',exact:true});for(let i=0;i<20;i++)await indentation.press('ArrowDown');await insert(1,true);
 await dialog.getByRole('button',{name:'Rectangle',exact:true}).click();
 for(const name of ['L-shaped','U-shaped','Rotate'])await expect(dialog.getByRole('button',{name,exact:true})).toHaveCount(0);
 // Selecting a corner and choosing a shape clear the edge.
 await chooseEdge(0);await dialog.getByRole('button',{name:'Corner 2',exact:true}).focus();await expect(add).toBeDisabled();
 await chooseEdge(0);await dialog.getByRole('button',{name:'Rectangle',exact:true}).click();await expect(add).toBeDisabled();
 await dialog.getByRole('button',{name:'Rectangle',exact:true}).click();
 while((await outlinePoints(page)).length<24){const points=await outlinePoints(page);let longest=0,index=0;points.forEach((p,i)=>{const q=points[(i+1)%points.length],length=(p.x-q.x)**2+(p.y-q.y)**2;if(length>longest){longest=length;index=i}});await insert(index);}
 await chooseEdge(0);await expect(add).toBeDisabled();await dialog.getByRole('button',{name:'Circle',exact:true}).click();await expect(add).toBeDisabled();await expect(remove).toBeDisabled();
 await dialog.getByRole('button',{name:'Rectangle',exact:true}).click();await dialog.getByRole('button',{name:'Corner 1',exact:true}).focus();await remove.click();await expect(remove).toBeDisabled();
 await dialog.getByRole('button',{name:'Rectangle',exact:true}).click();await chooseEdge(2);await dialog.getByRole('button',{name:'Edge 3',exact:true}).press('ArrowUp');
 await chooseEdge(2);await dialog.screenshot({path:`verification/local-selected-outline-edge-${width}.png`});await insert(2);
 const expected=await outlinePoints(page);expect((await workspace(page)).floorPlans.find((p:any)=>p.floor===floor).outline).toBeNull();
 await dialog.getByRole('button',{name:'Apply outline',exact:true}).click();expect((await workspace(page)).floorPlans.find((p:any)=>p.floor===floor).outline).toBeNull();
 await page.getByRole('button',{name:'Cancel',exact:true}).click();expect((await workspace(page)).floorPlans.find((p:any)=>p.floor===floor).outline).toBeNull();
 // Apply again, then explicitly save; draft cancellation above touched no stored floor.
 await page.getByRole('button',{name:'Arrange',exact:true}).click();await page.getByRole('button',{name:'Floor outline',exact:true}).click();await chooseEdge(2);await dialog.getByRole('button',{name:'Edge 3',exact:true}).press('ArrowUp');await insert(2);
 expect(await outlinePoints(page)).toEqual(expected);await dialog.getByRole('button',{name:'Apply outline',exact:true}).click();await page.getByRole('button',{name:'Save layout',exact:true}).click();await expect(page.getByRole('button',{name:'Arrange',exact:true})).toBeVisible();
 expect((await workspace(page)).floorPlans.find((p:any)=>p.floor===floor).outline).toEqual(expected);await page.reload();await page.getByRole('button',{name:'Arrange',exact:true}).click();await page.getByRole('button',{name:'Floor outline',exact:true}).click();expect(await outlinePoints(page)).toEqual(expected);await expect(add).toBeDisabled();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await touch?.detach();
});
