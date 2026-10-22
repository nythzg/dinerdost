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

test('simple inventory planning, expiry links and historical order ingredient drill-down work on desktop and phone',async({page})=>{
 test.setTimeout(300000);await register(page);const w=await workspace(page);
 const materialName='Plan flour '+randomUUID().slice(0,6); const material={...await command(page,'ingredient',{outletId:w.outletId,name:materialName,unit:'kg'}),name:materialName};
 await command(page,'receipt',{ingredientId:material.id,batchNumber:'PLAN-'+randomUUID().slice(0,6),quantityMilli:10000,unitCost:1000,reference:'Synthetic ingredient plan',expiresAt:new Date(Date.now()+72*3600000).toISOString()});
 const itemName='Plan dish '+randomUUID().slice(0,6); const item={...await command(page,'menu',{outletId:w.outletId,name:itemName,category:'Food',price:10000,taxBps:0,station:'Plan kitchen',unit:'piece',recipe:[{id:material.id,quantityMilli:250}]}),name:itemName};
 const order=await command(page,'createRound',{outletId:w.outletId,type:'TAKEAWAY',items:[{itemId:item.id,quantity:2}]});
 const snapshot=await(await page.request.get('/api/orders/'+order.id)).json();
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===390?844:1000});await page.goto('/app/inventory');
  await page.getByText('Inventory tools',{exact:true}).click();await page.getByRole('button',{name:'Plan ingredients',exact:true}).click();const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Planned dish 1',{exact:true}).selectOption(item.id);await dialog.getByLabel('Planned quantity 1',{exact:true}).fill('40');await dialog.getByRole('button',{name:'Calculate ingredients',exact:true}).click();
  const row=dialog.getByRole('row').filter({has:page.getByRole('cell',{name:material.name,exact:true})});await expect(row).toContainText('10 kg');await expect(row).toContainText('9.5 kg');await expect(row).toContainText('0.5 kg');
  const downloadPromise=page.waitForEvent('download');await dialog.getByRole('button',{name:'Export ingredient plan',exact:true}).click();expect((await downloadPromise).suggestedFilename()).toBe('ingredient-plan.csv');
  await page.screenshot({path:`verification/ingredient-plan-0418-${width}.png`});await page.getByLabel('Close dialog').click();
  await page.getByRole('button',{name:'Expiry & affected dishes',exact:true}).click();await dialog.getByLabel('Expiry ingredient',{exact:true}).selectOption(material.id);await expect(dialog).toContainText(item.name);await expect(dialog).toContainText('0.25 kg / piece');
  await dialog.getByRole('button',{name:'Refresh expiry status',exact:true}).click();await expect(dialog).toContainText(item.name);await page.screenshot({path:`verification/expiry-impact-0418-${width}.png`});await page.getByLabel('Close dialog').click();
  await page.goto('/app/orders/'+order.id);await page.getByRole('button',{name:'Ingredient usage',exact:true}).click();await expect(dialog).toContainText('Saved item costs');await expect(dialog).toContainText(material.name);
  await expect(dialog.getByRole('row').filter({has:page.getByRole('cell',{name:material.name,exact:true})}).last()).toContainText('0.5 kg');await expect(dialog).toContainText('₹5.00');await page.screenshot({path:`verification/order-ingredient-usage-0418-${width}.png`});await page.getByLabel('Close dialog').click();
  expect(await(await page.request.get('/api/orders/'+order.id)).json()).toEqual(snapshot);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});

