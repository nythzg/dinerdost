import { test, expect, type Page } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, appendFile } from "node:fs/promises";
import { businessDate, floorOutline } from "@dinerdost/core";
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
  if (!state)
    await page.setExtraHTTPHeaders({
      "x-forwarded-for": "10." + [...randomBytes(3)].join("."),
    });
  const email = "late-" + randomUUID() + "@example.test";
  await page.goto("/signup");
  for (const [name, value] of [
    ["Your name", "Late QA Owner"],
    ["Restaurant name", "Late QA Restaurant"],
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
async function command(page: Page, action: string, input?: unknown, ids = {}) {
  const r = await page.request.post("/api/commands", {
      headers: {
        Origin: new URL(page.url()).origin,
        "Idempotency-Key": randomUUID(),
      },
      data: { action, input, ...ids },
    }),
    result = await r.json();
  expect(r.ok(), JSON.stringify(result)).toBe(true);
  return result;
}
async function save(page: Page, name = "Save") {
  await page
    .getByRole("dialog")
    .getByRole("button", { name, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
}
const future = () => new Date(Date.now() + 36 * 3600000).toISOString();
async function create(page: Page, itemId: string, phone = "9123456771") {
  const w = await workspace(page);
  return command(page, "createRound", {
    outletId: w.outletId,
    type: "TAKEAWAY",
    customer: { name: "Late Guest", phone },
    items: [{ itemId, quantity: 1 }],
  });
}
async function payment(page: Page, order: any) {
  await command(page, "reviewRewards", undefined, {
    orderId: order.id,
    roundId: order.rounds[0].id,
  });
  const d = await (await page.request.get("/api/orders/" + order.id)).json();
  await command(
    page,
    "recordPayment",
    {
      version: d.rounds[0].version,
      method: "CASH",
      amount: Number(d.rounds[0].payable),
    },
    { orderId: d.id, roundId: d.rounds[0].id },
  );
}

test("late stock rate, required expiry, menu recipe and daily waste/usage reports persist on desktop and phone", async ({
  page,
}) => {
  await register(page);
  const w = await workspace(page),
    name = "Stock " + randomUUID().slice(0, 5);
  await page.goto("/app/inventory");
  await page.getByRole("button", { name: "Ingredient", exact: true }).click();
  await page.getByLabel("Ingredient name", { exact: true }).fill(name);
  await page
    .getByLabel("Purchase rate per kg / L / unit (₹)", { exact: true })
    .fill("123.45");
  await save(page);
  let stock = (await workspace(page)).ingredients.find(
    (i: any) => i.name === name,
  );
  expect(Number(stock.purchase_rate)).toBe(12345);
  await page
    .getByRole("button", { name: "Receive stock", exact: true })
    .first()
    .click();
  await page.getByLabel("Ingredient", { exact: true }).selectOption(stock.id);
  await expect(page.getByLabel("Cost per unit (₹)")).toHaveValue("123.45");
  await expect(
    page.getByLabel("Expiry (India time) date", { exact: true }),
  ).toHaveAttribute("required", "");
  await page.getByLabel("Batch / lot number").fill("LATE-UI");
  await page.getByLabel("Quantity", { exact: true }).fill("10");
  const local = new Date(Date.now() + 36 * 3600000 + 330 * 60000)
    .toISOString()
    .slice(0, 16);
  await page
    .getByLabel("Expiry (India time) date", { exact: true })
    .fill(local.slice(0, 10));
  await page
    .getByLabel("Expiry (India time) time", { exact: true })
    .fill(local.slice(11));
  await page.getByLabel("Invoice / GRN reference").fill("LATE-UI-GRN");
  await save(page, "Receive stock");
  let current = await workspace(page);
  const batch = current.batches.find((b: any) => b.ingredient_id === stock.id);
  expect(batch.expires_at).toBeTruthy();
  await command(page, "wastage", {
    batchId: batch.id,
    quantityMilli: 500,
    reason: "Daily QA waste",
  });
  const dishName = "Recipe " + randomUUID().slice(0, 5),
    dish = await command(page, "menu", {
      outletId: w.outletId,
      name: dishName,
      category: "Breads",
      price: 17280,
      taxBps: 0,
      station: "Main kitchen",
      imageUrl: "/images/menu/samples/butter-naan.webp",
    });
  await page.goto("/app/menu");
  const row = page.getByRole("row").filter({ hasText: dishName });
  await expect(row).toContainText("Recipe needed");
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("button", { name: "Add stock item", exact: true })
    .click();
  await page
    .getByLabel("Recipe stock 1", { exact: true })
    .selectOption(stock.id);
  await page.getByLabel("Recipe quantity 1", { exact: true }).fill("0.25");
  await save(page);
  current = await workspace(page);
  expect(
    Number(
      current.recipes.find((r: any) => r.item_id === dish.id).quantity_milli,
    ),
  ).toBe(250);
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(
    page.getByLabel("Recipe quantity 1", { exact: true }),
  ).toHaveValue("0.25");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  const order = await create(page, dish.id);
  await payment(page, order);
  for (const ticket of (await workspace(page)).tickets.filter(
    (t: any) => t.order_id === order.id,
  )) {
    await command(page, "kitchen", { state: "PREPARING" }, { id: ticket.id });
    await command(page, "kitchen", { state: "READY" }, { id: ticket.id });
  }
  await command(page, "serve", undefined, {
    orderId: order.id,
    roundId: order.rounds[0].id,
  });
  await command(page, "bill", { final: true }, { orderId: order.id });
  await page.goto("/app/inventory");
  await page.getByRole("button", { name: "Daily waste", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: name })).toContainText(
    "0.5 kg",
  );
  await page.goto("/app/reports");
  await page.getByRole("button", { name: "Waste", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: name })).toContainText(
    "Daily QA waste",
  );
  await page.getByRole("button", { name: "Usage", exact: true }).click();
  await page.getByLabel("Search usage").fill(name);
  await expect(page.getByRole("row").filter({ hasText: name })).toContainText(
    "0.25 kg",
  );
  await expect(page.getByRole("row").filter({ hasText: name })).toContainText(
    "9.25 kg",
  );
  await page.getByRole("button", { name: "Dish profit", exact: true }).click();
  await page.getByLabel("Search dish report").fill(dishName);
  await expect(
    page.getByRole("row").filter({ hasText: dishName }),
  ).toContainText("₹141.94");
  await page.getByLabel("Report outlet").selectOption("");
  await page.getByRole("button", { name: "Stock", exact: true }).click();
  await expect(page.getByLabel("Report outlet")).toHaveValue(w.outletId);
  await page.getByLabel("Search stock summary").fill(name);
  await expect(page.getByRole("row").filter({ hasText: name })).toContainText(
    "9.25",
  );
  await page.screenshot({ path: "verification/late-reports-desktop.png" });
  await page.goto("/app/overview");
  await expect(page.locator(".stock-alerts-panel")).toContainText(name);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".sidebar")).not.toBeInViewport();
  await page.screenshot({
    path: "verification/late-stock-alerts-mobile.png",
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});

test("late table actions and shared Explore additions/deletions preserve save and cancel", async ({
  page,
}) => {
  await register(page);
  const w = await workspace(page),
    floor = "Shared " + randomUUID().slice(0, 4);
  await command(page, "floor", { outletId: w.outletId, name: floor });
  const plan = (await workspace(page)).floorPlans.find(
    (p: any) => p.floor === floor,
  );
  await command(page, "floorPlan", {
    outletId: w.outletId,
    floor,
    version: plan.version,
    width: 800,
    height: 600,
    outline: floorOutline("Circle", { width: 800, height: 600 }),
    objects: [],
  });
  await page.goto("/app/floor-plan");
  await page.getByLabel("Floor plan floor").selectOption(floor);
  await page.getByRole("button", { name: "Add table", exact: true }).click();
  const name = "Shared-" + randomUUID().slice(0, 4);
  await page.getByLabel("Table name", { exact: true }).fill(name);
  await save(page, "Add table");
  await expect(
    page.getByRole("button", { name: new RegExp("^Table " + name + "\\b") }),
  ).toBeVisible();
  await page.goto("/app/floor");
  const card = page
    .locator(".table-card")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  const summary = card.getByLabel("Actions for " + name);
  await expect(summary).toHaveText("⋮");
  await expect(card.locator(".table-card-title")).toContainText("Available");
  expect(
    await summary.evaluate((e) => getComputedStyle(e).borderTopWidth),
  ).toBe("0px");
  const cb = await card.boundingBox(),
    sb = await summary.boundingBox();
  expect(sb!.x + sb!.width).toBeGreaterThan(cb!.x + cb!.width - 40);
  await page.screenshot({ path: "verification/late-table-actions.png" });
  await page.goto("/app/floor-plan");
  await page.getByLabel("Floor plan floor").selectOption(floor);
  await page.getByRole("button", { name: "Arrange", exact: true }).click();
  await page
    .getByRole("button", { name: new RegExp("^Table " + name + "\\b") })
    .click();
  await page
    .getByRole("button", { name: "Delete selected", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: new RegExp("^Table " + name + "\\b") }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Arrange", exact: true }).click();
  await page
    .getByRole("button", { name: new RegExp("^Table " + name + "\\b") })
    .click();
  await page
    .getByRole("button", { name: "Delete selected", exact: true })
    .click();
  await page.getByRole("button", { name: "Save layout", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Arrange", exact: true }),
  ).toBeVisible();
  await page.goto("/app/floor");
  await expect(page.getByRole("heading", { name, exact: true })).toHaveCount(0);
});

test("late KOT printing follows authorized release, supports manual reprint and outlet off switch", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.print = () => {
      window.parent.document.documentElement.setAttribute(
        "data-qa-print-count",
        String(
          Number(
            window.parent.document.documentElement.getAttribute(
              "data-qa-print-count",
            ) ?? 0,
          ) + 1,
        ),
      );
    };
  });
  await register(page);
  await page.goto("/app/outlets");
  await page
    .getByRole("button", { name: "Manage outlet", exact: true })
    .first()
    .click();
  await expect(
    page.getByLabel("Kitchen authorization", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("KOT printing", { exact: true }).selectOption("AUTO");
  await save(page);
  const w = await workspace(page),
    order = await create(page, w.menu[0].id, "9123456772");
  await page.goto("/app/orders/" + order.id);
  await expect(
    page.getByRole("button", { name: "Print KOT", exact: true }),
  ).toHaveCount(0);
  await payment(page, order);
  await page.reload();
  // Reload establishes the baseline; manual printing tests the iframe and print dialog entry.
  await page.getByRole("button", { name: "Print KOT", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute(
    "data-qa-print-count",
    "1",
  );
  const ticket = await page.context().newPage();
  await ticket.goto(`/kot/${order.id}/${order.rounds[0].id}`);
  await expect(ticket.locator("[data-kot-receipt]")).toContainText(
    w.menu[0].name,
  );
  await expect(ticket.locator("[data-kot-receipt]")).not.toContainText(
    "Late Guest",
  );
  await ticket.screenshot({ path: "verification/late-kot-ticket.png" });
  await ticket.close();
  const next = await create(page, w.menu[1].id, "9123456772");
  await payment(page, next);
  await expect(page.locator("html")).toHaveAttribute(
    "data-qa-print-count",
    "2",
    { timeout: 30000 },
  );
  await page.goto("/app/outlets");
  await page
    .getByRole("button", { name: "Manage outlet", exact: true })
    .first()
    .click();
  await page.getByLabel("KOT printing", { exact: true }).selectOption("OFF");
  await save(page);
  await page.goto("/app/orders/" + order.id);
  await expect(
    page.getByRole("button", { name: "Print KOT", exact: true }),
  ).toHaveCount(0);
  expect(
    (await page.request.get(`/kot/${order.id}/${order.rounds[0].id}`)).status(),
  ).toBe(404);
});

test("late downward rounding preview and compact descriptions agree with persisted web totals", async ({
  page,
}) => {
  await register(page);
  const w = await workspace(page),
    name = "Compact " + randomUUID().slice(0, 4);
  const item = await command(page, "menu", {
    outletId: w.outletId,
    name,
    description: "Fresh mint and lemon",
    category: "Breads",
    price: 17280,
    taxBps: 0,
    station: "Main kitchen",
    imageUrl: "/images/menu/samples/mint-cooler.webp",
  });
  await page.goto("/app/pos");
  const card = page.getByRole("button", { name: new RegExp(name) });
  const title = await card.locator(".dish-details > strong").boundingBox(),
    description = await card.locator(".dish-description").boundingBox();
  expect(description!.y - title!.y - title!.height).toBeLessThanOrEqual(3);
  expect(description!.y).toBeGreaterThan(title!.y);
  await card.screenshot({ path: "verification/late-menu-description.png" });
  const order = await create(page, item.id, "9123456773");
  await page.goto("/app/orders/" + order.id);
  await page.getByRole("button", { name: "Adjustments", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Round down to ₹1", exact: true })
    .check();
  await expect(page.getByRole("dialog")).toContainText("₹172.00");
  await page
    .getByRole("dialog")
    .screenshot({ path: "verification/late-round-down.png" });
  await save(page, "Save adjustments");
  await page.reload();
  const result = await (
    await page.request.get("/api/orders/" + order.id)
  ).json();
  expect(Number(result.rounds[0].payable)).toBe(17200);
  expect(Number(result.rounds[0].round_off)).toBe(-80);
  expect(result.rounds[0].rounding_mode).toBe("DOWN");
});

test("late public linked identity suggestions stay device-private across QR and storefront checkout", async ({
  page,
  browser,
}) => {
  await register(page);
  const w = await workspace(page),
    table = w.tables.find((t: any) => t.label === "T10");
  await command(page, "openSession", { tableId: table.id, guests: 1 });
  const suffix = randomUUID().slice(0, 5),
    brand = await command(
      page,
      "record",
      {
        outletId: w.outletId,
        title: "Identity brand " + suffix,
        data: { description: "QA", active: true },
      },
      { kind: "brands" },
    ),
    slug = "identity-" + suffix;
  await command(page, "storefront", {
    outletId: w.outletId,
    brandId: brand.id,
    slug,
    published: true,
  });
  const guest = await browser.newContext(),
    other = await browser.newContext();
  try {
    const q = await guest.newPage();
    await q.goto("/q/" + table.public_key);
    const origin = new URL(q.url()).origin,
      url = "/api/guest/" + table.public_key;
    await expect(
      q.getByRole("button", { name: "Menu", exact: true }),
    ).toBeEnabled();
    const response = await q.request.post(url, {
      headers: { Origin: origin, "Idempotency-Key": randomUUID() },
      data: {
        action: "order",
        input: {
          name: "Private linked guest",
          phone: "9123456774",
          items: [{ itemId: w.menu[0].id, quantity: 1 }],
        },
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
    await q.goto("/store/" + slug);
    await q
      .locator(".storefront-menu article")
      .first()
      .getByRole("button", { name: "Add", exact: true })
      .click();
    await q.getByRole("dialog").getByRole("button", { name: /^Add / }).click();
    await q.getByRole("button", { name: /^Takeaway/ }).click();
    await q.getByLabel("Name", { exact: true }).fill("Private");
    await q.getByRole("option", { name: /Private linked guest/ }).click();
    await expect(q.getByLabel("Phone", { exact: true })).toHaveValue(
      "+919123456774",
    );
    await q.getByLabel("Phone", { exact: true }).fill("9123456774");
    await q.getByRole("option", { name: /Private linked guest/ }).click();
    await expect(q.getByLabel("Name", { exact: true })).toHaveValue(
      "Private linked guest",
    );
    await q
      .getByRole("dialog")
      .screenshot({ path: "verification/late-customer-suggestions.png" });
    const stranger = await other.newPage();
    await stranger.goto("/store/" + slug);
    const body = await (
      await stranger.request.get("/api/store/" + slug)
    ).json();
    expect(body.identities).toEqual([]);
    expect(JSON.stringify(body)).not.toContain("9123456774");
  } finally {
    await guest.close();
    await other.close();
  }
});

test("late Half/Full menu editor keeps its checkbox label together and preserves prices on desktop and phone", async ({
  page,
}) => {
  await register(page);
  const w = await workspace(page),
    name = "Portions layout " + randomUUID().slice(0, 4),
    saved = await command(page, "menu", {
      outletId: w.outletId,
      name,
      category: "Breads",
      price: 17280,
      taxBps: 0,
      station: "Main kitchen",
      imageUrl: "/images/menu/samples/butter-naan.webp",
    });
  await page.goto("/app/menu");
  const row = page.getByRole("row").filter({ hasText: name });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  const toggle = page.getByRole("checkbox", {
    name: "Half / Full portions",
    exact: true,
  });
  await toggle.check();
  await page.getByLabel("Full price (₹)", { exact: true }).fill("300");
  const checkbox = await toggle.boundingBox(),
    label = await page.locator(".menu-portions-toggle span").boundingBox();
  expect(label!.x - checkbox!.x - checkbox!.width).toBeLessThan(16);
  expect(label!.height).toBeLessThan(30);
  await save(page);
  let item = (await workspace(page)).menu.find((m: any) => m.id === saved.id);
  expect(Number(item.price)).toBe(17280);
  expect(item.variants.find((v: any) => v.id === "full").price).toBe(12720);
  await page.setViewportSize({ width: 390, height: 844 });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(toggle).toBeChecked();
  await expect(page.getByLabel("Full price (₹)", { exact: true })).toHaveValue(
    "300",
  );
  await toggle.scrollIntoViewIfNeeded();
  expect(
    await page
      .getByRole("dialog")
      .evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
  ).toBe(true);
  const mobileLabel = await page
    .locator(".menu-portions-toggle span")
    .boundingBox();
  expect(mobileLabel!.height).toBeLessThan(30);
  await page.getByRole("dialog").screenshot({
    path: "verification/late-half-full-mobile.png",
    animations: "disabled",
  });
});
