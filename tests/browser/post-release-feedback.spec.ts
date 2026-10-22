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

test("review occupied cards keep the approved dark green and faint black action box, menus dismiss outside and Orders omits only its Voided tab", async ({
  page,
}) => {
  await register(page);
  const w = await workspace(page),
    taken = w.tables.find((t: any) => t.label === "T02");
  await command(page, "openSession", { tableId: taken.id, guests: 1 });
  await page.goto("/app/floor");
  const occupied = page
      .locator(".table-card")
      .filter({ has: page.getByRole("heading", { name: "T02", exact: true }) }),
    available = page
      .locator(".table-card")
      .filter({ has: page.getByRole("heading", { name: "T01", exact: true }) });
  expect(
    await occupied.evaluate((e) => getComputedStyle(e).backgroundColor),
  ).toBe("rgb(25, 63, 48)");
  expect(await occupied.evaluate((e) => getComputedStyle(e).opacity)).toBe("1");
  expect(
    await available.evaluate((e) => getComputedStyle(e).backgroundColor),
  ).toBe("rgb(255, 255, 255)");
  expect(
    await occupied
      .getByRole("heading")
      .evaluate((e) => getComputedStyle(e).color),
  ).toBe("rgb(255, 255, 255)");
  await occupied.screenshot({ path: "verification/review-occupied-tint.png" });
  const first = page.getByLabel("Actions for T01", { exact: true }),
    second = page.getByLabel("Actions for T02", { exact: true });
  await first.click();
  await expect(page.getByRole("menu", { name: "T01 actions" })).toBeVisible();
  await page.getByRole("heading", { name: "Tables", exact: true }).click();
  await expect(page.locator(".table-actions-menu[open]")).toHaveCount(0);
  await first.click();
  await second.click();
  await expect(page.locator(".table-actions-menu[open]")).toHaveCount(1);
  await second.press("Escape");
  await expect(second).toBeFocused();
  await expect(page.locator(".table-actions-menu[open]")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".sidebar")).not.toBeInViewport();
  await second.click();
  await page.getByRole("heading", { name: "Tables", exact: true }).click();
  await expect(page.locator(".table-actions-menu[open]")).toHaveCount(0);
  await page.screenshot({
    path: "verification/review-tables-mobile.png",
    animations: "disabled",
  });
  await page.goto("/app/orders");
  await expect(
    page.getByRole("button", { name: "Voided", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "All", exact: true }).click();
  expect((await workspace(page)).orders).toEqual(w.orders);
});

