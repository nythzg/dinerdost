import {test,expect,type Page} from '@playwright/test';
import {randomBytes,randomUUID} from 'node:crypto';

test.use({actionTimeout:15000});
async function register(page:Page){
 await page.setExtraHTTPHeaders({'x-forwarded-for':'10.'+[...randomBytes(3)].join('.')});await page.goto('/signup');
 for(const [name,value] of [['Your name','Order alert QA'],['Restaurant name','Order alert isolated QA'],['First outlet','Main'],['Email','order-alert-'+randomUUID()+'@example.test'],['Password',randomBytes(24).toString('base64url')]])await page.getByLabel(name,{exact:true}).fill(value);
 await page.getByLabel('Customer QR ordering').selectOption('on');await page.getByLabel('Add a sample menu and 12 tables').press('Space');await page.getByRole('button',{name:'Create workspace',exact:true}).click();await page.waitForURL('**/app/overview');
}
async function workspace(page:Page){return(await page.request.get('/api/workspace')).json()}
async function command(page:Page,action:string,input:unknown,extra={}){const response=await page.request.post('/api/commands',{headers:{Origin:new URL(page.url()).origin,'Idempotency-Key':randomUUID()},data:{action,input,...extra}}),body=await response.json();expect(response.ok(),JSON.stringify(body)).toBe(true);return body}
const money=(amount:unknown)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(Number(amount)/100);
const alert=(page:Page)=>page.getByRole('dialog',{name:'Order placed',exact:true});
async function summary(page:Page,order:any,width:number,kind:string){
 const popup=alert(page);await expect(popup).toBeVisible();await expect(popup).toHaveCSS('opacity','1');await expect(popup.getByRole('button',{name:'Done',exact:true})).toBeFocused();
 await expect(popup).toContainText('#'+order.number);const round=order.rounds.at(-1);await expect(popup).toContainText(round.items[0].name);await expect(popup).toContainText('Grand total');await expect(popup.locator('.order-placed-summary dt')).toHaveText(['Table / type','Order no.','Customer','Grand total']);await expect(popup).not.toContainText('Subtotal');await expect(popup).not.toContainText('Payment');
 const box=(await popup.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
 await expect(popup.locator('.order-placed-summary')).toHaveCSS('color','rgb(36, 52, 44)');await expect(popup.locator('.order-placed-summary img')).toHaveCount(0);
 await page.screenshot({path:`verification/local-order-placed-${kind}-${width}.png`,animations:'disabled'});
 const active=order.rounds.filter((entry:any)=>!['VOIDED','REJECTED'].includes(entry.status)),total=active.reduce((sum:number,entry:any)=>sum+Number(entry.payable),0);
 const amounts=popup.locator('.order-placed-totals dd');await expect(amounts).toHaveCount(1);await expect(amounts).toHaveText(money(total));await popup.locator('.order-placed-totals').scrollIntoViewIfNeeded();await expect(popup.getByRole('button',{name:'Done',exact:true})).toBeInViewport();
 await page.screenshot({path:`verification/local-order-placed-${kind}-totals-${width}.png`,animations:'disabled'});
}

test('staff takeaway, table orders, added rounds and submitted drafts show saved order details; failures and draft saves do not',async({page})=>{
 test.setTimeout(180000);await register(page);const w=await workspace(page),item=w.menu.find((entry:any)=>entry.name==='Mint cooler');
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===390?844:1000});await page.goto('/app/pos');await page.getByLabel('Search menu',{exact:true}).fill(item.name);await page.locator('.menu-card').getByRole('button',{name:'Increase quantity',exact:true}).click();
  await page.route('**/api/commands',route=>route.request().postDataJSON()?.action==='createRound'?route.fulfill({status:409,json:{error:{code:'QA_REJECTION',message:'Synthetic order rejected'}}}):route.continue());
  await page.getByRole('button',{name:'Create order',exact:true}).click();await expect(page.getByText('Synthetic order rejected',{exact:true})).toBeVisible();await expect(alert(page)).toHaveCount(0);await expect(page.getByLabel(item.name+' quantity',{exact:true})).toHaveValue('1');await page.unroute('**/api/commands');
  const before=(await workspace(page)).orders.length;await page.getByRole('button',{name:'Create order',exact:true}).click();await page.waitForURL('**/app/orders/*');let order=await(await page.request.get('/api/orders/'+page.url().split('/').at(-1))).json();await summary(page,order,width,'staff');expect((await workspace(page)).orders.length).toBe(before+1);await alert(page).press('Escape');await page.reload();await expect(alert(page)).toHaveCount(0);
  const session=await command(page,'openSession',{tableId:w.tables[width===1440?0:1].id,guests:1});
  await page.goto('/app/pos?session='+session.id);await page.getByLabel('Search menu',{exact:true}).fill(item.name);await page.locator('.menu-card').getByRole('button',{name:'Increase quantity',exact:true}).click();await page.getByRole('button',{name:'Create order',exact:true}).click();await page.waitForURL('**/app/orders/*');order=await(await page.request.get('/api/orders/'+page.url().split('/').at(-1))).json();await summary(page,order,width,'table');await expect(alert(page)).toContainText(w.tables[width===1440?0:1].label);await alert(page).getByRole('button',{name:'Done',exact:true}).click();
  const previous=order;await page.goto('/app/pos?order='+order.id+'&version='+order.version+'&session='+session.id);await page.getByLabel('Search menu',{exact:true}).fill(item.name);await page.locator('.menu-card').getByRole('button',{name:'Increase quantity',exact:true}).click();await page.getByRole('button',{name:'Create order',exact:true}).click();await page.waitForURL('**/app/orders/*');order=await(await page.request.get('/api/orders/'+previous.id)).json();expect(order.rounds.length).toBe(2);expect(order.rounds[0].items).toEqual(previous.rounds[0].items);await summary(page,order,width,'added-round');await expect(alert(page).getByRole('heading',{name:/Round 2/})).toBeVisible();await alert(page).getByRole('button',{name:'Done',exact:true}).click();
  await page.goto('/app/pos');await page.getByLabel('Search menu',{exact:true}).fill(item.name);await page.locator('.menu-card').getByRole('button',{name:'Increase quantity',exact:true}).click();await page.getByRole('button',{name:'Save as draft',exact:true}).click();await page.waitForURL('**/app/orders/*');await expect(alert(page)).toHaveCount(0);await page.getByRole('button',{name:'Edit & submit draft',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Save & submit',exact:true}).click();order=await(await page.request.get('/api/orders/'+page.url().split('/').at(-1))).json();await summary(page,order,width,'draft');await alert(page).getByRole('button',{name:'Done',exact:true}).click();
  await page.goto('/app/pos');await page.getByLabel('Order type',{exact:true}).selectOption('DELIVERY');await page.getByLabel('Search menu',{exact:true}).fill(item.name);await page.locator('.menu-card').getByRole('button',{name:'Increase quantity',exact:true}).click();const deliveryBefore=(await workspace(page)).orders.length;await page.getByRole('button',{name:'Create order',exact:true}).evaluate(element=>{(element as HTMLButtonElement).click();(element as HTMLButtonElement).click()});await page.waitForURL('**/app/orders/*');order=await(await page.request.get('/api/orders/'+page.url().split('/').at(-1))).json();await summary(page,order,width,'delivery');await expect(alert(page)).toContainText('Delivery');expect((await workspace(page)).orders.length).toBe(deliveryBefore+1);await alert(page).getByRole('button',{name:'Done',exact:true}).click();
 }
});

