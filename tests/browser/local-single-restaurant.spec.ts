import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';

let fixture:any;
const base=process.env.QA_BASE_URL??'http://localhost:5091';
test.beforeAll(async()=>{
 if(!/^http:\/\/(localhost|127\.0\.0\.1):5091$/.test(base))throw new Error('Only the isolated QA server is allowed.');
 fixture=JSON.parse(await readFile('../work/single-restaurant-browser-fixture.json','utf8'));
 if(!/^\.data\/single-restaurant-qa-\d+$/.test(fixture.path))throw new Error('Isolated single-restaurant fixture required.');
});
async function platformSignIn(page:Page){
 await page.goto('/superadmin/signin');await page.getByLabel('Email',{exact:true}).fill(fixture.admin);await page.getByLabel('Password',{exact:true}).fill(fixture.password);await page.getByRole('button',{name:'Sign in to platform',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
 const snapshot=await (await page.request.get('/api/superadmin')).json();expect(snapshot.admin.email).toBe(fixture.admin);expect(snapshot.tenants.map((r:any)=>r.id)).toEqual([fixture.tenantId]);
}

for(const width of [1440,390])test(`clean restaurant directory shows one business and owner search works at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await platformSignIn(page);
 await expect(page.getByText('1 stored restaurant',{exact:false})).toBeVisible();
 await page.getByRole('navigation',{name:'Superadmin navigation'}).getByRole('button',{name:'Restaurants',exact:true}).click();
 await page.getByLabel('Find a restaurant').fill('Restaurant QA owner');
 const row=page.getByRole('row').filter({hasText:'Bistro QA'});await expect(row).toBeVisible();await expect(row.getByText('Owner: Restaurant QA owner',{exact:true})).toBeVisible();
 await expect(page.getByRole('status').filter({hasText:'1 matching restaurant'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.screenshot({path:`../work/single-restaurant-${width}.png`,fullPage:true});
 await row.getByRole('button',{name:'View data'}).click();await expect(page.getByRole('heading',{name:'Bistro QA',exact:true})).toBeVisible();
 await expect(page.getByRole('cell',{name:'QA Main',exact:true}).first()).toBeVisible();
});

test('kept owner uses the same credentials and sees retained orders; removed account cannot sign in',async({page})=>{
 const result=await page.request.post(base+'/api/auth/login',{headers:{Origin:base},data:{email:fixture.owner,password:fixture.password}});expect(result.ok()).toBeTruthy();
 await page.goto('/app/overview');const workspace=await (await page.request.get('/api/workspace?outlet='+fixture.outletId)).json();expect(workspace.restaurant.id).toBe(fixture.tenantId);expect(workspace.orders.length).toBeGreaterThan(0);
 expect((await page.request.get('/api/superadmin')).status()).toBe(403);
 const rejected=await page.request.post(base+'/api/auth/login',{headers:{Origin:base},data:{email:fixture.analyst,password:fixture.password}});expect(rejected.ok()).toBeFalsy();
});
