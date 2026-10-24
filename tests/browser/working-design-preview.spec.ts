import {test,expect,request as playwrightRequest,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const base=process.env.QA_BASE_URL??'http://localhost:5091';
let fixture:any;const auth:Record<string,any[]>={};
test.beforeAll(async()=>{
 if(!/^http:\/\/(localhost|127\.0\.0\.1):5091$/.test(base))throw Error('Isolated QA origin required');
 fixture=JSON.parse(await readFile('../work/platform-browser-fixture.json','utf8'));
 if(!/^\.data\/platform-qa-\d+$/.test(fixture.path))throw Error('Isolated fixture required');
 for(const role of ['owner','admin']){const c=await playwrightRequest.newContext({baseURL:base});try{expect((await c.post('/api/auth/login',{headers:{Origin:base},data:{email:fixture[role],password:fixture.password}})).ok()).toBeTruthy();auth[role]=(await c.storageState()).cookies}finally{await c.dispose()}}
});
async function login(page:Page,role='owner'){await page.context().addCookies(auth[role])}
async function appearance(page:Page,on:boolean){await page.evaluate(value=>{localStorage.setItem('dd-working-design-preview',value?'on':'off');window.dispatchEvent(new Event('dd-working-design-preview-change'))},on);if(on)await expect(page.locator('body')).toHaveClass(/dd-working-preview/);else await expect(page.locator('body')).not.toHaveClass(/dd-working-preview/)}
async function signature(page:Page){return page.locator('.main-content').evaluate(root=>Array.from(root.querySelectorAll('button,a,input,select,textarea')).map(node=>{const e=node as HTMLInputElement;return {tag:e.tagName,text:e.textContent?.replace(/\s+/g,' ').trim(),name:e.getAttribute('aria-label'),href:e.getAttribute('href'),type:e.getAttribute('type'),required:e.required??false,disabled:e.disabled??false,readOnly:e.readOnly??false,value:e.tagName==='INPUT'||e.tagName==='SELECT'||e.tagName==='TEXTAREA'?e.value:undefined,options:e.tagName==='SELECT'?Array.from((node as HTMLSelectElement).options).map(o=>[o.value,o.text,o.disabled]):undefined}}))}
test('working preview enters the canonical restaurant and retains actual authenticated data',async({page})=>{
 await login(page);await page.goto('/design-preview');
 await expect(page).toHaveURL(/\/app\/overview$/,{timeout:15000});
 await expect(page.locator('body')).toHaveClass(/dd-working-preview/);
 const data=await (await page.request.get('/api/workspace')).json();expect(data.restaurant.id).toBe(fixture.tenantId);
 await expect(page.locator('.workspace-name')).toContainText(data.restaurant.name);
 await expect(page.getByText('Sample Bistro',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('region',{name:'Working design preview'})).toContainText('Local working data');
 await page.locator('.working-layout-options summary').click();await page.getByRole('radio',{name:'Compact',exact:true}).check();await expect(page.locator('body')).toHaveAttribute('data-working-density','compact');await page.getByRole('radio',{name:'Comfortable',exact:true}).check();await expect(page.locator('body')).toHaveAttribute('data-working-density','comfortable');await page.locator('.working-layout-options summary').click();
});
test('all 28 existing restaurant screen routes retain their controls, properties and server data with the skin enabled',async({page})=>{
 await login(page);await page.goto('/app/overview');await expect(page.getByText('Settled sales',{exact:true})).toBeVisible();
 const before=await (await page.request.get('/api/workspace')).json();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const screens=['overview','floor-plan','floor','qr','orders','pos','kitchen','tasks','payments','invoices','menu','recipes','inventory','customers','loyalty','reservations','vendors','purchases','expenses','checklists','campaigns','team','attendance','outlets','brands','reports','audit','integrations'];
 for(const screen of screens){
  await page.goto('/app/'+screen);await expect(page.locator('.workspace-controls')).toBeVisible();
  if(screen==='tasks')await expect(page.locator('.service-counts strong').first()).not.toHaveText('—');if(screen==='customers')await expect(page.getByText('Loading customers…',{exact:true})).toHaveCount(0);if(screen==='inventory')await expect(page.getByRole('button',{name:'Export CSV',exact:true})).toBeEnabled();
  if(screen==='reports')await expect(page.getByRole('button',{name:'Export CSV',exact:true})).toBeEnabled();
  await appearance(page,false);const original=await signature(page);await appearance(page,true);
  await expect.poll(()=>signature(page),{message:'Existing fields/actions preserved on '+screen}).toEqual(original);
  await expect(page.locator('.error')).toHaveCount(0);
  if(screen==='overview'){await expect(page.getByText('Loading stock…',{exact:true})).not.toBeVisible();await expect(page.locator('.main-content .panel-heading h2').filter({hasText:'Orders'})).toHaveCSS('color','rgb(21, 54, 41)')}
  if(['overview','menu','inventory','floor-plan','orders'].includes(screen))await page.screenshot({path:'../work/working-design-'+screen+'-desktop.png',animations:'disabled'});
 }
 const after=await (await page.request.get('/api/workspace')).json();
 for(const key of ['restaurant','outlets','menu','ingredients','tables','orders'])expect(after[key],key+' preserved by read-only visual review').toEqual(before[key]);
 expect(errors).toEqual([]);
});
test('the complete restaurant navigation scrolls internally, collapses accessibly and fits the phone without hiding destinations',async({page})=>{
 await login(page);await page.goto('/design-preview');await expect(page.locator('.sidebar')).toBeVisible();
 await expect(page.getByRole('button',{name:'Manage',exact:true})).toHaveCount(0);
 const links=await page.getByRole('navigation',{name:'Main navigation'}).locator('a').evaluateAll(nodes=>nodes.map(n=>[n.getAttribute('href'),n.getAttribute('aria-label')??n.textContent?.trim()]));
 expect(links.length).toBeGreaterThanOrEqual(23);
 await expect(page.locator('.sidebar nav')).toHaveCSS('scrollbar-width','thin');await expect(page.locator('.sidebar nav')).toHaveCSS('overscroll-behavior-y','contain');
 await page.getByRole('button',{name:'Collapse navigation',exact:true}).click();await expect(page.locator('.app-shell')).toHaveAttribute('data-preview-compact','true');
 expect(await page.getByRole('navigation',{name:'Main navigation'}).locator('a').evaluateAll(nodes=>nodes.map(n=>[n.getAttribute('href'),n.getAttribute('aria-label')??n.textContent?.trim()]))).toEqual(links);
 await page.locator('.sidebar nav').evaluate(e=>e.scrollTop=e.scrollHeight);await page.getByRole('button',{name:'Open profile',exact:true}).click();await expect(page.getByRole('dialog',{name:'Profile properties',exact:true}).getByRole('button',{name:'Sign out',exact:true})).toBeInViewport();await page.getByRole('button',{name:'Close profile',exact:true}).click();
 await page.screenshot({path:'../work/working-design-navigation-compact.png',animations:'disabled'});
 await page.getByRole('button',{name:'Expand navigation',exact:true}).click();await page.setViewportSize({width:375,height:850});await page.getByRole('button',{name:'Open navigation',exact:true}).click();
 await expect(page.getByRole('navigation',{name:'Main navigation'})).toBeVisible();await page.getByRole('link',{name:'Connections',exact:true}).scrollIntoViewIfNeeded();await expect(page.getByRole('link',{name:'Connections',exact:true})).toBeInViewport();await page.getByRole('button',{name:'Open profile',exact:true}).click();await expect(page.getByRole('dialog',{name:'Profile properties',exact:true}).getByRole('button',{name:'Sign out',exact:true})).toBeInViewport();await page.getByRole('button',{name:'Close profile',exact:true}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:'../work/working-design-navigation-phone.png',animations:'disabled'});
 await page.getByRole('link',{name:'Connections',exact:true}).click();await expect(page.locator('.sidebar')).not.toHaveClass(/is-open/);await expect(page.getByRole('heading',{name:'Connections',exact:true})).toBeVisible();
 await page.goto('/app/overview');await expect(page.getByText('Settled sales',{exact:true})).toBeVisible();await expect(page.getByText('Loading stock…',{exact:true})).not.toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await expect(page.getByRole('region',{name:'Working design preview'})).toContainText('Changes save normally');await page.screenshot({path:'../work/working-design-overview-phone.png',animations:'disabled'});
});
test('working appearance preserves platform navigation, print icons and the original sign-in when exiting',async({page})=>{
 await login(page,'admin');await page.goto('/design-preview?workspace=platform');await expect(page).toHaveURL(/\/superadmin$/);await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
 const names=['Overview','Restaurants','Feature controls','Plans & billing','Integrations','Internal team','Messages','Audit history','Support & broadcasts'];
 for(const name of names)await expect(page.getByRole('navigation',{name:'Superadmin navigation'}).getByRole('button',{name,exact:true})).toBeVisible();
 await page.screenshot({path:'../work/working-design-platform-desktop.png',animations:'disabled'});
 const role=(await (await page.request.get('/api/superadmin')).json()).admin.role;
 await page.emulateMedia({media:'print'});await expect(page.getByRole('region',{name:'Working design preview'})).not.toBeVisible();await expect(page.locator('.working-preview-icon-art').first()).not.toBeVisible();await expect(page.locator('.working-original-icon-art').first()).toBeVisible();await page.emulateMedia({media:'screen'});
 await page.getByRole('button',{name:'Exit design preview'}).click();await expect(page.locator('body')).not.toHaveClass(/dd-working-preview/);expect((await (await page.request.get('/api/superadmin')).json()).admin.role).toBe(role);
 await page.reload();await expect(page.getByRole('region',{name:'Working design preview'})).toHaveCount(0);
});