test('customer QR and storefront confirmations show only requested order details and saved prices without leaking other visits',async({page,browser})=>{
 test.setTimeout(180000);await register(page);const w=await workspace(page);
 await command(page,'menu',{outletId:w.outletId,name:'Order alert dish',category:'QA Food',price:19999,taxBps:500,station:'QA Kitchen',unit:'portion',variants:[{id:'large',name:'Large',price:5000}],modifiers:[{id:'extra',name:'Extra sauce',price:1500}]});
 await command(page,'menu',{outletId:w.outletId,name:'Fractional QA item',category:'QA Food',price:100,taxBps:0,station:'QA Kitchen',unit:'kg'});
 const brand=await command(page,'record',{outletId:w.outletId,title:'Order alert store',data:{description:'Synthetic QA store',active:true}},{kind:'brands'}),slug='order-alert-'+randomUUID();await command(page,'storefront',{outletId:w.outletId,brandId:brand.id,slug,published:true});
 for(const width of [1440,390])for(const kind of ['qr','store']){
  const context=await browser.newContext({viewport:{width,height:width===390?844:1000}}),customer=await context.newPage();
  const table=w.tables[width===1440?2:3];if(kind==='qr')await command(page,'openSession',{tableId:table.id,guests:1});
  const path=kind==='qr'?'/q/'+table.public_key:'/store/'+slug;await customer.goto(new URL(path,page.url()).href);
  if(kind==='qr')await customer.locator('.guest-menu-tile').click();
  await customer.getByLabel('Search menu',{exact:true}).fill('Order alert dish');
  if(kind==='qr')await customer.getByRole('button',{name:'Add Order alert dish',exact:true}).click();else await customer.getByRole('button',{name:'Add',exact:true}).click();
  await customer.getByLabel('Variant',{exact:true}).selectOption('large');await customer.getByLabel('Extra sauce',{exact:true}).check();await customer.getByLabel('Quantity',{exact:true}).fill('2');await customer.getByLabel('Kitchen note',{exact:true}).fill('<img src=x onerror=alert(1)> no chilli');await customer.getByRole('dialog').getByRole('button',{name:/^Add ·/}).click();
  await customer.getByLabel('Search menu',{exact:true}).fill('Fractional QA item');await customer.getByRole('button',{name:kind==='qr'?'Add Fractional QA item':'Add',exact:true}).click();await customer.getByLabel('Quantity',{exact:true}).fill('0.145');await customer.getByRole('dialog').getByRole('button',{name:/^Add ·/}).click();
  if(kind==='store')await customer.getByRole('button',{name:/^Takeaway ·/}).click();
  await customer.getByLabel(kind==='qr'?'Customer name':'Name',{exact:true}).fill('Order alert guest');await customer.getByLabel(kind==='qr'?'Customer phone':'Phone',{exact:true}).fill('9123456787');
  const endpoint=kind==='qr'?'/api/guest/'+table.public_key:'/api/store/'+slug;let reject=true,refreshFailure=false;
  await customer.route('**'+endpoint,async route=>{
   if(route.request().method()==='POST'&&route.request().postDataJSON()?.action==='order'){
    if(reject){reject=false;await route.fulfill({status:409,json:{error:{code:'QA_REJECTION',message:'Synthetic customer order rejected'}}});return}
    refreshFailure=true;
   }else if(route.request().method()==='GET'&&refreshFailure){refreshFailure=false;await route.fulfill({status:503,json:{error:{code:'QA_REFRESH',message:'Synthetic refresh unavailable'}}});return}
   await route.continue();
  });
  await customer.getByRole('button',{name:kind==='qr'?/^Place order ·/:/^Send order ·/}).click();await expect(customer.getByText('Synthetic customer order rejected',{exact:true}).first()).toBeVisible();await expect(alert(customer)).toHaveCount(0);
  await customer.getByRole('button',{name:kind==='qr'?/^Place order ·/:/^Send order ·/}).click();
  const popup=alert(customer);await expect(popup).toBeVisible();await expect(popup).not.toContainText('Waiting for staff acceptance.');await expect(popup).not.toContainText('<img src=x onerror=alert(1)> no chilli');await expect(popup).not.toContainText('9123456787');await expect(popup).toContainText('Order alert guest');await expect(popup).toContainText('0.145 kg × ₹1.00 = ₹0.15');
  const catalog=await(await customer.request.get(kind==='qr'?'/api/guest/'+table.public_key:'/api/store/'+slug)).json(),order=kind==='qr'?catalog.order:catalog.orders[0];await summary(customer,order,width,kind);await popup.getByRole('button',{name:'Done',exact:true}).click();await customer.reload();await expect(alert(customer)).toHaveCount(0);
  const strangerContext=await browser.newContext(),stranger=await strangerContext.newPage();await stranger.goto(new URL(path,page.url()).href);const strangerData=await(await stranger.request.get(kind==='qr'?'/api/guest/'+table.public_key:'/api/store/'+slug)).json();expect(kind==='qr'?strangerData.order:strangerData.orders.length).toBe(kind==='qr'?null:0);await strangerContext.close();await context.close();
 }
});
