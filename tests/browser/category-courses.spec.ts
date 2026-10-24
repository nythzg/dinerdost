import {test,expect,request,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
const base=process.env.QA_BASE_URL??'http://localhost:5091';

test('category main-menu assignments persist, recover from save failure and match POS and customer browsing',async({page})=>{
 test.setTimeout(180000);
 if(!/^http:\/\/(localhost|127\.0\.0\.1):5091$/.test(base))throw Error('Isolated QA origin required');
 const fixture=JSON.parse(await readFile('../work/platform-browser-fixture.json','utf8'));
 if(!/^\.data\/platform-qa-\d+$/.test(fixture.path))throw Error('Disposable QA fixture required');
 const api=await request.newContext({baseURL:base,extraHTTPHeaders:{'x-forwarded-for':'10.'+[...randomBytes(3)].join('.')}});
 try{expect((await api.post('/api/auth/login',{headers:{Origin:base},data:{email:fixture.owner,password:fixture.password}})).ok()).toBeTruthy();await page.context().addCookies((await api.storageState()).cookies)}finally{await api.dispose()}
 await page.addInitScript(()=>localStorage.setItem('dd-working-design-preview','off'));
 const command=async(action:string,input:any)=>{const response=await page.request.post('/api/commands',{headers:{Origin:base,'Idempotency-Key':randomUUID()},data:{action,input}});expect(response.ok(),action+' '+response.status()).toBeTruthy();return response.json()};
 await page.goto('/app/menu');const w=await(await page.request.get('/api/workspace')).json(),suffix=randomUUID().slice(0,6),name='Seasonal drinks '+suffix,dishName='Course pastry '+suffix;
 await page.getByRole('button',{name:'Categories',exact:true}).click();await page.getByRole('button',{name:'Add category',exact:true}).click();
 let editor=page.getByRole('dialog',{name:'Add category',exact:true});await editor.getByLabel('Category name',{exact:true}).fill(name);await editor.getByLabel('Main menu',{exact:true}).selectOption('starter');await editor.getByRole('button',{name:'Save',exact:true}).click();await expect(editor).toHaveCount(0);
 await command('menu',{outletId:w.outletId,name:dishName,category:name,price:10000,taxBps:0,station:'Main kitchen',imageUrl:'/images/menu/samples/mint-cooler.webp'});
 await page.reload();await page.getByRole('button',{name:'Categories',exact:true}).click();let row=page.locator('.category-manager-row').filter({has:page.getByText(name,{exact:true})});await expect(row.locator('small')).toHaveText('Starter');await row.getByRole('button',{name:'Edit '+name,exact:true}).click();
 editor=page.getByRole('dialog',{name:'Edit category',exact:true});await expect(editor.getByLabel('Main menu',{exact:true})).toHaveValue('starter');await editor.getByLabel('Main menu',{exact:true}).selectOption('dessert');
 await page.route('**/api/commands',route=>route.fulfill({status:503,json:{error:{code:'TEMPORARILY_UNAVAILABLE',message:'Temporary category save failure. Try again.'}}}),{times:1});
 await editor.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByText('Temporary category save failure. Try again.',{exact:true})).toBeVisible();await expect(editor.getByLabel('Category name',{exact:true})).toHaveValue(name);await expect(editor.getByLabel('Main menu',{exact:true})).toHaveValue('dessert');await editor.getByRole('button',{name:'Save',exact:true}).click();await expect(editor).toHaveCount(0);
 await page.reload();await page.getByRole('button',{name:'Categories',exact:true}).click();row=page.locator('.category-manager-row').filter({has:page.getByText(name,{exact:true})});await expect(row.locator('small')).toHaveText('Dessert');
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});await expect(row.getByRole('button',{name:'Edit '+name,exact:true})).toBeInViewport();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.getByRole('dialog',{name:'Categories',exact:true}).screenshot({path:'../work/category-main-menu-'+width+'-'+test.info().project.name+'.png'})}
 await page.getByLabel('Close dialog',{exact:true}).click();
 await page.goto('/app/pos');const courses=page.getByRole('navigation',{name:'POS menu courses',exact:true});await courses.getByRole('button',{name:/Dessert/}).click();await expect(page.locator('.menu-card').filter({hasText:dishName})).toBeVisible();await expect(page.getByRole('group',{name:'Menu categories',exact:true}).getByRole('button',{name,exact:true})).toBeVisible();await courses.getByRole('button',{name:/Starter/}).click();await expect(page.locator('.menu-card').filter({hasText:dishName})).toHaveCount(0);
 const table=await command('table',{outletId:w.outletId,label:'Course '+suffix,seats:2,floor:'Main floor'});await command('openSession',{tableId:table.id,guests:2});const key=(await(await page.request.get('/api/workspace')).json()).tables.find((t:any)=>t.id===table.id).public_key;
 const context=await page.context().browser()!.newContext({baseURL:base,viewport:{width:390,height:844}}),guest=await context.newPage();
 try{await guest.goto('/q/'+key);await guest.getByRole('button',{name:'Menu',exact:true}).click();await expect(guest.getByRole('button',{name:'Add '+dishName,exact:true})).toHaveCount(0);await guest.getByRole('navigation',{name:'Dining journey',exact:true}).getByRole('button',{name:/Dessert/}).click();await expect(guest.getByRole('button',{name:'Add '+dishName,exact:true})).toBeVisible();await guest.getByRole('button',{name:name,exact:true}).click();await expect(guest.locator('.guest-menu article')).toHaveCount(1);await guest.screenshot({path:'../work/category-customer-dessert-'+test.info().project.name+'.png'});const catalog=await(await guest.request.get('/api/guest/'+key)).json();expect(catalog.menu.find((m:any)=>m.name===dishName).menu_course).toBe('dessert');expect(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)}finally{await context.close()}
});
