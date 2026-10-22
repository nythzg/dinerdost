import { test, expect, type Page } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
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
  await page.goto("/signup");
  for (const [name, value] of [
    ["Your name", "Daily count QA"],
    ["Restaurant name", "Daily stock QA"],
    ["First outlet", "Main"],
    ["Email", `counts-${randomUUID()}@example.test`],
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

test("daily physical counts, corrections and CSV variance work on desktop and phone without blocking orders or changing stock", async ({
  page,
}) => {
  await register(page);
  const w = await workspace(page),
    tag = "Daily QA " + randomUUID().slice(0, 5),
    name = tag + " flour",
    zeroName = tag + " zero";
  const stock = await command(page, "ingredient", {
    outletId: w.outletId,
    name,
    unit: "kg",
  });
  await command(page, "ingredient", {
    outletId: w.outletId,
    name: zeroName,
    unit: "kg",
  });
  const receipt = await command(page, "receipt", {
    ingredientId: stock.id,
    batchNumber: randomUUID(),
    quantityMilli: 2000,
    unitCost: 1000,
    reference: "Daily QA opening receipt",
    expiresAt: new Date(Date.now() + 72 * 3600000).toISOString(),
  });
  const dish = await command(page, "menu", {
    outletId: w.outletId,
    name: tag + " dish",
    category: "Mains",
    price: 10000,
    taxBps: 0,
    unit: "portion",
    station: "Main kitchen",
  });
  await command(page, "recipe", {
    itemId: dish.id,
    ingredients: [{ id: stock.id, quantityMilli: 500 }],
  });
  await page.goto("/app/pos");
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Opening stock counts pending" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Record counts", exact: true }).click();
  await expect(page).toHaveURL(/inventory\?view=counts/);
  await page.getByLabel("Search daily stock", { exact: true }).fill(tag);
  const count = async (
    phase: "Opening" | "Closing",
    amount: string,
    correction = "",
  ) => {
    await page
      .getByRole("button", { name: phase + " stock", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: phase + " stock",
      exact: true,
    });
    await dialog
      .getByLabel(name + " " + phase.toLowerCase() + " count", { exact: true })
      .fill(amount);
    await dialog
      .getByLabel(zeroName + " " + phase.toLowerCase() + " count", {
        exact: true,
      })
      .fill("0");
    if (correction)
      await dialog.getByLabel("Count note", { exact: true }).fill(correction);
    await dialog
      .getByRole("button", { name: "Save counts", exact: true })
      .click();
    await expect(dialog).toBeHidden();
  };
  let row = page.locator("#daily-stock-counts")
    .getByRole("row")
    .filter({ has: page.getByText(name, { exact: true }) });
  await count("Opening", "2");
  await expect(row).toContainText("v1");
  expect(
    Number(
      (await workspace(page)).ingredients.find((i: any) => i.id === stock.id)
        .on_hand,
    ),
  ).toBe(2000);
  // Other demo ingredients remain uncounted; staff ordering must still work.
  const order = await command(page, "createRound", {
    outletId: w.outletId,
    type: "TAKEAWAY",
    items: [{ itemId: dish.id, quantity: 2 }],
  });
  expect(order.rounds[0].status).toBe("ACCEPTED");
  await command(page, "receipt", {
    ingredientId: stock.id,
    batchNumber: randomUUID(),
    quantityMilli: 500,
    unitCost: 1000,
    reference: "Daily QA afternoon receipt",
    expiresAt: new Date(Date.now() + 72 * 3600000).toISOString(),
  });
  await command(page, "wastage", {
    batchId: receipt.id,
    quantityMilli: 100,
    reason: "Daily QA recorded spill",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await count("Closing", "1.3");
  await expect(row).toContainText("Shortage");
  await expect(row.locator("td").last()).toContainText("-0.1");
  expect(
    Number(
      (await workspace(page)).ingredients.find((i: any) => i.id === stock.id)
        .on_hand,
    ),
  ).toBe(1400);
  await expect(
    page.getByRole("button", { name: "Opening stock", exact: true }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "verification/daily-counts-phone.png" });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  const csv = await readFile((await (await downloadPromise).path())!, "utf8");
  expect(csv).toContain('"Variance (counted minus expected)"');
  expect(csv).toContain(name);
  expect(csv).toContain('"-0.1"');
  await count("Closing", "1.4", "Rechecked physical quantity");
  await expect(row).toContainText("v2");
  await expect(row.locator("td").last()).toHaveText("0");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "verification/daily-counts-desktop.png" });
  await page.goto("/app/reports");
  await page
    .getByRole("button", { name: "Stock variance", exact: true })
    .click();
  await page.getByLabel("Search daily stock", { exact: true }).fill(tag);
  row=page.getByRole("row").filter({has:page.getByText(name,{exact:true})});
  await expect(row).toContainText("v2");
  await expect(
    page.getByRole("button", { name: "Closing stock", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Report business date", { exact: true })
    .fill("2000-01-01");
  await expect(row).toContainText("Not counted");
  await expect(row.locator("td").last()).toHaveText("—");
});

test("Service marks a ready round served inline only after all stations are ready", async ({
  page,
}) => {
  await register(page);
  const w = await workspace(page),
    items = ["Mint cooler", "Butter naan"].map((name) => ({
      itemId: w.menu.find((m: any) => m.name === name).id,
      quantity: 1,
    }));
  const order = await command(page, "createRound", {
    outletId: w.outletId,
    type: "TAKEAWAY",
    items,
  });
  const tickets = (await workspace(page)).tickets.filter(
    (t: any) => t.order_id === order.id,
  );
  expect(tickets.length).toBe(2);
  await command(page, "kitchen", { state: "PREPARING" }, { id: tickets[0].id });
  await command(page, "kitchen", { state: "READY" }, { id: tickets[0].id });
  await page.goto("/app/tasks");
  const rows = page
    .locator("#ready-orders")
    .getByRole("row")
    .filter({ has: page.getByText("#" + order.number, { exact: true }) });
  await expect(rows).toHaveCount(1);
  await expect(
    rows.getByRole("button", { name: "Mark as served", exact: true }),
  ).toBeDisabled();
  await command(page, "kitchen", { state: "PREPARING" }, { id: tickets[1].id });
  await command(page, "kitchen", { state: "READY" }, { id: tickets[1].id });
  await page.reload();
  await expect(rows).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.locator(".sidebar").evaluate(el => el.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
  await expect(
    rows.getByRole("button", { name: "Mark as served", exact: true }).first(),
  ).toBeEnabled();
  await rows
    .getByRole("button", { name: "Mark as served", exact: true })
    .first()
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "verification/service-inline-served-phone.png",
  });
  await rows
    .getByRole("button", { name: "Mark as served", exact: true })
    .first()
    .click();
  await expect(rows).toHaveCount(0);
  await expect(page).toHaveURL(/\/app\/tasks$/);
  const after = await (
    await page.request.get("/api/orders/" + order.id)
  ).json();
  expect(after.status).toBe("SERVED");
  expect(after.rounds[0].payable).toBe(order.rounds[0].payable);
  expect(after.rounds[0].paid).toBe(order.rounds[0].paid);
});
