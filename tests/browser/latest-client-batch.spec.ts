import { test, expect, type Page } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
async function register(page: Page) {
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
    ["Your name", "Latest batch QA"],
    ["Restaurant name", "Latest batch isolated QA"],
    ["First outlet", "Main"],
    ["Email", `latest-batch-${randomUUID()}@example.test`],
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

test('persistent dismissals, table icons, kitchen All/bulk, named charges and locked floor view at desktop and phone sizes',async({page})=>{
 test.setTimeout(process.env.QA_BASE_URL?360000:240000);
 await register(page);
 let w=await workspace(page);
 const table=w.tables[0];
 await command(page,'openSession',{tableId:table.id,guests:2});
 const barName='Latest bar '+randomUUID().slice(0,6);
 const bar=await command(page,'menu',{outletId:w.outletId,name:barName,category:'Bar',price:12000,taxBps:0,station:'Latest bar',unit:'portion',stream:'BAR'});
 const food=w.menu.find((item:any)=>item.name==='Butter naan');
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===390?844:1000});
  await command(page,'ingredient',{outletId:w.outletId,name:'Latest empty '+width+' '+randomUUID().slice(0,5),unit:'kg'});
  await page.goto('/app/overview');
  const stock=page.getByRole('region',{name:'Stock alerts',exact:true});
  await expect(stock).toBeVisible();
  const source=(await workspace(page)).stockAlerts;
  await stock.getByRole('button',{name:'Close stock alerts',exact:true}).click();
  await expect(stock).toHaveCount(0);
  await expect.poll(async()=>(await workspace(page)).uiDismissals.includes('STOCK:'+source.signature)).toBe(true);
  await page.reload();await expect(stock).toHaveCount(0);
  await page.goto('/app/floor');
  const card=page.locator('.table-card').filter({has:page.getByRole('heading',{name:table.label,exact:true})});
  const actions=card.locator('.table-card-actions');
  for(const name of ['Details','Separate bill','Table QR'])await expect(actions.getByRole('button',{name,exact:true})).toBeVisible();
  const boxes=await actions.getByRole('button').evaluateAll(buttons=>buttons.map(button=>{const box=button.getBoundingClientRect();return {x:box.x,y:box.y,width:box.width,height:box.height}}));
  expect(boxes).toHaveLength(3);expect(Math.max(...boxes.map(b=>b.y))-Math.min(...boxes.map(b=>b.y))).toBeLessThan(2);
  expect(boxes.every(b=>b.width>=40&&b.height>=40)).toBe(true);
  await card.screenshot({path:`verification/table-icons-${width}.png`});
  await actions.getByRole('button',{name:'Table QR',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByLabel('Close dialog').click();
  await actions.getByRole('button',{name:'Separate bill',exact:true}).click();await expect(page.getByLabel('Separate bill label')).toBeVisible();await page.getByLabel('Close dialog').click();
  await actions.getByRole('button',{name:'Details',exact:true}).click();await expect(page).toHaveURL(new RegExp('/app/table-billing/'+table.id+'$'));
  const order=await command(page,'createRound',{outletId:w.outletId,type:'TAKEAWAY',items:[{itemId:food.id,quantity:1},{itemId:bar.id,quantity:1}]});
  await command(page,'orderCharges',{version:order.rounds[0].version,charges:[{name:'Packaging fee',amount:2500},{name:'Event service',amount:500}]},{orderId:order.id,roundId:order.rounds[0].id});
  const snapshot=await(await page.request.get('/api/orders/'+order.id)).json();
  await page.goto('/app/orders/'+order.id);
  const summary=page.locator('.panel').filter({has:page.getByRole('heading',{name:'Bill summary',exact:true})});
  await expect(summary.locator('.total-row').filter({has:page.getByText('Packaging fee',{exact:true})})).toContainText('₹25.00');
  await expect(summary.locator('.total-row').filter({has:page.getByText('Event service',{exact:true})})).toContainText('₹5.00');
  await expect(summary.locator('.total-row').filter({has:page.getByText('Other charges',{exact:true})})).toHaveCount(0);
  await summary.screenshot({path:`verification/named-bill-charges-${width}.png`});
  await page.goto('/app/kitchen');
  const tabs=page.getByLabel('Production display');await tabs.getByRole('button',{name:'All',exact:true}).click();
  const released=page.locator('.kitchen-column').filter({has:page.getByRole('heading',{name:'Released',exact:true})});
  const preparing=page.locator('.kitchen-column').filter({has:page.getByRole('heading',{name:'Preparing',exact:true})});
  const ready=page.locator('.kitchen-column').filter({has:page.getByRole('heading',{name:'Ready',exact:true})});
  const own=released.locator('.ticket').filter({has:page.getByText('#'+order.number,{exact:true})});await expect(own).toHaveCount(2);
  await own.first().getByRole('checkbox').check();await released.getByRole('button',{name:'Forward selected',exact:true}).click();
  await expect(own).toHaveCount(1);
  await released.getByRole('button',{name:'Forward all',exact:true}).click();await expect(own).toHaveCount(0);
  await preparing.getByRole('button',{name:'Forward all',exact:true}).click();
  await expect(ready.locator('.ticket').filter({has:page.getByText('#'+order.number,{exact:true})})).toHaveCount(2);
  await page.screenshot({path:`verification/kitchen-all-bulk-${width}.png`});
  await tabs.getByRole('button',{name:'Food',exact:true}).click();await expect(page.locator('.ticket').filter({hasText:barName})).toHaveCount(0);
  await tabs.getByRole('button',{name:'Bar',exact:true}).click();await expect(page.locator('.ticket').filter({hasText:'Butter naan'})).toHaveCount(0);
  await tabs.getByRole('button',{name:'All',exact:true}).click();await page.reload();await expect(tabs.getByRole('button',{name:'All',exact:true})).toHaveClass('selected');
  const after=await(await page.request.get('/api/orders/'+order.id)).json();expect(after.totals).toEqual(snapshot.totals);expect(after.rounds[0].charges).toEqual(snapshot.rounds[0].charges);
  await page.goto('/app/floor-plan');
  const viewport=page.getByLabel('Floor canvas viewport',{exact:true}),camera=page.locator('.floor-camera');
  await expect(page.getByLabel('Floor layout bounding box',{exact:true})).toBeAttached();
  await expect(page.locator('.floor-outline-boundary polygon')).toHaveAttribute('fill','#eaf1e6');
  await page.getByLabel('Fit floor to view',{exact:true}).click();await page.getByLabel('Zoom in floor plan',{exact:true}).click();
  const bounds=await viewport.boundingBox();const x=bounds!.x+bounds!.width/2,y=bounds!.y+30;
  await page.getByRole('button',{name:'Lock floor view',exact:true}).click();
  const locked=await camera.getAttribute('style');
  await expect(page.getByLabel('Zoom in floor plan',{exact:true})).toBeDisabled();await expect(page.getByLabel('Fit floor to view',{exact:true})).toBeDisabled();
  await page.mouse.move(x,y);await page.mouse.wheel(30,70);
  await viewport.focus();await viewport.press('ArrowDown');await viewport.press('Home');
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+35,y+35,{steps:5});await page.mouse.up();
  const client=await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-30,y},{x:x+30,y}]});
  await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-50,y:y+20},{x:x+50,y:y+20}]});
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await client.detach();
  expect(await camera.getAttribute('style')).toBe(locked);
  await page.getByRole('button',{name:'Unlock floor view',exact:true}).focus();
  await page.screenshot({path:`verification/floor-locked-${width}.png`});
  await page.getByRole('button',{name:'Unlock floor view',exact:true}).click();
  await page.getByLabel('Zoom in floor plan',{exact:true}).click();await expect(camera).not.toHaveAttribute('style',locked!);
  const unlocked=await camera.getAttribute('style');await viewport.focus();await viewport.press('ArrowDown');await expect(camera).not.toHaveAttribute('style',unlocked!);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});


