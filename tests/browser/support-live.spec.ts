import {test,expect,request} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
const base=process.env.QA_BASE_URL??'http://localhost:5091';
test.use({actionTimeout:15000});
test('live replies stream both ways without timed refresh requests, reconnect and stop on session revocation',async({page,browser})=>{
 test.setTimeout(150000);
 if(!/^http:\/\/(localhost|127\.0\.0\.1):5091$/.test(base))throw Error('Isolated QA required');
 const fixture=JSON.parse(await readFile('../work/platform-browser-fixture.json','utf8'));
 if(!/^\.data\/platform-qa-\d+$/.test(fixture.path))throw Error('Isolated fixture required');
 const api=async(role:string)=>{const context=await request.newContext({baseURL:base,extraHTTPHeaders:{Origin:base,'x-forwarded-for':'10.'+[...randomBytes(3)].join('.')}});expect((await context.post('/api/auth/login',{data:{email:fixture[role],password:fixture.password}})).ok()).toBeTruthy();return context};
 const staff=await api('admin'),customer=await api('owner');
 const post=async(context:typeof staff,url:string,data:unknown)=>{const result=await context.post(url,{headers:{'Idempotency-Key':randomUUID()},data});expect(result.ok(),await result.text()).toBeTruthy();return result.json()};
 const subject='Live exchange '+randomUUID().slice(0,8),created=await post(customer,'/api/support',{action:'create',outletId:fixture.outletId,queue:'GENERAL',subject,message:'Synthetic live conversation.'}),id=created.id;
 const ownerContext=await browser.newContext({baseURL:base,storageState:await customer.storageState()}),owner=await ownerContext.newPage();
 const visible=()=>{Object.defineProperty(document,'hidden',{get:()=>false});localStorage.setItem('dd-working-design-preview','off')};
 try{
  await page.addInitScript(visible);await owner.addInitScript(visible);await page.context().addCookies((await staff.storageState()).cookies);await page.goto('/superadmin?supportChat='+id);await expect(page.getByRole('region',{name:'Support chat inbox',exact:true}).locator('.support-refresh-note')).toContainText('Live messages');
  await owner.goto('/app/overview');const trigger=owner.getByRole('button',{name:'Contact support',exact:true});await trigger.click();const dialog=owner.getByRole('dialog',{name:'Diner Dost support',exact:true});await expect(dialog).toBeVisible();await dialog.locator('[data-thread-id="'+id+'"]').click();await expect(dialog.locator('.support-refresh-note')).toContainText('Live messages');
  await page.route('**/api/superadmin/support-chat?**',route=>new URL(route.request().url()).searchParams.get('live')==='1'?route.continue():route.abort());await owner.route('**/api/support?**',route=>new URL(route.request().url()).searchParams.get('live')==='1'?route.continue():route.abort());
  await post(customer,'/api/support',{action:'reply',threadId:id,message:'Restaurant reply delivered through the live stream.'});await expect(page.getByRole('log')).toContainText('Restaurant reply delivered through the live stream.',{timeout:3000});await expect(page.getByRole('status',{name:'New support alert',exact:true})).toContainText('New support message',{timeout:3000});
  await post(staff,'/api/superadmin/support-chat',{action:'reply',tenantId:fixture.tenantId,threadId:id,message:'Superadmin reply delivered through the live stream.'});await expect(dialog.getByRole('log')).toContainText('Superadmin reply delivered through the live stream.',{timeout:3000});
  const marker='Reply after reconnect '+randomUUID().slice(0,8);await ownerContext.setOffline(true);await owner.evaluate(()=>window.dispatchEvent(new Event('offline')));await expect(dialog.locator('.support-refresh-note')).toContainText('Connecting live updates',{timeout:10000});await ownerContext.setOffline(false);await owner.evaluate(()=>window.dispatchEvent(new Event('online')));await expect(dialog.locator('.support-refresh-note')).toContainText('Live messages',{timeout:12000});await post(staff,'/api/superadmin/support-chat',{action:'reply',tenantId:fixture.tenantId,threadId:id,message:marker});await expect(dialog.getByRole('log')).toContainText(marker,{timeout:3000});
  await owner.unroute('**/api/support?**');expect((await customer.post('/api/auth/logout',{data:{}})).ok()).toBeTruthy();await post(staff,'/api/superadmin/support-chat',{action:'reply',tenantId:fixture.tenantId,threadId:id,message:'A revoked session must not receive this private reply.'});await expect(dialog.getByRole('log')).toHaveCount(0,{timeout:4000});await expect(owner).toHaveURL(/\/signin$/);await expect(owner.getByText('A revoked session must not receive this private reply.',{exact:true})).toHaveCount(0);expect((await customer.get('/api/support?live=1&id='+id)).status()).toBe(401);
 }finally{
  await ownerContext.close();const detail=await(await staff.get('/api/superadmin/support-chat?id='+id)).json();if(detail.thread?.status!=='CLOSED')await post(staff,'/api/superadmin/support-chat',{action:'close',tenantId:fixture.tenantId,threadId:id,version:detail.thread.version,resolution:'Completed isolated live delivery verification.'});await customer.dispose();await staff.dispose();
 }
});
