import {test,expect,request,type Page,type Cookie} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import {navigateConsole} from './platform-navigation';

const base=process.env.QA_BASE_URL??'http://localhost:5091';
const sizes=[[320,740],[390,844],[768,1024],[1024,768],[844,390],[1440,1000]];
const routes=['overview','floor-plan','floor','qr','orders','pos','kitchen','tasks','payments','invoices','menu','recipes','inventory','customers','loyalty','reservations','vendors','purchases','expenses','checklists','campaigns','team','attendance','outlets','brands','reports','audit','integrations'];
let fixture:any;
const cookies:Record<string,Cookie[]>={};
test.beforeAll(async()=>{
  if(!/^http:\/\/(localhost|127\.0\.0\.1):5091$/.test(base))throw Error('Isolated QA origin required');
  fixture=JSON.parse(await readFile('../work/platform-browser-fixture.json','utf8'));
  if(!/^\.data\/platform-qa-\d+$/.test(fixture.path))throw Error('Isolated QA fixture required');
  for(const role of ['owner','admin']){
    const api=await request.newContext({baseURL:base,extraHTTPHeaders:{'x-forwarded-for':'10.'+[...randomBytes(3)].join('.')}});
    try{expect((await api.post('/api/auth/login',{headers:{Origin:base},data:{email:fixture[role],password:fixture.password}})).ok()).toBeTruthy();cookies[role]=(await api.storageState()).cookies}finally{await api.dispose()}
  }
});
async function fit(page:Page,name:string,width:number,height:number){
  await page.setViewportSize({width,height});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),{message:name+' page width at '+width}).toBeLessThanOrEqual(1);
  // Page overflow alone misses controls painted over one another inside a fixed-height header.
  await expect.poll(()=>page.locator('.topbar,.sa-topbar').evaluateAll(headers=>headers.flatMap(header=>{
    const controls=[...header.querySelectorAll('button,select,input')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&getComputedStyle(e).visibility!=='hidden'});
    return controls.flatMap((a,i)=>controls.slice(i+1).filter(b=>{const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();return !a.contains(b)&&!b.contains(a)&&Math.min(x.right,y.right)-Math.max(x.left,y.left)>2&&Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top)>2}).map(b=>[a.getAttribute('aria-label'),b.getAttribute('aria-label')]));
  })),{message:name+' overlapping header controls at '+width}).toEqual([]);
}
async function appearance(page:Page,on:boolean){await page.evaluate(value=>{localStorage.setItem('dd-working-design-preview',value?'on':'off');window.dispatchEvent(new Event('dd-working-design-preview-change'))},on);await expect(page.locator('body')).toHaveClass(on?/dd-working-preview/:/^(?!.*dd-working-preview)/)}

test('all restaurant routes and order details fit phones, tablets and landscape in both appearances',async({page})=>{
  await page.context().addCookies(cookies.owner);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/app/overview');await expect(page.locator('.workspace-controls')).toBeVisible();
  const before=await(await page.request.get('/api/workspace')).json();
  expect(before.restaurant.id).toBe(fixture.tenantId);
  for(const route of routes){
    await page.goto('/app/'+route);await expect(page.locator('.workspace-controls')).toBeVisible();
    for(const [width,height] of sizes)await fit(page,route,width,height);
    await appearance(page,true);await fit(page,route+' preview',320,740);await appearance(page,false);
  }
  if(before.orders.length){await page.goto('/app/orders/'+before.orders[0].id);await expect(page.locator('.order-layout')).toBeVisible();for(const [width,height] of sizes)await fit(page,'order details',width,height)}
  const after=await(await page.request.get('/api/workspace')).json();
  for(const key of ['restaurant','outlets','menu','ingredients','tables','orders'])expect(after[key],key+' unchanged').toEqual(before[key]);
  expect(errors).toEqual([]);
});

test('every Superadmin section, navigation and support desk fits narrow and short screens',async({page})=>{
  await page.context().addCookies(cookies.admin);await page.goto('/superadmin');
  await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
  for(const section of ['Overview','Restaurants','Feature controls','Plans & billing','Integrations','Internal team','Messages','Support & broadcasts','Audit history']){
    if(section!=='Overview')await navigateConsole(page,section);
    await expect(page.getByRole('heading',{name:section,exact:true})).toBeVisible();
    for(const [width,height] of sizes)await fit(page,section,width,height);
    await appearance(page,true);await fit(page,section+' preview',320,740);await appearance(page,false);
  }
  await page.setViewportSize({width:320,height:568});await navigateConsole(page,'Messages');
  await expect(page.getByRole('region',{name:'Support chat inbox',exact:true})).toBeVisible();
  await page.screenshot({path:'../work/responsive-admin-'+test.info().project.name+'.png',fullPage:true});
});

