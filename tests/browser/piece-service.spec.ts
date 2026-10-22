import { test, expect, type Page } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
async function register(page: Page) {
  if(process.env.QA_FIXTURE_FILE){const fixture=JSON.parse(await readFile(process.env.QA_FIXTURE_FILE,"utf8"));await page.goto("/signin");await page.getByLabel("Email",{exact:true}).fill(fixture.email);await page.getByLabel("Password",{exact:true}).fill(fixture.password);await page.getByRole("button",{name:"Sign in",exact:true}).click();await page.waitForURL("**/app/overview");return;}
  const state = process.env.QA_AUTH_STATE_FILE;
  if (state)
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
  if (!process.env.QA_BASE_URL)
    await page.setExtraHTTPHeaders({
      "x-forwarded-for": "10." + [...randomBytes(3)].join("."),
    });
  await page.goto("/signup");
  for (const [name, value] of [
    ["Your name", "Piece service QA"],
    ["Restaurant name", "Piece service isolated QA"],
    ["First outlet", "Main"],
    ["Email", `piece-service-${randomUUID()}@example.test`],
    ["Password", randomBytes(24).toString("base64url")],
  ])
    await page.getByLabel(name, { exact: true }).fill(value);
  await page.getByLabel("Customer QR ordering").selectOption("on");
  await page.getByLabel("Add a sample menu and 12 tables").press("Space");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.waitForURL("**/app/overview");
  if (state) await page.context().storageState({ path: state });
}
async function command(page: Page, action: string, input: unknown, extra = {}) {
  const reply = await page.request.post("/api/commands", {
    headers: {
      Origin: new URL(page.url()).origin,
      "Idempotency-Key": randomUUID(),
    },
    data: { action, input, ...extra },
  });
  const body = await reply.json();
  expect(reply.ok(), JSON.stringify(body)).toBe(true);
  return body;
}
const workspace = async (page: Page) =>
  (await page.request.get("/api/workspace")).json();

test('piece selling unit and ready-notification navigation preserve service and payment guards at desktop and phone sizes',async({page})=>{
 test.setTimeout(process.env.QA_BASE_URL?240000:180000);await register(page);let w=await workspace(page);
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===390?844:1000});
  const name='Piece QA '+width+' '+randomUUID().slice(0,6);
  const item=await command(page,'menu',{outletId:w.outletId,name,category:'Food',price:12000,taxBps:0,station:'Piece QA kitchen',unit:'portion',imageUrl:'/images/menu/samples/butter-naan.webp'});
  await page.goto('/app/menu');await page.getByLabel('Search dishes',{exact:true}).fill(name);
  const row=page.getByRole('row').filter({hasText:name});await row.getByRole('button',{name:'Edit',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByLabel('Sell by',{exact:true}).selectOption('piece');
  await expect(dialog.getByLabel('Sell by',{exact:true})).toHaveValue('piece');
  await dialog.screenshot({path:`verification/piece-menu-editor-${width}.png`});
  await dialog.getByRole('button',{name:'Save',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(row).toContainText('Per piece');
  w=await workspace(page);expect(w.menu.find((m:any)=>m.id===item.id).unit).toBe('piece');
  await page.goto('/app/pos');const card=page.locator('.menu-card').filter({has:page.getByText(name,{exact:true})});await card.locator('.dish-select').click();
  const quantity=page.locator('.cart-item').filter({has:page.getByText(name,{exact:true})}).getByRole('spinbutton');
  await expect(quantity).toHaveAttribute('min','1');await expect(quantity).toHaveAttribute('step','1');
  const order=await command(page,'createRound',{outletId:w.outletId,type:'TAKEAWAY',items:[{itemId:item.id,quantity:2}]});
  const rejected=await page.request.post('/api/commands',{headers:{Origin:new URL(page.url()).origin,'Idempotency-Key':randomUUID()},data:{action:'createRound',input:{outletId:w.outletId,type:'TAKEAWAY',items:[{itemId:item.id,quantity:1.5}]}}});expect(rejected.ok()).toBe(false);expect((await rejected.json()).error.code).toBe('WHOLE_QUANTITY_REQUIRED');
  const ticket=(await workspace(page)).tickets.find((t:any)=>t.order_id===order.id);
  await command(page,'kitchen',{state:'PREPARING'},{id:ticket.id});await command(page,'kitchen',{state:'READY'},{id:ticket.id});
  await page.getByRole('button',{name:/^Notifications/}).click();await expect(dialog).toBeVisible();
  await dialog.getByRole('button',{name:new RegExp('^Order ready #'+order.number+'(?: |$)')}).click();
  await expect(page).toHaveURL(/\/app\/tasks#ready-orders$/);await expect(dialog).toHaveCount(0);
  const service=page.locator('#ready-orders').getByRole('row').filter({has:page.getByLabel('Select order #'+order.number+' round 1',{exact:true})});
  await expect(service).toBeVisible();await expect(service.getByRole('button',{name:'Mark as served',exact:true})).toBeEnabled();
  const serveBox=await service.getByRole('button',{name:'Mark as served',exact:true}).boundingBox(),panelBox=await page.locator('#ready-orders').boundingBox();
  expect(serveBox!.x+serveBox!.width).toBeLessThanOrEqual(panelBox!.x+panelBox!.width-5);
  const before=await(await page.request.get('/api/orders/'+order.id)).json();expect(before.rounds[0].items[0].unit_snapshot).toBe('piece');expect(before.rounds[0].kot_status).toBe('READY');
  await page.screenshot({path:`verification/ready-notification-service-${width}.png`});
  await service.getByRole('button',{name:'Mark as served',exact:true}).click();await expect(service).toHaveCount(0);
  const after=await(await page.request.get('/api/orders/'+order.id)).json();expect(after.rounds[0].kot_status).toBe('SERVED');expect(after.totals).toEqual(before.totals);expect(after.rounds[0].payments).toEqual(before.rounds[0].payments);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});