test("review deleting and recreating T13 through Tables and Explore uses a new QR and retains one active card", async ({
  page,
}) => {
  await register(page);
  const w = await workspace(page),
    floor = "Reuse " + randomUUID().slice(0, 4);
  await command(page, "floor", { outletId: w.outletId, name: floor });
  await page.goto("/app/floor-plan");
  await page.getByLabel("Floor plan floor").selectOption(floor);
  await page.getByRole("button", { name: "Add table", exact: true }).click();
  await page.getByLabel("Table name", { exact: true }).fill("T13");
  await save(page, "Add table");
  const old = (await workspace(page)).tables.find(
    (t: any) => t.label === "T13",
  );
  await page.goto("/app/floor");
  await page.getByLabel("Actions for T13", { exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Delete table", exact: true })
    .click();
  await save(page, "Delete table");
  await expect(
    page.getByRole("heading", { name: "T13", exact: true }),
  ).toHaveCount(0);
  await page.goto("/app/floor-plan");
  await page.getByLabel("Floor plan floor").selectOption(floor);
  await page.getByRole("button", { name: "Add table", exact: true }).click();
  await page.getByLabel("Table name", { exact: true }).fill("T13");
  await save(page, "Add table");
  await expect(
    page.getByRole("button", { name: /^Table T13\b/ }),
  ).toBeVisible();
  const fresh = (await workspace(page)).tables.find(
    (t: any) => t.label === "T13",
  );
  expect(fresh.id).not.toBe(old.id);
  expect(fresh.public_key).not.toBe(old.public_key);
  expect(
    (await page.request.get("/api/guest/" + old.public_key)).status(),
  ).toBe(404);
  await page.goto("/app/floor");
  await expect(
    page.getByRole("heading", { name: "T13", exact: true }),
  ).toHaveCount(1);
  await page.getByLabel("Actions for T13", { exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Delete table", exact: true })
    .click();
  await save(page, "Delete table");
});

test("review Explore control panel resizes by edge and keyboard, persists locally and leaves saved floor data unchanged", async ({
  page,
}) => {
  await register(page);
  await page.goto("/app/floor-plan");
  const before = (await workspace(page)).floorPlans,
    edge = page.getByRole("separator", {
      name: "Resize Explore controls",
      exact: true,
    }),
    panel = page.locator(".explore-header");
  const initial = (await panel.boundingBox())!.height;
  await edge.focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowDown");
  await expect
    .poll(async () => (await panel.boundingBox())!.height)
    .toBeGreaterThan(initial + 35);
  let box = (await edge.boundingBox())!;
  const previous = (await panel.boundingBox())!.height;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 60, {
    steps: 8,
  });
  await page.mouse.up();
  const changed = (await panel.boundingBox())!.height;
  expect(changed).toBeGreaterThan(previous + 40);
  await page.reload();
  await expect
    .poll(async () => (await panel.boundingBox())!.height)
    .toBeCloseTo(changed, 0);
  expect((await workspace(page)).floorPlans).toEqual(before);
  await page.getByRole("button", { name: "Arrange", exact: true }).click();
  await edge.focus();
  await page.keyboard.press("Home");
  await expect
    .poll(async () => (await panel.boundingBox())!.height)
    .toBeCloseTo(68, 0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".sidebar")).not.toBeInViewport();
  box = (await edge.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 50, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(page.locator(".floor-plan-scroll")).toBeVisible();
  expect(
    (await page.locator(".floor-plan-scroll").boundingBox())!.height,
  ).toBeGreaterThanOrEqual(139);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "verification/review-explore-controls-mobile.png",
    animations: "disabled",
  });
  expect((await workspace(page)).floorPlans).toEqual(before);
});

test("review current inventory value edits persist, retain receipt rates, flow into wastage and allow guarded deletion", async ({
  page,
}) => {
  await register(page);
  const w = await workspace(page),
    name = "Valuation " + randomUUID().slice(0, 5),
    stock = await command(page, "ingredient", {
      outletId: w.outletId,
      name,
      unit: "kg",
      purchaseRate: 1250,
    }),
    batch = await command(page, "receipt", {
      ingredientId: stock.id,
      quantityMilli: 3000,
      unitCost: 1000,
      batchNumber: randomUUID(),
      reference: "Review valuation GRN",
      expiresAt: new Date(Date.now() + 72 * 3600000).toISOString(),
    });
  await page.goto("/app/inventory");
  let row = page.getByRole("row").filter({ hasText: name });
  await page.getByLabel("Edit " + name + " value", { exact: true }).click();
  await page
    .getByLabel("Current stock value (₹)", { exact: true })
    .fill("100.01");
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Correct remaining stock value");
  await page
    .getByRole("dialog")
    .screenshot({ path: "verification/review-inventory-value.png" });
  await save(page, "Save value");
  await page.reload();
  await expect(
    page.getByLabel("Edit " + name + " value", { exact: true }),
  ).toContainText("₹100.01");
  let data = await workspace(page);
  expect(
    Number(data.ingredients.find((i: any) => i.id === stock.id).purchase_rate),
  ).toBe(1250);
  expect(
    Number(data.batches.find((b: any) => b.id === batch.id).unit_cost),
  ).toBe(1000);
  await row.getByLabel("Delete " + name, { exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Record remaining stock as wastage",
  );
  await expect(
    page.getByRole("button", { name: "Delete item", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "FIFO batches", exact: true }).click();
  row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toContainText("₹10.00");
  await expect(row).toContainText("₹100.01");
  await row.getByRole("button", { name: "Wastage", exact: true }).click();
  await page.getByLabel("Quantity", { exact: true }).fill("3");
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Revalued stock wastage QA");
  await save(page, "Record wastage");
  await page.getByRole("button", { name: "Daily waste", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: name })).toContainText(
    "₹100.01",
  );
  await page.getByRole("button", { name: "Ingredients", exact: true }).click();
  await page.getByLabel("Delete " + name, { exact: true }).click();
  await save(page, "Delete item");
  await expect(page.getByRole("row").filter({ hasText: name })).toHaveCount(0);
  data = await workspace(page);
  expect(data.ingredients.some((i: any) => i.id === stock.id)).toBe(false);
  const history = await (
    await page.request.get(
      `/api/stock-reports?outletId=${w.outletId}&date=${businessDate()}&search=${encodeURIComponent(name)}`,
    )
  ).json();
  expect(history.items[0].name).toBe(name);
  expect(Number(history.items[0].cost)).toBe(10001);
});

test("review outlet QR modes persist and customer orders require only their configured approvals", async ({
  page,
  browser,
}) => {
  await register(page);
  const w = await workspace(page);
  const setMode = async (mode: string) => {
    await page.goto("/app/outlets");
    await page
      .getByRole("button", { name: "Manage outlet", exact: true })
      .first()
      .click();
    await expect(
      page.getByText("Online payments require payment gateway setup.", {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByLabel("QR menu", { exact: true }).selectOption(mode);
    await save(page);
    await page.reload();
    expect(
      (await workspace(page)).outlets.find((o: any) => o.id === w.outletId)
        .qr_payment_mode,
    ).toBe(mode);
  };
  const makeGuest = async (label: string) => {
    const context = await browser.newContext(),
      table = w.tables.find((t: any) => t.label === label),
      origin = new URL(page.url()).origin,
      url = origin + "/api/guest/" + table.public_key;
    await command(page, "openSession", { tableId: table.id, guests: 1 });
    let reply = await context.request.post(url, {
      headers: { Origin: origin },
      data: { action: "connect", input: {} },
    });
    expect(reply.ok(), await reply.text()).toBe(true);
    reply = await context.request.post(url, {
      headers: { Origin: origin, "Idempotency-Key": randomUUID() },
      data: {
        action: "order",
        input: {
          name: "QR Mode Guest",
          phone: "9123456791",
          items: [{ itemId: w.menu[0].id, quantity: 1 }],
        },
      },
    });
    const o = await reply.json();
    expect(reply.ok(), JSON.stringify(o)).toBe(true);
    await context.close();
    await page.goto("/app/orders/" + o.id);
    await expect(
      page.getByRole("button", { name: "Accept round", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Accept round", exact: true })
      .click();
    return o.id;
  };
  await setMode("ORDER_ONLY");
  const only = await makeGuest("T10");
  await expect(
    page.getByRole("button", { name: "Authorize postpaid", exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/orders/" + only)).json()).rounds[0]
          .kot_status,
    )
    .toBe("RELEASED");
  let d = await (await page.request.get("/api/orders/" + only)).json();
  expect(Number(d.rounds[0].paid)).toBe(0);
  expect(d.rounds[0].payments).toHaveLength(0);
  await setMode("PAYMENT");
  const payment = await makeGuest("T11");
  await expect(
    page.getByRole("button", { name: "Authorize postpaid", exact: true }),
  ).toBeVisible();
  d = await (await page.request.get("/api/orders/" + payment)).json();
  expect(d.rounds[0].kot_status).toBe("HELD");
  await page
    .getByRole("button", { name: "Authorize postpaid", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/orders/" + payment)).json())
          .rounds[0].kot_status,
    )
    .toBe("RELEASED");
  d = await (await page.request.get("/api/orders/" + payment)).json();
  expect(Number(d.rounds[0].paid)).toBe(0);
  expect(d.rounds[0].postpaid_authorized).toBe(true);
  await page.screenshot({
    path: "verification/review-qr-payment-flow.png",
    animations: "disabled",
  });
});

test("review shared tables show four measured rows with a sticky green header and scroll to remaining records", async ({
  page,
}) => {
  await register(page);
  const w = await workspace(page),
    prefix = "Scroll QA " + randomUUID().slice(0, 4);
  for (let i = 0; i < 6; i++)
    await command(
      page,
      "record",
      {
        outletId: w.outletId,
        title: prefix + " " + i,
        data: {
          contact: "Supplier " + i,
          phone: "",
          email: "",
          address:
            i === 2
              ? "A longer supplier address that wraps at phone widths"
              : "",
          gstin: "",
        },
      },
      { kind: "vendors" },
    );
  await page.goto("/app/vendors");
  const region = page
    .getByRole("region", { name: "Scrollable records" })
    .filter({ has: page.getByText(prefix + " 5", { exact: true }) });
  await expect(region).toBeVisible();
  const verify = async () => {
    const g = await region.evaluate((el) => {
      const node = el as HTMLElement,
        t = el.querySelector("table")!,
        rows = Array.from(t.querySelectorAll("tbody tr")),
        b = el.getBoundingClientRect();
      return {
        viewport: b.height,
        fourth:
          rows[3].getBoundingClientRect().bottom -
          t.getBoundingClientRect().top,
        scroll: node.scrollHeight > node.clientHeight,
        head: getComputedStyle(t.querySelector("th")!).backgroundColor,
        color: getComputedStyle(t.querySelector("th")!).color,
        count: rows.length,
      };
    });
    expect(g.count).toBeGreaterThanOrEqual(6);
    expect(Math.abs(g.viewport - g.fourth)).toBeLessThanOrEqual(2);
    expect(g.scroll).toBe(true);
    expect(g.head).toBe("rgb(224, 232, 221)");
    expect(g.color).toBe("rgb(25, 63, 48)");
  };
  await verify();
  await region.focus();
  await region.press("End");
  await expect
    .poll(() => region.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  expect(
    await region
      .locator("th")
      .first()
      .evaluate((el) =>
        Math.abs(
          el.getBoundingClientRect().top -
            el.closest(".table-scroll")!.getBoundingClientRect().top,
        ),
      ),
  ).toBeLessThanOrEqual(2);
  await page.screenshot({
    path: "verification/review-four-row-table.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await region.evaluate((el) => {
    el.scrollTop = 0;
  });
  await expect
    .poll(() =>
      region.evaluate((el) =>
        Math.abs(
          el.getBoundingClientRect().height -
            (el.querySelectorAll("tbody tr")[3].getBoundingClientRect().bottom -
              el.querySelector("table")!.getBoundingClientRect().top),
        ),
      ),
    )
    .toBeLessThanOrEqual(2);
  await verify();
});

test("review POS prices align at the bottom and inline minus quantity plus preserves cart variants", async ({
  page,
}) => {
  await register(page);
  const w = await workspace(page);
  const custom = "Variant QA " + randomUUID().slice(0, 5);
  await command(page, "menu", {
    outletId: w.outletId,
    name: custom,
    description: "Prepared to order",
    category: "Breads",
    price: 10000,
    taxBps: 0,
    unit: "portion",
    station: "Main kitchen",
    imageUrl: "/images/menu/samples/butter-naan.webp",
    variants: [
      { id: "half", name: "Half", price: 0 },
      { id: "full", name: "Full", price: 10000 },
    ],
    modifiers: [],
  });
  await page.goto("/app/pos");
  const mint = page
      .locator(".menu-card")
      .filter({ has: page.getByRole("button", { name: /Mint cooler/ }) }),
    step = mint.getByRole("group", { name: "Mint cooler quantity controls" });
  await step
    .getByRole("button", { name: "Increase quantity", exact: true })
    .click();
  await step
    .getByRole("button", { name: "Increase quantity", exact: true })
    .click();
  await expect(
    step.getByLabel("Mint cooler quantity in cart", { exact: true }),
  ).toHaveText("2");
  await step
    .getByRole("button", { name: "Decrease quantity", exact: true })
    .click();
  await expect(
    step.getByLabel("Mint cooler quantity in cart", { exact: true }),
  ).toHaveText("1");
  await page.getByLabel("Mint cooler quantity", { exact: true }).fill("5");
  await expect(
    step.getByLabel("Mint cooler quantity in cart", { exact: true }),
  ).toHaveText("5");
  const bottoms = await page
    .locator(".menu-card")
    .evaluateAll((cards) =>
      cards
        .slice(0, 4)
        .map(
          (el) =>
            el.querySelector(".pos-card-price")!.getBoundingClientRect().bottom,
        ),
    );
  expect(Math.max(...bottoms) - Math.min(...bottoms)).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: "verification/review-pos-controls.png",
    animations: "disabled",
  });
  const variant = page
      .locator(".menu-card")
      .filter({ has: page.getByRole("button", { name: new RegExp(custom) }) }),
    controls = variant.getByRole("group");
  await controls
    .getByRole("button", { name: "Increase quantity", exact: true })
    .click();
  await page.getByRole("radio", { name: /Full/ }).check();
  await page.getByLabel("Quantity", { exact: true }).fill("2");
  await page.getByRole("dialog").getByRole("button", { name: /^Add / }).click();
  await controls
    .getByRole("button", { name: "Increase quantity", exact: true })
    .click();
  await page.getByRole("radio", { name: /Half/ }).check();
  await page.getByRole("dialog").getByRole("button", { name: /^Add / }).click();
  await expect(
    controls.getByLabel(custom + " quantity in cart", { exact: true }),
  ).toHaveText("3");
  await controls
    .getByRole("button", { name: "Decrease quantity", exact: true })
    .click();
  await expect(
    controls.getByLabel(custom + " quantity in cart", { exact: true }),
  ).toHaveText("2");
  const selectedLine = page.locator(".cart-item").filter({ hasText: custom });
  await expect(selectedLine).toContainText("₹200.00");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => {
      const b = await page.locator(".sidebar").boundingBox();
      return b!.x + b!.width;
    })
    .toBeLessThanOrEqual(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const boxes = await controls.boundingBox(),
    card = await variant.boundingBox();
  expect(boxes!.x + boxes!.width).toBeLessThanOrEqual(card!.x + card!.width);
  await page.screenshot({
    path: "verification/review-pos-controls-mobile.png",
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Save as draft", exact: true })
    .click();
  await page.waitForURL("**/app/orders/*");
  const saved = await (
      await page.request.get("/api/orders/" + page.url().split("/").pop())
    ).json(),
    line = saved.rounds[0].items.find((item: any) => item.name === custom);
  expect(saved.rounds[0].status).toBe("DRAFT");
  expect(line.variant).toBe("Full");
  expect(Number(line.quantity_milli)).toBe(2000);
  expect(Number(line.unit_price)).toBe(20000);
});

test("review zero-total staff bills retain reward authorization and settle without fake receipts", async ({
  page,
}) => {
  await register(page);
  const w = await workspace(page),
    name = "Zero UI " + randomUUID().slice(0, 5);
  const menu = await command(page, "menu", {
      outletId: w.outletId,
      name,
      category: "Food",
      price: 100,
      taxBps: 0,
      station: "Main kitchen",
    }),
    o = await command(page, "createRound", {
      outletId: w.outletId,
      type: "TAKEAWAY",
      customer: { name: "Zero UI Guest", phone: "9123456792" },
      items: [{ itemId: menu.id, quantity: 1 }],
    });
  await page.goto("/app/orders/" + o.id);
  await page.getByRole("button", { name: "Adjustments", exact: true }).click();
  await page.getByLabel("Discount (₹)", { exact: true }).fill("1");
  await save(page, "Save adjustments");
  await page
    .getByRole("button", { name: "Review loyalty", exact: true })
    .click();
  const ticket = (await workspace(page)).tickets.find(
    (t: any) => t.round_id === o.rounds[0].id,
  );
  await command(page, "kitchen", { state: "PREPARING" }, { id: ticket.id });
  await command(page, "kitchen", { state: "READY" }, { id: ticket.id });
  await page.reload();
  await page.getByRole("button", { name: "Mark served", exact: true }).click();
  await page
    .getByRole("button", { name: "Settle", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Review payment", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("button", { name: "Authorize zero total", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/orders/" + o.id)).json()).rounds[0]
          .payment_status,
    )
    .toBe("PAID");
  await expect(
    page.getByRole("button", { name: "Adjustments", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "verification/review-zero-total.png",
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Settle", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await (await page.request.get("/api/orders/" + o.id)).json()).status,
    )
    .toBe("SETTLED");
  const final = await (await page.request.get("/api/orders/" + o.id)).json();
  expect(Number(final.totals.paid)).toBe(0);
  expect(final.rounds[0].payments).toHaveLength(0);
});
