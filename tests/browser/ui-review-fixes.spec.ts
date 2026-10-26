import {test,expect,request,type Page,type APIRequestContext} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';

const base=process.env.QA_BASE_URL??'http://localhost:5091';
let fixture:any,staff:APIRequestContext,admin:APIRequestContext,table:any;
test.use({actionTimeout:15000});
test.beforeAll(async()=>{
  if(base!=='http://localhost:5091')throw Error('Isolated UI QA origin required');
  fixture=JSON.parse(await readFile('../work/platform-browser-fixture.json','utf8'));
  if(!/^\.data\/platform-qa-\d+$/.test(fixture.path))throw Error('Synthetic QA database required');
  staff=await request.newContext({baseURL:base,extraHTTPHeaders:{Origin:base,'x-forwarded-for':'10.'+[...randomBytes(3)].join('.')}});
  admin=await request.newContext({baseURL:base,extraHTTPHeaders:{Origin:base,'x-forwarded-for':'10.'+[...randomBytes(3)].join('.')}});
  for(const [context,email] of [[staff,fixture.owner],[admin,fixture.admin]] as const)
    expect((await context.post('/api/auth/login',{data:{email,password:fixture.password}})).ok()).toBeTruthy();
  const w=await(await staff.get('/api/workspace?outlet='+fixture.outletId)).json();
  const created=await command('table',{outletId:w.outletId,label:'UI review '+randomUUID().slice(0,6),seats:2,floor:'Main floor'});
  await command('openSession',{tableId:created.id,guests:1});
  table=(await(await staff.get('/api/workspace?outlet='+fixture.outletId)).json()).tables.find((t:any)=>t.id===created.id);
});
test.afterAll(async()=>{await staff?.dispose();await admin?.dispose()});
async function command(action:string,input:unknown){
  const response=await staff.post('/api/commands',{headers:{'Idempotency-Key':randomUUID()},data:{action,input}});
  const body=await response.json();expect(response.ok(),JSON.stringify(body)).toBeTruthy();return body;
}
async function login(page:Page,platform=false){
  await page.context().addCookies((await(platform?admin:staff).storageState()).cookies);
  await page.goto(platform?'/superadmin':'/app/pos');
  await expect(page.locator(platform?'.sa-content':'.app-shell')).toBeVisible();
}
async function nav(page:Page,name:string){
  const open=page.getByRole('button',{name:'Open navigation',exact:true});
  const shell=page.locator('.sa-shell'),sidebar=page.locator('.sa-sidebar');
  const mobile=await open.isVisible();
  if(mobile&&await shell.getAttribute('data-menu-open')!=='true'){
    await expect(sidebar).not.toBeInViewport();await open.click();
    await expect(shell).toHaveAttribute('data-menu-open','true');
  }
  const before=page.url();
  await page.getByRole('navigation',{name:'Superadmin navigation'}).getByRole('link',{name,exact:true}).click();
  if(page.url()===before&&await shell.getAttribute('data-menu-open')==='true')
    await page.getByRole('button',{name:'Close navigation',exact:true}).click();
  await expect(shell).toHaveAttribute('data-menu-open','false');
  if(mobile)await expect(sidebar).not.toBeInViewport();
}
async function noOverflow(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy()}

test('KYC dialog skips hidden controls and traps keyboard focus',async({page})=>{
  await login(page,true);await nav(page,'Restaurants');
  const opener=page.getByRole('row').filter({hasText:'Bistro QA'}).getByRole('button',{name:'KYC documents'});
  await opener.focus();await opener.press('Enter');
  const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(node=>node.contains(document.activeElement))).toBeTruthy();
  for(let i=0;i<10;i++){
    await page.keyboard.press(i<5?'Tab':'Shift+Tab');
    expect(await dialog.evaluate(node=>node.contains(document.activeElement))).toBeTruthy();
  }
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('row').filter({hasText:'Bistro QA'}).getByRole('button',{name:'KYC documents'})).toBeFocused();
});