test('mobile forms, dialogs and touch navigation remain reachable when the viewport shrinks',async({page})=>{
  await page.context().addCookies(cookies.owner);await page.setViewportSize({width:320,height:740});
  await page.goto('/app/overview');await expect(page.locator('.workspace-controls')).toBeVisible();
  await page.getByRole('button',{name:'Open navigation',exact:true}).click();
  const last=page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Activity log',exact:true});await last.scrollIntoViewIfNeeded();await expect(last).toBeInViewport();await last.click();
  const support=page.getByRole('button',{name:'Contact support',exact:true});await expect(support).toHaveCSS('min-height','44px');await support.focus();await page.keyboard.press('Enter');
  const dialog=page.getByRole('dialog',{name:'Diner Dost support',exact:true});await expect(dialog).toBeVisible();
  await dialog.getByRole('button',{name:'New chat',exact:true}).click();
  const subject=dialog.getByLabel('What do you need help with?',{exact:true});await expect(subject).toHaveCSS('font-size','16px');await subject.fill('Responsive check - unsent');
  for(const [width,height] of [[320,400],[844,390],[390,844]]){
    await page.setViewportSize({width,height});await subject.focus();
    const send=dialog.getByRole('button',{name:'Send to support',exact:true});await send.scrollIntoViewIfNeeded();await expect(send).toBeInViewport();
    const box=await dialog.boundingBox();expect(box!.height).toBeLessThanOrEqual(height);expect(box!.width).toBeLessThanOrEqual(width);
  }
  await dialog.getByRole('button',{name:'Close dialog',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(support).toBeFocused();
  await page.screenshot({path:'../work/responsive-restaurant-'+test.info().project.name+'.png'});
});

test('customer QR home, arcade and four-course cart fit mobile browsers without distractions while ordering',async({page})=>{
  await page.context().addCookies(cookies.owner);
  const workspace=await(await page.request.get('/api/workspace')).json();
  const table=workspace.tables.find((row:any)=>row.public_key);expect(table).toBeTruthy();
  await page.context().clearCookies();await page.goto('/q/'+table.public_key);await expect(page.locator('.guest-home')).toBeVisible();
  for(const [width,height] of sizes)await fit(page,'QR home',width,height);
  await page.setViewportSize({width:390,height:844});await expect(page.locator('.guest-restaurant-mark')).toBeVisible();
  await expect(page.locator('.guest-welcome-copy')).toHaveCSS('row-gap','4px');
  await expect(page.locator('.guest-welcome-copy .eyebrow')).toHaveCSS('font-size','14px');await expect(page.locator('.guest-welcome-copy .eyebrow')).toHaveCSS('top','4px');await expect(page.locator('.guest-welcome-outlet')).toHaveCSS('text-align','right');await expect(page.locator('.guest-welcome-outlet')).toHaveCSS('font-size','10px');
  const mark=(await page.locator('.guest-restaurant-mark').boundingBox())!,copy=(await page.locator('.guest-welcome-copy').boundingBox())!;expect(Math.abs(mark.y-copy.y)).toBeLessThanOrEqual(1);expect(Math.abs(mark.height-copy.height)).toBeLessThanOrEqual(1);
  for(const text of await page.locator('.guest-welcome-copy p,.guest-welcome-copy h1').all()){await expect(text).toHaveCSS('margin-top','0px');await expect(text).toHaveCSS('margin-bottom','0px')}
  await page.screenshot({path:'../work/responsive-guest-'+test.info().project.name+'.png',fullPage:true});
  await page.getByRole('button',{name:'Play games',exact:true}).click();for(const [width,height] of sizes)await fit(page,'arcade',width,height);
  await page.getByRole('button',{name:'Back to main menu',exact:true}).click();await page.getByRole('button',{name:'Menu',exact:true}).click();
  await expect(page.locator('.guest-welcome,.guest-games-entry')).toHaveCount(0);
  await expect(page.getByRole('navigation',{name:'Dining journey'}).locator('button')).toHaveCount(4);
  await expect(page.locator('.guest-course-copy h1')).toHaveText('Starter');await expect(page.getByRole('button',{name:/^Next ·/})).toHaveCount(0);await expect(page.locator('.guest-course-navigation')).toHaveCount(0);await expect(page.locator('.guest-course-copy .eyebrow')).toHaveCount(0);await expect(page.locator('.guest-journey strong')).toHaveText(['Starter','Main course','Drinks','Dessert']);await page.getByRole('button',{name:/Step 3 Drinks/}).click();
  for(const preview of [false,true]){
    await appearance(page,preview);await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await page.getByRole('button',{name:/Step 2 Main course/}).click();await expect(page.getByRole('button',{name:/^Next ·/})).toHaveCount(0);await expect(page.getByRole('button',{name:'Previous',exact:true})).toBeVisible();
    await expect.poll(async()=>{const heading=(await page.locator('.guest-course-heading').boundingBox())!,trail=(await page.locator('.guest-journey').boundingBox())!;return heading.y-trail.y-trail.height}).toBeGreaterThanOrEqual(0);
    await page.screenshot({path:'../work/guest-course-switch-'+test.info().project.name+'-'+preview+'.png'});await page.getByRole('button',{name:/Step 3 Drinks/}).click();
  }
  await appearance(page,false);
  await expect(page.getByRole('searchbox',{name:'Search menu'})).toHaveCount(0);
  const searchControl=(await page.getByRole('button',{name:'Search dishes',exact:true}).boundingBox())!,skipControl=(await page.locator('.guest-skip-course').boundingBox())!;expect(searchControl.x+searchControl.width).toBeLessThanOrEqual(skipControl.x);expect(Math.abs(searchControl.y-skipControl.y)).toBeLessThanOrEqual(1);
  await expect(page.locator('.guest-course-copy')).toHaveCSS('row-gap','6px');await expect(page.locator('.guest-course-copy>p')).toHaveCSS('line-height','18px');await expect(page.locator('.guest-skip-course')).toHaveCSS('background-color','rgb(25, 63, 48)');await expect(page.locator('.guest-skip-course')).toHaveCSS('color','rgb(255, 255, 255)');
  await page.getByRole('button',{name:'Search dishes',exact:true}).click();await expect(page.locator('.guest-dish-search-form')).toHaveCSS('padding','20px');await page.screenshot({path:'../work/guest-search-dialog-'+test.info().project.name+'.png'});await page.getByRole('searchbox',{name:'Search menu'}).fill('Mint');await page.getByRole('button',{name:'Show dishes',exact:true}).click();await expect(page.getByRole('button',{name:'Add Mint cooler',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Search dishes',exact:true}).click();await page.getByRole('button',{name:'Clear search',exact:true}).click();await page.getByRole('button',{name:'Show dishes',exact:true}).click();
  for(const width of [320,390,768]){
    await page.setViewportSize({width,height:844});
    const copyBox=(await page.locator('.guest-course-copy').boundingBox())!,actionsBox=(await page.locator('.guest-course-actions').boundingBox())!;expect(Math.abs(copyBox.y+copyBox.height/2-actionsBox.y-actionsBox.height/2)).toBeLessThanOrEqual(1);
    if(width===320){await page.getByRole('button',{name:'Search dishes',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Find a dish',exact:true});await expect(dialog).toBeVisible();const bounds=(await dialog.boundingBox())!;expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(width);await page.screenshot({path:'../work/guest-search-dialog-phone-'+test.info().project.name+'.png'});await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Search dishes',exact:true})).toBeFocused()}
    const titles=await page.locator('.guest-journey button>strong').evaluateAll(nodes=>nodes.map(e=>e.getBoundingClientRect().top));expect(Math.max(...titles)-Math.min(...titles)).toBeLessThanOrEqual(1);
    for(const step of await page.locator('.guest-journey button').all()){
      await expect(step.locator(':scope>.icon')).toBeVisible();for(const selector of ['.icon','span'])await expect(step.locator(':scope>'+selector)).toHaveCSS('top','15px');await expect(step.locator(':scope>strong')).toHaveCSS('top','15px');await expect(step.locator(':scope>span')).toHaveCSS('font-size','9px');await expect(step.locator(':scope>strong')).toHaveCSS('font-size',width<=480?'12px':'14px');
      const [icon,number,title]=await Promise.all(['.icon','span','strong'].map(async selector=>(await step.locator(':scope>'+selector).boundingBox())!));expect(icon.y+icon.height).toBeLessThanOrEqual(number.y);expect(number.y+number.height).toBeLessThanOrEqual(title.y);
    }
  }
  await page.getByRole('button',{name:'Add Mint cooler',exact:true}).click();await expect(page.getByRole('region',{name:'Floating cart',exact:true})).toBeVisible();
  for(const [width,height] of sizes){await fit(page,'QR cart',width,height);await expect(page.getByRole('region',{name:'Floating cart',exact:true})).toBeInViewport()}
  await page.getByRole('button',{name:/Step 1 Starter/}).click();await page.getByRole('button',{name:'Skip Starter',exact:true}).click();await expect(page.locator('.guest-course-copy h1')).toHaveText('Main course');await page.getByRole('button',{name:/Step 3 Drinks/}).click();await page.getByRole('button',{name:'Skip Drinks',exact:true}).click();await expect(page.getByRole('button',{name:/^Next ·/})).toHaveCount(0);
  await expect(page.locator('.guest-cart')).toHaveCount(0);await page.getByRole('region',{name:'Floating cart',exact:true}).getByRole('button',{name:'Order from cart',exact:true}).click();await expect(page.locator('.guest-journey')).toHaveCount(0);
  await page.setViewportSize({width:320,height:568});await fit(page,'Dessert checkout',320,568);await expect(page.getByLabel('Customer name',{exact:true})).toHaveCSS('font-size','16px');
  await expect(page.getByRole('region',{name:'Floating cart',exact:true})).toHaveCount(0);await expect(page.locator('.guest-cart')).toBeVisible();
  await page.screenshot({path:'../work/responsive-cart-'+test.info().project.name+'.png',fullPage:true});
});

test('sign-in and account forms preserve readable inputs and browser zoom',async({page})=>{
  for(const route of ['/signin','/signup','/superadmin/signin','/superadmin/setup']){
    await page.goto(route);for(const [width,height] of sizes)await fit(page,route,width,height);
    await page.setViewportSize({width:320,height:568});
    const viewport=await page.locator('meta[name=viewport]').getAttribute('content');expect(viewport).not.toMatch(/user-scalable=no|maximum-scale=1(?:,|$)/);
    for(const input of await page.locator('input:not([type=hidden]):not([type=checkbox]):not([type=radio])').all()){if(await input.isVisible())await expect(input).toHaveCSS('font-size','16px')}
  }
});

test('edge tools keep connected vertical tabs and fit without an outer scrolling popup',async({page})=>{
 await page.context().addCookies(cookies.owner);await page.goto('/app/overview');await expect(page.locator('.workspace-controls')).toBeVisible();await page.emulateMedia({reducedMotion:'reduce'});
 const tools=page.locator('.workspace-side-tabs'),calc=page.getByRole('region',{name:'Calculator',exact:true}),active=page.getByRole('region',{name:'Active orders',exact:true});
 for(const preview of [false,true]){await appearance(page,preview);for(const [width,height] of sizes){
  await page.setViewportSize({width,height});const mainY=await page.locator('.main-content').evaluate(el=>el.getBoundingClientRect().top+scrollY);await tools.locator('.calculator-dock .workspace-dock-trigger').click();await expect(calc).toBeVisible();
  await expect.poll(()=>calc.evaluate(el=>{const box=el.getBoundingClientRect(),trigger=el.parentElement!.querySelector('.workspace-dock-trigger')!.getBoundingClientRect();return Math.max(-box.x,box.right-innerWidth, -box.y,box.bottom-innerHeight,Math.abs(box.x-trigger.right)-2)})).toBeLessThanOrEqual(0);
  const box=(await calc.boundingBox())!;expect(Math.abs(box.width/box.height-280/600)).toBeLessThan(.002);await expect(calc.getByRole('button',{name:'Save note',exact:true})).toBeInViewport();expect(await calc.locator('.tool-panel-body').evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1);await expect(tools).toHaveCSS('position','fixed');await expect(tools).toHaveCSS('overflow','visible');expect(await page.locator('.main-content').evaluate(el=>el.getBoundingClientRect().top+scrollY)).toBe(mainY);
  await tools.locator('.active-orders-dock>.workspace-dock-trigger').click();await expect(active).toBeVisible();const connection=await active.evaluate(el=>{const box=el.getBoundingClientRect(),trigger=el.parentElement!.querySelector('.workspace-dock-trigger')!.getBoundingClientRect();return {gap:Math.abs(box.right-trigger.left),left:box.left,top:box.top,bottom:box.bottom}});expect(connection.gap).toBeLessThanOrEqual(1);expect(connection.left).toBeGreaterThanOrEqual(0);expect(connection.top).toBeGreaterThanOrEqual(0);expect(connection.bottom).toBeLessThanOrEqual(height);await fit(page,'connected edge tools',width,height);
  if(width===320||width===1440)await page.screenshot({path:'../work/connected-edge-tools-'+test.info().project.name+'-'+width+'-'+preview+'.png',animations:'disabled'});
  await active.getByRole('button',{name:'Minimize active orders',exact:true}).click();await calc.getByRole('button',{name:'Minimize calculator',exact:true}).click();await expect(calc).toHaveCount(0);await expect(active).toHaveCount(0);
 }}
});

test('published storefront and enterprise reporting remain fitted on phones and tablets',async({page})=>{
  await page.context().addCookies(cookies.owner);
  const workspace=await(await page.request.get('/api/workspace')).json();
  const store=workspace.storefronts.find((row:any)=>row.published);expect(store,'QA has a published storefront').toBeTruthy();
  await page.goto('/enterprise');await expect(page.getByRole('heading',{name:'Brand reports',exact:true})).toBeVisible();
  for(const [width,height] of sizes)await fit(page,'enterprise',width,height);
  await page.context().clearCookies();await page.goto('/store/'+store.slug);await expect(page.locator('.storefront')).toBeVisible();
  for(const [width,height] of sizes)await fit(page,'storefront',width,height);
  await page.screenshot({path:'../work/responsive-storefront-'+test.info().project.name+'.png',fullPage:true});
});


test('platform team header action retains readable contrast and access dialog',async({page})=>{
  await page.context().addCookies(cookies.admin);await page.goto('/superadmin');await navigateConsole(page,'Internal team');
  const button=page.getByRole('button',{name:'Grant access',exact:true});
  for(const preview of [false,true]){
    await appearance(page,preview);
    for(const width of [1440,390]){
      await page.setViewportSize({width,height:844});
      await expect(button).toHaveCSS('color','rgb(255, 255, 255)');await expect(button).toBeVisible();
      await button.hover();await expect(button).toHaveCSS('color','rgb(255, 255, 255)');await expect(button).toHaveCSS('background-color','rgb(29, 72, 54)');
      await button.click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'Close dialog',exact:true}).click();
      await page.screenshot({path:'../work/access-button-'+test.info().project.name+'-'+width+'-'+preview+'.png'});
    }
  }
});


test('cashier POS groups original categories under four courses and searches from the heading without losing its cart',async({page})=>{
  await page.context().addCookies(cookies.owner);await page.goto('/app/pos');
  const before=await(await page.request.get('/api/workspace')).json();const trail=page.getByRole('navigation',{name:'POS menu courses',exact:true}),categories=page.getByRole('group',{name:'Menu categories',exact:true});
  await expect(trail.locator('strong')).toHaveText(['Starter','Main course','Drinks','Dessert']);await expect(page.locator('.catalog>.search-box')).toHaveCount(0);
  await trail.getByRole('button',{name:/Step 2 Main course/}).click();await expect(categories.getByRole('button',{name:'Breads',exact:true})).toBeVisible();await expect(categories.getByRole('button',{name:'Beverages',exact:true})).toHaveCount(0);await categories.getByRole('button',{name:'Breads',exact:true}).click();await expect(page.locator('.menu-grid')).toContainText('Butter naan');await expect(page.locator('.menu-grid')).not.toContainText('Mint cooler');
  await trail.getByRole('button',{name:/Step 3 Drinks/}).click();await expect(categories.getByRole('button',{name:'Beverages',exact:true})).toBeVisible();const mint=page.locator('.menu-card').filter({has:page.getByText('Mint cooler',{exact:true})});await mint.getByRole('button',{name:'Increase quantity',exact:true}).click();await expect(page.getByLabel('Mint cooler quantity',{exact:true})).toHaveValue('1');
  for(const width of [1440,390,320]){
    await fit(page,'POS courses',width,844);const search=page.getByRole('button',{name:'Search menu',exact:true}),title=(await page.getByRole('heading',{name:'Cashier POS',exact:true}).boundingBox())!,icon=(await search.boundingBox())!;expect(icon.x).toBeGreaterThan(title.x+title.width);if(Number(before.stockCountStatus?.missingOpening)>0){const notice=(await page.locator('.page-heading-tools>.stock-count-reminder').boundingBox())!;if(await search.getAttribute('aria-expanded')==='false'){expect(icon.x-notice.x-notice.width).toBeLessThanOrEqual(9);expect(icon.x-notice.x-notice.width).toBeGreaterThanOrEqual(7);expect(Math.abs(icon.y+icon.height/2-notice.y-notice.height/2)).toBeLessThanOrEqual(1)}}
    if(!await page.getByRole('searchbox',{name:'Search menu',exact:true}).isVisible())await search.click();await expect(page.getByRole('dialog',{name:'Search menu',exact:true})).toHaveCount(0);await page.getByRole('searchbox',{name:'Search menu',exact:true}).fill('Butter');await expect(page.locator('.menu-grid')).toContainText('Butter naan');await expect(page.locator('.menu-grid')).not.toContainText('Mint cooler');await expect(page.getByLabel('Mint cooler quantity',{exact:true})).toHaveValue('1');await page.screenshot({path:'../work/pos-course-search-'+test.info().project.name+'-'+width+'.png'});
  }
  await categories.getByRole('button',{name:'All',exact:true}).click();await page.getByRole('searchbox',{name:'Search menu',exact:true}).fill('');await expect(page.locator('.menu-card')).toHaveCount(before.menu.filter((row:any)=>row.active).length);
  const after=await(await page.request.get('/api/workspace')).json();expect(after.orders).toEqual(before.orders);
});


test('both sidebar rails share one horizontal center and rounded square profile marks',async({page})=>{
 for(const role of ['owner','admin']){
  await page.context().clearCookies();await page.context().addCookies(cookies[role]);await page.setViewportSize({width:1440,height:1000});await page.goto(role==='owner'?'/app/overview':'/superadmin');
  const sidebar=page.locator(role==='owner'?'.sidebar':'.sa-sidebar');await expect(sidebar).toBeVisible();
  for(const preview of [false,true]){await appearance(page,preview);for(const width of [1440,1024,390,320]){
   await page.setViewportSize({width,height:1000});if(width<851)await page.getByRole('button',{name:'Open navigation',exact:true}).click();
   await expect(sidebar.locator(':scope>a,:scope>.sa-brand')).toHaveCSS('height','64px');
   await expect.poll(()=>sidebar.evaluate(side=>{const bounds=side.getBoundingClientRect(),parts=[...side.querySelectorAll(':scope>a>.logo>span,:scope>.sa-brand>.logo>span,:scope>.sa-brand>.sa-brand-caption')].map(el=>el.getBoundingClientRect()).filter(box=>box.width&&box.height);return Math.abs((Math.min(...parts.map(box=>box.left))+Math.max(...parts.map(box=>box.right)))/2-bounds.x-bounds.width/2)})).toBeLessThanOrEqual(1);
   await expect.poll(()=>sidebar.evaluate(side=>{const box=side.getBoundingClientRect(),mark=side.querySelector('.logomark')!.getBoundingClientRect(),first=side.querySelector('nav :is(a,button)')!.getBoundingClientRect();return Math.abs(mark.y-box.y-first.y+mark.bottom)}),{message:role+' logo spacing '+width+' preview '+preview}).toBeLessThanOrEqual(1);
   if(width===1440){
    await expect(sidebar).toHaveCSS('width','240px');const selected=sidebar.locator('nav [aria-current=page]');await expect(selected).toHaveCSS('background-color','rgb(255, 255, 255)');await expect(selected.locator(':scope>.icon')).toHaveCSS('width','26px');
    const layout=await sidebar.evaluate(side=>[...side.querySelectorAll('nav :is(a,button)')].map(row=>{const icon=row.querySelector(':scope>.icon')!.getBoundingClientRect(),label=row.querySelector(':scope>span:not(.nav-count):not(.sa-nav-active)')!.getBoundingClientRect();return{iconCenter:icon.x+icon.width/2,iconSize:icon.width,labelX:label.x,rowHeight:row.getBoundingClientRect().height,active:row.getAttribute('aria-current')==='page'}}));
    expect(Math.max(...layout.map(row=>row.iconCenter))-Math.min(...layout.map(row=>row.iconCenter))).toBeLessThanOrEqual(1);expect(Math.max(...layout.map(row=>row.labelX))-Math.min(...layout.map(row=>row.labelX))).toBeLessThanOrEqual(1);for(const row of layout){expect(row.rowHeight).toBe(48);expect(row.iconSize).toBe(row.active?26:22)}
    const hover=sidebar.locator('nav :is(a,button):not([aria-current=page])').first();await hover.hover();await expect(hover).toHaveCSS('background-color','rgba(255, 255, 255, 0.03)');await expect(hover).toHaveCSS('color','rgb(228, 238, 231)');await expect(hover.locator(':scope>.icon')).toHaveCSS('color','rgb(165, 191, 176)');await expect(selected).toHaveCSS('background-color','rgb(255, 255, 255)');await page.mouse.move(300,200);
    const curves=await selected.evaluate(el=>[getComputedStyle(el,'::before').backgroundImage,getComputedStyle(el,'::after').backgroundImage]);for(const curve of curves)expect(curve).toContain('radial-gradient');
   }
   if(width===1440||width===390)await page.screenshot({path:'../work/sidebar-brand-centered-'+role+'-'+test.info().project.name+'-'+width+'-'+preview+'.png',animations:'disabled'});
   if(role==='admin'&&width<851){const close=sidebar.getByRole('button',{name:'Close navigation',exact:true}),title=sidebar.locator('.sa-brand>.logo>span:last-child');expect((await title.boundingBox())!.x+(await title.boundingBox())!.width).toBeLessThanOrEqual((await close.boundingBox())!.x)}
   if(width<851){if(role==='owner')await page.locator('.sidebar-scrim').click({position:{x:width-16,y:120}});else await sidebar.getByRole('button',{name:'Close navigation',exact:true}).click()}
  }}
  await page.setViewportSize({width:1440,height:1000});const collapse=page.getByRole('button',{name:'Collapse navigation',exact:true});if(await collapse.isVisible())await collapse.click();
  for(const preview of [false,true]){await appearance(page,preview);await expect(sidebar).toHaveCSS('width','76px');await expect.poll(()=>sidebar.evaluate(side=>{const bounds=side.getBoundingClientRect(),center=bounds.x+bounds.width/2;return [...side.querySelectorAll('nav :is(a,button)>.icon,.logomark,.sidebar-profile-avatar')].map(el=>{const box=el.getBoundingClientRect();return Math.abs(box.x+box.width/2-center)})})).toEqual(expect.arrayContaining([expect.any(Number)]));const deltas=await sidebar.evaluate(side=>{const bounds=side.getBoundingClientRect(),center=bounds.x+bounds.width/2;return [...side.querySelectorAll('nav :is(a,button)>.icon,.logomark,.sidebar-profile-avatar')].map(el=>{const box=el.getBoundingClientRect();return Math.abs(box.x+box.width/2-center)})});expect(Math.max(...deltas)).toBeLessThanOrEqual(1);await expect(sidebar.locator('.sidebar-profile-avatar')).toHaveCSS('border-radius','8px');await sidebar.getByRole('button',{name:'Open profile',exact:true}).click();await expect(page.locator('.sidebar-profile-panel .sidebar-profile-avatar')).toHaveCSS('border-radius','8px');await page.getByRole('button',{name:'Close profile',exact:true}).click();await page.screenshot({path:'../work/sidebar-center-'+role+'-'+test.info().project.name+'-'+preview+'.png'})}
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Open navigation',exact:true}).click();const icons=await sidebar.locator('nav :is(a,button)>.icon').evaluateAll(nodes=>nodes.map(node=>{const box=node.getBoundingClientRect();return box.x+box.width/2}));expect(Math.max(...icons)-Math.min(...icons)).toBeLessThanOrEqual(1);await expect(sidebar.locator('.sidebar-profile-avatar')).toHaveCSS('border-radius','8px');await page.keyboard.press('Escape');
 }
});

test('POS search keeps the stock notice shape and centers its icon with an inside close control',async({page})=>{
 await page.context().addCookies(cookies.owner);await page.goto('/app/pos');
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:844});const trigger=page.getByRole('button',{name:'Search menu',exact:true}),notice=page.locator('.page-heading-tools>.stock-count-reminder');
  if(await trigger.getAttribute('aria-expanded')==='true')await trigger.click();await trigger.hover();const deltas=await trigger.evaluate(button=>{const box=button.getBoundingClientRect(),icon=button.querySelector('svg')!.getBoundingClientRect();return [Math.abs(box.x+box.width/2-icon.x-icon.width/2),Math.abs(box.y+box.height/2-icon.y-icon.height/2)]});expect(Math.max(...deltas)).toBeLessThanOrEqual(1);const before=await notice.boundingBox();await trigger.click();await expect(page.getByRole('searchbox',{name:'Search menu',exact:true})).toBeVisible();await expect.poll(async()=>Math.abs((await notice.boundingBox())!.width-before!.width)).toBeLessThanOrEqual(1);expect(Math.abs((await notice.boundingBox())!.height-before!.height)).toBeLessThanOrEqual(1);const field=(await page.locator('.pos-heading-search').boundingBox())!,close=(await trigger.boundingBox())!;expect(close.x).toBeGreaterThanOrEqual(field.x);expect(close.x+close.width).toBeLessThanOrEqual(field.x+field.width);if(width<500)expect((await notice.boundingBox())!.x).toBeLessThan(before!.x);await page.screenshot({path:'../work/pos-inline-search-final-'+test.info().project.name+'-'+width+'.png'});await page.getByRole('searchbox',{name:'Search menu',exact:true}).press('Escape');await expect(trigger).toBeFocused();
 }
});

