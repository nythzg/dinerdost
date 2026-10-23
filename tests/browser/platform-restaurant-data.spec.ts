import {navigateConsole} from './platform-navigation';
import {test,expect,request as playwrightRequest,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';

let fixture:any,cookies:any[];
const base=process.env.QA_BASE_URL??'http://localhost:5091';
test.beforeAll(async()=>{
 if(!/^http:\/\/(localhost|127\.0\.0\.1):5091$/.test(base))throw new Error('Use the isolated QA server on port 5091.');
 fixture=JSON.parse(await readFile('../work/platform-browser-fixture.json','utf8'));
 if(!/^\.data\/platform-qa-\d+$/.test(fixture.path)||!fixture.secondOutletId)throw new Error('Run the isolated data fixture first.');
 const context=await playwrightRequest.newContext({baseURL:base});
 try{
  expect((await context.post('/api/auth/login',{headers:{Origin:base},data:{email:fixture.admin,password:fixture.password}})).ok()).toBeTruthy();
  const snapshot=await (await context.get('/api/superadmin')).json();expect(snapshot.admin.email).toBe(fixture.admin);expect(snapshot.tenants.some((r:any)=>r.id===fixture.tenantId)).toBeTruthy();
  cookies=(await context.storageState()).cookies;
 }finally{await context.dispose()}
});
async function open(page:Page){await page.context().addCookies(cookies);await page.goto('/superadmin');await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible()}
async function directory(page:Page){await navigateConsole(page,'Restaurants');await expect(page.getByRole('region',{name:'Restaurant directory'}).getByText('matching restaurants',{exact:false})).toBeVisible()}

test('overview filter and directory reconcile real stored flags and activity through the API',async({page})=>{
 await open(page);
 const snapshot=await (await page.request.get('/api/superadmin')).json();
 await expect(page.getByText(`${snapshot.metrics.datasets.all_records} stored restaurants`,{exact:false})).toBeVisible();
 await page.getByRole('combobox',{name:'Restaurant dataset',exact:true}).selectOption('nonDemo');
 await expect(page.locator('.sa-portfolio-heading').getByText('Demo flag off · current database records',{exact:true})).toBeVisible();
 const scoped=await (await page.request.get('/api/superadmin?dataset=nonDemo')).json();expect(Number(scoped.metrics.orders_30d)).toBe(0);
 await page.getByRole('button',{name:'Browse restaurant data'}).click();
 await expect(page.getByRole('row').filter({hasText:'Unflagged QA registration'})).toBeVisible();
 await expect(page.getByRole('row').filter({hasText:'Bistro QA'})).toHaveCount(0);
 await page.getByRole('combobox',{name:'Restaurant dataset',exact:true}).selectOption('withOrders');
 await expect(page.getByRole('row').filter({hasText:'Bistro QA'})).toBeVisible();
 await expect(page.getByRole('row').filter({hasText:'Unflagged QA registration'})).toHaveCount(0);
});

test('restaurant drilldown reads actual orders, payments and issued documents and isolates the selected outlet',async({page})=>{
 await open(page);await directory(page);
 await page.getByLabel('Find a restaurant').fill('Bistro QA');
 await page.getByRole('row').filter({hasText:'Bistro QA'}).getByRole('button',{name:'View data'}).click();
 const region=page.getByRole('region',{name:'Restaurant data'});
 await expect(region.getByRole('heading',{name:'Bistro QA',exact:true})).toBeVisible();
 const all=await (await page.request.get('/api/superadmin?view=restaurant&tenantId='+fixture.tenantId)).json();
 await expect(region.locator('.sa-metric').filter({hasText:'Orders'}).locator('strong')).toHaveText(String(all.summary.orders));
 await expect(region.getByRole('cell',{name:all.recentInvoices[0].number,exact:true})).toBeVisible();
 await region.getByRole('combobox',{name:'Outlet data',exact:true}).selectOption(fixture.secondOutletId);
 await expect(region.getByText('No orders recorded.',{exact:true})).toBeVisible();
 await expect(region.locator('.sa-metric').filter({hasText:'Gross verified receipts'}).locator('strong')).toHaveText('₹0.00');
 await expect(region.getByText('No bill documents recorded.',{exact:true})).toBeVisible();
 const wrong=await page.request.get('/api/superadmin?view=restaurant&tenantId='+fixture.tenantId+'&outletId='+all.restaurant.id);expect(wrong.status()).toBe(404);
 await region.getByRole('combobox',{name:'Outlet data',exact:true}).selectOption('');
 await expect(region.getByRole('cell',{name:all.recentInvoices[0].number,exact:true})).toBeVisible();
 await region.getByRole('button',{name:'Back to restaurants'}).click();await expect(page.getByLabel('Find a restaurant')).toHaveValue('Bistro QA');
});

test('directory and operational details reject ordinary owners and analysts at the HTTP boundary',async({browser})=>{
 for(const role of ['owner','analyst']){
  const context=await browser.newContext(),page=await context.newPage();
  try{
   expect((await page.request.post(base+'/api/auth/login',{headers:{Origin:base},data:{email:fixture[role],password:fixture.password}})).ok()).toBeTruthy();
   for(const query of ['view=directory','view=restaurant&tenantId='+fixture.tenantId])expect((await page.request.get(base+'/api/superadmin?'+query)).status()).toBe(403);
  }finally{await context.close()}
 }
});

for(const width of [1440,390])test(`linked restaurant data renders at ${width}px without page overflow or client errors`,async({page})=>{
 await page.setViewportSize({width,height:900});const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await open(page);await directory(page);
 await page.getByRole('row').filter({hasText:'Bistro QA'}).getByRole('button',{name:'View data'}).click();
 await expect(page.getByRole('heading',{name:'Bistro QA',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();expect(errors).toEqual([]);
 await page.screenshot({path:`../work/platform-data-${width}.png`,fullPage:true});
});