test('Superadmin warns before discarding flags and reason-only edits, including Back and reload',async({page})=>{
  await login(page,true);await nav(page,'Feature controls');
  const flag=page.getByRole('switch',{name:'Menu',exact:true});
  const original=await flag.getAttribute('aria-checked');await flag.click();
  page.once('dialog',dialog=>dialog.dismiss());
  await nav(page,'Restaurants');await expect(flag).toHaveAttribute('aria-checked',String(original!=='true'));
  page.once('dialog',dialog=>dialog.dismiss());await page.goBack();
  await expect(page).toHaveURL(/section=features/);await expect(flag).toBeVisible();
  page.once('dialog',dialog=>dialog.dismiss());await page.reload({timeout:3000}).catch(()=>{});
  await expect(flag).toHaveAttribute('aria-checked',String(original!=='true'));
  await page.getByRole('button',{name:'Discard changes',exact:true}).click();
  await page.getByRole('textbox',{name:'Reason for change',exact:true}).fill('Reason-only unsaved draft');
  page.once('dialog',dialog=>dialog.dismiss());await nav(page,'Restaurants');
  await expect(page.getByRole('textbox',{name:'Reason for change',exact:true})).toHaveValue('Reason-only unsaved draft');
  page.once('dialog',dialog=>dialog.accept());await nav(page,'Restaurants');
  await nav(page,'Feature controls');await expect(flag).toHaveAttribute('aria-checked',original!);
  await expect(page.getByRole('textbox',{name:'Reason for change',exact:true})).toHaveValue('');
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:'../work/ui-review-superadmin-'+test.info().project.name+'.png',fullPage:true});
  await noOverflow(page);
});

test('Superadmin sections, restaurant filters and sort survive reload and browser history',async({page})=>{
  await login(page,true);await nav(page,'Restaurants');
  const search=page.getByRole('searchbox',{name:'Find a restaurant',exact:true});
  await search.fill('Bistro');await expect(page).toHaveURL(/restaurantSearch=Bistro/);
  await expect(page.getByRole('row').filter({hasText:'Bistro QA'})).toBeVisible();
  await page.reload();await expect(search).toHaveValue('Bistro');
  await nav(page,'Feature controls');await page.goBack();
  await expect(search).toHaveValue('Bistro');await page.goForward();
  await expect(page.getByRole('heading',{name:'Restaurant feature controls',exact:true})).toBeVisible();
  const link=page.locator('.sa-sidebar nav a[aria-label="Restaurants"]');
  await expect(link).toHaveAttribute('href',/section=tenants/);
  const context=await page.context().browser()!.newContext();
  await context.addCookies((await admin.storageState()).cookies);const other=await context.newPage();
  await other.goto(new URL((await link.getAttribute('href'))!,base).href);
  await expect(other.getByRole('heading',{name:'Restaurant directory',exact:true})).toBeVisible();await context.close();
});