test('floor dropdown edits the selected name with cancel, reload and table identity preserved',async({page})=>{
 await page.context().addCookies(cookies.owner);await page.goto('/app/floor-plan');const w=await(await page.request.get('/api/workspace')).json();expect(w.restaurant.id).toBe(fixture.tenantId);
 const command=async(action:string,input:any)=>{const response=await page.request.post('/api/commands',{headers:{Origin:base,'Idempotency-Key':randomUUID()},data:{action,input}}),body=await response.json();expect(response.ok(),JSON.stringify(body)).toBeTruthy();return body};
 let floor='Dropdown floor '+randomUUID().slice(0,7);await command('floor',{outletId:w.outletId,name:floor});const table=await command('table',{outletId:w.outletId,floor,label:'Rename '+randomUUID().slice(0,7),seats:2});await page.reload();const picker=page.getByLabel('Floor plan floor',{exact:true});await picker.selectOption(floor);const initial=(await(await page.request.get('/api/workspace')).json()).tables.find((row:any)=>row.id===table.id);
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:844});await page.getByRole('button',{name:'Edit floor name',exact:true}).click();let dialog=page.getByRole('dialog',{name:'Rename floor',exact:true});await expect(dialog.getByLabel('Floor name',{exact:true})).toHaveValue(floor);await expect(picker).toHaveValue(floor);await expect(picker).toHaveCSS('border-top-width','0px');await expect(picker).toHaveCSS('height','44px');const center=await page.locator('.floor-plan-picker').evaluate(group=>{const b=group.getBoundingClientRect(),icon=group.querySelector('button svg')!.getBoundingClientRect(),s=group.querySelector('select')!.getBoundingClientRect();return [Math.abs(icon.y+icon.height/2-b.y-b.height/2),Math.abs(s.y+s.height/2-b.y-b.height/2)]});expect(Math.max(...center)).toBeLessThanOrEqual(1);await dialog.getByRole('button',{name:'Close dialog',exact:true}).click();await expect(picker).toHaveValue(floor);
  await page.getByRole('button',{name:'Edit floor name',exact:true}).click();dialog=page.getByRole('dialog',{name:'Rename floor',exact:true});const renamed=floor+' '+width;await dialog.getByLabel('Floor name',{exact:true}).fill(renamed);await dialog.getByRole('button',{name:'Rename floor',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(picker).toHaveValue(renamed);await expect(page.getByLabel('Floor name tag',{exact:true})).toHaveText(renamed);await page.reload();await expect(picker).toHaveValue(renamed);floor=renamed;
  const saved=(await(await page.request.get('/api/workspace')).json()).tables.find((row:any)=>row.id===table.id);for(const property of ['id','label','seats','public_key','outlet_id'])expect(saved[property]).toEqual(initial[property]);expect(saved.floor).toBe(renamed);const edit=page.getByRole('button',{name:'Edit floor name',exact:true});await expect(edit.locator('..')).toHaveClass('floor-plan-picker');const group=(await edit.locator('..').boundingBox())!,icon=(await edit.boundingBox())!,select=(await picker.boundingBox())!;expect(Math.abs(icon.x-group.x-1)).toBeLessThanOrEqual(1);expect(icon.x+icon.width).toBeLessThanOrEqual(select.x+1);expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);await page.screenshot({path:'../work/floor-name-dropdown-'+test.info().project.name+'-'+width+'.png',animations:'disabled'});
 }
 await page.getByRole('button',{name:'Arrange',exact:true}).click();await expect(picker).toBeDisabled();await expect(page.getByRole('button',{name:'Edit floor name',exact:true})).toBeDisabled();await page.getByRole('button',{name:'Cancel',exact:true}).click();
});


