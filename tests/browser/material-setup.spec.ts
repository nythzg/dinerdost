import { test, expect, type Page } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
test.use({actionTimeout:15000});
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

test('material metadata, category/code search and buying-pack receiving stay simple and exact at desktop and phone sizes',async({page})=>{
 test.setTimeout(300000);await register(page);const w=await workspace(page);
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===390?844:1000});const name='Pack flour '+width+' '+randomUUID().slice(0,6),code='RM-'+width+'-'+randomUUID().slice(0,4);
  const ingredient=await command(page,'ingredient',{outletId:w.outletId,name,unit:'kg'});await page.goto('/app/inventory');await page.getByLabel('Search materials',{exact:true}).fill(name);
  const row=page.getByRole('row').filter({has:page.getByRole('button',{name:'Material setup for '+name,exact:true})});await expect(row).toHaveCount(1);await row.getByRole('button',{name:'Material setup for '+name,exact:true}).click();const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Material category',{exact:true}).fill('Dry goods');await dialog.getByLabel('Material code',{exact:true}).fill(code);await dialog.getByLabel('Material HSN',{exact:true}).fill('TEST-REFERENCE');await dialog.getByRole('button',{name:'Add buying pack',exact:true}).click();await dialog.getByLabel('Pack name 1',{exact:true}).fill('Bag');await dialog.getByLabel('Pack contains 1',{exact:true}).fill('5');await dialog.getByText('Preparation reference (optional)',{exact:true}).click();await dialog.getByLabel('Measured usable yield (%)',{exact:true}).fill('80');
  await page.screenshot({path:`verification/material-setup-0419-${width}.png`});await dialog.getByRole('button',{name:'Save material setup',exact:true}).click();await expect(dialog).toHaveCount(0);
  await page.getByLabel('Search materials',{exact:true}).fill(code);await page.getByLabel('Filter material category',{exact:true}).selectOption('c:Dry goods');await expect(row).toContainText(code);await expect(row).toContainText('TEST-REFERENCE');
  await row.getByRole('button',{name:'Receive',exact:true}).click();const state=await workspace(page),pack=state.purchasePacks.find((pack:any)=>pack.ingredient_id===ingredient.id);await dialog.getByLabel('Buying unit',{exact:true}).selectOption(pack.id);await dialog.getByLabel('Batch / lot number',{exact:true}).fill('PACK-'+randomUUID().slice(0,6));await dialog.getByLabel('Quantity',{exact:true}).fill('2');await dialog.getByLabel('Cost per pack (₹)',{exact:true}).fill('125.55');const day=new Date(Date.now()+72*3600000).toISOString().slice(0,10);await dialog.getByLabel('Expiry (India time) date',{exact:true}).fill(day);await dialog.getByLabel('Expiry (India time) time',{exact:true}).fill('20:00');await dialog.getByLabel('Invoice / GRN reference',{exact:true}).fill('Synthetic pack invoice');await expect(dialog).toContainText('Adds 10 kg. Total receipt cost ₹251.10.');
  await page.screenshot({path:`verification/pack-receipt-0419-${width}.png`});await dialog.getByRole('button',{name:'Receive stock',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(row).toContainText('10 kg');await expect(row).toContainText('₹251.10');
  const after=await workspace(page),batch=after.batches.find((batch:any)=>batch.ingredient_id===ingredient.id);expect(Number(batch.on_hand)).toBe(10000);expect(Number(batch.remaining_value)).toBe(25110);expect(batch.purchase_pack_snapshot.name).toBe('Bag');expect(after.ingredients.find((item:any)=>item.id===ingredient.id).unit).toBe('kg');
  await page.screenshot({path:`verification/material-list-0419-${width}.png`});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});

test('ready-food selected card text is readable and floor-only tint is 25 percent with all objects and geometry intact',async({page})=>{
 test.setTimeout(300000);await register(page);const w=await workspace(page),item=w.menu.find((item:any)=>item.name==='Mint cooler'&&!item.ready_food_batch_id);let source=await command(page,'createRound',{outletId:w.outletId,type:'TAKEAWAY',customer:{name:'Visual Ready Guest',phone:'9123456784'},items:[{itemId:item.id,quantity:2}]});
 for(const ticket of (await workspace(page)).tickets.filter((ticket:any)=>ticket.order_id===source.id)){await command(page,'kitchen',{state:'PREPARING'},{id:ticket.id});await command(page,'kitchen',{state:'READY'},{id:ticket.id})}
 source=await(await page.request.get('/api/orders/'+source.id)).json();await command(page,'cancelPrepared',{version:source.rounds[0].version,reason:'Synthetic ready food retained',reallocate:true,useBy:new Date(Date.now()+7200000).toISOString()},{orderId:source.id,roundId:source.rounds[0].id});
 const guestTable=w.tables.find((t:any)=>!t.is_occupied);expect(guestTable).toBeTruthy();await command(page,'openSession',{tableId:guestTable.id,guests:1});
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===390?844:1000});await page.goto('/app/floor-plan');const before=(await workspace(page)).floorPlans;
  const tint=page.locator('.floor-background-tint');await expect(tint).toHaveAttribute('fill-opacity','0.25');await expect(page.locator('.floor-outline-boundary')).not.toHaveCSS('opacity','0.25');await expect(page.locator('.plan-table').first()).toHaveCSS('opacity','1');await page.getByLabel('Fit floor to view',{exact:true}).click();await page.screenshot({path:`verification/floor-tint-0419-${width}.png`});expect((await workspace(page)).floorPlans).toEqual(before);
  await page.goto('/q/'+guestTable.public_key);await page.getByRole('button',{name:'Menu',exact:true}).click();await page.getByRole('navigation',{name:'Dining journey'}).getByRole('button',{name:/Main course/}).click();const card=page.locator('.guest-menu article').filter({has:page.locator('.ready-food-tag')}).first();await card.getByRole('button',{name:'Add '+item.name,exact:true}).click();await expect(card).toHaveClass('is-added');const badge=card.locator('.ready-food-tag');await expect(badge).toHaveCSS('color','rgb(255, 255, 255)');await expect(badge).toHaveCSS('background-color','rgb(16, 45, 34)');await expect(card.locator('h3')).toHaveCSS('color','rgb(255, 255, 255)');await expect(card).not.toContainText('Use by');await expect(card).not.toContainText('Prepared portions available now');await page.screenshot({path:`verification/ready-food-contrast-0419-${width}.png`});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});