test('restaurant settings retain edits on cancelled close and save without a discard prompt',async({page})=>{
  await login(page);const w=await(await staff.get('/api/workspace')).json();
  const old=await(await staff.get('/api/bill-settings?outletId='+w.outletId)).json();
  const nextCap=Number(old.loyaltyCap)===7725?8825:7725;
  await page.getByRole('button',{name:'Future bill settings',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Future bill settings',exact:true});
  const cap=dialog.getByLabel('Loyalty cap per bill (₹)',{exact:true});await cap.fill(String(nextCap/100));
  page.once('dialog',dialog=>dialog.dismiss());await page.keyboard.press('Escape');await expect(cap).toHaveValue(String(nextCap/100));
  await dialog.getByRole('button',{name:'Generate discount coupon',exact:true}).click();
  page.once('dialog',dialog=>dialog.dismiss());await dialog.getByRole('button',{name:'Close dialog',exact:true}).click();
  await expect(dialog.getByLabel('Coupon code 1',{exact:true})).toBeVisible();
  page.once('dialog',dialog=>dialog.accept());await dialog.getByRole('button',{name:'Close dialog',exact:true}).click();
  expect((await(await staff.get('/api/bill-settings?outletId='+w.outletId)).json()).loyaltyCap).toBe(old.loyaltyCap);
  await page.getByRole('button',{name:'Future bill settings',exact:true}).click();await cap.fill(String(nextCap/100));
  const unexpected:string[]=[];page.on('dialog',dialog=>{unexpected.push(dialog.type());void dialog.dismiss()});
  await page.screenshot({path:'../work/ui-review-restaurant-'+test.info().project.name+'.png',fullPage:true});
  await dialog.getByRole('button',{name:'Save adjustment',exact:true}).click();await expect(dialog).toHaveCount(0);
  expect(unexpected).toEqual([]);
  expect((await(await staff.get('/api/bill-settings?outletId='+w.outletId)).json()).loyaltyCap).toBe(nextCap);
  await noOverflow(page);
});

test('QR search keeps focus and caret on each keystroke; views and filters restore from URL',async({page})=>{
  await page.goto('/q/'+table.public_key);await page.getByRole('button',{name:'Menu',exact:true}).click();
  await page.getByRole('button',{name:'Search dishes',exact:true}).click();
  const input=page.getByRole('searchbox',{name:'Search menu',exact:true});
  await input.pressSequentially('paneer');await input.press('Home');await input.press('ArrowRight');await input.press('z');
  await expect(input).toHaveValue('pzaneer');await expect(input).toBeFocused();
  await input.fill('paneer');await page.getByRole('button',{name:'Show dishes',exact:true}).click();
  await expect(page).toHaveURL(/search=paneer/);await page.reload();
  await expect(page.locator('.guest-shell')).toHaveAttribute('data-view','menu');
  await page.getByRole('button',{name:'Search dishes',exact:true}).click();await expect(input).toHaveValue('paneer');
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'Back to main menu',exact:true}).click();
  await page.getByRole('button',{name:'Play games',exact:true}).click();await expect(page.locator('.guest-shell')).toHaveAttribute('data-view','games');
  await page.goBack();await expect(page.locator('.guest-shell')).toHaveAttribute('data-view','home');
  await page.goBack();await expect(page.locator('.guest-shell')).toHaveAttribute('data-view','menu');
  await noOverflow(page);
});