test('sidebar expansion stays on its horizontal axis with synchronized content and reduced-motion support',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await page.emulateMedia({reducedMotion:'no-preference'});
 for(const role of ['owner','admin']){
  await page.context().clearCookies();await page.context().addCookies(cookies[role]);await page.goto(role==='owner'?'/app/overview':'/superadmin');const sidebar=page.locator(role==='owner'?'.sidebar':'.sa-sidebar');
  for(const preview of [false,true]){await appearance(page,preview);await expect(sidebar).toHaveCSS('width','240px');
   for(const collapse of [true,false]){
    const trigger=page.getByRole('button',{name:collapse?'Collapse navigation':'Expand navigation',exact:true});
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));const frames=await trigger.evaluate(async(button)=>{const side=document.querySelector('aside.curved-sidebar')!,main=document.querySelector('.main-shell,.sa-main')!,start=performance.now(),frames:{width:number,x:number,y:number,height:number,gap:number,centers:number[]}[]=[];(button as HTMLButtonElement).click();await new Promise<void>(resolve=>{const sample=()=>{const b=side.getBoundingClientRect(),m=main.getBoundingClientRect();frames.push({width:b.width,x:b.x,y:b.y,height:b.height,gap:m.x-b.right,centers:[side.querySelector('.logomark')!,...side.querySelectorAll('nav :is(a,button)>.icon'),side.querySelector('.sidebar-profile-avatar')!].map(el=>{const box=el.getBoundingClientRect();return box.y+box.height/2})});if(performance.now()-start<450)requestAnimationFrame(sample);else resolve()};requestAnimationFrame(sample)});return frames});
    expect(frames.some(frame=>frame.width>77&&frame.width<239),JSON.stringify({role,preview,collapse,frames})).toBeTruthy();for(const frame of frames){expect(Math.abs(frame.x)).toBeLessThanOrEqual(1);expect(Math.abs(frame.y-frames[0].y)).toBeLessThanOrEqual(1);expect(Math.abs(frame.height-frames[0].height)).toBeLessThanOrEqual(1);expect(Math.abs(frame.gap)).toBeLessThanOrEqual(1);for(let i=0;i<frame.centers.length;i++)expect(Math.abs(frame.centers[i]-frames[0].centers[i])).toBeLessThanOrEqual(1)}for(let i=1;i<frames.length;i++)expect(collapse?frames[i].width-frames[i-1].width:frames[i-1].width-frames[i].width).toBeLessThanOrEqual(1);await expect(sidebar).toHaveCSS('width',collapse?'76px':'240px');await expect(page.locator(role==='owner'?'.app-shell':'.sa-shell')).toHaveCSS('background-color','rgb(255, 255, 255)');await expect(page.locator(role==='owner'?'.main-shell':'.sa-main')).toHaveCSS('background-color','rgb(255, 255, 255)');await expect(sidebar.locator(':scope>nav')).toHaveCSS('row-gap','4px');for(const part of await sidebar.locator(':scope>a,:scope>.sa-brand,:scope>.sidebar-footer,:scope>.sidebar-profile,.sidebar-profile-row').all()){await expect(part).toHaveCSS('border-top-width','0px');await expect(part).toHaveCSS('border-bottom-width','0px')}await expect(sidebar.locator('.sidebar-profile-copy')).toHaveCSS('visibility',collapse?'hidden':'visible');await expect(sidebar.locator(':scope>a,:scope>.sa-brand')).toHaveCSS('background-color','rgb(18, 51, 41)');await expect(sidebar.locator(':scope>a,:scope>.sa-brand')).toHaveCSS('box-shadow','none');await expect(sidebar.locator(':scope>.sidebar-footer,:scope>.sidebar-profile')).toHaveCSS('box-shadow','none');await expect(sidebar.locator(':scope>.sidebar-footer,:scope>.sidebar-profile')).toHaveCSS('background-color','rgb(18, 51, 41)');await expect(sidebar.locator('.sidebar-profile-trigger')).toHaveCSS('justify-content','flex-start');const title=sidebar.locator(role==='owner'?':scope>a>.logo>span:last-child':'.sa-brand>.logo>span:last-child');await expect(title).toHaveCSS('display','block');await expect(title).toHaveCSS('opacity',collapse?'0':'1');
   }
  }
  await page.emulateMedia({reducedMotion:'reduce'});await expect(sidebar).toHaveCSS('transition-duration','0s');await page.getByRole('button',{name:'Collapse navigation',exact:true}).click();await expect(sidebar).toHaveCSS('width','76px');await page.getByRole('button',{name:'Expand navigation',exact:true}).click();await expect(sidebar).toHaveCSS('width','240px');await page.emulateMedia({reducedMotion:'no-preference'});
 }
});


