import { test, expect, type Page, type Locator } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";
import { businessDate } from "@dinerdost/core";
import { resolve } from "node:path";

async function uploadMenuPhoto(page: Page, name: string) {
  const upload = page.waitForResponse(
    (r) => r.url().includes("/api/uploads?") && r.request().method() === "POST",
  );
  await page
    .getByLabel("Upload image", { exact: true })
    .setInputFiles(
      resolve("apps/web/public/images/menu/samples/" + name + ".webp"),
    );
  expect((await upload).ok()).toBe(true);
}

test("custom floors, outlines and activation switch persist with unchanged table links", async ({
  page,
  browser,
}) => {
  await register(page, true);
  const initial = await (await page.request.get("/api/workspace")).json(),
    table = initial.tables.find((t: any) => t.label === "T01");
  await page.goto("/app/floor");
  await expect(
    page.getByRole("switch", { name: "Auto activation of tables" }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Edit T01 capacity", exact: true })
    .click();
  await page.getByLabel("Seats", { exact: true }).fill("3");
  await save(page);
  await expect(
    page
      .locator(".table-card")
      .filter({ has: page.getByRole("heading", { name: "T01", exact: true }) })
      .getByText("3 seats", { exact: true }),
  ).toBeVisible();
  await page.getByRole("switch", { name: "Auto activation of tables" }).click();
  await expect(
    page.getByRole("switch", { name: "Auto activation of tables" }),
  ).toBeChecked();
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    guest = await context.newPage();
  await guest.goto(new URL("/q/" + table.public_key, page.url()).href);
  await expect(
    guest.getByRole("button", { name: "Menu", exact: true }),
  ).toBeEnabled();
  await expect(
    guest.getByRole("button", {
      name: "Request table activation",
      exact: true,
    }),
  ).toHaveCount(0);
  await guest.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(guest.locator(".menu-picture img").first()).toBeVisible();
  await guest.locator(".menu-picture img").last().scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      guest
        .locator(".menu-picture img")
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete &&
              (image as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
  await guest.locator(".guest-shell").scrollIntoViewIfNeeded();
  await guest.screenshot({
    path: "verification/customer-picture-menu-mobile.png",
    fullPage: true,
  });
  expect(
    await guest.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.getByRole("switch", { name: "Auto activation of tables" }).click();
  await expect(
    page.getByRole("switch", { name: "Auto activation of tables" }),
  ).not.toBeChecked();
  await guest.reload();
  await expect(
    guest.getByRole("button", { name: "Menu", exact: true }),
  ).toBeEnabled();
  await page.goto("/app/floor-plan");
  await page.getByRole("button", { name: "Add floor", exact: true }).click();
  await page.getByLabel("Floor name", { exact: true }).fill("Rooftop");
  await save(page, "Add floor");
  await expect(page.getByLabel("Floor plan floor")).toHaveValue("Rooftop");
  await page.getByRole("button", { name: "Arrange", exact: true }).click();
  await page
    .getByRole("button", { name: "Floor outline", exact: true })
    .click();
  await page.getByRole("button", { name: "L-shaped", exact: true }).click();
  await page.getByRole("button",{name:"Edge 1",exact:true}).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Add corner", exact: true }).click();
  await page
    .getByRole("button", { name: "Remove corner", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByRole("button", { name: /^Corner \d+$/ }),
  ).toHaveCount(6);
  await page.getByRole("button",{name:"Edge 1",exact:true}).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Add corner", exact: true }).click();
  const corner = page.getByRole("button", { name: "Corner 2", exact: true }),
    handle = await corner.boundingBox();
  await page.mouse.move(
    handle!.x + handle!.width / 2,
    handle!.y + handle!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    handle!.x + handle!.width / 2,
    handle!.y + handle!.height / 2 + 18,
    { steps: 4 },
  );
  await page.mouse.up();
  const polygon = page.locator(".outline-preview polygon"),
    beforeRotation = await polygon.getAttribute("points");
  await page.getByRole("button", { name: "Rotate", exact: true }).click();
  await expect(polygon).not.toHaveAttribute("points", beforeRotation!);
  for (let i = 0; i < 3; i++)
    await page.getByRole("button", { name: "Rotate", exact: true }).click();
  await expect(page.getByRole("dialog").locator("input")).toHaveCount(0);
  const notification = page.getByRole("button", {
    name: "Dismiss notification",
    exact: true,
  });
  if (await notification.isVisible()) await notification.click();
  await page
    .getByRole("dialog")
    .screenshot({ path: "verification/floor-outline-editor.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("dialog")
    .screenshot({ path: "verification/floor-outline-mobile.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Apply outline", exact: true })
    .click();
  await page.getByRole("button", { name: "Save layout", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Arrange", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Rename floor", exact: true }).click();
  await page.getByLabel("Floor name", { exact: true }).fill("Garden lounge");
  await save(page, "Rename floor");
  await page.reload();
  await page.getByLabel("Floor plan floor").selectOption("Garden lounge");
  await expect(
    page.getByLabel("Floor boundary", { exact: true }),
  ).toBeVisible();
  await page.goto("/app/floor");
  await page
    .getByRole("button", { name: "Garden lounge", exact: true })
    .click();
  await page.getByRole("button", { name: "Add table", exact: true }).click();
  await page.getByLabel("Table name", { exact: true }).fill("ROOF01");
  await page.getByLabel("Seats", { exact: true }).fill("10");
  await expect(page.getByLabel("Floor", { exact: true })).toHaveValue(
    "Garden lounge",
  );
  await save(page);
  await page.getByRole("button", { name: "All floors", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit T01 capacity", exact: true })
    .click();
  await page.getByLabel("Floor", { exact: true }).selectOption("Garden lounge");
  await save(page);
  await page.goto("/app/floor-plan");
  await page.getByLabel("Floor plan floor").selectOption("Garden lounge");
  await page.getByRole("button", { name: "Arrange", exact: true }).click();
  await page.getByRole("button", { name: "Save layout", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Arrange", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Table ROOF01 available", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "verification/custom-floor-desktop.png",
    fullPage: true,
  });
  const final = await (await page.request.get("/api/workspace")).json();
  expect(final.tables.find((t: any) => t.id === table.id).public_key).toBe(
    table.public_key,
  );
  expect(
    final.floorPlans.find((p: any) => p.floor === "Garden lounge").outline,
  ).toHaveLength(7);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".sidebar")).not.toBeInViewport();
  await page.screenshot({
    path: "verification/custom-floor-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await context.close();
});

test("POS quantities and customer autocomplete/profile corrections preserve the customer account", async ({
  page,
}) => {
  await register(page);
  const initial = await (await page.request.get("/api/workspace")).json(),
    dish = initial.menu.find((item: any) => item.name === "Butter naan");
  const order = await command(page, "createRound", {
    outletId: initial.outletId,
    type: "TAKEAWAY",
    customer: { name: "Lookup Guest", phone: "9123456777" },
    items: [{ itemId: dish.id, quantity: 1 }],
  });
  await page.goto("/app/pos");
  await page
    .locator(".menu-grid")
    .getByRole("button", { name: /Butter naan/ })
    .click();
  await page
    .locator(".menu-grid")
    .getByRole("button", { name: /Butter naan/ })
    .click();
  await expect(
    page.getByLabel("Butter naan quantity in cart", { exact: true }),
  ).toHaveText("2");
  await page.getByLabel("Butter naan quantity", { exact: true }).fill("5");
  await expect(
    page.getByLabel("Butter naan quantity in cart", { exact: true }),
  ).toHaveText("5");
  await page.getByLabel("Customer name", { exact: true }).fill("Look");
  await page.getByRole("option", { name: /Lookup Guest/ }).click();
  await expect(page.getByLabel("Customer phone", { exact: true })).toHaveValue(
    "+919123456777",
  );
  await page.getByLabel("Customer name", { exact: true }).fill("");
  await page.getByLabel("Customer phone", { exact: true }).fill("9123456");
  await expect(
    page.getByRole("option", { name: /Lookup Guest/ }),
  ).toBeVisible();
  await page.getByLabel("Customer phone", { exact: true }).press("ArrowDown");
  await page.getByLabel("Customer phone", { exact: true }).press("Enter");
  await expect(page.getByLabel("Customer name", { exact: true })).toHaveValue(
    "Lookup Guest",
  );
  await page.screenshot({
    path: "verification/pos-quantity-customer.png",
    fullPage: true,
  });
  await page.goto("/app/customers");
  await page
    .getByRole("row")
    .filter({ has: page.getByText("Lookup Guest", { exact: true }) })
    .getByRole("button", { name: "View", exact: true })
    .click();
  await expect(
    page.getByText(order.customer_id, { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit customer", exact: true })
    .click();
  await page
    .getByLabel("Customer name", { exact: true })
    .fill("Corrected Guest");
  await page.getByLabel("Customer phone", { exact: true }).fill("9123456778");
  await save(page);
  await page
    .getByRole("row")
    .filter({ has: page.getByText("Corrected Guest", { exact: true }) })
    .getByRole("button", { name: "View", exact: true })
    .click();
  await expect(
    page.getByText(order.customer_id, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("+919123456778", { exact: true })).toBeVisible();
  await page
    .getByRole("dialog")
    .screenshot({ path: "verification/customer-profile.png" });
});

test("member details and completed vendors can be edited without changing access or purchase records", async ({
  page,
}) => {
  await register(page);
  const initial = await (await page.request.get("/api/workspace")).json();
  await page.goto("/app/team");
  let member = page
    .getByRole("row")
    .filter({ has: page.getByText("Browser QA", { exact: true }) });
  await member
    .getByRole("button", { name: "Edit member", exact: true })
    .click();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(
    "Browser QA",
  );
  await page.getByLabel("Full name", { exact: true }).fill("Edited Owner");
  await page
    .getByLabel("Monthly base salary (₹)", { exact: true })
    .fill("35000.50");
  await page
    .getByRole("dialog")
    .screenshot({ path: "verification/edit-member.png" });
  await save(page);
  await page.reload();
  member = page
    .getByRole("row")
    .filter({ has: page.getByText("Edited Owner", { exact: true }) });
  await expect(member.getByText("₹35,000.50", { exact: true })).toBeVisible();
  await expect(member.getByText("Owner", { exact: true })).toBeVisible();
  const values = {
    category: "Vegetables",
    description: "Daily produce",
    contact: "Supplier",
    phone: "9123456789",
    email: "vendor@example.test",
    address: "Main road",
    gstin: "",
  };
  const vendor = await command(
    page,
    "record",
    { outletId: initial.outletId, title: "Completed Vendor", data: values },
    { kind: "vendors" },
  );
  await command(
    page,
    "recordDecision",
    { version: 1, state: "APPROVED", reason: "Approved vendor" },
    { id: vendor.id },
  );
  await command(
    page,
    "recordDecision",
    { version: 2, state: "COMPLETED", reason: "Vendor setup complete" },
    { id: vendor.id },
  );
  await page.goto("/app/vendors");
  let row = page
    .getByRole("row")
    .filter({ has: page.getByText("Completed Vendor", { exact: true }) });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Vendor name", { exact: true })).toHaveValue(
    "Completed Vendor",
  );
  await expect(page.getByLabel("Contact person", { exact: true })).toHaveValue(
    "Supplier",
  );
  await page.getByLabel("Vendor name", { exact: true }).fill("Edited Vendor");
  await page.getByLabel("Supplies", { exact: true }).fill("Fresh vegetables");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Updated supply details");
  await page.getByLabel("Contact person", { exact: true }).fill("New Contact");
  await page
    .getByRole("dialog")
    .screenshot({ path: "verification/edit-vendor.png" });
  await save(page);
  await page.reload();
  row = page
    .getByRole("row")
    .filter({ has: page.getByText("Edited Vendor", { exact: true }) });
  await expect(row.getByText("Completed", { exact: true })).toBeVisible();
  await expect(
    row.getByText("Fresh vegetables", { exact: true }),
  ).toBeVisible();
  const updated = await (
    await page.request.get("/api/records/vendors?outlet=" + initial.outletId)
  ).json();
  expect(updated[0].data.contact).toBe("New Contact");
  expect(updated[0].data.phone).toBe(values.phone);
  expect(updated[0].data.email).toBe(values.email);
});

test("table requests activate from Tables and notification reads survive refresh", async ({
  page,
  browser,
}) => {
  await register(page, true);
  const workspace = await (await page.request.get("/api/workspace")).json();
  const table = workspace.tables[0];
  const guest = await browser.newContext();
  const origin = new URL(page.url()).origin;
  const path = origin + "/api/guest/" + table.public_key;
  const headers = { Origin: origin, "Idempotency-Key": randomUUID() };
  expect(
    (
      await guest.request.post(path, {
        headers,
        data: { action: "connect", input: {} },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await guest.request.post(path, {
        headers: { ...headers, "Idempotency-Key": randomUUID() },
        data: { action: "service", input: { kind: "ACTIVATE_TABLE" } },
      })
    ).ok(),
  ).toBe(true);
  const feedPath = "/api/notifications?outlet=" + workspace.outletId;
  const feed = await (await page.request.get(feedPath)).json();
  expect(feed.unread).toBe(1);
  expect(feed.items[0].title).toBe(
    "Table activation requested · " + table.label,
  );
  expect((await guest.request.get(origin + feedPath)).status()).toBe(401);
  expect(
    (
      await page.request.post("/api/notifications", {
        headers: { Origin: "https://invalid.example" },
        data: { outletId: workspace.outletId, through: feed.latest },
      })
    ).status(),
  ).toBe(403);
  await page.goto("/app/floor");
  const card = page.locator(".table-card").filter({
    has: page.getByRole("heading", { name: table.label, exact: true }),
  });
  await expect(
    card.getByText("Activation requested", { exact: true }),
  ).toBeVisible();
  await card
    .getByRole("button", { name: "Activate table", exact: true })
    .click();
  await save(page, "Activate table");
  await page.getByRole("link", { name: "Tables", exact: true }).click();
  await expect(card.getByText("Occupied", { exact: true })).toBeVisible();
  expect(
    (await (await guest.request.get(path)).json()).activationRequired,
  ).toBe(false);
  expect(
    (
      await page.request.post("/api/notifications", {
        headers: { Origin: origin },
        data: { outletId: workspace.outletId, ids: [feed.items[0].id] },
      })
    ).ok(),
  ).toBe(true);
  expect((await (await page.request.get(feedPath)).json()).unread).toBe(0);
  await guest.close();
});
async function register(page: Page, qr = false) {
  // Each isolated browser account represents a separate client in rate-limit tests.
  if (!process.env.QA_BASE_URL || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(process.env.QA_BASE_URL))
    await page.setExtraHTTPHeaders({
      "x-forwarded-for": "10." + [...randomBytes(3)].join("."),
    });
  const email =
      "browser-" +
      Date.now() +
      "-" +
      randomBytes(3).toString("hex") +
      "@example.test",
    password = randomBytes(24).toString("base64url");
  await page.goto("/signup");
  await page.getByLabel("Your name", { exact: true }).fill("Browser QA");
  await page
    .getByLabel("Restaurant name", { exact: true })
    .fill("Browser QA Restaurant");
  await page.getByLabel("First outlet", { exact: true }).fill("Main");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Customer QR ordering").selectOption(qr ? "on" : "off");
  await page.getByLabel("Add a sample menu and 12 tables").check();
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.waitForURL("**/app/overview");
  if (process.env.QA_ACCOUNTS_FILE)
    await appendFile(
      process.env.QA_ACCOUNTS_FILE,
      JSON.stringify({ email }) + "\n",
    );
  await expect(page.getByText("Settled sales", { exact: true })).toBeVisible();
  return { email, password };
}
async function save(page: Page, name = "Save") {
  await page
    .getByRole("dialog")
    .getByRole("button", { name, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
}
async function dragFloorObject(
  page: Page,
  object: Locator,
  x: number,
  y: number,
) {
  await object.scrollIntoViewIfNeeded();
  const start = await object.evaluate((element) => ({
      x: parseFloat((element as HTMLElement).style.left),
      y: parseFloat((element as HTMLElement).style.top),
    })),
    box = await object.boundingBox();
  const scale = await page
    .locator(".floor-camera")
    .evaluate(
      (element) => new DOMMatrix(getComputedStyle(element).transform).a,
    );
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box!.x + box!.width / 2 + (x - start.x) * scale,
    box!.y + box!.height / 2 + (y - start.y) * scale,
    { steps: 6 },
  );
  await page.mouse.up();
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
test("prepaid order reaches an immutable final invoice through kitchen service", async ({
  page,
}) => {
  await register(page);
  await page.getByRole("link", { name: "Cashier POS", exact: true }).click();
  await page.getByRole("button", { name: /Paneer tikka/ }).click();
  await page.getByRole("button", { name: /Mint cooler/ }).click();
  await page.getByRole("button", { name: "Create order", exact: true }).click();
  await page.waitForURL("**/app/orders/*");
  await page.getByRole("dialog", { name: "Order placed", exact: true }).getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Accept round", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Add details", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Test Guest");
  await page.getByLabel("Mobile number", { exact: true }).fill("9876543210");
  await save(page);
  await page.getByRole("button", { name: /^Receive ₹/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Record payment ·/ })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator(".payment-list .badge.received")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Verify", exact: true }),
  ).toHaveCount(0);
  const orderUrl = page.url();
  await page.getByRole("link", { name: "Kitchen", exact: true }).click();
  await page
    .getByRole("button", { name: "Start preparing", exact: true })
    .first()
    .waitFor();
  for (const display of ["Food", "Bar"]) {
    await page
      .getByLabel("Production display")
      .getByRole("button", { name: display, exact: true })
      .click();
    for (const action of ["Start preparing", "Mark ready"]) {
      while (
        await page.getByRole("button", { name: action, exact: true }).count()
      ) {
        await Promise.all([
          page.waitForResponse(
            (r) =>
              r.url().includes("/api/workspace?outlet=") && r.status() === 200,
          ),
          page
            .getByRole("button", { name: action, exact: true })
            .first()
            .click(),
        ]);
        await expect(page.locator("fieldset[disabled]")).toHaveCount(0);
      }
    }
  }
  await page.goto(orderUrl);
  await page.getByRole("button", { name: "Mark served", exact: true }).click();
  await page
    .getByRole("button", { name: "Settle", exact: true })
    .click();
  await page.getByRole("button",{name:"Invoice",exact:true}).click();
  await page.waitForURL("**/invoice/*");
  await expect(
    page.getByRole("article", { name: "Final tax invoice", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Test Guest", { exact: true })).toBeVisible();
});
test("table cards open a code-free customer menu and submit pending orders", async ({
  page,
  browser,
}) => {
  await register(page, true);
  const workspace = await (await page.request.get("/api/workspace")).json();
  const dish = workspace.menu.find((m: any) => m.name === "Paneer tikka");
  const configured = await page.evaluate(
    async ({ item, outletId }) => {
      const result = await fetch("/api/commands", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          action: "menu",
          input: {
            id: item.id,
            version: item.version,
            outletId,
            name: item.name,
            category: item.category,
            description: item.description,
            price: Number(item.price),
            taxBps: item.tax_bps,
            unit: item.unit,
            station: item.station,
            variants: [{ id: "large", name: "Large", price: 5000 }],
            modifiers: [{ id: "extra", name: "Extra sauce", price: 1500 }],
          },
        }),
      });
      return result.ok;
    },
    { item: dish, outletId: workspace.outletId },
  );
  expect(configured).toBe(true);
  await expect(
    page
      .locator('nav[aria-label="Main navigation"]')
      .getByRole("link", { name: "Table QR", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Tables", exact: true }).click();
  await page.getByRole("link", { name: "Table QR", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Table QR", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Customer QR ordering", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    page.getByText("OFF · Staff approval", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".qr-screen-card img")).toHaveCount(12);
  const card = page
    .locator(".qr-card")
    .filter({ has: page.getByRole("heading", { name: "T01", exact: true }) });
  const url = await card
    .getByRole("link", { name: "Preview menu for T01", exact: true })
    .getAttribute("href");
  const secondUrl = await page
    .locator(".qr-card")
    .filter({ has: page.getByRole("heading", { name: "T02", exact: true }) })
    .getByRole("link", { name: "Preview menu for T02", exact: true })
    .getAttribute("href");
  const downloadEvent = page.waitForEvent("download");
  await card
    .getByRole("button", { name: "Download PNG for T01", exact: true })
    .click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("Table-T01-QR.png");
  await download.saveAs("verification/table-T01-QR.png");
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".qr-card:visible")).toHaveCount(12);
  await page.pdf({
    path: "verification/all-table-QR-print.pdf",
    preferCSSPageSize: true,
    printBackground: true,
  });
  await page.emulateMedia({ media: "screen" });
  await page.getByLabel("Select visible tables", { exact: true }).uncheck();
  await page.getByLabel("Search tables", { exact: true }).fill("T01");
  await expect(page.locator(".qr-card:visible")).toHaveCount(1);
  await page.getByLabel("Select visible tables", { exact: true }).check();
  await page.getByLabel("Search tables", { exact: true }).clear();
  await page.getByLabel("Select T01", { exact: true }).check();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".qr-card:visible")).toHaveCount(1);
  await expect(page.locator(".sidebar")).toBeHidden();
  await page.pdf({
    path: "verification/table-QR-print.pdf",
    preferCSSPageSize: true,
    printBackground: true,
  });
  await page.emulateMedia({ media: "screen" });
  await page.screenshot({
    path: "verification/table-qr-desktop.png",
    fullPage: true,
  });
  const guestContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const guest = await guestContext.newPage();
  const errors: string[] = [];
  guest.on("pageerror", (e) => errors.push(e.message));
  await guest.goto(url!);
  await expect(
    guest.getByRole("button", { name: "Call waiter", exact: true }),
  ).toBeVisible();
  for (const name of ["Menu", "Water", "Bill", "My order"])
    await expect(
      guest.getByRole("button", { name, exact: true }),
    ).toBeDisabled();
  await expect(
    guest.getByRole("button", { name: "Activate my table", exact: true }),
  ).toHaveCount(0);
  const scanned = await (await page.request.get("/api/workspace")).json();
  expect(
    scanned.sessions.filter(
      (session: any) =>
        session.table_id ===
        scanned.tables.find((table: any) => table.label === "T01").id,
    ),
  ).toHaveLength(0);
  await guest
    .getByRole("button", { name: "Request table activation", exact: true })
    .click();
  await expect(
    guest.getByRole("button", { name: "Activation requested", exact: true }),
  ).toBeDisabled();
  await guest.reload();
  await expect(
    guest.getByRole("button", { name: "Activation requested", exact: true }),
  ).toBeDisabled();
  await guest.screenshot({
    path: "verification/customer-activation-request-mobile.png",
    fullPage: true,
  });
  await page.goto("/app/tasks");
  const activationRow = page
    .getByRole("row")
    .filter({ has: page.getByText("Activate table", { exact: true }) });
  await expect(activationRow).toHaveCount(1);
  await activationRow
    .getByRole("button", { name: "Activate table", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .screenshot({ path: "verification/staff-activation-dialog.png" });
  await save(page, "Activate table");
  await guest.reload();
  for (const name of ["Menu", "Water", "Bill", "My order"])
    await expect(
      guest.getByRole("button", { name, exact: true }),
    ).toBeEnabled();
  await expect(
    guest.getByRole("button", {
      name: "Request table activation",
      exact: true,
    }),
  ).toHaveCount(0);
  await guest.getByRole("button", { name: "Call waiter", exact: true }).click();
  await expect(
    guest.getByText("Your waiter has been called.", { exact: true }),
  ).toBeVisible();
  await guest.screenshot({
    path: "verification/customer-home-mobile.png",
    fullPage: true,
  });
  await guest.setViewportSize({ width: 1440, height: 1000 });
  await guest.screenshot({
    path: "verification/customer-home-desktop.png",
    fullPage: true,
  });
  await guest.setViewportSize({ width: 390, height: 844 });
  await guest.getByRole("button", { name: "Water", exact: true }).click();
  await expect(
    guest.getByText("Water requested.", { exact: true }),
  ).toBeVisible();
  await guest.getByRole("button", { name: "Bill", exact: true }).click();
  await expect(
    guest.getByText("Your bill has been requested.", { exact: true }),
  ).toBeVisible();
  await guest.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(
    guest.getByRole("button", { name: "Add Butter naan" }),
  ).toBeEnabled();
  await expect(guest.getByLabel("Table pairing code")).toHaveCount(0);
  await guest.screenshot({
    path: "verification/scan-menu-mobile.png",
    fullPage: true,
  });
  await guest.getByLabel("Search menu").fill("Butter");
  await expect(guest.locator(".guest-menu article")).toHaveCount(1);
  await guest.getByRole("button", { name: "Add Butter naan" }).click();
  await guest.getByLabel("Search menu").fill("Paneer");
  await guest.getByRole("button", { name: "Add Paneer tikka" }).click();
  await guest.getByLabel("Variant", { exact: true }).selectOption("large");
  await guest.getByLabel("Extra sauce", { exact: true }).check();
  await guest
    .getByRole("dialog")
    .getByRole("button", { name: /Add ·/ })
    .click();
  await expect(
    guest.getByText("Large · Extra sauce", { exact: true }),
  ).toBeVisible();
  await guest.getByLabel("Paneer tikka quantity", { exact: true }).fill("2");
  await guest.getByRole("button", { name: "Remove Paneer tikka" }).click();
  await expect(
    guest.getByText("Large · Extra sauce", { exact: true }),
  ).toHaveCount(0);
  await guest.getByLabel("Customer name").fill("QR Guest");
  await guest.getByLabel("Customer phone").fill("9456789012");
  await guest.getByRole("button", { name: /Place order/ }).click();
  await guest.getByRole("dialog", { name: "Order placed", exact: true }).getByRole("button", { name: "Done", exact: true }).click();
  await expect(guest.getByRole("heading", { name: /Order #/ })).toBeVisible();
  await expect(
    guest.getByText("Waiting for your server", { exact: true }),
  ).toBeVisible();
  await guest.reload();
  await guest.getByRole("button", { name: "My order", exact: true }).click();
  await expect(guest.getByRole("heading", { name: /Order #/ })).toBeVisible();
  await guest.goto(secondUrl!);
  await guest.getByRole("button", { name: "Call waiter", exact: true }).click();
  await expect(
    guest.getByText("Your waiter has been called.", { exact: true }),
  ).toBeVisible();
  await guest.goto(url!);
  await guest.getByRole("button", { name: "My order", exact: true }).click();
  await expect(guest.getByRole("heading", { name: /Order #/ })).toBeVisible();
  const second = await browser.newContext();
  const secondPage = await second.newPage();
  await secondPage.goto(url!);

  await secondPage
    .getByRole("button", { name: "My order", exact: true })
    .click();
  await expect(
    secondPage.getByRole("heading", { name: /Order #/ }),
  ).toHaveCount(0);
  await second.close();
  await page.getByRole("link", { name: "Tables", exact: true }).click();
  const table = page
    .locator(".table-card")
    .filter({ has: page.getByRole("heading", { name: "T01", exact: true }) });
  await expect(table.getByText("Occupied", { exact: true })).toBeVisible();
  const availableTable = page.locator(".table-card").filter({
    has: page.getByRole("heading", { name: "T03", exact: true }),
  });
  await expect(
    availableTable.getByRole("button", { name: "Seat guests", exact: true }),
  ).toBeVisible();
  await expect(
    availableTable.getByRole("button", { name: "Customer QR", exact: true }),
  ).toHaveCount(0);
  await availableTable
    .getByRole("button", { name: "Table QR", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "T03 Table QR", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("img", { name: "Customer QR for T03", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .locator('nav[aria-label="Main navigation"] a[href="/app/orders"]')
    .click();
  await page.waitForURL("**/app/orders");
  await page.reload();
  await expect(page.getByText("QR Guest", { exact: true })).toBeVisible();
  await page
    .getByRole("row")
    .filter({ has: page.getByText("QR Guest", { exact: true }) })
    .getByRole("button", { name: /^Open order / })
    .click();
  await page.getByRole("button", { name: "Ban device", exact: true }).click();
  await page.getByLabel("Duration", { exact: true }).selectOption("15");
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Repeated unwanted requests");
  await page
    .getByRole("dialog")
    .screenshot({ path: "verification/device-ban-dialog.png" });
  await save(page, "Ban device");
  await expect(
    page.getByRole("button", { name: "Lift ban", exact: true }),
  ).toBeVisible();
  await page
    .locator(".device-control")
    .screenshot({ path: "verification/device-ban-control.png" });
  await guest.reload();
  await expect(
    guest.getByText(
      "This browser is temporarily blocked at this outlet. Please speak to a staff member.",
      { exact: true },
    ),
  ).toBeVisible();
  const deviceCookie = (await guestContext.cookies()).find(
    (cookie) => cookie.name === "dd_device",
  );
  expect(deviceCookie?.httpOnly).toBe(true);
  expect(deviceCookie!.expires - Date.now() / 1000).toBeGreaterThan(
    300 * 86400,
  );
  const denied = await guest.request.post(url!.replace("/q/", "/api/guest/"), {
    headers: { Origin: new URL(url!).origin, "Idempotency-Key": randomUUID() },
    data: { action: "service", input: { kind: "HELP" } },
  });
  expect(denied.status()).toBe(403);
  expect((await denied.json()).error.code).toBe("DEVICE_TEMPORARILY_BANNED");
  await guest.goto(secondUrl!);
  await expect(
    guest.getByText(
      "This browser is temporarily blocked at this outlet. Please speak to a staff member.",
      { exact: true },
    ),
  ).toBeVisible();
  const unaffectedContext = await browser.newContext();
  const unaffected = await unaffectedContext.newPage();
  await unaffected.goto(url!);
  await unaffected.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(
    unaffected.getByRole("button", { name: "Add Butter naan", exact: true }),
  ).toBeEnabled();
  await unaffectedContext.close();
  await page.getByRole("button", { name: "Lift ban", exact: true }).click();
  await save(page, "Lift ban");
  await expect(
    page.getByRole("button", { name: "Ban device", exact: true }),
  ).toBeVisible();
  await guest.goto(url!);
  await guest.getByRole("button", { name: "My order", exact: true }).click();
  await expect(guest.getByRole("heading", { name: /Order #/ })).toBeVisible();
  await guest
    .getByRole("button", { name: "Request water", exact: true })
    .click();
  await expect(
    guest.getByText("Water requested.", { exact: true }),
  ).toBeVisible();
  expect(
    await guest.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await expect(
    page
      .locator('nav[aria-label="Main navigation"]')
      .getByRole("link", { name: "Table QR", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Tables", exact: true }).click();
  await page.getByRole("link", { name: "Table QR", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".qr-page")).toBeVisible();
  await expect(page.locator(".sidebar")).not.toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: "verification/table-qr-mobile.png",
    fullPage: false,
  });
  await page
    .getByRole("switch", { name: "Customer QR ordering", exact: true })
    .click();
  await save(page, "Pause ordering");
  await guest.reload();
  await expect(
    guest.getByText(
      "QR ordering is paused. Please order with a staff member.",
      {
        exact: true,
      },
    ),
  ).toBeVisible();
  expect(errors).toEqual([]);
  await guestContext.close();
});

test("local review entry is disabled outside dedicated preview storage", async ({
  request,
}) => {
  const reply = await request.get("/preview", { maxRedirects: 0 });
  expect(reply.status()).toBe(404);
});

test("navigation stays large and keyboard search opens management pages", async ({
  page,
}) => {
  await register(page);
  const navigation = page.locator(".sidebar");
  await expect(
    page.getByRole("link", { name: "Cashier POS", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^(Expand|Collapse) navigation$/ }),
  ).toHaveCount(0);
  const dimensions = await navigation.boundingBox();
  expect(dimensions!.width).toBeGreaterThanOrEqual(260);
  const orderLink = page.getByRole("link", { name: "Orders", exact: true });
  expect((await orderLink.boundingBox())!.height).toBeGreaterThanOrEqual(52);
  await page.evaluate(() =>
    localStorage.setItem("dd-compact-navigation", "true"),
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".app-shell")).not.toHaveClass(/nav-compact/);
  await expect(orderLink.locator("span").first()).toBeVisible();
  expect(
    Math.round((await navigation.boundingBox())!.width),
  ).toBeGreaterThanOrEqual(260);
  await page.keyboard.press("Control+k");
  const input = page.getByRole("combobox", {
    name: "Search pages",
    exact: true,
  });
  await expect(input).toBeFocused();
  await input.fill("invent");
  await expect(
    page.getByRole("option", { name: "Inventory", exact: true }),
  ).toBeVisible();
  await input.press("Enter");
  await page.waitForURL("**/app/inventory");
  await expect(
    page.getByRole("heading", { name: "Inventory", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Search pages", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Search pages", exact: true })
    .fill("does not exist");
  await expect(page.getByText("No pages found", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Manage", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("link", { name: "Menu", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Menu", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Cashier POS", exact: true }),
  ).toBeVisible();
  expect(
    Math.round((await navigation.boundingBox())!.width),
  ).toBeGreaterThanOrEqual(260);
  expect((await orderLink.boundingBox())!.height).toBeGreaterThanOrEqual(52);
});

test("draft round editor uses whole quantities, supports delete/undo and preserves cancelled edits before kitchen submission", async ({
  page,
}) => {
  await register(page);
  await page.getByRole("link", { name: "Cashier POS", exact: true }).click();
  const dish = page
    .locator(".menu-grid")
    .getByRole("button", { name: /Paneer tikka/ });
  await dish.click();
  await expect(dish).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /Mint cooler/ }).click();
  await page.getByLabel("Customer name", { exact: true }).fill("Editor Guest");
  await page.getByLabel("Customer phone", { exact: true }).fill("9123456781");
  await page.screenshot({
    path: "verification/pos-selected-items.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Save as draft", exact: true })
    .click();
  await page.waitForURL("**/app/orders/*");
  await expect(page.getByText("Editor Guest", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Edit & submit draft", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const quantity = dialog.getByLabel("Paneer tikka quantity", { exact: true });
  await expect(quantity).toHaveAttribute("step", "1");
  await quantity.fill("0.99");
  await expect(
    dialog.getByText("Use whole numbers, such as 1 or 2.", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Save & submit", exact: true }),
  ).toBeDisabled();
  await quantity.fill("0");
  await expect(
    dialog.getByText("Use Delete to remove this item.", { exact: true }),
  ).toBeVisible();
  await quantity.fill("2");
  await dialog
    .getByRole("button", {
      name: "Increase Paneer tikka quantity",
      exact: true,
    })
    .click();
  await expect(quantity).toHaveValue("3");
  await dialog
    .getByRole("button", { name: "Delete Mint cooler", exact: true })
    .click();
  await expect(
    dialog.getByLabel("Mint cooler quantity", { exact: true }),
  ).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Undo delete", exact: true })
    .click();
  await expect(
    dialog.getByLabel("Mint cooler quantity", { exact: true }),
  ).toHaveValue("1");
  await dialog.screenshot({ path: "verification/round-editor-desktop.png" });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".round-panel tbody tr")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Edit & submit draft", exact: true })
    .click();
  await expect(quantity).toHaveValue("1");
  await quantity.fill("3");
  await dialog
    .getByRole("button", { name: "Delete Mint cooler", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.screenshot({ path: "verification/round-editor-mobile.png" });
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    ),
  ).toBe(false);
  await dialog
    .getByRole("button", { name: "Delete Paneer tikka", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Save & submit", exact: true }),
  ).toBeDisabled();
  await expect(dialog.getByText(/Keep at least one item/)).toBeVisible();
  await dialog
    .getByRole("button", { name: "Undo delete", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Save & submit", exact: true }).click();
  await page.getByRole("dialog", { name: "Order placed", exact: true }).getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator(".round-panel tbody tr")).toHaveCount(1);
  await expect(
    page.locator(".round-panel tbody tr").getByRole("cell").nth(1),
  ).toHaveText("3");
  await expect(
    page.getByRole("button", { name: "Edit & submit draft", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Settle", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Before settlement", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Review payment", exact: true }),
  ).toBeVisible();
});

test("menu categories, reservations and vendor descriptions work through their forms", async ({
  page,
}) => {
  await register(page);
  await page.goto("/app/menu");
  await page.getByRole("button", { name: "Categories", exact: true }).click();
  await page.getByRole("button", { name: "Add category", exact: true }).click();
  await page.getByLabel("Category name", { exact: true }).fill("Chinese");
  await save(page);
  await page
    .getByLabel("Filter menu category", { exact: true })
    .selectOption("Chinese");
  await page.getByRole("button", { name: "Add dish", exact: true }).click();
  await page.getByLabel("Dish name", { exact: true }).fill("Hakka noodles");
  await uploadMenuPhoto(page, "butter-naan");
  await page.getByLabel("Category", { exact: true }).selectOption("Chinese");
  await page.getByLabel("Price (₹)", { exact: true }).fill("180");
  await save(page);
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "Hakka noodles" })
      .filter({ hasText: "Chinese" }),
  ).toBeVisible();
  await expect(
    page
      .locator(".sidebar")
      .getByRole("link", { name: "Recipes", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Recipes", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Recipes", exact: true }).click();
  await page.waitForURL("**/app/recipes");
  const navigation = page.locator('nav[aria-label="Main navigation"]');
  await navigation
    .getByRole("link", { name: "Menu", exact: true })
    .evaluate((element) => element.scrollIntoView({ block: "center" }));
  const before = await navigation.evaluate((element) => element.scrollTop);
  expect(before).toBeGreaterThan(0);
  await page.getByRole("link", { name: "Menu", exact: true }).click();
  await page.waitForURL("**/app/menu");
  expect(
    await navigation.evaluate((element) => element.scrollTop),
  ).toBeGreaterThanOrEqual(before - 2);
  await page.goto("/app/reservations");
  await page
    .getByRole("button", { name: "Add reservation", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Guest name", { exact: true })
    .fill("Reservation Guest");
  await dialog.getByLabel("Mobile number", { exact: true }).fill("9123456782");
  const workspace = await (await page.request.get("/api/workspace")).json();
  await dialog
    .getByRole("combobox", { name: "Table", exact: true })
    .selectOption(workspace.tables[0].id);
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  if (
    !(await dialog
      .getByRole("button", { name: "Reserve on " + tomorrow, exact: true })
      .count())
  )
    await dialog
      .getByRole("button", { name: "Next month", exact: true })
      .click();
  await dialog
    .getByRole("button", { name: "Reserve on " + tomorrow, exact: true })
    .click();
  await dialog.screenshot({
    path: "verification/reservation-editor-desktop.png",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.screenshot({
    path: "verification/reservation-editor-mobile.png",
  });
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    ),
  ).toBe(false);
  await save(page, "Save reservation");
  await expect(
    page.getByRole("row", { name: /Reservation Guest \+919123456782/ }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/app/vendors");
  await page.getByRole("button", { name: "Add vendor", exact: true }).click();
  await page.getByLabel("Vendor name", { exact: true }).fill("Fresh Farm");
  await page.getByLabel("Supplies", { exact: true }).fill("Mushrooms");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Fresh oyster mushrooms");
  await page.getByLabel("Contact person", { exact: true }).fill("Farm Contact");
  await save(page);
  await expect(page.getByText("Mushrooms", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Fresh oyster mushrooms", { exact: true }),
  ).toBeVisible();
});

test("payment methods and shift attendance are configurable from their pages", async ({
  page,
}) => {
  await register(page);
  await page.goto("/app/payments");
  await page
    .getByRole("button", { name: "Payment methods", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Card", { exact: true }).check();
  await dialog.getByLabel("Online transfer", { exact: true }).check();
  await save(page, "Save methods");
  const workspace = await (await page.request.get("/api/workspace")).json();
  expect(workspace.outlets[0].payment_methods).toEqual(
    expect.arrayContaining(["CASH", "CARD", "ONLINE"]),
  );
  await page.goto("/app/attendance");
  await page.getByRole("button", { name: "Shifts", exact: true }).click();
  await page.getByRole("button", { name: "Add shift", exact: true }).click();
  await page.getByLabel("Shift name", { exact: true }).fill("Morning");
  await save(page);
  await page
    .getByRole("button", { name: "Record attendance", exact: true })
    .click();
  await page
    .getByLabel("Employee", { exact: true })
    .selectOption(workspace.actor.employeeId);
  const refreshed = await (await page.request.get("/api/workspace")).json();
  await page
    .getByLabel("Shift", { exact: true })
    .selectOption(refreshed.shifts[0].id);
  await save(page);
  await expect(
    page.getByRole("cell", { name: "Present", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Manager recorded", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Check out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Check out", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "verification/attendance-desktop.png",
    fullPage: true,
  });
});

test("floor controls move and swap sessions, close tables and reject service with a reason", async ({
  page,
}) => {
  await register(page, true);
  const workspace = await (await page.request.get("/api/workspace")).json();
  const [first, second, third] = workspace.tables;
  const firstSession = await command(page, "openSession", {
    tableId: first.id,
    guests: 2,
  });
  const secondSession = await command(page, "openSession", {
    tableId: second.id,
    guests: 3,
  });
  const tableCard = (name: string) =>
    page
      .locator(".table-card")
      .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await page.goto("/app/floor");
  await tableCard(first.label)
    .getByLabel("Actions for " + first.label)
    .click();
  await tableCard(first.label)
    .getByRole("menuitem", { name: "Move / swap", exact: true })
    .click();
  await page
    .getByLabel("Destination table", { exact: true })
    .selectOption(third.id);
  await save(page, "Move / swap");
  let data = await (await page.request.get("/api/workspace")).json();
  expect(
    data.sessions.find((s: any) => s.id === firstSession.id).table_id,
  ).toBe(third.id);
  await tableCard(third.label)
    .getByLabel("Actions for " + third.label)
    .click();
  await tableCard(third.label)
    .getByRole("menuitem", { name: "Move / swap", exact: true })
    .click();
  await expect(page.getByLabel("Destination table")).toContainText(
    second.label + " · occupied, swap guests",
  );
  await page.getByLabel("Destination table").selectOption(second.id);
  await save(page, "Move / swap");
  data = await (await page.request.get("/api/workspace")).json();
  expect(
    data.sessions.find((s: any) => s.id === firstSession.id).table_id,
  ).toBe(second.id);
  expect(
    data.sessions.find((s: any) => s.id === secondSession.id).table_id,
  ).toBe(third.id);
  await page.goto("/app/tasks");
  await page.getByRole("button", { name: "Request", exact: true }).click();
  await page
    .getByLabel("Table session", { exact: true })
    .selectOption(firstSession.id);
  await page.getByLabel("Request", { exact: true }).selectOption("WATER");
  await save(page);
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Water station temporarily unavailable");
  await save(page, "Reject request");
  await expect(
    page.getByRole("cell", { name: "Rejected", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Water station temporarily unavailable", { exact: true }),
  ).toBeVisible();
  await page.goto("/app/qr");
  await page
    .locator(".qr-card")
    .filter({
      has: page.getByRole("heading", { name: second.label, exact: true }),
    })
    .getByRole("button", { name: "Close table", exact: true })
    .click();
  await save(page, "Close table");
  data = await (await page.request.get("/api/workspace")).json();
  expect(data.sessions.some((s: any) => s.table_id === second.id)).toBe(false);
});

test("order and payment filters show the corresponding records", async ({
  page,
}) => {
  await register(page, true);
  const workspace = await (await page.request.get("/api/workspace")).json();
  const make = () =>
    command(page, "createRound", {
      outletId: workspace.outletId,
      type: "TAKEAWAY",
      items: [{ itemId: workspace.menu[0].id, quantity: 1 }],
    });
  const customerOrder = async (table: any) => {
    await command(page, "openSession", { tableId: table.id, guests: 1 });
    const headers = {
      Origin: new URL(page.url()).origin,
      "Idempotency-Key": randomUUID(),
    };
    const connect = await page.request.post("/api/guest/" + table.public_key, {
      headers,
      data: { action: "connect", input: {} },
    });
    expect(connect.ok(), await connect.text()).toBe(true);
    const reply = await page.request.post("/api/guest/" + table.public_key, {
      headers: { ...headers, "Idempotency-Key": randomUUID() },
      data: {
        action: "order",
        input: {
          name: "Filter QR Guest",
          phone: "9123456786",
          items: [{ itemId: workspace.menu[0].id, quantity: 1 }],
        },
      },
    });
    const data = await reply.json();
    expect(reply.ok(), JSON.stringify(data)).toBe(true);
    const detail = await page.request.get("/api/orders/" + data.id);
    expect(detail.ok()).toBe(true);
    return detail.json();
  };
  const pending = await customerOrder(workspace.tables[0]),
    accepted = await make(),
    rejected = await customerOrder(workspace.tables[1]);
  expect(accepted.rounds[0].status).toBe("ACCEPTED");
  await command(
    page,
    "decideRound",
    {
      version: rejected.rounds[0].version,
      decision: "REJECT",
      reason: "Guest changed their plans",
    },
    { orderId: rejected.id, roundId: rejected.rounds[0].id },
  );
  await page.goto("/app/orders");
  const filter = (name: string) =>
    page
      .locator(".orders-panel .tabs")
      .getByRole("button", { name, exact: true });
  for (const [name, number] of [
    ["Pending", pending.number],
    ["Accepted", accepted.number],
    ["Rejected", rejected.number],
  ] as const) {
    await filter(name).click();
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Open order " + number, exact: true }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole("button", { name: "Voided", exact: true }),
  ).toHaveCount(0);
  for (const name of ["Cancelled", "Settled"]) {
    await filter(name).click();
    await expect(
      page.getByText("No orders in this view.", { exact: true }),
    ).toBeVisible();
  }
  await filter("Active").click();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await filter("All").click();
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await page.goto("/app/orders/" + accepted.id);
  await page.getByRole("button", { name: "Add details", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Filter Guest");
  await page.getByLabel("Mobile number", { exact: true }).fill("9123456784");
  await save(page);
  await page.getByRole("button", { name: /^Receive ₹/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Record payment ·/ })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.goto("/app/payments");
  const tabs = page.getByLabel("Payment methods", { exact: true });
  await tabs.getByRole("button", { name: "Cash", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "Cash", exact: true }),
  ).toBeVisible();
  for (const name of [
    "UPI transfer",
    "UPI QR",
    "UPI phone number",
    "Card",
    "Online transfer",
  ]) {
    await tabs.getByRole("button", { name, exact: true }).click();
    await expect(
      page.getByRole("cell", { name: "Cash", exact: true }),
    ).toHaveCount(0);
  }
  await tabs.getByRole("button", { name: "All", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "Cash", exact: true }),
  ).toBeVisible();
});

test("recipe editing, liquor forms, direct purchase approval and checklist assignments persist", async ({
  page,
}) => {
  await register(page);
  await page.goto("/app/inventory");
  await page.getByRole("button", { name: "Ingredient", exact: true }).click();
  await page
    .getByLabel("Ingredient name", { exact: true })
    .fill("Recipe flour");
  await save(page);
  let workspace = await (await page.request.get("/api/workspace")).json();
  const flour = workspace.ingredients.find(
    (i: any) => i.name === "Recipe flour",
  );
  const dish = workspace.menu[0];
  await command(page, "recipe", {
    itemId: dish.id,
    ingredients: [{ id: flour.id, quantityMilli: 250 }],
  });
  await page.goto("/app/recipes");
  await page
    .getByRole("button", { name: "Edit recipe for " + dish.name, exact: true })
    .click();
  await expect(
    page.getByLabel("Recipe flour (kg per sell unit)", { exact: true }),
  ).toHaveValue("0.25");
  await page
    .getByLabel("Recipe flour (kg per sell unit)", { exact: true })
    .fill("0.3");
  await save(page);
  await page
    .getByRole("button", { name: "Edit recipe for " + dish.name, exact: true })
    .click();
  await expect(
    page.getByLabel("Recipe flour (kg per sell unit)", { exact: true }),
  ).toHaveValue("0.3");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.goto("/app/inventory");
  await page.getByRole("button", { name: "Liquor", exact: true }).click();
  await page.getByRole("button", { name: "Liquor stock", exact: true }).click();
  await page
    .getByLabel("Ingredient name", { exact: true })
    .fill("House whisky");
  await expect(page.getByLabel("Unit", { exact: true })).toHaveValue("L");
  await save(page);
  await expect(page.getByText("House whisky", { exact: true })).toBeVisible();
  workspace = await (await page.request.get("/api/workspace")).json();
  const liquor = workspace.ingredients.find(
    (i: any) => i.name === "House whisky",
  );
  await page.goto("/app/menu");
  await page.getByRole("button", { name: "Add liquor", exact: true }).click();
  await page.getByLabel("Liquor name", { exact: true }).fill("Whisky 30 ml");
  await uploadMenuPhoto(page, "mint-cooler");
  await page.getByLabel("Price (₹)", { exact: true }).fill("120");
  await page.getByLabel("Peg size (ml)", { exact: true }).fill("30");
  await page
    .getByLabel("Liquor stock", { exact: true })
    .selectOption(liquor.id);
  await save(page);
  workspace = await (await page.request.get("/api/workspace")).json();
  expect(
    workspace.menu.find((m: any) => m.name === "Whisky 30 ml"),
  ).toMatchObject({ unit: "peg", peg_ml: 30, liquor_ingredient_id: liquor.id });
  await page.goto("/app/vendors");
  await page.getByRole("button", { name: "Add vendor", exact: true }).click();
  await page.getByLabel("Vendor name", { exact: true }).fill("Flour supplier");
  await page.getByLabel("Supplies", { exact: true }).fill("Flour");
  await page.getByLabel("Contact person", { exact: true }).fill("Supplier");
  await save(page);
  const vendors = await (
    await page.request.get("/api/records/vendors?outlet=" + workspace.outletId)
  ).json();
  await page.goto("/app/purchases");
  await page.getByRole("button", { name: "Add purchase", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Flour delivery");
  await page.getByLabel("Vendor", { exact: true }).selectOption(vendors[0].id);
  await page
    .getByLabel("Purchase order reference", { exact: true })
    .fill("PO-UI-1");
  await page.getByLabel("Order amount (₹)", { exact: true }).fill("500");
  await save(page);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "Approved", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();
  const expenses = await (
    await page.request.get("/api/records/expenses?outlet=" + workspace.outletId)
  ).json();
  expect(expenses).toHaveLength(1);
  expect(expenses[0].data.amount).toBe(50000);
  await page.goto("/app/checklists");
  await page
    .getByRole("button", { name: "Add checklist", exact: true })
    .click();
  await page.getByLabel("Title", { exact: true }).fill("Opening inspection");
  const assignee = page.getByLabel("Assigned to", { exact: true });
  await expect(assignee.locator("option[value]:not([value=''])")).toHaveCount(
    workspace.assignmentEmployees.length,
  );
  await assignee.selectOption(workspace.actor.employeeId);
  await page
    .getByLabel("Due date", { exact: true })
    .fill(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
  await page
    .getByLabel("Instructions", { exact: true })
    .fill("Inspect the opening station");
  await save(page);
  await expect(
    page.getByText("Opening inspection", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Browser QA", { exact: true }).last(),
  ).toBeVisible();
});

test("reservation reminders appear and deferred integration buttons explain their requirements", async ({
  page,
}) => {
  await register(page);
  const workspace = await (await page.request.get("/api/workspace")).json();
  const table = workspace.tables[0];
  await command(page, "openSession", { tableId: table.id, guests: 2 });
  await command(
    page,
    "record",
    {
      outletId: workspace.outletId,
      title: "Upcoming Guest",
      data: {
        guest: "Upcoming Guest",
        phone: "9123456785",
        guests: 2,
        tableId: table.id,
        at: new Date(Date.now() + 10 * 60000).toISOString(),
        durationMinutes: 90,
        note: "",
      },
    },
    { kind: "reservations" },
  );
  await page.reload();
  const reminder = page.getByLabel("Reservation reminders", { exact: true });
  await expect(
    reminder.getByText(table.label + " is still occupied", { exact: true }),
  ).toBeVisible();
  await expect(reminder.getByText(/Upcoming Guest/)).toBeVisible();
  await reminder.screenshot({ path: "verification/reservation-reminder.png" });
  await reminder
    .getByRole("button", { name: "View reservation", exact: true })
    .click();
  await page.waitForURL("**/app/reservations");
  await expect(
    page.getByLabel("Reservation reminders", { exact: true }),
  ).toHaveCount(0);
  await page.goto("/app/integrations");
  const labels = [
    "Merchant account + webhook required",
    "Provider + approved templates required",
    "Official order-feed access required",
    "Device model + pairing required",
    "OCR provider + invoice samples required",
    "Local edge device + pairing required",
  ];
  for (const name of labels) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(
      page
        .getByRole("dialog")
        .getByText("Setup deferred. Required to connect:", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
  }
  await page.screenshot({
    path: "verification/connections-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".sidebar")).not.toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: "verification/connections-mobile.png",
    fullPage: true,
  });
  await page.goto("/app/campaigns");
  await page
    .getByRole("button", {
      name: "Order tokens · WhatsApp setup required",
      exact: true,
    })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByText("Trigger: an order token is issued to a customer", {
        exact: true,
      }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.goto("/app/attendance");
  await page
    .getByRole("button", {
      name: "Fingerprint · device + SDK required",
      exact: true,
    })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByText("Fingerprint device model and supported SDK/API", {
        exact: true,
      }),
  ).toBeVisible();
});

test("occupied table cards retain dark green and Details opens the real separate bills", async ({
  page,
}) => {
  if (process.env.QA_BASE_URL && process.env.QA_AUTH_STATE_FILE) {
    await page
      .context()
      .addCookies(
        JSON.parse(await readFile(process.env.QA_AUTH_STATE_FILE, "utf8"))
          .cookies,
      );
    await page.goto("/app/overview");
  } else await register(page);
  const workspace = await (await page.request.get("/api/workspace")).json();
  const created = await command(page, "table", {
    outletId: workspace.outletId,
    label: "Bills QA " + randomUUID().slice(0, 5),
    seats: 4,
    floor: "Main floor",
  });
  const table = (
    await (await page.request.get("/api/workspace")).json()
  ).tables.find((t: any) => t.id === created.id);
  const first = await command(page, "openSession", {
    tableId: table.id,
    guests: 2,
  });
  const second = await command(page, "openSession", {
    tableId: table.id,
    guests: 1,
    label: "A",
  });
  const make = (sessionId: string) =>
    command(page, "createRound", {
      outletId: workspace.outletId,
      sessionId,
      type: "DINE_IN",
      items: [{ itemId: workspace.menu[0].id, quantity: "1" }],
    });
  const firstOrder = await make(first.id),
    secondOrder = await make(second.id);
  await page.goto("/app/floor");
  const card = page.locator(".table-card").filter({
    has: page.getByRole("heading", { name: table.label, exact: true }),
  });
  await expect(card).toHaveClass(/occupied/);
  expect(
    await card.evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe("rgb(25, 63, 48)");
  await card.screenshot({ path: "verification/occupied-table-desktop.png" });
  await card.getByRole("button", { name: "Details", exact: true }).click();
  await page.waitForURL("**/app/table-billing/" + table.id);
  const bills = page.getByLabel("Table bill", { exact: true });
  await expect(bills.locator("option")).toHaveCount(2);
  await bills.selectOption(firstOrder.id);
  await expect(
    page
      .locator(".order-summary-strip")
      .getByText("#" + firstOrder.number, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Bill summary", exact: true }),
  ).toBeVisible();
  await bills.selectOption(secondOrder.id);
  await expect(
    page
      .locator(".order-summary-strip")
      .getByText("#" + secondOrder.number, { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".sidebar")).not.toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: "verification/table-billing-mobile.png",
    fullPage: true,
  });
});

test("Floor plan arranges real tables and fixtures, persists edits, and opens table seating", async ({
  page,
}) => {
  await register(page);
  await page.getByRole("link", { name: "Explore", exact: true }).click();
  await page.waitForURL("**/app/floor-plan");
  await expect(page.locator(".plan-table")).toHaveCount(12);
  for (const name of ["Reception", "Washroom", "Entry", "Staircase"])
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  await page.screenshot({
    path: "verification/floor-plan-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Arrange", exact: true }).click();
  const table = page.getByRole("button", {
    name: "Table T01 available",
    exact: true,
  });
  await table.click();
  await expect(
    page.getByLabel("Object X position", { exact: true }),
  ).toHaveCount(0);
  const originalX = await table.evaluate((element) =>
    parseFloat((element as HTMLElement).style.left),
  );
  await table.press("ArrowRight");
  await expect(table).toHaveCSS("left", originalX + 10 + "px");
  const position = await table.boundingBox();
  const scale = await page
    .locator(".floor-camera")
    .evaluate(
      (element) => new DOMMatrix(getComputedStyle(element).transform).a,
    );
  await page.mouse.move(
    position!.x + position!.width / 2,
    position!.y + position!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    position!.x + position!.width / 2 + 50 * scale,
    position!.y + position!.height / 2 + 40 * scale,
    { steps: 4 },
  );
  await page.mouse.up();
  await expect(table).toHaveCSS("left", originalX + 60 + "px");
  await page
    .getByLabel("Fixture type", { exact: true })
    .selectOption("WASHROOM");
  await page.getByRole("button", { name: "Add fixture", exact: true }).click();
  await page
    .getByLabel("Fixture label", { exact: true })
    .fill("Family washroom");
  await dragFloorObject(
    page,
    page.getByRole("button", { name: "Family washroom", exact: true }),
    430,
    660,
  );
  await page.getByRole("button", { name: "Save layout", exact: true }).click();
  await expect(
    page.getByText("Floor plan saved.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  const extra = page.getByRole("button", {
    name: "Family washroom",
    exact: true,
  });
  await expect(extra).toHaveCSS("left", "430px");
  await expect(extra).toHaveCSS("top", "660px");
  await expect(table).toHaveCSS("left", originalX + 60 + "px");
  await page.getByRole("button", { name: "Arrange", exact: true }).click();
  await extra.click();
  await dragFloorObject(page, extra, 510, 660);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(extra).toHaveCSS("left", "430px");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".sidebar")).not.toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: "verification/floor-plan-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "Table T02 available", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "Open T02", exact: true }),
  ).toBeVisible();
  await save(page, "Open table");
  await page.waitForURL("**/app/pos?session=*");
  await page.getByRole("link", { name: "Explore", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Table T02 occupied", exact: true }),
  ).toBeVisible();
});

test("customer and staff input send activity heartbeats while background polls do not", async ({
  page,
  browser,
}) => {
  await register(page, true);
  const workspace = await (await page.request.get("/api/workspace")).json();
  const table = workspace.tables[0];
  await command(page, "openSession", { tableId: table.id, guests: 1 });
  const guestContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const guest = await guestContext.newPage();
  await guest.clock.install({ time: new Date() });
  let guestTouches = 0;
  guest.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.postDataJSON()?.action === "activity"
    )
      guestTouches++;
  });
  await guest.goto("/q/" + table.public_key);
  await expect(
    guest.getByRole("button", { name: "Menu", exact: true }),
  ).toBeEnabled();
  await Promise.all([
    guest.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.request().postDataJSON()?.action === "activity" &&
        response.ok(),
    ),
    guest.getByRole("button", { name: "Menu", exact: true }).click(),
  ]);
  expect(guestTouches).toBe(1);
  await guest.clock.fastForward(61000);
  expect(guestTouches).toBe(1);
  await Promise.all([
    guest.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.request().postDataJSON()?.action === "activity" &&
        response.ok(),
    ),
    guest.getByLabel("Search menu", { exact: true }).click(),
  ]);
  expect(guestTouches).toBe(2);
  const refreshed = await (await page.request.get("/api/workspace")).json();
  const session = refreshed.sessions.find(
    (session: any) => session.table_id === table.id,
  );
  await page.goto("/app/pos?session=" + session.id);
  await page.clock.install({ time: new Date() });
  let staffTouches = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.postDataJSON()?.action === "tableActivity"
    )
      staffTouches++;
  });
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.request().postDataJSON()?.action === "tableActivity" &&
        response.ok(),
    ),
    page
      .locator(".menu-grid")
      .getByRole("button", { name: /Butter naan/ })
      .click(),
  ]);
  expect(staffTouches).toBe(1);
  await page.clock.fastForward(61000);
  expect(staffTouches).toBe(1);
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.request().postDataJSON()?.action === "tableActivity" &&
        response.ok(),
    ),
    page
      .locator(".menu-grid")
      .getByRole("button", { name: /Mint cooler/ })
      .click(),
  ]);
  expect(staffTouches).toBe(2);
  await guestContext.close();
});

test("saved named taxes persist before checkout and one-step digital receipts mark payment received", async ({
  page,
}) => {
  await register(page);
  const workspace = await (await page.request.get("/api/workspace")).json();
  await page.goto("/app/pos");
  await page
    .getByRole("button", { name: "Edit tax settings", exact: true })
    .click();
  await page.getByLabel("Tax name 1", { exact: true }).fill("VAT");
  await page.getByLabel("Tax rate 1", { exact: true }).fill("7.5");
  await page
    .getByRole("dialog")
    .screenshot({ path: "verification/tax-settings-desktop.png" });
  await save(page, "Save taxes");
  const bill = await command(page, "createRound", {
    outletId: workspace.outletId,
    type: "TAKEAWAY",
    customer: { name: "Tax Guest", phone: "9134567892" },
    items: [{ itemId: workspace.menu[0].id, quantity: 2 }],
  });
  await page.goto("/app/orders/" + bill.id);
  await expect(
    page.getByRole("button", { name: "Edit tax", exact: true }),
  ).toHaveCount(0);
  let detail = await (await page.request.get("/api/orders/" + bill.id)).json();
  expect(detail.tax_bps_override).toBe(750);
  expect(Number(detail.totals.tax)).toBe(
    Math.round(Number(detail.totals.subtotal) * 0.075),
  );
  await page.reload();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText("VAT", { exact: true })).toBeVisible();
  const summary = page.locator("section.panel").filter({
    has: page.getByRole("heading", { name: "Bill summary", exact: true }),
  });
  await expect(
    summary.getByRole("button", { name: "Edit bill tax" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Accept round", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Review loyalty", exact: true })
    .click();
  await page.getByRole("button", { name: /^Receive ₹/ }).click();
  await expect(
    page.getByLabel("Confirm your password", { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Method", { exact: true }).selectOption("MANUAL_UPI");
  await page.getByLabel("Amount (₹)", { exact: true }).fill("1");
  await page
    .getByLabel("Merchant / bank reference", { exact: true })
    .fill("BROWSER-TAX-RECEIPT");
  await page
    .getByRole("dialog")
    .screenshot({ path: "verification/payment-recorder-mobile.png" });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Record payment ·/ })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Edit tax", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Verify/ })).toHaveCount(0);
  detail = await (await page.request.get("/api/orders/" + bill.id)).json();
  expect(Number(detail.totals.paid)).toBe(100);
  expect(detail.rounds[0].payments[0].state).toBe("VERIFIED");
  expect(detail.rounds[0].kot_status).toBe("RELEASED");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});

test("only owners can edit tax and named charges, and packaging fees appear on bills", async ({
  page,
  browser,
}) => {
  await register(page);
  const workspace = await (await page.request.get("/api/workspace")).json();
  const bill = await command(page, "createRound", {
    outletId: workspace.outletId,
    type: "TAKEAWAY",
    items: [{ itemId: workspace.menu[0].id, quantity: 1 }],
  });
  await page.goto("/app/orders/" + bill.id);
  await page
    .getByRole("button", { name: "Edit other charges", exact: true })
    .click();
  await page.getByRole("button", { name: "Add charge", exact: true }).click();
  await page.getByLabel("Charge 1 name", { exact: true }).fill("Packaging fee");
  await page.getByLabel("Charge 1 amount", { exact: true }).fill("15.75");
  await page
    .getByRole("dialog")
    .screenshot({ path: "verification/charges-editor-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("dialog")
    .screenshot({ path: "verification/charges-editor-mobile.png" });
  await save(page, "Save charges");
  let detail = await (await page.request.get("/api/orders/" + bill.id)).json();
  expect(Number(detail.totals.charges)).toBe(1575);
  await page
    .getByRole("button", { name: "Edit other charges", exact: true })
    .click();
  await expect(page.getByLabel("Charge 1 name", { exact: true })).toHaveValue(
    "Packaging fee",
  );
  await page
    .getByRole("button", { name: "Remove charge 1", exact: true })
    .click();
  await save(page, "Save charges");
  detail = await (await page.request.get("/api/orders/" + bill.id)).json();
  expect(Number(detail.totals.charges)).toBe(0);
  detail = await command(
    page,
    "orderCharges",
    {
      version: detail.rounds[0].version,
      charges: [{ name: "Packaging fee", amount: 1575 }],
    },
    { orderId: bill.id, roundId: bill.rounds[0].id },
  );
  const document = await command(
    page,
    "bill",
    { final: false },
    { orderId: bill.id },
  );
  await page.goto("/invoice/" + document.id);
  await expect(
    page
      .locator(".receipt-summary")
      .getByText("Packaging fee", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".receipt-grand").getByText("Grand Total", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "verification/bill-with-packaging-mobile.png",
    fullPage: true,
  });
  for (const role of ["MANAGER", "CASHIER"]) {
    const email = role.toLowerCase() + "-" + randomUUID() + "@example.test",
      password = randomBytes(20).toString("base64url");
    await command(page, "employee", {
      name: role + " QA",
      email,
      password,
      role,
      outletIds: [workspace.outletId],
    });
    const context = await browser.newContext();
    const staff = await context.newPage();
    const login = await context.request.post(
      new URL("/api/auth/login", page.url()).toString(),
      {
        headers: { Origin: new URL(page.url()).origin },
        data: { email, password },
      },
    );
    expect(login.ok()).toBe(true);
    await staff.goto("/app/orders/" + bill.id);
    await expect(
      staff.getByRole("heading", { name: "Bill summary", exact: true }),
    ).toBeVisible();
    await expect(
      staff.getByRole("button", { name: "Edit tax", exact: true }),
    ).toHaveCount(0);
    await expect(
      staff.getByRole("button", { name: "Edit other charges", exact: true }),
    ).toHaveCount(0);
    for (const action of ["orderTax", "orderCharges"]) {
      const reply = await context.request.post(
        new URL("/api/commands", page.url()).toString(),
        {
          headers: {
            Origin: new URL(page.url()).origin,
            "Idempotency-Key": randomUUID(),
          },
          data: {
            action,
            orderId: bill.id,
            roundId: bill.rounds[0].id,
            input:
              action === "orderTax"
                ? {
                    version: detail.version,
                    taxBps: 0,
                    reason: "Forbidden edit",
                  }
                : { version: detail.rounds[0].version, charges: [] },
          },
        },
      );
      expect(reply.status()).toBe(403);
    }
    await context.close();
  }
});

test("owner invites separate cashier, waiter and chef accounts and changes their role/access immediately", async ({
  page,
  browser,
}) => {
  const ownerAccount = await register(page);
  const initial = await (await page.request.get("/api/workspace")).json();
  await page.goto("/app/team");
  const accounts: any[] = [];
  for (const role of ["CASHIER", "WAITER", "KITCHEN"]) {
    await page
      .getByRole("button", { name: "Invite staff", exact: true })
      .click();
    await page.getByLabel("Full name", { exact: true }).fill(role + " QA");
    await page
      .getByLabel("Sign-in email", { exact: true })
      .fill(role.toLowerCase() + "-" + randomUUID() + "@example.test");
    await page.getByLabel("Role", { exact: true }).selectOption(role);
    await page
      .getByRole("button", { name: "Create invite", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Invite link", exact: true }),
    ).toBeVisible();
    const url = await page
      .getByRole("textbox", { name: "Invite link", exact: true })
      .inputValue();
    await page
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const staff = await context.newPage();
    await staff.goto(url);
    await expect(staff.getByRole("heading", { name: /^Join / })).toBeVisible();
    await staff
      .getByLabel("Create password", { exact: true })
      .fill("staff-invite-password-123");
    if (role === "CASHIER")
      await staff.screenshot({
        path: "verification/staff-invite-mobile.png",
        fullPage: true,
      });
    await staff.getByRole("button", { name: "Join team", exact: true }).click();
    await staff.waitForURL("**/app/**");
    const workspace = await (await staff.request.get("/api/workspace")).json();
    expect(workspace.actor.role).toBe(role);
    expect(workspace.actor.employeeId).not.toBe(initial.actor.employeeId);
    expect(workspace.employees).toBeUndefined();
    expect(workspace.staffInvitations).toBeUndefined();
    if (role === "KITCHEN") {
      expect(workspace.orders).toBeUndefined();
      expect(workspace.metrics).toBeUndefined();
    }
    if (role === "WAITER") expect(workspace.payments).toBeUndefined();
    await expect(
      staff.getByRole("link", { name: "Team", exact: true }),
    ).toHaveCount(0);
    accounts.push({
      context,
      page: staff,
      employeeId: workspace.actor.employeeId,
      role,
    });
  }
  const target = accounts[0];
  const memberRow = () =>
    page
      .getByRole("row")
      .filter({ has: page.getByText("CASHIER QA", { exact: true }) });
  await memberRow()
    .getByRole("button", { name: "Edit access", exact: true })
    .click();
  await page.getByLabel("Role", { exact: true }).selectOption("KITCHEN");
  await page
    .getByLabel("Confirm your password", { exact: true })
    .fill(ownerAccount.password);
  await page
    .getByRole("dialog")
    .screenshot({ path: "verification/staff-access-desktop.png" });
  await save(page, "Save access");
  expect(
    (await (await target.page.request.get("/api/workspace")).json()).actor.role,
  ).toBe("KITCHEN");
  await target.page.goto("/app/overview");
  await target.page.waitForURL("**/app/kitchen");
  await expect(
    target.page.getByRole("heading", { name: "Kitchen", exact: true }),
  ).toBeVisible();
  await memberRow()
    .getByRole("button", { name: "Edit access", exact: true })
    .click();
  await page.getByLabel("Account enabled", { exact: true }).uncheck();
  await page
    .getByLabel("Confirm your password", { exact: true })
    .fill(ownerAccount.password);
  await save(page, "Save access");
  expect((await target.page.request.get("/api/workspace")).status()).toBe(401);
  const pending = await command(page, "staffInvite", {
    name: "Pending QA",
    email: "pending-" + randomUUID() + "@example.test",
    role: "WAITER",
    outletIds: [initial.outletId],
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Revoke invite", exact: true })
    .click();
  await expect(page.getByText("Pending QA", { exact: true })).toHaveCount(0);
  expect(
    (await page.request.get("/api/invites/" + pending.token)).status(),
  ).toBe(404);
  await page.screenshot({
    path: "verification/team-accounts-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: "verification/team-accounts-mobile.png",
    fullPage: true,
  });
  for (const account of accounts) await account.context.close();
});

test("Floor plan resizes, copies tables and fixtures, and saves rooms without duplicate sessions", async ({
  page,
}) => {
  await register(page);
  await page.goto("/app/floor-plan");
  await page.getByRole("button", { name: "Arrange", exact: true }).click();
  await page.getByRole("button", { name: "Resize area", exact: true }).click();
  await page.getByLabel("Area width", { exact: true }).fill("2000");
  await page.getByLabel("Area height", { exact: true }).fill("1400");
  await save(page, "Apply size");
  await expect(page.locator(".floor-plan-canvas")).toHaveCSS("width", "2000px");
  for (const [kind, name] of [
    ["SMOKING_ROOM", "Smoking room"],
    ["LIQUOR_ROOM", "Liquor room"],
    ["WALL", "Wall"],
    ["EXIT", "Exit"],
    ["KITCHEN", "Kitchen"],
  ]) {
    await page.getByLabel("Fixture type", { exact: true }).selectOption(kind);
    await page
      .getByRole("button", { name: "Add fixture", exact: true })
      .click();
    await expect(page.getByLabel("Fixture label", { exact: true })).toHaveValue(
      name,
    );
  }
  await page.getByLabel("Fixture label", { exact: true }).fill("Main kitchen");
  const resize = page.getByRole("button", {
    name: "Resize Main kitchen corner",
    exact: true,
  });
  await resize.focus();
  for (let i = 0; i < 20; i++) await resize.press("ArrowRight");
  for (let i = 0; i < 8; i++) await resize.press("ArrowDown");
  const kitchen = page.getByRole("button", {
    name: "Main kitchen",
    exact: true,
  });
  await dragFloorObject(page, kitchen, 1400, 900);
  await kitchen.focus();
  await kitchen.press("Control+c");
  await kitchen.press("Control+v");
  await expect(
    page.getByRole("button", { name: "Main kitchen", exact: true }),
  ).toHaveCount(2);
  const table = page.getByRole("button", {
    name: "Table T01 available",
    exact: true,
  });
  await table.click();
  await table.press("Control+c");
  await table.press("Control+v");
  await expect(
    page.getByRole("button", { name: "Table T01 copy available", exact: true }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Save layout", exact: true }).click();
  await expect(
    page.getByText("Floor plan saved.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  const w = await (await page.request.get("/api/workspace")).json();
  expect(w.tables).toHaveLength(13);
  expect(w.sessions).toHaveLength(0);
  expect(w.floorPlans[0].width).toBe(2000);
  expect(w.floorPlans[0].height).toBe(1400);
  expect(
    w.floorPlans[0].objects.filter((o: any) => o.label === "Main kitchen"),
  ).toHaveLength(2);
  expect(w.floorPlans[0].objects.every((o: any) => !o.copyOfTableId)).toBe(
    true,
  );
  await page.getByRole("button", { name: "Arrange", exact: true }).click();
  await page.getByRole("button", { name: "Resize area", exact: true }).click();
  await page.getByLabel("Area width", { exact: true }).fill("400");
  await page.getByLabel("Area height", { exact: true }).fill("300");
  await save(page, "Apply size");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".floor-plan-canvas")).toHaveCSS("width", "2000px");
  await page.screenshot({
    path: "verification/floor-plan-v2-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Arrange", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await expect(
    page.getByRole("button", { name: "Copy", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "verification/floor-plan-v2-mobile.png",
    fullPage: true,
  });
});

test("published customer store shows floor plan, books a table and accepts private takeaway orders", async ({
  page,
  browser,
}) => {
  await register(page);
  const w = await (await page.request.get("/api/workspace")).json();
  const brand = await command(
    page,
    "record",
    {
      outletId: w.outletId,
      title: "QA Dining",
      data: { description: "Fresh food", active: true },
    },
    { kind: "brands" },
  );
  const slug = "browser-store-" + randomBytes(4).toString("hex");
  await command(page, "storefront", {
    outletId: w.outletId,
    brandId: brand.id,
    slug,
    published: true,
  });
  const customerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const customer = await customerContext.newPage();
  const origin = new URL(page.url()).origin;
  await customer.goto(origin + "/store/" + slug);
  await expect(
    customer.getByRole("heading", { name: "QA Dining", exact: true }),
  ).toBeVisible();
  await customer
    .getByRole("button", { name: "Floor plan", exact: true })
    .click();
  await expect(
    customer.getByRole("img", { name: "Main floor floor plan", exact: true }),
  ).toBeVisible();
  await customer
    .getByRole("article")
    .filter({
      has: customer.getByRole("heading", { name: "T01", exact: true }),
    })
    .getByRole("button", { name: "Reserve", exact: true })
    .click();
  await customer.getByLabel("Name", { exact: true }).fill("Public Guest");
  await customer.getByLabel("Phone", { exact: true }).fill("9123456789");
  await customer
    .getByRole("button", { name: "Book table", exact: true })
    .click();
  await expect(
    customer.getByText("Table booked.", { exact: true }),
  ).toBeVisible();
  await expect(
    customer.getByRole("heading", { name: "T01", exact: true }),
  ).toBeVisible();
  await customer.getByRole("button", { name: "Menu", exact: true }).click();
  await customer
    .getByLabel("Search menu", { exact: true })
    .fill("Paneer tikka");
  await customer.getByRole("button", { name: "Add", exact: true }).click();
  await customer
    .getByRole("dialog")
    .getByRole("button", { name: /^Add ·/ })
    .click();
  await customer.getByRole("button", { name: /^Takeaway ·/ }).click();
  await customer.getByLabel("Name", { exact: true }).fill("Public Guest");
  await customer.getByLabel("Phone", { exact: true }).fill("9123456789");
  await customer.getByRole("button", { name: /^Send order ·/ }).click();
  await customer.getByRole("dialog", { name: "Order placed", exact: true }).getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    customer.getByText("Order sent. Waiting for staff acceptance.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    customer.getByRole("heading", { name: /^Order #/ }),
  ).toBeVisible();
  expect(
    await customer.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await customer.screenshot({
    path: "verification/customer-store-mobile.png",
    fullPage: true,
  });
  const staff = await (await page.request.get("/api/workspace")).json();
  expect(staff.orders[0].source).toBe("D2C");
  expect(staff.orders[0].status).toBe("PENDING");
  expect(staff.tickets).toHaveLength(0);
  const anotherContext = await browser.newContext();
  const other = await anotherContext.newPage();
  await other.goto(origin + "/store/" + slug);
  await other.getByRole("button", { name: "My visits", exact: true }).click();
  await expect(
    other.getByText("No orders or bookings on this device.", { exact: true }),
  ).toBeVisible();
  const publicData = await (
    await other.request.get(origin + "/api/store/" + slug)
  ).json();
  expect(JSON.stringify(publicData)).not.toContain("Public Guest");
  expect(JSON.stringify(publicData)).not.toContain("public_key");
  await customer
    .getByRole("button", { name: "Cancel booking", exact: true })
    .click();
  await expect(
    customer.getByText("Booking cancelled.", { exact: true }),
  ).toBeVisible();
  await customer.setViewportSize({ width: 1440, height: 1000 });
  await customer
    .getByRole("button", { name: "Floor plan", exact: true })
    .click();
  await customer.screenshot({
    path: "verification/customer-store-desktop.png",
    fullPage: true,
  });
  await customerContext.close();
  await anotherContext.close();
});

test("v2 REST preserves app binding, CSRF, idempotency and the paid kitchen-to-invoice workflow", async ({
  page,
  browser,
}) => {
  const account = await register(page);
  const origin = new URL(page.url()).origin;
  const app = await browser.newContext({
    extraHTTPHeaders: { Origin: origin, "x-forwarded-for": "10.77.11.9" },
  });
  const login = await app.request.post(origin + "/v2/auth/login", {
    data: { ...account, application: "POS" },
  });
  expect(login.ok(), await login.text()).toBe(true);
  const w = await (await app.request.get(origin + "/v2/workspace")).json();
  expect(w.actor.application).toBe("POS");
  expect(w.actor.sessionHash).toBeUndefined();
  const post = async (path: string, data: unknown, key = randomUUID()) => {
    const reply = await app.request.post(origin + path, {
      headers: { "Idempotency-Key": key },
      data,
    });
    const result = await reply.json();
    expect(reply.ok(), JSON.stringify(result)).toBe(true);
    return result;
  };
  const input = {
    outletId: w.outletId,
    type: "TAKEAWAY",
    customer: { name: "REST Guest", phone: "9123456789" },
    items: [{ itemId: w.menu[0].id, quantity: 1 }],
  };
  const requestId = randomUUID();
  let order = await post("/v2/orders", input, requestId);
  expect((await post("/v2/orders", input, requestId)).id).toBe(order.id);
  const roundId = order.rounds[0].id,
    path = `/v2/orders/${order.id}/rounds/${roundId}`;
  const csrf = await app.request.post(origin + path + "/accept", {
    headers: {
      Origin: "https://other.example",
      "Idempotency-Key": randomUUID(),
    },
    data: { version: order.rounds[0].version },
  });
  expect(csrf.status()).toBe(403);
  order = await post(path + "/accept", { version: order.rounds[0].version });
  await post(path + "/payment", {
    version: order.rounds[0].version,
    method: "CASH",
    amount: order.rounds[0].payable,
  });
  const master = await (await page.request.get("/api/workspace")).json();
  for (const ticket of master.tickets.filter(
    (row: any) => row.order_id === order.id,
  )) {
    await command(page, "kitchen", { state: "PREPARING" }, { id: ticket.id });
    await command(page, "kitchen", { state: "READY" }, { id: ticket.id });
  }
  await post(path + "/serve", {});
  const invoice = await post(`/v2/orders/${order.id}/settle`, {});
  expect(invoice.document_type).toBe("FINAL_TAX_INVOICE");
  await app.request.post(origin + "/v2/auth/login", {
    data: { ...account, application: "CAPTAIN" },
  });
  const forbidden = await app.request.post(origin + "/v2/commands", {
    headers: { "Idempotency-Key": randomUUID(), "X-Application": "MASTER" },
    data: { action: "outlet", input: {} },
  });
  expect(forbidden.status()).toBe(403);
  expect((await forbidden.json()).error.code).toBe("APPLICATION_FORBIDDEN");
  const worker = await page.request.get("/api/internal/push/dispatch");
  expect(worker.status()).toBe(401);
  await app.close();
});

test("approved delivery creates visible FIFO stock and reports use the saved expense period", async ({
  page,
}) => {
  await register(page);
  const w = await (await page.request.get("/api/workspace")).json();
  const ingredient = await command(page, "ingredient", {
    outletId: w.outletId,
    name: "Receipt flour",
    unit: "kg",
  });
  const vendor = await command(
    page,
    "record",
    {
      outletId: w.outletId,
      title: "Receipt vendor",
      data: {
        contact: "Supplier",
        phone: "",
        email: "",
        address: "",
        gstin: "",
      },
    },
    { kind: "vendors" },
  );
  const purchase = await command(
    page,
    "record",
    {
      outletId: w.outletId,
      title: "Flour purchase",
      data: {
        vendorId: vendor.id,
        reference: "PO-BROWSER",
        amount: 20000,
        note: "",
      },
    },
    { kind: "purchases" },
  );
  await command(
    page,
    "recordDecision",
    { version: 1, state: "APPROVED", reason: "Approved purchase" },
    { id: purchase.id },
  );
  await page.goto("/app/purchases");
  await page
    .getByRole("button", { name: "Receive delivery", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add received batch", exact: true })
    .click();
  await page
    .getByLabel("Received ingredient 1", { exact: true })
    .selectOption(ingredient.id);
  await page
    .getByLabel("Batch number 1", { exact: true })
    .fill("FLOUR-BROWSER");
  await page.getByLabel("Received quantity 1", { exact: true }).fill("2");
  await page.getByLabel("Received unit cost 1", { exact: true }).fill("100");
  const purchaseExpiry = new Date(Date.now() + 72 * 3600000 + 330 * 60000)
    .toISOString()
    .slice(0, 16);
  await page
    .getByLabel("Received expiry 1 date", { exact: true })
    .fill(purchaseExpiry.slice(0, 10));
  await page
    .getByLabel("Received expiry 1 time", { exact: true })
    .fill(purchaseExpiry.slice(11));
  await page
    .getByRole("dialog")
    .screenshot({ path: "verification/purchase-receipt.png" });
  await save(page, "Receive delivery");
  const updated = await (await page.request.get("/api/workspace")).json();
  expect(
    updated.batches.filter((row: any) => row.ingredient_id === ingredient.id),
  ).toHaveLength(1);
  await page.goto("/app/reports");
  await expect(
    page.getByRole("button", { name: "Export CSV", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByText("Final invoices and approved expenses.", { exact: false }),
  ).toBeVisible();
  const report = await (
    await page.request.get(
      `/v2/reports?from=${businessDate()}&to=${businessDate()}&outlet=${w.outletId}`,
    )
  ).json();
  expect(report.stockPurchases).toBe(20000);
  expect(report.expenses).toBe(0);
  await page.screenshot({
    path: "verification/financial-report-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.screenshot({
    path: "verification/financial-report-mobile.png",
    fullPage: true,
  });
});
