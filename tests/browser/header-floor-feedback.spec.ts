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

test("order header clear/table label and fixture contrast work at desktop and phone sizes without clearing later visits", async ({page}) => {
  test.setTimeout(process.env.QA_BASE_URL ? 300000 : 240000);
  await register(page);
  const w=await workspace(page);
  for (const width of [1440,390]) {
    await page.setViewportSize({width,height:width===390?844:1000});
    const visits:{tableId:string;id:string;label:string}[]=[];
    for(const suffix of ['A','B']){
      const label='Header '+width+suffix+' '+randomUUID().slice(0,4);
      const table=await command(page,'table',{outletId:w.outletId,label,seats:4,floor:'Main floor'});
      const session=await command(page,'openSession',{tableId:table.id,guests:2});visits.push({tableId:table.id,id:session.id,label});
    }
    const [a,b]=visits;
    await command(page,'merge',{parentId:a.id,childId:b.id,reason:'Synthetic combined guest party'});
    const order=await command(page,'createRound',{outletId:w.outletId,sessionId:a.id,type:'DINE_IN',customer:{name:'Header Guest',phone:'9123456764'},items:[{itemId:w.menu.find((m:any)=>m.name==='Mint cooler').id,quantity:1}]});
    const blocked=await command(page,'createRound',{outletId:w.outletId,sessionId:b.id,type:'DINE_IN',draft:true,items:[{itemId:w.menu[0].id,quantity:1}]});
    const reviewed=await command(page,'reviewRewards',{}, {orderId:order.id,roundId:order.rounds[0].id});
    await command(page,'recordPayment',{version:reviewed.order.rounds[0].version,method:'CASH',amount:Number(reviewed.order.rounds[0].payable)},{orderId:order.id,roundId:order.rounds[0].id});
    for(const ticket of (await workspace(page)).tickets.filter((t:any)=>t.order_id===order.id)){
      await command(page,'kitchen',{state:'PREPARING'},{id:ticket.id});await command(page,'kitchen',{state:'READY'},{id:ticket.id});
    }
    await command(page,'serve',{}, {orderId:order.id,roundId:order.rounds[0].id});
    await command(page,'bill',{final:true},{orderId:order.id});
    await page.goto('/app/orders/'+order.id);
    const heading=page.locator('.order-table-heading');await expect(heading).toHaveText('Table '+a.label);
    expect(await heading.evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(24);
    const headingBox=await heading.boundingBox(),titleBox=await page.getByRole('heading',{name:'Order details',exact:true}).boundingBox();expect(headingBox!.y).toBeGreaterThanOrEqual(titleBox!.y+titleBox!.height);
    const clear=page.getByRole('button',{name:'Clear table',exact:true}),invoice=page.getByRole('button',{name:'Invoice',exact:true});
    await expect(invoice).toBeVisible();await expect(clear).toHaveCount(1);await expect(clear).toBeDisabled();
    expect(await invoice.evaluate(el=>el.nextElementSibling?.textContent)).toContain('Clear table');
    await command(page,'void',{version:blocked.rounds[0].version,reason:'Synthetic draft cancelled'},{orderId:blocked.id,roundId:blocked.rounds[0].id});await page.reload();
    await expect(clear).toBeEnabled();
    await page.screenshot({path:`verification/order-header-clear-${width}.png`});
    await page.goto('/app/table-billing/'+a.tableId);await expect(clear).toHaveCount(1);await expect(page.locator('.detail-toolbar').getByRole('button',{name:'Clear table',exact:true})).toBeEnabled();
    const old=(await(await page.request.get('/api/orders/'+order.id)).json());
    await clear.click();await expect(page.getByRole('dialog')).toContainText('Makes the table available for new customers. Existing bills are kept.');await page.getByLabel('Close dialog').click();
    expect((await workspace(page)).sessions.some((s:any)=>s.id===a.id)).toBe(true);
    await clear.click();await page.getByRole('dialog').getByRole('button',{name:'Clear table',exact:true}).click();await expect(page).toHaveURL(/\/app\/floor$/);
    const cleared=await workspace(page);for(const visit of visits)expect(cleared.sessions.some((s:any)=>s.id===visit.id)).toBe(false);
    const next=await command(page,'openSession',{tableId:a.tableId,guests:1});
    await page.goto('/app/orders/'+order.id);await expect(heading).toHaveText('Table '+a.label);await expect(clear).toHaveCount(0);
    expect((await workspace(page)).sessions.some((s:any)=>s.id===next.id)).toBe(true);
    expect(await(await page.request.get('/api/orders/'+order.id)).json()).toEqual(old);
    await page.goto('/app/floor-plan');await page.getByLabel('Fit floor to view',{exact:true}).click();
    const beforePlan=(await workspace(page)).floorPlans;
    const fixtures=page.locator('.plan-fixture:not(.plan-kind-wall)');expect(await fixtures.count()).toBeGreaterThan(0);
    const fixtureStyles=await fixtures.evaluateAll(items=>items.map(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color,border:getComputedStyle(el).borderColor})));
    expect(fixtureStyles.every(style=>style.background==='rgb(216, 229, 211)'&&style.color==='rgb(53, 74, 46)')).toBe(true);
    await page.getByRole('button',{name:'Arrange',exact:true}).click();await expect(page.getByLabel('Floor layout bounding box',{exact:true})).toBeAttached();
    await page.screenshot({path:`verification/fixture-contrast-${width}.png`});
    await page.getByRole('button',{name:'Cancel',exact:true}).click();expect((await workspace(page)).floorPlans).toEqual(beforePlan);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
});