test('menu selection fades its curved edges with the row and keeps expanded labels free of tooltips',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});
 for(const role of ['owner','admin']){
  await page.context().clearCookies();await page.context().addCookies(cookies[role]);await page.goto(role==='owner'?'/app/overview':'/superadmin');const sidebar=page.locator(role==='owner'?'.sidebar':'.sa-sidebar');await expect(sidebar).toHaveCSS('width','240px');
  const before=await sidebar.locator('nav :is(a,button)').evaluateAll(rows=>rows.map(row=>{const b=row.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height}}));
  for(const title of role==='owner'?['Cashier POS','Kitchen','Service','Payments']:['Restaurants','Feature controls','Plans & billing','Integrations']){
   const row=sidebar.getByRole(role==='owner'?'link':'button',{name:title,exact:true});await expect(row).not.toHaveAttribute('title');const old=sidebar.locator('nav [aria-current=page]');const oldName=await old.getAttribute('aria-label')??await old.innerText();await row.click();await expect(row).toHaveAttribute('aria-current','page');
   await expect.poll(()=>row.evaluate(el=>getComputedStyle(el,'::before').opacity)).toBe('1');await expect.poll(()=>row.evaluate(el=>getComputedStyle(el,'::after').opacity)).toBe('1');
   const layers=await row.evaluate(el=>({background:getComputedStyle(el).backgroundColor,corner:getComputedStyle(el,'::before').backgroundImage,fade:getComputedStyle(el,'::before').transitionDuration}));expect(layers.background).toBe('rgb(255, 255, 255)');expect(layers.corner).toContain('radial-gradient');expect(layers.fade).toBe('0.2s');
   const inactive=sidebar.locator('nav :is(a,button):not([aria-current=page])').first();await expect.poll(()=>inactive.evaluate(el=>getComputedStyle(el,'::before').opacity)).toBe('0');await expect(inactive).not.toHaveAttribute('aria-current','page');
   const after=await sidebar.locator('nav :is(a,button)').evaluateAll(rows=>rows.map(row=>{const b=row.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height}}));expect(after,oldName+' to '+title).toEqual(before);
  }
  await page.getByRole('button',{name:'Collapse navigation',exact:true}).click();await expect(sidebar).toHaveCSS('width','76px');const hidden=sidebar.locator(role==='owner'?':scope>a>.logo>span:last-child':'.sa-brand>.logo>span:last-child');await expect(hidden).toHaveCSS('visibility','hidden');await expect(hidden).toHaveCSS('opacity','0');await expect(sidebar.locator('.logo')).toHaveCSS('text-decoration-line','none');
 }
});
