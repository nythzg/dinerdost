import { test, expect, type Page } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, appendFile } from "node:fs/promises";
import { businessDate } from "@dinerdost/core";
async function register(page: Page) {
  const stateFile = process.env.QA_AUTH_STATE_FILE;
  if (stateFile) {
    try {
      const state = JSON.parse(await readFile(stateFile, "utf8"));
      await page.context().addCookies(state.cookies);
      await page.goto("/app/overview");
      await expect(
        page.getByRole("heading", { name: "Overview", exact: true }),
      ).toBeVisible();
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  if (!stateFile)
    await page.setExtraHTTPHeaders({
      "x-forwarded-for": "10." + [...randomBytes(3)].join("."),
    });
  const email = "overnight-" + randomUUID() + "@example.test";
  await page.goto("/signup");
  for (const [name, value] of [
    ["Your name", "Web QA Owner"],
    ["Restaurant name", "Web QA Restaurant"],
    ["First outlet", "Main"],
    ["Email", email],
    ["Password", randomBytes(24).toString("base64url")],
  ])
    await page.getByLabel(name, { exact: true }).fill(value);
  await page.getByLabel("Customer QR ordering").selectOption("on");
  await page.getByLabel("Add a sample menu and 12 tables").check();
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.waitForURL("**/app/overview");
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  if (stateFile) await page.context().storageState({ path: stateFile });
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
  const reply = await page.request.post("/api/commands", {
    headers: {
      Origin: new URL(page.url()).origin,
      "Idempotency-Key": randomUUID(),
    },
    data: { action, input, ...ids },
  });
  const result = await reply.json();
  expect(reply.ok(), JSON.stringify(result)).toBe(true);
  return result;
}
async function save(page: Page, name = "Save") {
  await page
    .getByRole("dialog")
    .getByRole("button", { name, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

test("overnight Explore rotates, resizes, cancels deletion and saves boundary style on a full-area pan/zoom canvas", async ({
  page,
}) => {
  await register(page);
  const w = await workspace(page),
    floor = "Canvas " + randomUUID().slice(0, 5);
  await command(page, "floor", { outletId: w.outletId, name: floor });
  const table = await command(page, "table", {
    outletId: w.outletId,
    label: "C-" + randomUUID().slice(0, 5),
    seats: 4,
    floor,
  });
  await command(page, "floorPlan", {
    outletId: w.outletId,
    floor,
    version: (await workspace(page)).floorPlans.find(
      (p: any) => p.floor === floor,
    ).version,
    width: 1200,
    height: 800,
    objects: [
      {
        id: "reception",
        kind: "RECEPTION",
        label: "Reception QA",
        x: 400,
        y: 300,
        width: 180,
        height: 90,
      },
      {
        id: "table",
        kind: "TABLE",
        label: "QA table",
        tableId: table.id,
        x: 100,
        y: 150,
        width: 160,
        height: 110,
      },
    ],
  });
  await page.goto("/app/floor-plan");
  await page.getByLabel("Floor plan floor").selectOption(floor);
  await page.getByRole("button", { name: "Arrange", exact: true }).click();
  await page.getByRole("button", { name: "Reception QA", exact: true }).click();
  for (let i = 0; i < 3; i++)
    await page
      .getByRole("button", { name: "Rotate selected clockwise", exact: true })
      .click();
  await expect(page.getByLabel("Selected rotation")).toHaveText("45°");
  await page
    .getByRole("button", { name: "Resize Reception QA width", exact: true })
    .focus();
  await page.keyboard.press("ArrowRight");
  await page.getByLabel("Boundary style").selectOption("WALLS");
  await page.getByRole("button", { name: "Save layout", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Arrange", exact: true }),
  ).toBeVisible();
  let plan = (await workspace(page)).floorPlans.find(
    (p: any) => p.floor === floor,
  );
  expect(plan.objects.find((o: any) => o.id === "reception").rotation).toBe(45);
  expect(plan.objects.find((o: any) => o.id === "reception").width).toBe(190);
  expect(plan.boundary_style).toBe("WALLS");
  await page.getByRole("button", { name: "Arrange", exact: true }).click();
  await page.getByRole("button", { name: /^Table C-/ }).click();
  await page
    .getByRole("button", { name: "Delete selected", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    (await workspace(page)).tables.some((t: any) => t.id === table.id),
  ).toBe(true);
  const viewport = page.getByLabel("Floor canvas viewport"),
    box = (await viewport.boundingBox())!;
  await page.getByRole("button", { name: "Zoom in floor plan" }).click();
  const before = await page.locator(".floor-camera").getAttribute("style");
  await page.mouse.move(box.x + box.width - 25, box.y + box.height - 25);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 90, box.y + box.height - 70);
  await page.mouse.up();
  expect(await page.locator(".floor-camera").getAttribute("style")).not.toBe(
    before,
  );
  await page.getByRole("button", { name: "Fit floor to view" }).click();
  await page.screenshot({
    animations: "disabled",
    path: "verification/overnight-explore-desktop.png",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => {
      const b = await page.locator(".sidebar").boundingBox();
      return b!.x + b!.width;
    })
    .toBeLessThanOrEqual(0);
  await page.getByRole("button", { name: "Fit floor to view" }).click();
  await expect(viewport).toBeVisible();
  expect((await viewport.boundingBox())!.height).toBeGreaterThan(150);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    animations: "disabled",
    path: "verification/overnight-explore-mobile.png",
  });
  await page.reload();
  await page.getByLabel("Floor plan floor").selectOption(floor);
  plan = (await workspace(page)).floorPlans.find((p: any) => p.floor === floor);
  expect(plan.objects[0].rotation).toBe(45);
});

test("overnight Tables three-dot menu merges and swaps safely, and removes only an idle table", async ({
  page,
}) => {
  await register(page);
  const w = await workspace(page),
    a = w.tables.find((t: any) => t.label === "T09"),
    b = w.tables.find((t: any) => t.label === "T10");
  await command(page, "openSession", { tableId: a.id, guests: 1 });
  await command(page, "openSession", { tableId: b.id, guests: 1 });
  await page.goto("/app/floor");
  await page.getByLabel("Actions for " + a.label, { exact: true }).click();
  await expect(
    page.getByRole("menuitem", { name: "Delete table", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("menuitem", { name: "Merge tables", exact: true })
    .click();
  await page
    .getByLabel("Merge with", { exact: true })
    .selectOption({ label: b.label + " · MAIN" });
  await save(page, "Merge tables");
  expect(
    (await workspace(page)).sessions.find((s: any) => s.table_id === b.id)
      .parent_id,
  ).toBeTruthy();
  await page.getByLabel("Actions for " + a.label, { exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Move / swap", exact: true })
    .click();
  await page
    .getByLabel("Destination table", { exact: true })
    .selectOption(b.id);
  await save(page, "Move / swap");
  const idle = await command(page, "table", {
    outletId: w.outletId,
    label: "DEL-" + randomUUID().slice(0, 5),
    seats: 2,
    floor: a.floor,
  });
  await page.reload();
  const fresh = (await workspace(page)).tables.find(
    (t: any) => t.id === idle.id,
  );
  await page.getByLabel("Actions for " + fresh.label, { exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Delete table", exact: true })
    .click();
  await save(page, "Delete table");
  await expect(
    page.getByRole("heading", { name: fresh.label, exact: true }),
  ).toHaveCount(0);
  expect(
    (await page.request.get("/api/guest/" + fresh.public_key)).status(),
  ).toBe(404);
  await page.screenshot({
    animations: "disabled",
    path: "verification/overnight-table-actions.png",
  });
});

test("overnight Kitchen remembers Food/Bar per account and survives navigation and reload", async ({
  page,
}) => {
  await register(page);
  await page.goto("/app/kitchen");
  await page
    .getByLabel("Production display")
    .getByRole("button", { name: "Bar", exact: true })
    .click();
  await page.getByRole("link", { name: "Orders", exact: true }).click();
  await page.getByRole("link", { name: "Kitchen", exact: true }).click();
  await expect(
    page
      .getByLabel("Production display")
      .getByRole("button", { name: "Bar", exact: true }),
  ).toHaveClass(/selected/);
  await page.reload();
  await expect(
    page
      .getByLabel("Production display")
      .getByRole("button", { name: "Bar", exact: true }),
  ).toHaveClass(/selected/);
  await page
    .getByLabel("Production display")
    .getByRole("button", { name: "Food", exact: true })
    .click();
  await page.reload();
  await expect(
    page
      .getByLabel("Production display")
      .getByRole("button", { name: "Food", exact: true }),
  ).toHaveClass(/selected/);
});

test("overnight POS descriptions, Half/Full buttons, staff acceptance and bill adjustments reach the payment UI", async ({
  page,
}) => {
  await register(page);
  const w = await workspace(page),
    name = "Portion QA " + randomUUID().slice(0, 4);
  await command(page, "menu", {
    outletId: w.outletId,
    name,
    description: "Prepared to order",
    category: "Breads",
    price: 10031,
    taxBps: 0,
    unit: "portion",
    station: "Main kitchen",
    imageUrl: "/images/menu/samples/butter-naan.webp",
    variants: [
      { id: "half", name: "Half", price: 0 },
      { id: "full", name: "Full", price: 8058 },
    ],
    modifiers: [],
  });
  await page.goto("/app/pos");
  const card = page.getByRole("button", { name: new RegExp(name) });
  await expect(card).toContainText("Prepared to order");
  await card.click();
  await expect(page.getByLabel("Variant", { exact: true })).toHaveCount(0);
  await page.getByRole("radio", { name: /Full/ }).check();
  await page.getByLabel("Quantity", { exact: true }).fill("2");
  await page
    .getByRole("dialog")
    .screenshot({ path: "verification/overnight-portions.png" });
  await page.getByRole("dialog").getByRole("button", { name: /^Add / }).click();
  await page.getByLabel("Customer name", { exact: true }).fill("Portion Guest");
  await page.getByLabel("Customer phone", { exact: true }).fill("9123456740");
  await page.getByRole("button", { name: "Create order", exact: true }).click();
  await page.waitForURL("**/app/orders/*");
  await expect(
    page.getByRole("button", { name: "Accept round", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Void round", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Edit items", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Authorize postpaid", exact: true }),
  ).toHaveCount(0);
  const submitted = await (
    await page.request.get("/api/orders/" + page.url().split("/").pop())
  ).json();
  expect(submitted.rounds[0].kot_status).toBe("RELEASED");
  expect(Number(submitted.rounds[0].paid)).toBe(0);
  await page.getByRole("button", { name: "Adjustments", exact: true }).click();
  await page.getByLabel("Discount (₹)", { exact: true }).fill("1.25");
  await page
    .getByRole("checkbox", { name: "Round down to ₹1", exact: true })
    .check();
  await save(page, "Save adjustments");
  await expect(page.locator(".total-panel")).toContainText("Saved amount");
  let detail = await (
    await page.request.get("/api/orders/" + page.url().split("/").pop())
  ).json();
  expect(detail.totals.payable).toBe(36000);
  expect(detail.totals.roundOff).toBe(-53);
  expect(detail.totals.discount).toBe(125);
  await page.reload();
  await expect(page.locator(".total-panel")).toContainText("₹360.00");
  await page
    .getByRole("button", { name: "Review loyalty", exact: true })
    .click();
  await page.getByRole("button", { name: /^Receive ₹/ }).click();
  await expect(page.getByLabel("Amount (₹)", { exact: true })).toHaveValue(
    "360.00",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Record payment/ })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Adjustments", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    animations: "disabled",
    path: "verification/overnight-bill-adjustments.png",
  });
});

test("overnight approved checklist edits, period leaderboard, stock and English/Hindi preferences survive reload", async ({
  page,
}) => {
  await register(page);
  const w = await workspace(page),
    saved = await command(
      page,
      "record",
      {
        outletId: w.outletId,
        title: "Opening QA",
        data: {
          due: businessDate(),
          employeeId: w.actor.employeeId,
          instructions: "Check the opening",
        },
      },
      { kind: "checklists" },
    );
  await command(
    page,
    "recordDecision",
    { version: 1, state: "APPROVED", reason: "Approved QA task" },
    { id: saved.id },
  );
  await page.goto("/app/checklists");
  const row = page.getByRole("row").filter({ hasText: "Opening QA" });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Opening QA updated");
  await save(page);
  await page.reload();
  await expect(
    page.getByRole("row").filter({ hasText: "Opening QA updated" }),
  ).toContainText("Approved");
  await page.goto("/app/loyalty");
  for (const period of ["YEAR", "MONTH", "WEEK", "OVERALL"])
    await page.getByLabel("Leaderboard period").selectOption(period);
  const ingredient = await command(page, "ingredient", {
    outletId: w.outletId,
    name: "Stock QA",
    unit: "unit",
    reorderMilli: 0,
  });
  await command(page, "receipt", {
    expiresAt: new Date(Date.now() + 72 * 3600000).toISOString(),
    ingredientId: ingredient.id,
    batchNumber: "QA",
    quantityMilli: 10000,
    unitCost: 100,
    reference: "OPEN-STOCK-QA",
  });
  await page.goto("/app/overview");
  await page.getByLabel("Search stock summary").fill("Stock QA");
  await expect(
    page.getByRole("row").filter({ hasText: "Stock QA" }),
  ).toContainText("10");
  await page.getByLabel("Interface language").selectOption("hi");
  await expect(
    page.getByRole("heading", { name: "अवलोकन", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Cashier POS", exact: true }),
  ).toContainText("कैशियर पीओएस");
  await expect(page.getByText("Web QA Owner", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Interface language")).toHaveValue("hi");
  await expect(
    page.getByRole("heading", { name: "अवलोकन", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    path: "verification/overnight-hindi.png",
  });
  await page.getByLabel("Interface language").selectOption("en");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    animations: "disabled",
    path: "verification/overnight-stock-mobile.png",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("overnight customer QR rounds retain acceptance and postpaid authorization has no extra form", async ({
  page,
  browser,
}) => {
  await register(page);
  const w = await workspace(page),
    outlet = w.outlets[0],
    table = w.tables.find((t: any) => t.label === "T04");
  await command(page, "outlet", {
    id: outlet.id,
    version: outlet.version,
    name: outlet.name,
    code: outlet.code,
    address: outlet.address,
    gstin: outlet.gstin,
    qrEnabled: true,
    paymentPolicy: "POSTPAID",
    qrPaymentMode: "PAYMENT",
    taxBps: Number(outlet.tax_bps),
    earnBps: Number(outlet.earn_bps),
  });
  await command(page, "openSession", { tableId: table.id, guests: 1 });
  const guest = await browser.newContext(),
    origin = new URL(page.url()).origin,
    url = origin + "/api/guest/" + table.public_key;
  try {
    let reply = await guest.request.post(url, {
      headers: { Origin: origin },
      data: { action: "connect", input: {} },
    });
    expect(reply.ok(), await reply.text()).toBe(true);
    reply = await guest.request.post(url, {
      headers: { Origin: origin, "Idempotency-Key": randomUUID() },
      data: {
        action: "order",
        input: {
          name: "QR Approval QA",
          phone: "9123456741",
          items: [{ itemId: w.menu[0].id, quantity: 1 }],
        },
      },
    });
    const order = await reply.json();
    expect(reply.ok(), JSON.stringify(order)).toBe(true);
    await page.goto("/app/orders/" + order.id);
    await expect(
      page.getByRole("button", { name: "Accept round", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Accept round", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Authorize postpaid", exact: true })
      .click();
    await expect(
      page.getByLabel("Approval reason", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByLabel("Confirm your password", { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect
      .poll(async () => {
        const d = await (
          await page.request.get("/api/orders/" + order.id)
        ).json();
        return d.rounds[0].kot_status;
      })
      .toBe("RELEASED");
  } finally {
    await guest.close();
  }
});

test("overnight unassigned waiter opens a ready notification and sees the table without private order access", async ({
  page,
  browser,
}) => {
  await register(page);
  const w = await workspace(page),
    table = w.tables.find((t: any) => t.label === "T08"),
    email = "ready-waiter-" + randomUUID() + "@example.test",
    password = randomBytes(24).toString("base64url");
  await command(page, "employee", {
    name: "Ready QA Waiter",
    email,
    password,
    role: "WAITER",
    outletIds: [w.outletId],
  });
  if (process.env.QA_ACCOUNTS_FILE)
    await appendFile(
      process.env.QA_ACCOUNTS_FILE,
      JSON.stringify({ email }) + "\n",
    );
  const session = await command(page, "openSession", {
    tableId: table.id,
    guests: 1,
  });
  let order = await command(page, "createRound", {
    outletId: w.outletId,
    sessionId: session.id,
    customer: { name: "Ready QA Guest", phone: "9123456742" },
    items: [{ itemId: w.menu[0].id, quantity: 1 }],
  });
  await command(page, "reviewRewards", undefined, {
    orderId: order.id,
    roundId: order.rounds[0].id,
  });
  order = await (await page.request.get("/api/orders/" + order.id)).json();
  await command(
    page,
    "recordPayment",
    {
      version: order.rounds[0].version,
      method: "CASH",
      amount: Number(order.rounds[0].payable),
    },
    { orderId: order.id, roundId: order.rounds[0].id },
  );
  for (const ticket of (await workspace(page)).tickets.filter(
    (t: any) => t.order_id === order.id,
  )) {
    await command(page, "kitchen", { state: "PREPARING" }, { id: ticket.id });
    await command(page, "kitchen", { state: "READY" }, { id: ticket.id });
  }
  const staff = await browser.newContext(),
    waiter = await staff.newPage(),
    origin = new URL(page.url()).origin;
  try {
    await waiter.goto(origin + "/signin");
    await waiter.getByLabel("Email", { exact: true }).fill(email);
    await waiter.getByLabel("Password", { exact: true }).fill(password);
    await waiter.getByRole("button", { name: "Sign in", exact: true }).click();
    await waiter.waitForURL("**/app/**");
    await waiter.goto(origin + "/app/tasks");
    await waiter.getByRole("button", { name: /^Notifications/ }).click();
    const ready = waiter.getByRole("dialog").getByRole("button", {
      name: new RegExp("Order ready #" + order.number + " · " + table.label),
    });
    await expect(ready).toHaveCount(1);
    await ready.click();
    await expect(waiter).toHaveURL(/\/app\/tasks#ready-orders$/);
    const row = waiter
      .locator("#ready-orders")
      .getByRole("row")
      .filter({ hasText: "#" + order.number });
    await expect(row).toContainText(table.label);
    await expect(
      row.getByRole("link", { name: "View order", exact: true }),
    ).toHaveCount(0);
    expect(
      (await waiter.request.get(origin + "/api/orders/" + order.id)).status(),
    ).toBe(403);
    await waiter.screenshot({
      path: "verification/overnight-waiter-ready.png",
      animations: "disabled",
    });
  } finally {
    await staff.close();
  }
});
