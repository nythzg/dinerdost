import { test, expect, type Page } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
async function register(page: Page) {
  const state = process.env.QA_AUTH_STATE_FILE;
  if (process.env.QA_FIXTURE_FILE) {
    const fixture = JSON.parse(await readFile(process.env.QA_FIXTURE_FILE, 'utf8'));
    await page.goto('/signin');
    await page.getByLabel('Email',{exact:true}).fill(fixture.email);
    await page.getByLabel('Password',{exact:true}).fill(fixture.password);
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await page.waitForURL('**/app/overview');
    if (state) await page.context().storageState({path:state});
    return;
  }
  if (state) {
    try {
      await page
        .context()
        .addCookies(JSON.parse(await readFile(state, "utf8")).cookies);
      await page.goto("/app/overview");
      await expect(
        page.getByRole("heading", { name: "Overview", exact: true }),
      ).toBeVisible();
      return;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }
  if (!process.env.QA_BASE_URL)
    await page.setExtraHTTPHeaders({
      "x-forwarded-for": "10." + [...randomBytes(3)].join("."),
    });
  await page.goto("/signup");
  for (const [name, value] of [
    ["Your name", "Header feedback QA"],
    ["Restaurant name", "Header feedback isolated QA"],
    ["First outlet", "Main"],
    ["Email", `header-${randomUUID()}@example.test`],
    ["Password", randomBytes(24).toString("base64url")],
  ])
    await page.getByLabel(name, { exact: true }).fill(value);
  await page.getByLabel("Customer QR ordering").selectOption("on");
  await page.getByLabel("Add a sample menu and 12 tables").press("Space");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.waitForURL("**/app/overview");
  if (state) await page.context().storageState({ path: state });
}
async function workspace(page: Page) {
  return (await page.request.get("/api/workspace")).json();
}
async function command(page: Page, action: string, input: unknown, extra = {}) {
  const response = await page.request.post("/api/commands", {
    headers: {
      Origin: new URL(page.url()).origin,
      "Idempotency-Key": randomUUID(),
    },
    data: { action, input, ...extra },
  });
  const body = await response.json();
  expect(response.ok(), JSON.stringify(body)).toBe(true);
  return body;
}

test('counter/filter layout, calculator persistence, active orders, dot grid and paid-round controls work on desktop and phone',async({page})=>{
 test.setTimeout(300000);await register(page);const w=await workspace(page);
 const order=await command(page,'createRound',{outletId:w.outletId,type:'TAKEAWAY',customer:{name:'Tools Guest',phone:'9123456769'},items:[{itemId:w.menu.find((m:any)=>m.name==='Mint cooler').id,quantity:1}]});
 const reviewed=await command(page,'reviewRewards',{}, {orderId:order.id,roundId:order.rounds[0].id});
 await command(page,'recordPayment',{version:reviewed.order.rounds[0].version,method:'CASH',amount:Number(reviewed.order.rounds[0].payable)},{orderId:order.id,roundId:order.rounds[0].id});
 for(const ticket of (await workspace(page)).tickets.filter((t:any)=>t.order_id===order.id))await command(page,'kitchen',{state:'PREPARING'},{id:ticket.id});
 const original=await(await page.request.get('/api/orders/'+order.id)).json();
 const calcTrigger=page.locator('.calculator-dock>.workspace-dock-trigger'),calc=page.getByRole('region',{name:'Calculator',exact:true}),activeTrigger=page.locator('.active-orders-dock>.workspace-dock-trigger'),active=page.getByRole('region',{name:'Active orders',exact:true});
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===390?844:1000});await page.goto('/app/orders');
  const counts=page.getByRole('group',{name:'Order counts',exact:true}),filters=page.getByRole('group',{name:'Filter orders',exact:true});
  await expect(counts.getByRole('button')).toHaveCount(8);await expect(filters.getByRole('button')).toHaveCount(8);
  const counterBox=await counts.boundingBox(),filterBox=await filters.boundingBox();expect(counterBox!.y+counterBox!.height).toBeLessThanOrEqual(filterBox!.y);
  const style=await counts.getByRole('button').first().evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}));expect(style.background).toMatch(/rgb\((25, 63, 48|40, 91, 69)\)/);expect(style.color).toBe('rgb(255, 255, 255)');
  await filters.getByRole('button',{name:'All orders',exact:true}).click();await expect(counts.locator('[data-view=All]')).toHaveAttribute('aria-pressed','true');
  expect(await filters.locator('[data-view=Active] span').evaluate(el=>getComputedStyle(el).color)).toBe('rgb(83, 102, 74)');
  await page.screenshot({path:`verification/orders-counters-0417-${width}.png`});
  if(await calcTrigger.getAttribute('aria-expanded')==='false')await calcTrigger.click();
  await calc.getByLabel('Calculation',{exact:true}).fill(`125*2+${width}`);await calc.getByRole('button',{name:'=',exact:true}).click();await calc.getByLabel('Calculation note',{exact:true}).fill('Tools note '+width);await calc.getByRole('button',{name:'Save note',exact:true}).click();await calc.getByRole('button',{name:'Show calculator history',exact:true}).click();
  const entry=calc.locator('.calculator-entry').filter({has:page.getByText(`125*2+${width}`,{exact:true})});await expect(entry).toContainText('= '+(250+width));await expect(entry.getByRole('textbox')).toHaveValue('Tools note '+width);
  await entry.getByRole('textbox').fill('Saved revised note '+width);await entry.getByRole('button',{name:'Save note',exact:true}).click();
  await page.locator('.topbar .status-dot').click({timeout:10000});await expect(calc).toBeVisible();
  await page.goto('/app/inventory');await expect(calc).toBeVisible();await page.reload();await expect(calc).toBeVisible();await calc.getByRole('button',{name:'Show calculator history',exact:true}).click();await expect(entry.getByRole('textbox')).toHaveValue('Saved revised note '+width);await calc.getByRole('button',{name:'Back to calculator',exact:true}).click();
  await calc.getByLabel('Calculation',{exact:true}).fill('1/0');await calc.getByRole('button',{name:'=',exact:true}).click();await expect(calc.getByRole('alert')).toHaveText('Cannot divide by zero.');
  await page.screenshot({path:`verification/calculator-0417-${width}.png`});
  await calc.getByRole('button',{name:'Minimize calculator',exact:true}).click();await expect(calc).toHaveCount(0);
  await activeTrigger.click();await expect(active).toBeVisible();const activeOrder=active.getByRole('link').filter({hasText:'#'+order.number+' · Takeaway'});await expect(activeOrder).toContainText('Preparing');await expect(activeOrder).toContainText('₹0.00');
  await page.screenshot({path:`verification/active-orders-0417-${width}.png`});await page.getByRole('heading',{name:'Inventory',exact:true}).click();await expect(active).toHaveCount(0);
  await activeTrigger.click();await activeOrder.click();await expect(page).toHaveURL(new RegExp('/app/orders/'+order.id+'$'));await expect(active).toHaveCount(0);
  const reallocate=page.getByRole('button',{name:'Reallocate',exact:true}),cancel=page.locator('.round-panel').getByRole('button',{name:'Cancel',exact:true});
  await expect(reallocate).toBeVisible();await expect(reallocate).toBeDisabled();await expect(cancel).toBeVisible();await expect(cancel).toBeDisabled();await expect(page.getByText('Cancel and Reallocate require a wholly unpaid order without unresolved payments.',{exact:true})).toBeVisible();
  const actionPositions=await page.locator('.round-panel button').evaluateAll(buttons=>buttons.map(button=>button.textContent?.trim()));expect(actionPositions.indexOf('Review loyalty')).toBeLessThan(actionPositions.indexOf('Reallocate'));expect(actionPositions.indexOf('Reallocate')).toBeLessThan(actionPositions.indexOf('Cancel'));expect(actionPositions.indexOf('Cancel')).toBeLessThan(actionPositions.indexOf('Clear all actions'));
  await page.screenshot({path:`verification/round-controls-0417-${width}.png`});expect(await(await page.request.get('/api/orders/'+order.id)).json()).toEqual(original);
  await page.goto('/app/floor-plan');const before=(await workspace(page)).floorPlans;await expect(page.locator('#floor-mapping-dots')).toBeAttached();await expect(page.locator('.floor-outline-boundary polygon').first()).toHaveAttribute('fill','url(#floor-mapping-dots)');await page.getByLabel('Fit floor to view',{exact:true}).click();await page.screenshot({path:`verification/floor-grid-0417-${width}.png`});expect((await workspace(page)).floorPlans).toEqual(before);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await calcTrigger.click();await calc.getByRole('button',{name:'Show calculator history',exact:true}).click();const entry=calc.locator('.calculator-entry').filter({has:page.getByText('125*2+390',{exact:true})});await entry.getByRole('button',{name:'Delete',exact:true}).click();await page.getByRole('dialog',{name:'Please confirm',exact:true}).getByRole('button',{name:'Delete calculation',exact:true}).click();await expect(entry).toHaveCount(0);await page.reload();await expect(entry).toHaveCount(0);
});

