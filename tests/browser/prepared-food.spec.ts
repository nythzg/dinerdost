import { test, expect, type Page } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { businessDateTime } from "@dinerdost/core";
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
    ["Your name", "Prepared QA"],
    ["Restaurant name", "Prepared isolated QA"],
    ["First outlet", "Main"],
    ["Email", `prepared-${randomUUID()}@example.test`],
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
test("prepared food, selected actions, separate settlement/invoice, visits/search, daily counts and charts work at desktop and phone sizes", async ({
  page,
}) => {
  test.setTimeout(process.env.QA_BASE_URL ? 300000 : 240000);
  await register(page);
  let w = await workspace(page);
  const item = w.menu.find((m: any) => m.name === "Mint cooler" && !m.ready_food_batch_id);
  let source = await command(page, "createRound", {
    outletId: w.outletId,
    type: "TAKEAWAY",
    customer: { name: "Ready QA Guest", phone: "9123456791" },
    items: [{ itemId: item.id, quantity: 2 }],
  });
  for (const t of (await workspace(page)).tickets.filter(
    (t: any) => t.order_id === source.id,
  )) {
    await command(page, "kitchen", { state: "PREPARING" }, { id: t.id });
    await command(page, "kitchen", { state: "READY" }, { id: t.id });
  }
  await page.goto("/app/orders/" + source.id);
  await expect(
    page.getByRole("button", { name: "Provisional bill", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Settle", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".customer-visits strong")).toHaveText("0");
  await page.getByRole("button", { name: "Reallocate", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Reason", { exact: true })
    .fill("QA guest cancelled; prepared food retained");
  await dialog.getByLabel("Prepared food hours",{exact:true}).fill("0");
  await dialog.getByLabel("Prepared food minutes",{exact:true}).fill("0");
  await expect(dialog.getByRole("button",{name:"Reallocate prepared food",exact:true})).toBeDisabled();
  await dialog.getByLabel("Prepared food hours", { exact: true }).fill("2");
  await dialog.getByLabel("Prepared food minutes",{exact:true}).fill("0");
  await dialog
    .getByRole("button", { name: "Reallocate prepared food", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".detail-toolbar")).toContainText("Voided");
  w = await workspace(page);
  const prepared = w.menu.find(
    (m: any) => m.ready_food_batch_id && m.name === item.name,
  );
  expect(prepared).toBeTruthy();
  expect(new Date(prepared.ready_use_by).getTime()-Date.now()).toBeGreaterThan(7100000);
  expect(new Date(prepared.ready_use_by).getTime()-Date.now()).toBeLessThanOrEqual(7200000);
  await page.goto("/app/pos");
  await expect(page.locator(".menu-card").first()).toContainText(
    "Ready to serve",
  );
  await expect(page.locator(".menu-card").first().locator("strong")).toHaveText(
    item.name,
  );
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.screenshot({
      path: `verification/ready-food-menu-${width}.png`,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  const brand=await command(page,"record",{outletId:w.outletId,title:"Prepared QA kitchen",data:{description:"Synthetic QA",active:true}},{kind:"brands"});
  const slug="prepared-"+randomUUID().slice(0,12);
  await command(page,"storefront",{outletId:w.outletId,brandId:brand.id,slug,published:true});
  await page.goto("/store/"+slug);
  await expect(page.locator(".storefront-menu article").first()).toBeVisible();await expect(page.getByText("Ready to serve",{exact:true})).toHaveCount(0);
  await expect(page.locator(".storefront-menu article").first()).not.toContainText("Use by");
  const resale = await command(page, "createRound", {
    outletId: w.outletId,
    type: "TAKEAWAY",
    customer: { name: "Ready QA Guest", phone: "9123456791" },
    items: [{ itemId: prepared.id, quantity: 1 }],
  });
  expect(resale.rounds[0].kot_status).toBe("READY");
  await page.goto("/app/orders/" + resale.id);
  await page
    .getByRole("button", { name: "Clear all actions", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Complete selected actions" }),
  ).toBeDisabled();
  await dialog.getByLabel("Review rewards", { exact: true }).check();
  await dialog.getByLabel(/Record cash I have received/).check();
  await dialog.getByLabel("Mark prepared food served", { exact: true }).check();
  await dialog
    .getByRole("button", { name: "Complete selected actions" })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".round-panel")).toContainText("Paid");
  const settledUrl = page.url();
  await page.getByRole("button", { name: "Settle", exact: true }).click();
  await expect(page.locator(".detail-toolbar")).toContainText("Settled");
  await expect(page).toHaveURL(settledUrl);
  await expect(page.locator(".customer-visits strong")).toHaveText("1");
  await expect(
    page.getByRole("button", { name: "Invoice", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Invoice", exact: true }).click();
  await expect(page).toHaveURL(/\/invoice\//);
  await expect(page.getByLabel("Final tax invoice")).toBeVisible();
  await page.goto("/app/orders");
  const counters = page.getByRole("group", {
    name: "Order counts",
    exact: true,
  });
  await counters.locator('[data-view="Reallocated"]').click();
  await expect(page.locator(".orders-panel tbody tr")).toHaveCount(1);
  await expect(page.locator(".orders-panel tbody tr")).toContainText(
    "#" + source.number,
  );
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto("/app/customers");
    await page
      .getByLabel("Search customers", { exact: true })
      .fill("9123456791");
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText("Ready QA Guest");
    await expect(page.locator("tbody tr td").nth(3)).toHaveText("1");
    await expect(page.locator("tbody tr")).not.toContainText("+919123456791");
    await page.screenshot({
      path: `verification/customer-visits-search-${width}.png`,
    });
    await page.goto("/app/inventory");
    await expect(
      page.getByRole("heading", { name: "Daily counts", exact: true }),
    ).toBeVisible();
    expect(
      await page.locator(".inventory-metrics ~ #daily-stock-counts").count(),
    ).toBe(1);
    await expect(
      page.getByRole("button", { name: "Opening stock", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `verification/inline-daily-counts-${width}.png`,
    });
    await page.goto("/app/reports");
    await expect(page.locator(".report-chart")).toHaveCount(4);
    await expect(page.locator(".report-chart").first()).toContainText(
      "Cashier Pos",
    );
    await expect(page.locator(".report-histogram")).toContainText("1");
    await expect(page.locator(".payment-pie")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `verification/recorded-report-charts-${width}.png`,
      fullPage: true,
    });
  }
});
