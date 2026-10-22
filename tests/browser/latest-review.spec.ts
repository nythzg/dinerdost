import { test, expect, type Page } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, appendFile } from "node:fs/promises";
import { businessDate } from "@dinerdost/core";
async function register(page: Page) {
  const state = process.env.QA_AUTH_STATE_FILE;
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
  const email = "review-" + randomUUID() + "@example.test";
  await page.goto("/signup");
  for (const [name, value] of [
    ["Your name", "Review QA Owner"],
    ["Restaurant name", "Review QA Restaurant"],
    ["First outlet", "Main"],
    ["Email", email],
    ["Password", randomBytes(24).toString("base64url")],
  ])
    await page.getByLabel(name, { exact: true }).fill(value);
  await page.getByLabel("Customer QR ordering").selectOption("on");
  await page.getByLabel("Add a sample menu and 12 tables").check();
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.waitForURL("**/app/overview");
  if (state) await page.context().storageState({ path: state });
  if (process.env.QA_ACCOUNTS_FILE)
    await appendFile(
      process.env.QA_ACCOUNTS_FILE,
      JSON.stringify({ email }) + "\n",
    );
}
async function workspace(page: Page) {
  return (await page.request.get("/api/workspace")).json();
}
async function command(page: Page, action: string, input: unknown, ids = {}) {
  const r = await page.request.post("/api/commands", {
      headers: {
        Origin: new URL(page.url()).origin,
        "Idempotency-Key": randomUUID(),
      },
      data: { action, input, ...ids },
    }),
    body = await r.json();
  expect(r.ok(), JSON.stringify(body)).toBe(true);
  return body;
}
async function save(page: Page, name = "Save") {
  await page
    .getByRole("dialog")
    .getByRole("button", { name, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

test("latest inventory removes reorder UI, preserves saved thresholds and shows actual ingredient and liquor expiry", async ({
  page,
}) => {
  await register(page);
  const w = await workspace(page),
    name = "Expiry QA " + randomUUID().slice(0, 5);
  const stock = await command(page, "ingredient", {
    outletId: w.outletId,
    name,
    unit: "kg",
    reorderMilli: 4000,
    purchaseRate: 2500,
  });
  await page.goto("/app/inventory");
  await expect(page.getByText(/reorder level/i)).toHaveCount(0);
  const row = page
    .getByRole("row")
    .filter({ has: page.getByText(name, { exact: true }) });
  await expect(row).toContainText("No stock");
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("dialog").getByLabel(/reorder/i)).toHaveCount(0);
  await page.getByLabel("Purchase rate per kg / L / unit (₹)").fill("30");
  await save(page);
  expect(
    Number(
      (await workspace(page)).ingredients.find((i: any) => i.id === stock.id)
        .reorder_milli,
    ),
  ).toBe(4000);
  await row.getByRole("button", { name: "Receive", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator('input[type="datetime-local"]')).toHaveCount(0);
  await expect(
    page.getByLabel("Expiry (India time) date", { exact: true }),
  ).toHaveAttribute("required", "");
  await expect(
    page.getByLabel("Expiry (India time) time", { exact: true }),
  ).toHaveAttribute("required", "");
  await page.getByLabel("Batch / lot number").fill("COMPACT-EXPIRY");
  await page.getByLabel("Quantity", { exact: true }).fill("2");
  const local = new Date(Date.now() + 48 * 3600000 + 330 * 60000)
    .toISOString()
    .slice(0, 16);
  await page
    .getByLabel("Expiry (India time) date", { exact: true })
    .fill(local.slice(0, 10));
  await page
    .getByLabel("Expiry (India time) time", { exact: true })
    .fill(local.slice(11));
  await page.getByLabel("Invoice / GRN reference").fill("COMPACT-EXPIRY-GRN");
  await dialog.screenshot({ path: "verification/latest-expiry-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByLabel("Expiry (India time) time", { exact: true }),
  ).toBeInViewport();
  await dialog.screenshot({ path: "verification/latest-expiry-mobile.png" });
  await save(page, "Receive stock");
  let current = await workspace(page);
  const batch = current.batches.find((b: any) => b.ingredient_id === stock.id);
  expect(new Date(batch.expires_at).toISOString()).toBe(
    new Date(local + "+05:30").toISOString(),
  );
  await expect(row).toContainText("Nearest batch expiry");
  await page.reload();
  await expect(row).toContainText("Nearest batch expiry");
  const liquor = await command(page, "ingredient", {
    outletId: w.outletId,
    name: name + " liquor",
    unit: "L",
    category: "LIQUOR",
  });
  await command(page, "receipt", {
    ingredientId: liquor.id,
    batchNumber: "LIQUOR-EXP",
    quantityMilli: 1000,
    unitCost: 3000,
    reference: "LIQUOR-GRN",
    expiresAt: new Date(Date.now() + 72 * 3600000).toISOString(),
  });
  await page.reload();
  await page.getByRole("button", { name: "Liquor", exact: true }).click();
  await expect(
    page
      .getByRole("row")
      .filter({ has: page.getByText(name + " liquor", { exact: true }) }),
  ).toContainText("Nearest batch expiry");
  await expect(
    page.getByRole("columnheader", { name: "Expiry", exact: true }),
  ).toBeVisible();
});

test("latest report tabs and table heading hierarchy are compact, distinct and separated on desktop and phone", async ({
  page,
}) => {
  await register(page);
  await page.goto("/app/reports");
  const tabs = page.locator(".report-tabs");
  await expect(
    tabs.getByRole("button", { name: "Sales", exact: true }),
  ).toBeVisible();
  expect(
    await tabs
      .getByRole("button", { name: "Stock", exact: true })
      .evaluate((e) => getComputedStyle(e).borderTopStyle),
  ).toBe("solid");
  const first = page.locator(".workspace-controls > .panel").filter({
    has: page.getByRole("heading", { name: "Sales by channel", exact: true }),
  });
  await expect(first).toBeVisible();
  expect(
    await first
      .locator(".panel-heading")
      .evaluate((e) => getComputedStyle(e).backgroundColor),
  ).toBe("rgb(25, 63, 48)");
  const panels = page.locator(".workspace-controls > .panel");
  const gap = async () =>
    panels.evaluateAll(
      (p) =>
        p[1].getBoundingClientRect().top - p[0].getBoundingClientRect().bottom,
    );
  expect(await gap()).toBeGreaterThanOrEqual(19);
  await page.screenshot({ path: "verification/latest-reports-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await gap()).toBeGreaterThanOrEqual(19);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "verification/latest-reports-mobile.png" });
  await page.goto("/app/tasks");
  const ready = page.locator("#ready-orders"),
    requests = page.locator(".panel").filter({
      has: page.getByRole("heading", { name: "Table requests", exact: true }),
    });
  await expect(requests).toBeVisible();
  expect(
    (await requests.boundingBox())!.y -
      ((await ready.boundingBox())!.y + (await ready.boundingBox())!.height),
  ).toBeGreaterThanOrEqual(19);
});

test("latest customer menu bottom footers, selected dark cards and minus quantity plus preserve variants", async ({
  page,
  context,
}) => {
  await register(page);
  const w = await workspace(page),
    table = w.tables.find((t: any) => t.label === "T01");
  if (!w.sessions.some((s: any) => s.table_id === table.id))
    await command(page, "openSession", { tableId: table.id, guests: 2 });
  const custom = "Guest portions " + randomUUID().slice(0, 4);
  await command(page, "menu", {
    outletId: w.outletId,
    name: custom,
    category: "Breads",
    description: "Prepared to order",
    price: 10000,
    taxBps: 0,
    unit: "portion",
    station: "Main kitchen",
    variants: [
      { id: "half", name: "Half", price: 0 },
      { id: "full", name: "Full", price: 10000 },
    ],
    modifiers: [],
  });
  const guest = await context.newPage();
  await guest.goto("/q/" + table.public_key);
  await guest.getByRole("button", { name: "Menu", exact: true }).click();
  const card = guest.locator(".guest-menu article").filter({
    has: guest.getByRole("heading", { name: "Mint cooler", exact: true }),
  });
  await card
    .getByRole("button", { name: "Add Mint cooler", exact: true })
    .click();
  await card
    .getByRole("button", { name: "Add Mint cooler", exact: true })
    .click();
  await expect(
    card.getByLabel("Mint cooler quantity in cart", { exact: true }),
  ).toHaveText("2");
  expect(await card.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(
    "rgb(40, 91, 69)",
  );
  await guest.getByLabel("Mint cooler quantity", { exact: true }).fill("5");
  await expect(
    card.getByLabel("Mint cooler quantity in cart", { exact: true }),
  ).toHaveText("5");
  await card
    .getByRole("button", { name: "Decrease Mint cooler", exact: true })
    .click();
  await expect(
    guest.getByLabel("Mint cooler quantity", { exact: true }),
  ).toHaveValue("4");
  const variant = guest
    .locator(".guest-menu article")
    .filter({ has: guest.getByRole("heading", { name: custom, exact: true }) });
  await variant
    .getByRole("button", { name: "Add " + custom, exact: true })
    .click();
  await guest.getByRole("radio", { name: /Half/ }).check();
  await guest
    .getByRole("dialog")
    .getByRole("button", { name: /Add ·/ })
    .click();
  await variant
    .getByRole("button", { name: "Add " + custom, exact: true })
    .click();
  await guest.getByRole("radio", { name: /Full/ }).check();
  await guest
    .getByRole("dialog")
    .getByRole("button", { name: /Add ·/ })
    .click();
  await expect(
    variant.getByLabel(custom + " quantity in cart", { exact: true }),
  ).toHaveText("2");
  await variant
    .getByRole("button", { name: "Decrease " + custom, exact: true })
    .click();
  await expect(
    guest.locator(".guest-cart-line").filter({ hasText: custom }),
  ).toHaveCount(1);
  await expect(
    guest.locator(".guest-cart-line").filter({ hasText: custom }),
  ).toContainText("Half");
  await guest.screenshot({ path: "verification/latest-guest-desktop.png" });
  await guest.setViewportSize({ width: 390, height: 844 });
  const priceShape = await card.locator(".guest-card-price").boundingBox();
  expect(priceShape!.height).toBeLessThan(25);
  expect(priceShape!.width).toBeGreaterThan(35);
  expect(
    await guest.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const alignment = await guest
    .locator(".guest-menu article")
    .evaluateAll((cards) =>
      cards
        .slice(0, 2)
        .map(
          (c) => c.querySelector(".guest-add")!.getBoundingClientRect().bottom,
        ),
    );
  expect(Math.abs(alignment[0] - alignment[1])).toBeLessThan(2);
  await guest.screenshot({ path: "verification/latest-guest-mobile.png" });
  await guest.close();
});

test("latest one merged card restores separate tables on demerge without closing visits or duplicating bills", async ({
  page,
}) => {
  await register(page);
  const w = await workspace(page),
    a = w.tables.find((t: any) => t.label === "T05"),
    b = w.tables.find((t: any) => t.label === "T06");
  for (const table of [a, b])
    if (!w.sessions.some((s: any) => s.table_id === table.id))
      await command(page, "openSession", { tableId: table.id, guests: 2 });
  await page.goto("/app/floor");
  const aCard = page
    .locator(".table-card")
    .filter({
      has: page.getByRole("heading", {
        name: new RegExp("^" + a.label + "(?: |$)"),
      }),
    });
  for (const cycle of [0, 1]) {
    await page.getByLabel("Actions for " + a.label, { exact: true }).click();
    await page
      .getByRole("menuitem", { name: "Merge tables", exact: true })
      .click();
    await page
      .getByLabel("Merge with", { exact: true })
      .selectOption({ label: b.label + " · MAIN" });
    await save(page, "Merge tables");
    await expect(aCard.getByRole("heading")).toHaveText(
      a.label + " & " + b.label + " (Merged)",
    );
    await expect(
      page.getByRole("heading", { name: b.label, exact: true }),
    ).toHaveCount(0);
    await page.getByLabel("Actions for " + a.label, { exact: true }).click();
    await aCard.screenshot({
      path: "verification/latest-merged-card-control.png",
    });
    await page
      .getByRole("menuitem", { name: "Demerge tables", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(aCard.locator(".table-merge-label")).toHaveCount(0);
    const after = await workspace(page);
    expect(
      after.sessions.filter((s: any) => [a.id, b.id].includes(s.table_id)),
    ).toHaveLength(2);
    expect(
      after.sessions.find((s: any) => s.table_id === b.id).parent_id,
    ).toBeNull();
  }
  expect(await aCard.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe(
    "rgb(25, 63, 48)",
  );
  expect(
    await aCard
      .getByLabel("Actions for " + a.label)
      .evaluate((e) => getComputedStyle(e).backgroundColor),
  ).toBe("rgba(0, 0, 0, 0.15)");
  await page.screenshot({ path: "verification/latest-table-demerge.png" });
});

test("latest Explore keeps a fixed screen frame and full-size tables while wheel, drag and touch pan reach distant tables", async ({
  page,
}) => {
  await register(page);
  const w = await workspace(page),
    floor = "Large " + randomUUID().slice(0, 4);
  await command(page, "floor", { outletId: w.outletId, name: floor });
  const a = await command(page, "table", {
    outletId: w.outletId,
    label: "Near " + floor,
    floor,
    seats: 4,
  });
  const b = await command(page, "table", {
    outletId: w.outletId,
    label: "Far " + floor,
    floor,
    seats: 4,
  });
  await command(page, "floorPlan", {
    outletId: w.outletId,
    floor,
    version: (await workspace(page)).floorPlans.find(
      (p: any) => p.floor === floor,
    ).version,
    width: 4800,
    height: 3600,
    objects: [
      {
        id: "near",
        kind: "TABLE",
        tableId: a.id,
        label: "Near",
        x: 100,
        y: 100,
        width: 150,
        height: 110,
      },
      {
        id: "far",
        kind: "TABLE",
        tableId: b.id,
        label: "Far",
        x: 4200,
        y: 3000,
        width: 150,
        height: 110,
      },
    ],
  });
  await page.goto("/app/floor-plan");
  await page.getByLabel("Floor plan floor").selectOption(floor);
  const viewport = page.getByLabel("Floor canvas viewport", { exact: true }),
    camera = page.locator(".floor-camera");
  const near = page.getByRole("button", {
      name: new RegExp("^Table Near " + floor),
    }),
    far = page.getByRole("button", { name: new RegExp("^Table Far " + floor) });
  await expect(near).toBeInViewport();
  expect(Math.round((await near.boundingBox())!.width)).toBe(150);
  await expect(far).not.toBeInViewport();
  const frame = await viewport.boundingBox();
  await viewport.hover();
  await page.mouse.wheel(3900, 2750);
  await expect(far).toBeInViewport();
  expect(await viewport.boundingBox()).toEqual(frame);
  await page
    .getByRole("button", { name: "Fit floor to view", exact: true })
    .click();
  await expect(near).toBeInViewport();
  await expect(far).toBeInViewport();
  await page.reload();
  await page.getByLabel("Floor plan floor").selectOption(floor);
  await expect(near).toBeInViewport();
  const start = await near.boundingBox(),
    old = await camera.getAttribute("style");
  await page.mouse.move(start!.x + 40, start!.y + 40);
  await page.mouse.down();
  await page.mouse.move(start!.x + 140, start!.y + 100, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await camera.getAttribute("style")).not.toBe(old);
  await page.screenshot({ path: "verification/latest-explore-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByLabel("Floor plan floor").selectOption(floor);
  const touchStart = await near.boundingBox();
  const client = await page.context().newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: touchStart!.x + 40, y: touchStart!.y + 30 }],
  });
  const preTouch = await camera.getAttribute("style");
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: touchStart!.x + 5, y: touchStart!.y - 60 }],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  expect(await camera.getAttribute("style")).not.toBe(preTouch);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "verification/latest-explore-mobile.png" });
});