test('customer pause control persists, freezes CSS and SVG motion, and honors reduced motion',async({page})=>{
  await page.goto('/q/'+table.public_key);await page.getByRole('button',{name:'Pause animations',exact:true}).click();
  await expect(page.locator('.guest-game-tease')).toHaveAttribute('src','/images/guest/teasing-face-still.svg');
  await expect(page.locator('.guest-games-entry-echo')).toHaveCSS('animation-play-state','paused');
  await page.reload();await expect(page.getByRole('button',{name:'Resume animations',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Play games',exact:true}).click();
  await expect(page.locator('.guest-game-echo')).toHaveCSS('animation-play-state','paused');
  await page.screenshot({path:'../work/ui-review-customer-'+test.info().project.name+'.png',fullPage:true});
  await page.getByRole('button',{name:'Resume animations',exact:true}).click();
  await page.emulateMedia({reducedMotion:'reduce'});await expect(page.locator('.guest-game-echo')).toHaveCSS('animation-name','none');
  await noOverflow(page);
});

test('fonts load locally without Google requests or missing assets',async({page})=>{
  const remote:string[]=[],errors:string[]=[];
  page.on('request',request=>{if(/fonts\.(googleapis|gstatic)\.com/.test(request.url()))remote.push(request.url())});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/q/'+table.public_key);await expect(page.locator('.guest-shell')).toBeVisible();
  expect(await page.evaluate(async()=>{await document.fonts.ready;return document.fonts.check('400 16px "DM Sans"')&&document.fonts.check('700 16px Manrope')})).toBeTruthy();
  for(const font of ['dm-sans-latin','manrope-latin']){
    const response=await page.request.get('/fonts/'+font+'.woff2');expect(response.ok()).toBeTruthy();expect((await response.body()).subarray(0,4).toString()).toBe('wOF2');
  }
  expect(remote).toEqual([]);expect(errors).toEqual([]);
});

test('large shared tables render at most 50 rows and keep later records reachable',async({page})=>{
  const records=Array.from({length:121},(_,index)=>({id:randomUUID(),title:'QA Vendor '+String(index+1).padStart(3,'0'),version:1,created_at:new Date().toISOString(),data:{category:'Food',active:true}}));
  await page.route('**/api/records/vendors?*',route=>route.fulfill({json:records}));
  await login(page);await page.goto('/app/vendors');
  const table=page.locator('.four-row-table table');await expect(table.locator('tbody tr')).toHaveCount(50);
  await expect(page.getByRole('button',{name:'Previous page',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Next page',exact:true}).click();
  await expect(table.locator('tbody tr')).toHaveCount(50);await expect(table).toContainText('QA Vendor 051');
  await page.getByRole('button',{name:'Next page',exact:true}).click();
  await expect(table.locator('tbody tr')).toHaveCount(21);await expect(table).toContainText('QA Vendor 121');
  await expect(page.getByRole('button',{name:'Next page',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Previous page',exact:true}).click();
  await expect(table).toContainText('QA Vendor 051');await noOverflow(page);
});

test('saved Superadmin flags survive reload and restore without spurious discard prompts',async({page})=>{
  await login(page,true);await nav(page,'Feature controls');
  const flag=page.getByRole('switch',{name:'Menu',exact:true});
  const original=await flag.getAttribute('aria-checked');
  const unexpected:string[]=[];page.on('dialog',dialog=>{unexpected.push(dialog.type());void dialog.dismiss()});
  try{
    await flag.click();await page.getByRole('textbox',{name:'Reason for change',exact:true}).fill('Synthetic UI review save verification');
    await page.getByRole('button',{name:'Save feature controls',exact:true}).click();
    await expect(page.getByRole('status')).toContainText('Feature availability saved');
    await page.reload();await expect(flag).toHaveAttribute('aria-checked',String(original!=='true'));
  }finally{
    if(await flag.getAttribute('aria-checked')!==original){
      await flag.click();await page.getByRole('textbox',{name:'Reason for change',exact:true}).fill('Restore synthetic UI review availability');
      await page.getByRole('button',{name:'Save feature controls',exact:true}).click();
      await expect(page.getByRole('status')).toContainText('Feature availability saved');
    }
  }
  expect(unexpected).toEqual([]);
});

test('restaurant and platform rails keep their geometry in compact and phone navigation',async({page})=>{
  for(const platform of [false,true]){
    await login(page,platform);
    const sidebar=page.locator(platform?'#sa-sidebar':'#workspace-navigation');
    const expand=page.getByRole('button',{name:'Open navigation',exact:true});
    if(await expand.isVisible()){
      await expand.click();await expect(sidebar).toBeInViewport();
      if(platform)await page.getByRole('button',{name:'Close navigation',exact:true}).click();
      else await page.locator('.sidebar-scrim').click({position:{x:380,y:120}});
      await expect(sidebar).not.toBeInViewport();
    }else{
      const first=sidebar.locator('nav a').first(),before=await first.boundingBox();
      await page.getByRole('button',{name:'Collapse navigation',exact:true}).click();
      await expect.poll(async()=>(await sidebar.boundingBox())!.width).toBeLessThan(100);
      await expect(first).toHaveCSS('height','48px');
      if(platform)await expect(first.locator('.sa-nav-label')).toHaveCSS('opacity','0');
      expect(Math.abs((await first.boundingBox())!.y-before!.y)).toBeLessThan(2);
      await page.getByRole('button',{name:'Expand navigation',exact:true}).click();
      await expect.poll(async()=>(await sidebar.boundingBox())!.width).toBeGreaterThan(200);
    }
    await noOverflow(page);
  }
});
