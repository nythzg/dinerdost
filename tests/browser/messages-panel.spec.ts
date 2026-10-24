import {test,expect,request,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import {navigateConsole} from './platform-navigation';

const base=process.env.QA_BASE_URL??'http://localhost:5091';
test.use({actionTimeout:15000});
test('restaurant messaging has a dedicated scoped inbox, responsive chat navigation, filters and persistent replies',async({page,browser})=>{
 test.setTimeout(180000);
 if(!/^http:\/\/(localhost|127\.0\.0\.1):5091$/.test(base))throw Error('Isolated QA required');
 const fixture=JSON.parse(await readFile('../work/platform-browser-fixture.json','utf8'));
 if(!/^\.data\/platform-qa-\d+$/.test(fixture.path))throw Error('Isolated fixture required');
 const api=async(role:string)=>{const context=await request.newContext({baseURL:base,extraHTTPHeaders:{Origin:base,'x-forwarded-for':'10.'+[...randomBytes(3)].join('.')}});expect((await context.post('/api/auth/login',{data:{email:fixture[role],password:fixture.password}})).ok()).toBeTruthy();return context};
 const staff=await api('admin'),customer=await api('owner'),analyst=await api('analyst'),ids:string[]=[],prefix='Messages '+randomUUID().slice(0,8);
 const post=async(context:typeof staff,url:string,data:unknown)=>{const result=await context.post(url,{headers:{'Idempotency-Key':randomUUID()},data});expect(result.ok(),await result.text()).toBeTruthy();return result.json()};
 const dismiss=async(target:Page)=>{const close=target.getByRole('button',{name:'Dismiss support alert',exact:true});if(await close.isVisible())await close.click()};
 try{
  for(const queue of ['GENERAL','BILLING'])ids.push((await post(customer,'/api/support',{action:'create',outletId:fixture.outletId,queue,subject:prefix+' '+queue,message:'Synthetic restaurant messaging request.'})).id);
  await page.context().addCookies((await staff.storageState()).cookies);await page.goto('/superadmin');await expect(page.locator('.sa-topbar')).toBeVisible();await dismiss(page);await navigateConsole(page,'Messages');
  const center=page.getByRole('region',{name:'Support chat inbox',exact:true}),inbox=center.locator('.support-thread-list');
  await expect(page.getByRole('heading',{name:'Messages',exact:true})).toBeVisible();await expect(center.getByRole('heading',{name:'Select a conversation',exact:true})).toBeVisible();await expect(page.getByRole('group',{name:'Administration categories',exact:true})).toHaveCount(0);
  await center.getByLabel('Find a conversation',{exact:true}).fill(prefix);await center.getByRole('button',{name:'Apply',exact:true}).click();await expect(center.locator('.support-thread')).toHaveCount(2);
  await center.getByLabel('Filter team',{exact:true}).selectOption('BILLING');await center.getByRole('button',{name:'Apply',exact:true}).click();await expect(center.locator('.support-thread')).toHaveCount(1);await expect(center.locator('.support-thread')).toContainText(prefix+' BILLING');
  await center.getByLabel('Find a conversation',{exact:true}).fill('No match '+randomUUID());await center.getByRole('button',{name:'Apply',exact:true}).click();await expect(center.locator('.support-empty')).toHaveText('No conversations found.');
  await center.getByLabel('Find a conversation',{exact:true}).fill(prefix);await center.getByLabel('Filter team',{exact:true}).selectOption('ALL');await center.getByRole('button',{name:'Apply',exact:true}).click();await expect(center.locator('.support-thread')).toHaveCount(2);await center.locator('[data-thread-id="'+ids[0]+'"]').click();await expect(center.getByRole('log')).toContainText('Synthetic restaurant messaging request.');
  const detail=await(await staff.get('/api/superadmin/support-chat?id='+ids[0])).json(),identity=detail.threads.find((item:any)=>item.id===ids[0]);await expect(center.locator('.support-chat-heading h4')).toHaveText(identity.restaurant);await expect(center.locator('[data-thread-id="'+ids[0]+'"] .support-thread-meta>span').first()).toHaveText(identity.restaurant);await expect(center.locator('.support-chat-heading')).toContainText(identity.requester);
  for(const preview of [false,true]){
   await page.evaluate(value=>{localStorage.setItem('dd-working-design-preview',value?'on':'off');window.dispatchEvent(new Event('dd-working-design-preview-change'))},preview);
   for(const [width,height] of [[1440,1000],[1024,900],[768,1024],[390,844],[320,740],[844,390]]){
    await page.setViewportSize({width,height});await center.getByLabel('Your reply',{exact:true}).scrollIntoViewIfNeeded();await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);await expect(center.getByRole('button',{name:'Send message',exact:true})).toHaveCSS('height','44px');
    if(width>850){await expect(inbox).toBeVisible();const list=(await inbox.boundingBox())!,chat=(await center.locator('.support-conversation').boundingBox())!;expect(chat.x).toBeGreaterThanOrEqual(list.x+list.width-1);expect(Math.abs(chat.y-list.y)).toBeLessThanOrEqual(1)}
    else{await expect(inbox).toBeHidden();await center.getByRole('button',{name:'All conversations',exact:true}).click();await expect(inbox).toBeVisible();await expect(center.locator('[data-thread-id="'+ids[0]+'"]')).toBeFocused();await center.locator('[data-thread-id="'+ids[0]+'"]').click();await expect(inbox).toBeHidden();await expect(center.getByRole('button',{name:'All conversations',exact:true})).toBeFocused()}
    if([1440,390,320].includes(width)){await center.getByLabel('Your reply',{exact:true}).scrollIntoViewIfNeeded();await page.evaluate(()=>scrollTo(0,0));await dismiss(page);await page.screenshot({path:`../work/messages-panel-${test.info().project.name}-${width}-${preview}.png`,fullPage:true})}
   }
  }
  await page.setViewportSize({width:1440,height:1000});await dismiss(page);const reply='We have received your restaurant request.\nPlease keep this conversation open.';await center.getByLabel('Your reply',{exact:true}).fill(reply);await center.getByRole('button',{name:'Send message',exact:true}).click();await expect(center.getByLabel('Your reply',{exact:true})).toHaveValue('');await expect(center.getByRole('log')).toContainText(reply);expect((await(await customer.get('/api/support?id='+ids[0])).json()).thread.messages.at(-1).body).toBe(reply);
  await center.getByText('Conversation tools',{exact:true}).click();await center.getByRole('button',{name:'Take this chat',exact:true}).click();await expect.poll(async()=>(await(await staff.get('/api/superadmin/support-chat?id='+ids[0])).json()).thread.assigned_to).toBe(detail.capabilities.userId);await center.getByText('Share chat',{exact:true}).click();await expect(center.getByLabel('Conversation link',{exact:true})).toHaveValue(base+'/superadmin?supportChat='+ids[0]);
  await page.goto('/superadmin?supportChat='+ids[0]);await expect(page.getByRole('heading',{name:'Messages',exact:true})).toBeVisible();await expect(center.getByRole('log')).toContainText(reply);
  await navigateConsole(page,'Support & broadcasts');await expect(page.getByRole('region',{name:'Support chat inbox',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Open restaurant dashboard',exact:true})).toBeVisible();await page.keyboard.press('Control+k');await page.getByRole('searchbox',{name:'Find a page or restaurant',exact:true}).fill('Messages');await page.locator('.sa-command-results').getByRole('button',{name:'Messages',exact:true}).click();await expect(page.getByRole('heading',{name:'Messages',exact:true})).toBeVisible();
  const restricted=await browser.newContext({baseURL:base,storageState:await analyst.storageState()}),reader=await restricted.newPage();try{await reader.goto('/superadmin');await expect(reader.locator('.sa-topbar')).toBeVisible();const permissions=(await(await analyst.get('/api/superadmin')).json()).admin.permissions;if(!permissions.includes('support')){await expect(reader.getByRole('button',{name:'Messages',exact:true})).toHaveCount(0);expect((await analyst.get('/api/superadmin/support-chat')).status()).toBe(403)}}finally{await restricted.close()}
 }finally{
  for(const id of ids){const detail=await(await staff.get('/api/superadmin/support-chat?id='+id)).json();if(detail.thread?.status!=='CLOSED')await post(staff,'/api/superadmin/support-chat',{action:'close',tenantId:fixture.tenantId,threadId:id,version:detail.thread.version,resolution:'Completed isolated restaurant messaging verification.'})}
  await customer.dispose();await analyst.dispose();await staff.dispose();
 }
});
