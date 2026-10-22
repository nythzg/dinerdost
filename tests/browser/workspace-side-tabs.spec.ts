import {test,expect,type Page} from '@playwright/test';
import {randomBytes,randomUUID} from 'node:crypto';

async function register(page:Page){
 await page.setExtraHTTPHeaders({'x-forwarded-for':'10.'+[...randomBytes(3)].join('.')});await page.goto('/signup');
 for(const [name,value] of [['Your name','Side tabs QA'],['Restaurant name','Isolated side tabs QA'],['First outlet','Main'],['Email','side-tabs-'+randomUUID()+'@example.test'],['Password',randomBytes(24).toString('base64url')]])await page.getByLabel(name,{exact:true}).fill(value);
 await page.getByLabel('Customer QR ordering').selectOption('on');await page.getByLabel('Add a sample menu and 12 tables').press('Space');await page.getByRole('button',{name:'Create workspace',exact:true}).click();await page.waitForURL('**/app/overview');
}

test('expanded mobile navigation covers the menu button and keeps its logo and links clickable',async({page})=>{
 await register(page);
 const toggle=page.getByRole('button',{name:'Open navigation',exact:true}),sidebar=page.locator('#workspace-navigation');
 for(const [width,height] of [[390,844],[320,568],[844,390]]){
  await page.setViewportSize({width,height});await page.goto('/app/overview');
  const button=(await toggle.boundingBox())!;
  await toggle.click();await expect(sidebar).toHaveClass(/is-open/);
  await expect.poll(()=>page.evaluate(({x,y})=>!!document.elementFromPoint(x,y)?.closest('#workspace-navigation'),{x:button.x+button.width/2,y:button.y+button.height/2})).toBe(true);
  await page.screenshot({path:`verification/local-navigation-layer-${width}-${height}.png`});
  await sidebar.getByRole('link',{name:'Diner Dost home',exact:true}).click();await expect(sidebar).toHaveClass(/is-open/);
  await sidebar.getByRole('link',{name:'Orders',exact:true}).click();await page.waitForURL('**/app/orders');await expect(sidebar).not.toHaveClass(/is-open/);
  await toggle.click();await page.locator('.sidebar-scrim').click({position:{x:width-16,y:40}});await expect(sidebar).not.toHaveClass(/is-open/);await expect(toggle).toBeVisible();
 }
 await page.setViewportSize({width:1440,height:1000});await expect(toggle).toBeHidden();await expect(sidebar).toBeInViewport();
});
test('green right-edge tool tabs follow the header, stay reachable on small screens and open inward without blocking page controls',async({page})=>{
 await register(page);
 const calcTab=page.locator('.calculator-dock>.workspace-dock-trigger'),ordersTab=page.locator('.active-orders-dock>.workspace-dock-trigger');
 for(const [width,height] of [[1440,1000],[390,844],[320,568],[844,390]]){
  await page.setViewportSize({width,height});await page.goto('/app/overview');
  if(await calcTab.getAttribute('aria-expanded')==='true')await calcTab.click();
  const header=(await page.locator('.topbar').boundingBox())!,calculator=(await calcTab.boundingBox())!,orders=(await ordersTab.boundingBox())!;
  expect(calculator.x+calculator.width).toBe(width);expect(orders.x+orders.width).toBe(width);expect(calculator.width).toBe(32);expect(orders.width).toBe(32);
  expect(calculator.y).toBeGreaterThanOrEqual(header.y+header.height+7);expect(calculator.y).toBeLessThanOrEqual(header.y+header.height+10);expect(orders.y+orders.height).toBe(height-16);expect(calculator.y+calculator.height).toBeLessThan(orders.y);
  await expect(calcTab.locator('.workspace-tab-label')).toHaveCSS('writing-mode','vertical-rl');await expect(calcTab).toHaveCSS('background-color','rgb(25, 63, 48)');
  const primary=(await page.getByRole('link',{name:'New order',exact:true}).boundingBox())!;expect(primary.x+primary.width).toBeLessThanOrEqual(calculator.x);
  await page.screenshot({path:`verification/local-workspace-side-tabs-${width}-${height}.png`});
  await calcTab.focus();await page.keyboard.press('Enter');const calc=page.getByRole('region',{name:'Calculator',exact:true});await expect(calc).toBeVisible();const panel=(await calc.boundingBox())!;
  expect(panel.x).toBeGreaterThanOrEqual(8);expect(panel.x+panel.width).toBeLessThanOrEqual(width-40);expect(panel.y).toBeGreaterThanOrEqual(header.y+header.height);expect(panel.y+panel.height).toBeLessThanOrEqual(height-8);
  await calc.getByLabel('Calculation',{exact:true}).fill('200+10%');await calc.getByLabel('Calculation',{exact:true}).press('Enter');await expect(calc.getByLabel('Calculation result',{exact:true})).toHaveText('220');await expect(calc.getByRole('button',{name:'Save note',exact:true})).toBeEnabled();await page.screenshot({path:`verification/local-workspace-side-calculator-${width}-${height}.png`});
  await page.locator('.topbar .status-dot').click();await expect(calc).toBeVisible();await calcTab.click();await expect(calc).toHaveCount(0);
  await ordersTab.focus();await page.keyboard.press('Enter');const active=page.getByRole('region',{name:'Active orders',exact:true});await expect(active).toBeVisible();const activeBox=(await active.boundingBox())!;
  expect(activeBox.x).toBeGreaterThanOrEqual(8);expect(activeBox.x+activeBox.width).toBeLessThanOrEqual(width-40);expect(activeBox.y).toBeGreaterThanOrEqual(header.y+header.height);expect(activeBox.y+activeBox.height).toBeLessThanOrEqual(height-8);await page.screenshot({path:`verification/local-workspace-side-orders-${width}-${height}.png`});await page.keyboard.press('Escape');await expect(active).toHaveCount(0);
  await ordersTab.click();await expect(active).toBeVisible();await page.getByRole('heading',{name:'Overview',exact:true}).click();await expect(active).toHaveCount(0);
  await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await expect(calcTab).toBeInViewport();await expect(ordersTab).toBeInViewport();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});
