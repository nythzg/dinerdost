import {test,expect,request,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
const base=process.env.QA_BASE_URL??'http://localhost:5091';let cookies:any[];
test.beforeAll(async()=>{
 if(!/^http:\/\/(localhost|127\.0\.0\.1):5091$/.test(base))throw Error('Isolated QA required');
 const f=JSON.parse(await readFile('../work/platform-browser-fixture.json','utf8'));if(!/^\.data\/platform-qa-\d+$/.test(f.path))throw Error('Isolated fixture required');
 const api=await request.newContext({baseURL:base,extraHTTPHeaders:{'x-forwarded-for':'10.'+[...randomBytes(3)].join('.')}});
 try{expect((await api.post('/api/auth/login',{headers:{Origin:base},data:{email:f.owner,password:f.password}})).ok()).toBeTruthy();cookies=(await api.storageState()).cookies}finally{await api.dispose()}
});
function response(page:Page,kind:string,predicate:(p:URLSearchParams)=>boolean){return page.waitForResponse(r=>{const u=new URL(r.url());return u.pathname==='/api/activity/'+kind&&predicate(u.searchParams)})}
for(const kind of ['payments','invoices','movements','purchases','expenses','checklists'])test(kind+' uses icon dropdowns with original filters and full-result sorting',async({page})=>{
 test.setTimeout(180000);await page.context().addCookies(cookies);await page.goto('/app/'+(kind==='movements'?'inventory':kind));if(kind==='movements')await page.getByRole('button',{name:'Movements',exact:true}).click();
 const noun=kind==='movements'?'stock movements':kind,sortLabel=kind==='payments'?'Payment':kind[0].toUpperCase()+kind.slice(1),filter=page.getByLabel('Filter '+noun,{exact:true}),sort=page.getByLabel('Sort '+noun,{exact:true});
 await expect(filter).toBeVisible();await expect(page.getByLabel('Period',{exact:true})).toBeHidden();await expect(filter.locator('span')).toHaveCount(0);await expect(filter).toHaveAttribute('title','Filter '+noun);
 const quantity=['invoices','movements','purchases'].includes(kind),property=quantity?'QUANTITY':kind==='checklists'?'TITLE':'AMOUNT';
 await sort.click();await page.getByLabel(sortLabel+' sort property',{exact:true}).selectOption(property);await page.getByLabel(sortLabel+' sort direction',{exact:true}).selectOption('ASC');let pending=response(page,kind,p=>p.get('sort')===property+'_ASC');await page.getByRole('button',{name:'Apply sorting',exact:true}).click();expect((await pending).ok()).toBeTruthy();await expect(sort).toBeFocused();
 await filter.click();await page.getByLabel('Period',{exact:true}).selectOption('custom');await page.getByLabel('From date',{exact:true}).fill('2020-01-01');await page.getByLabel('To date',{exact:true}).fill('2030-01-01');if(kind!=='checklists')await page.getByLabel('Min amount (₹)',{exact:true}).fill('1.23');if(quantity)await page.getByLabel('Min quantity',{exact:true}).fill('1.5');await page.getByLabel('Filter search',{exact:true}).fill('dropdown QA no match');
 pending=response(page,kind,p=>p.get('search')==='dropdown QA no match');await page.getByRole('button',{name:'Apply',exact:true}).click();const applied=await pending;expect(applied.ok()).toBeTruthy();const params=new URL(applied.url()).searchParams;expect(params.get('sort')).toBe(property+'_ASC');expect(params.get('offset')).toBe('0');if(kind!=='checklists')expect(params.get('minAmount')).toBe('123');if(quantity)expect(params.get('minQuantity')).toBe('1500');await expect(filter).toBeFocused();
 for(const preview of [false,true]){
  await page.evaluate(on=>{localStorage.setItem('dd-working-design-preview',on?'on':'off');dispatchEvent(new Event('dd-working-design-preview-change'))},preview);
  for(const [width,height] of [[1440,1000],[390,844],[320,568],[844,390]]){
   await page.setViewportSize({width,height});await filter.click();const popup=page.locator('.payment-filter-dropdown');await expect(popup).toBeVisible();await expect(page.getByLabel('Min quantity',{exact:true})).toHaveCount(quantity?1:0);await expect(page.getByLabel('Min amount (₹)',{exact:true})).toHaveCount(kind==='checklists'?0:1);
   const box=(await popup.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width+1);expect(box.y+box.height).toBeLessThanOrEqual(height+1);expect(await popup.evaluate(e=>e.scrollWidth-e.clientWidth)).toBeLessThanOrEqual(1);
   if(kind==='invoices'&&[320,1440].includes(width))await page.screenshot({path:'../work/activity-filter-'+width+'-'+preview+'.png'});
   await page.keyboard.press('Escape');await expect(filter).toBeFocused();await sort.click();const sorting=page.locator('.payment-sort-dropdown');await expect(sorting).toBeVisible();const b=(await sorting.boundingBox())!;expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(width+1);expect(b.y+b.height).toBeLessThanOrEqual(height+1);await page.keyboard.press('Escape');await expect(sort).toBeFocused();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  }
 }
 await filter.click();pending=response(page,kind,p=>!p.has('search')&&p.get('sort')===property+'_ASC');await page.locator('.payment-filter-dropdown').getByRole('button',{name:'Reset',exact:true}).click();expect((await pending).ok()).toBeTruthy();await sort.click();pending=response(page,kind,p=>p.get('sort')==='DATE_DESC');await page.locator('.payment-sort-dropdown').getByRole('button',{name:'Reset',exact:true}).click();expect((await pending).ok()).toBeTruthy();
});
