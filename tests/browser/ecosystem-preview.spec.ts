import {test,expect,type Page} from '@playwright/test';

async function open(page:Page){
 const api:string[]=[],errors:string[]=[];
 page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))api.push(r.method()+' '+new URL(r.url()).pathname)});
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',route=>route.abort());
 await page.goto('/design-preview/reference');
 await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
 await page.evaluate(()=>document.fonts.ready);
 return {api,errors};
}
async function navigate(page:Page,name:string){
 const desktop=page.getByRole('navigation',{name:'Preview navigation'}).getByRole('button',{name,exact:true});
 if((page.viewportSize()?.width??1440)>760)await desktop.click();
 else{await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('dialog',{name:'Navigation',exact:true}).getByRole('button',{name,exact:true}).click()}
 await expect(page.getByRole('heading',{name,exact:true,level:1})).toBeVisible();
}
test('preview sidebar, search, filters, sorting, card view and order drawer work without business requests',async({page})=>{
 const checks=await open(page);
 await expect(page.locator('.dp-sidebar')).toHaveCSS('background-color','rgb(23, 57, 44)');
 await expect(page.locator('.dp-topbar')).toHaveCSS('background-color','rgb(25, 63, 48)');
 const ratios=await page.evaluate(()=>{
  const luminance=(value:string)=>value.match(/[\d.]+/g)!.slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  return [['.dp-sidebar .dp-nav-group>span','.dp-sidebar'],['.dp-sidebar nav button:not([aria-current])','.dp-sidebar'],['.dp-sidebar nav button[aria-current]','.dp-sidebar nav button[aria-current]'],['.dp-breadcrumb>span','.dp-topbar']].map(([text,background])=>{const a=luminance(getComputedStyle(document.querySelector(text)!).color),b=luminance(getComputedStyle(document.querySelector(background)!).backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05)});
 });
 for(const ratio of ratios)expect(ratio).toBeGreaterThanOrEqual(4.5);
 await page.getByRole('button',{name:'Collapse navigation',exact:true}).click();
 await expect(page.getByRole('button',{name:'Expand navigation',exact:true})).toHaveAttribute('aria-expanded','false');
 await page.getByRole('button',{name:'Expand navigation',exact:true}).click();
 await page.keyboard.press('Control+k');await page.getByRole('searchbox',{name:'Find a preview screen'}).fill('orders');
 await page.getByRole('dialog').getByRole('button',{name:'Orders Workspace'}).click();
 await page.getByRole('button',{name:'Filters',exact:true}).click();
 await page.getByLabel('Preparing',{exact:true}).check();await page.getByRole('button',{name:'Apply filters'}).click();
 await expect(page.locator('.dp-order-row')).toHaveCount(2);
 await page.getByRole('combobox',{name:'Sort orders'}).selectOption('amount');
 await expect(page.locator('.dp-order-row').first()).toContainText('#246');
 await page.getByRole('button',{name:'Card view',exact:true}).click();await expect(page.locator('.dp-order-grid')).toBeVisible();
 await page.getByRole('searchbox',{name:'Search orders'}).fill('Arjun');await expect(page.locator('.dp-order-row')).toHaveCount(1);
 await page.locator('.dp-order-row').click();await expect(page.getByRole('dialog',{name:'Order #247'})).toContainText('₹385.00');
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();
 expect(checks.api).toEqual([]);expect(checks.errors).toEqual([]);
});
test('themed SweetAlert2 previews preserve order details, reward arithmetic and cancel-first confirmation',async({page})=>{
 const checks=await open(page);await navigate(page,'Alerts');
 await page.getByRole('button',{name:'Preview order placed',exact:true}).click();
 await expect(page.locator('.swal2-title')).toHaveText('Order placed');
 for(const text of ['Table 04','#248','Ananya','Round 1','Paneer tikka','Butter naan','₹530.00'])await expect(page.locator('.order-placed-summary')).toContainText(text);
 await page.getByRole('button',{name:'Done',exact:true}).click();
 await page.locator('.dp-alert-example').filter({has:page.getByRole('heading',{name:'Coupon applied',exact:true})}).click();
 await expect(page.getByLabel('Previous total',{exact:true})).toHaveText('₹530.00');await expect(page.getByLabel('Discounted total',{exact:true})).toHaveText('₹520.00');
 await page.getByRole('button',{name:'Done',exact:true}).click();
 await page.locator('.dp-alert-example').filter({has:page.getByRole('heading',{name:'Loyalty points claimed',exact:true})}).click();
 await expect(page.getByLabel('Discounted total',{exact:true})).toHaveText('₹510.00');await page.getByRole('button',{name:'Done',exact:true}).click();
 await page.locator('.dp-alert-example').filter({has:page.getByRole('heading',{name:'Confirmation',exact:true})}).click();
 await expect(page.getByRole('button',{name:'Cancel',exact:true})).toBeFocused();await page.keyboard.press('Escape');
 await expect(page.getByRole('status')).toContainText('cancelled');expect(checks.api).toEqual([]);expect(checks.errors).toEqual([]);
});
test('superadmin directory, staged upload and customer cart stay illustrative and send no commands',async({page})=>{
 const checks=await open(page);await page.getByLabel('Preview workspace',{exact:true}).selectOption('platform');await navigate(page,'Restaurants');
 await page.getByRole('searchbox',{name:'Search restaurants'}).fill('Terrace');await expect(page.locator('tbody tr')).toHaveCount(1);await expect(page.locator('tbody')).toContainText('Sample Terrace');
 await navigate(page,'Forms & uploads');await page.getByRole('button',{name:'Try upload dialog'}).click();
 const d=page.getByRole('dialog',{name:'Upload file'});await d.getByLabel('Choose a file',{exact:true}).setInputFiles({name:'sample.png',mimeType:'image/png',buffer:Buffer.from('local visual sample')});
 await expect(d.getByText('Ready to upload',{exact:true})).toBeVisible();await d.getByRole('button',{name:'Use sample file'}).click();
 await expect(page.getByRole('status')).toContainText('sends no files');
 await page.getByLabel('Preview workspace',{exact:true}).selectOption('customer');
 await page.getByRole('button',{name:'Add Paneer tikka',exact:true}).click();await page.getByRole('button',{name:'Add Paneer tikka',exact:true}).click();
 await page.getByRole('button',{name:'Sample cart (2)',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Sample cart'})).toContainText('₹440.00');await page.getByRole('button',{name:'Remove one Paneer tikka'}).click();
 await expect(page.locator('.dp-bill-total')).toContainText('₹220.00');await page.getByRole('dialog').getByRole('button',{name:'Preview order placed'}).click();
 await expect(page.locator('.swal2-title')).toHaveText('Order placed');await expect(page.locator('.order-placed-totals')).toContainText('₹220.00');
 await page.getByRole('button',{name:'Done',exact:true}).click();expect(checks.api).toEqual([]);expect(checks.errors).toEqual([]);
});
test('preview screens fit desktop, tablet and phone with visible navigation and themed alerts',async({page})=>{
 const checks=await open(page);
 for(const width of [1440,768,375]){
  await page.setViewportSize({width,height:960});await page.getByLabel('Preview workspace',{exact:true}).selectOption('restaurant');await expect(page.locator('.dd-design-preview')).toHaveAttribute('data-mode','restaurant');
  if(width===375){await page.getByRole('button',{name:'Open navigation',exact:true}).click();const nav=page.getByRole('dialog',{name:'Navigation',exact:true});await expect(nav).toHaveCSS('background-color','rgb(23, 57, 44)');await page.screenshot({path:'../work/ecosystem-preview-navigation-375.png',animations:'disabled'});await page.keyboard.press('Escape');await expect(nav).not.toBeVisible()}
  for(const screen of ['Overview','Orders','Explore','Menu','Cashier POS','Inventory','Kitchen','Reports','Forms & uploads','Alerts']){
   await navigate(page,screen);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),screen+' at '+width).toBeTruthy();
   if(['Overview','Orders','Alerts'].includes(screen))await page.screenshot({path:`../work/ecosystem-preview-${screen.toLowerCase()}-${width}.png`,animations:'disabled'});
  }
  await page.getByRole('button',{name:'Preview order placed',exact:true}).click();await expect(page.locator('.swal2-popup')).toBeInViewport();
  await expect(page.locator('.swal2-title')).toHaveText('Order placed');await page.screenshot({path:`../work/ecosystem-preview-alert-${width}.png`,animations:'disabled'});await page.getByRole('button',{name:'Done',exact:true}).click();
  await page.getByLabel('Preview workspace',{exact:true}).selectOption('platform');await expect(page.locator('.dd-design-preview')).toHaveAttribute('data-mode','platform');await navigate(page,'Restaurants');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.screenshot({path:`../work/ecosystem-preview-platform-${width}.png`,animations:'disabled'});
  await page.getByLabel('Preview workspace',{exact:true}).selectOption('customer');await expect(page.getByRole('heading',{name:'What sounds good today?'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:`../work/ecosystem-preview-customer-${width}.png`,animations:'disabled'});
 }
 expect(checks.api).toEqual([]);expect(checks.errors).toEqual([]);
});
