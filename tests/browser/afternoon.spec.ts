import { test, expect, type Page } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { appendFile, readFile } from "node:fs/promises";
import { businessDate } from "@dinerdost/core";
async function register(page: Page, qr = true) {
  const stateFile = process.env.QA_AUTH_STATE_FILE;
  if (stateFile) {
    try {
      const state = JSON.parse(await readFile(stateFile, "utf8"));
      await page.context().addCookies(state.cookies);
      await page.goto("/app/overview");
      await expect(
        page.getByText("Settled sales", { exact: true }),
      ).toBeVisible();
      return { email: "shared-synthetic-workspace", password: "" };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  if (!stateFile)
    await page.setExtraHTTPHeaders({
      "x-forwarded-for": "10." + [...randomBytes(3)].join("."),
    });
  const email =
      "afternoon-" +
      Date.now() +
      "-" +
      randomBytes(3).toString("hex") +
      "@example.test",
    password = randomBytes(24).toString("base64url");
  await page.goto("/signup");
  for (const [label, value] of [
    ["Your name", "Afternoon QA"],
    ["Restaurant name", "Afternoon QA Restaurant"],
    ["First outlet", "Main"],
    ["Email", email],
    ["Password", password],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel("Customer QR ordering").selectOption(qr ? "on" : "off");
  await page.getByLabel("Add a sample menu and 12 tables").check();
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.waitForURL("**/app/overview");
  await expect(page.getByText("Settled sales", { exact: true })).toBeVisible();
  if (stateFile) await page.context().storageState({ path: stateFile });
  if (process.env.QA_ACCOUNTS_FILE)
    await appendFile(
      process.env.QA_ACCOUNTS_FILE,
      JSON.stringify({ email }) + "\n",
    );
  return { email, password };
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
    }),
    data = await reply.json();
  expect(reply.ok(), JSON.stringify(data)).toBe(true);
  return data;
}
async function save(page: Page, name = "Save") {
  await page
    .getByRole("dialog")
    .getByRole("button", { name, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
}
const photo = resolve("apps/web/public/images/menu/samples/butter-naan.webp");
test("afternoon header notifications persist reads, package setup stays pending and leaderboard uses customer accounts", async ({
  page,
}) => {
  await register(page);
  const w = await workspace(page),
    order = await command(page, "createRound", {
      outletId: w.outletId,
      type: "TAKEAWAY",
      customer: { name: "Loyal Guest", phone: "9123456777" },
      items: [{ itemId: w.menu[0].id, quantity: 1 }],
    });
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: new RegExp("New order #" + order.number),
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Mark all read", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Mark all read", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.reload();
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await expect(
    page.getByRole("button", { name: "Mark all read", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("dialog")
    .screenshot({ path: "verification/afternoon-notification-inbox.png" });
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("button", { name: "View packages", exact: true })
    .click();
  for (const name of ["Trial", "Bronze", "Silver", "Gold", "Platinum"])
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
  await expect(page.getByText("Details pending", { exact: true })).toHaveCount(
    5,
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.goto("/app/loyalty");
  await expect(
    page.getByRole("heading", { name: "Loyalty leaderboard", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "Loyal Guest" }),
  ).toBeVisible();
  await page.screenshot({
    path: "verification/afternoon-loyalty-desktop.png",
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
    path: "verification/afternoon-loyalty-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "View packages", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .screenshot({ path: "verification/afternoon-packages-mobile.png" });
});
test("afternoon inventory item editing keeps current stock and movement history", async ({
  page,
}) => {
  await register(page);
  const w = await workspace(page),
    ingredient = await command(page, "ingredient", {
      outletId: w.outletId,
      name: "Edit rice",
      unit: "kg",
      reorderMilli: 1000,
    });
  await command(page, "receipt", {
    expiresAt: new Date(Date.now() + 72 * 3600000).toISOString(),
    ingredientId: ingredient.id,
    batchNumber: "RICE-QA",
    quantityMilli: 3000,
    unitCost: 10000,
    reference: "QA inventory",
  });
  await page.goto("/app/inventory");
  await page
    .getByRole("row")
    .filter({ hasText: "Edit rice" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page
    .getByLabel("Ingredient name", { exact: true })
    .fill("Basmati rice");
  await expect(page.getByLabel("Reorder level", { exact: true })).toHaveCount(0);
  await save(page);
  expect(Number((await workspace(page)).ingredients.find((i: any) => i.id === ingredient.id).reorder_milli)).toBe(1000);
  await expect(
    page.getByRole("row").filter({ hasText: "Basmati rice" }),
  ).toContainText("3 kg");
  await page.getByRole("button", { name: "Movements", exact: true }).click();
  await page.getByLabel("Period", { exact: true }).selectOption("month");
  await expect(
    page.getByRole("row").filter({ hasText: "Basmati rice" }),
  ).toContainText("3 kg");
  await page.screenshot({
    path: "verification/afternoon-inventory-movements.png",
    fullPage: true,
  });
});
test("afternoon menu uploads and Half/Full choices persist into POS pricing", async ({
  page,
}) => {
  await register(page);
  await page.goto("/app/menu");
  const row = page.getByRole("row").filter({ hasText: "Butter naan" });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Photo URL", { exact: true })).toHaveCount(0);
  const upload = page.waitForResponse(
    (r) => r.url().includes("/api/uploads?") && r.request().method() === "POST",
  );
  await page.getByLabel("Upload image", { exact: true }).setInputFiles(photo);
  const uploaded = await upload;
  expect(uploaded.ok()).toBe(true);
  await page.getByLabel("Half / Full portions", { exact: true }).check();
  await page.getByLabel("Half price (₹)", { exact: true }).fill("120");
  await page.getByLabel("Full price (₹)", { exact: true }).fill("200");
  await page
    .getByRole("dialog")
    .screenshot({ path: "verification/afternoon-menu-editor.png" });
  await save(page);
  const url = (await workspace(page)).menu.find(
    (m: any) => m.name === "Butter naan",
  ).image_url;
  expect(url).toMatch(/^\/api\/menu-images\//);
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByText("Image ready", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Photo URL", { exact: true })).toHaveCount(0);
  expect(
    (await workspace(page)).menu.find((m: any) => m.name === "Butter naan")
      .image_url,
  ).toBe(url);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.goto("/app/pos");
  const card = page.getByRole("button", { name: /Butter naan/ });
  await expect(card.locator("img")).toBeVisible();
  expect((await page.request.get(url)).status()).toBe(200);
  await card.click();
  await page.getByRole("radio", { name: /Full/ }).check();
  await expect(page.getByRole("radio", { name: /Full/ })).toBeChecked();
  await expect(page.getByRole("dialog")).toContainText("₹200.00");
  await page.getByRole("dialog").getByRole("button", { name: /^Add / }).click();
  await page.getByRole("button", { name: "Create order", exact: true }).click();
  await page.waitForURL("**/app/orders/*");
  await page.getByRole("dialog", { name: "Order placed", exact: true }).getByRole("button", { name: "Done", exact: true }).click();
  const detail = await (
    await page.request.get("/api/orders/" + page.url().split("/").pop())
  ).json();
  expect(Number(detail.rounds[0].items[0].unit_price)).toBe(20000);
  expect(detail.rounds[0].items[0].variant).toBe("Full");
  await page.goto("/app/menu");
  await page.getByRole("button", { name: "Add liquor", exact: true }).click();
  await expect(page.getByLabel("Liquor name", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Upload image", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  const w = await workspace(page),
    invalid = await page.request.post(
      `/api/uploads?outlet=${w.outletId}&purpose=MENU`,
      {
        headers: {
          Origin: new URL(page.url()).origin,
          "Content-Type": "image/svg+xml",
        },
        data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      },
    );
  expect(invalid.status()).toBe(422);
});
test("afternoon private staff details save, reload, and deny cashier file access", async ({
  page,
  browser,
}) => {
  await register(page);
  await page.goto("/app/team");
  await page.getByRole("button", { name: "Add member", exact: true }).click();
  const email = "staff-" + randomBytes(5).toString("hex") + "@example.test",
    password = "Staff-private-qa-123";
  for (const [label, value] of [
    ["Full name", "Staff QA"],
    ["Sign-in email", email],
    ["Initial password", password],
    ["Phone number", "9123456770"],
    ["Address", "Synthetic QA address"],
    ["Pincode", "781001"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel("Role", { exact: true }).selectOption("CASHIER");
  await page.getByLabel("Staff photo", { exact: true }).setInputFiles(photo);
  await expect(page.getByText("Uploading…", { exact: true })).toHaveCount(0);
  await page.getByLabel("Document type", { exact: true }).selectOption("PAN");
  await page.getByLabel("Government document", { exact: true }).setInputFiles({
    name: "synthetic-qa.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\nSynthetic QA file only"),
  });
  await expect(page.getByText("Uploading…", { exact: true })).toHaveCount(0);
  await save(page);
  await page
    .getByRole("row")
    .filter({ hasText: "Staff QA" })
    .getByRole("button", { name: "Edit member", exact: true })
    .click();
  await expect(page.getByLabel("Phone number", { exact: true })).toHaveValue(
    "9123456770",
  );
  await expect(page.getByLabel("Address", { exact: true })).toHaveValue(
    "Synthetic QA address",
  );
  const file = await page
    .getByRole("link", { name: "View file", exact: true })
    .last()
    .getAttribute("href");
  expect((await page.request.get(file!)).headers()["cache-control"]).toContain(
    "no-store",
  );
  await page
    .getByRole("dialog")
    .screenshot({ path: "verification/afternoon-staff-private.png" });
  await page.getByRole("button", { name: "Close dialog" }).click();
  const ctx = await browser.newContext(),
    staff = await ctx.newPage();
  await staff.goto(new URL("/signin", page.url()).href);
  await staff.getByLabel("Email", { exact: true }).fill(email);
  await staff.getByLabel("Password", { exact: true }).fill(password);
  await staff.getByRole("button", { name: "Sign in", exact: true }).click();
  await staff.waitForURL("**/app/**");
  expect((await staff.request.get(file!)).status()).toBe(403);
  expect(
    (
      await staff.request.get(file!.replace("staff-files", "menu-images"))
    ).status(),
  ).toBe(404);
  await ctx.close();
});
test("afternoon Explore supports circle edges, visual resize and compact labels", async ({
  page,
}) => {
  await register(page);
  const links = await page.locator(".sidebar a").allTextContents();
  expect(links.findIndex((x) => x.trim() === "Explore")).toBeLessThan(
    links.findIndex((x) => x.trim() === "Tables"),
  );
  await page.getByRole("link", { name: "Explore", exact: true }).click();
  await page.getByRole("button", { name: "Add floor", exact: true }).click();
  await page.getByLabel("Floor name", { exact: true }).fill("Round lounge");
  await save(page, "Add floor");
  await page.getByRole("button", { name: "Arrange", exact: true }).click();
  await page
    .getByRole("button", { name: "Floor outline", exact: true })
    .click();
  await page.getByRole("button", { name: "Circle", exact: true }).click();
  await page.getByRole("button", { name: "Rotate", exact: true }).click();
  await expect(page.locator(".outline-preview ellipse")).toHaveAttribute(
    "rx",
    "400",
  );
  await expect(page.locator(".outline-preview ellipse")).toHaveAttribute(
    "ry",
    "400",
  );
  const edge = page.getByRole("button", {
    name: "Resize right edge",
    exact: true,
  });
  const radius = await page
      .locator(".outline-preview ellipse")
      .getAttribute("rx"),
    edgeBox = await edge.boundingBox();
  await page.mouse.move(
    edgeBox!.x + edgeBox!.width / 2,
    edgeBox!.y + edgeBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    edgeBox!.x + edgeBox!.width / 2 - 12,
    edgeBox!.y + edgeBox!.height / 2,
    { steps: 4 },
  );
  await page.mouse.up();
  await expect(page.locator(".outline-preview ellipse")).not.toHaveAttribute(
    "rx",
    radius!,
  );
  await edge.focus();
  await edge.press("ArrowLeft");
  await expect(page.getByRole("dialog").locator("input")).toHaveCount(0);
  await page
    .getByRole("dialog")
    .screenshot({ path: "verification/afternoon-circle-editor.png" });
  await save(page, "Apply outline");
  await page.getByRole("button", { name: "Add fixture", exact: true }).click();
  const handle = page.getByRole("button", {
    name: "Resize Reception corner",
    exact: true,
  });
  const box = await handle.boundingBox(),
    scale = await page
      .locator(".floor-camera")
      .evaluate(
        (element) => new DOMMatrix(getComputedStyle(element).transform).a,
      );
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box!.x + box!.width / 2 + 20 * scale,
    box!.y + box!.height / 2 + 20 * scale,
    { steps: 4 },
  );
  await page.mouse.up();
  await handle.focus();
  for (let i = 0; i < 12; i++) await handle.press("ArrowLeft");
  for (let i = 0; i < 4; i++) await handle.press("ArrowUp");
  const fixture = page.getByRole("button", { name: "Reception", exact: true });
  await expect(fixture).toHaveCSS("width", "80px");
  await expect(fixture).toHaveCSS("overflow", "visible");
  await expect(page.getByLabel("Object width", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Save layout", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Arrange", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByLabel("Floor plan floor").selectOption("Round lounge");
  await expect(
    page.getByLabel("Floor boundary", { exact: true }).locator("ellipse"),
  ).toBeVisible();
  await page.screenshot({
    path: "verification/afternoon-explore-desktop.png",
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
    path: "verification/afternoon-explore-mobile.png",
    fullPage: true,
  });
});
test("afternoon record filters find older expenses, checklist dates and purchase expenses once", async ({
  page,
}) => {
  await register(page);
  const w = await workspace(page);
  await command(
    page,
    "record",
    {
      outletId: w.outletId,
      title: "Old rent",
      data: {
        category: "Rent",
        amount: 12345,
        date: "2025-01-10",
        reference: "OLD-QA",
        note: "",
      },
    },
    { kind: "expenses" },
  );
  await command(
    page,
    "record",
    {
      outletId: w.outletId,
      title: "Current rent",
      data: {
        category: "Rent",
        amount: 10000,
        date: businessDate(),
        reference: "NOW-QA",
        note: "",
      },
    },
    { kind: "expenses" },
  );
  await page.goto("/app/expenses");
  await page.getByLabel("Period", { exact: true }).selectOption("custom");
  await page.getByLabel("From date", { exact: true }).fill("2025-01-01");
  await page.getByLabel("To date", { exact: true }).fill("2025-01-31");
  await page.getByLabel("Min amount (₹)", { exact: true }).fill("120");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByText("Old rent", { exact: true })).toBeVisible();
  await expect(page.getByText("Current rent", { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: "verification/afternoon-record-filters.png",
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
    path: "verification/afternoon-record-filters-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const vendor = await command(
      page,
      "record",
      {
        outletId: w.outletId,
        title: "QA supplier",
        data: {
          contact: "Supplier",
          phone: "",
          email: "",
          address: "",
          gstin: "",
        },
      },
      { kind: "vendors" },
    ),
    purchase = await command(
      page,
      "record",
      {
        outletId: w.outletId,
        title: "QA purchase expense",
        data: {
          vendorId: vendor.id,
          reference: "PO-AFTERNOON",
          amount: 5000,
          note: "",
        },
      },
      { kind: "purchases" },
    );
  await command(
    page,
    "recordDecision",
    { version: 1, state: "APPROVED", reason: "QA approval" },
    { id: purchase.id },
  );
  await page.goto("/app/expenses");
  await expect(
    page.getByRole("row").filter({ hasText: "QA purchase expense" }),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "View purchase", exact: true })
    .click();
  await expect(
    page.getByText("Approved purchase · included once in expenses", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.goto("/app/checklists");
  await page.getByLabel("Period", { exact: true }).selectOption("week");
  await expect(page.getByLabel("Min amount (₹)", { exact: true })).toHaveCount(
    0,
  );
});
test("afternoon QR off hides cards and owner bill correction appears in readable activity changes", async ({
  page,
}) => {
  await register(page);
  let w = await workspace(page);
  await command(page, "qrPolicy", {
    outletId: w.outletId,
    version: w.outlets[0].version,
    enabled: false,
  });
  await page.goto("/app/floor");
  await expect(
    page.getByRole("link", { name: "Table QR", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Table QR", exact: true }),
  ).toHaveCount(0);
  await page.goto("/app/qr");
  await expect(
    page.getByRole("heading", { name: "Table QR is off", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".qr-card")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Enable Table QR", exact: true })
    .click();
  await expect(page.locator(".qr-card")).toHaveCount(12);
  const order = await command(page, "createRound", {
    outletId: w.outletId,
    type: "TAKEAWAY",
    items: [{ itemId: w.menu[0].id, quantity: 1 }],
  });
  await page.goto("/app/orders/" + order.id);
  await page
    .getByRole("button", { name: "Edit bill tax", exact: true })
    .click();
  await page.getByLabel("Tax name 1", { exact: true }).fill("Service tax");
  await page.getByLabel("Tax rate 1", { exact: true }).fill("8");
  await page
    .getByLabel("Reason", { exact: true })
    .fill("Client tax correction");
  await save(page, "Save taxes");
  await expect(page.getByText("Service tax", { exact: true })).toBeVisible();
  const changed = await (
    await page.request.get("/api/orders/" + order.id)
  ).json();
  expect(changed.tax_bps_override).toBe(800);
  await page.goto("/app/audit");
  const row = page.getByRole("row").filter({ hasText: "Bill tax changed" });
  await row.getByRole("button", { name: "Details", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Exact changes" }),
  ).toContainText("Service tax");
  await page
    .getByRole("dialog")
    .screenshot({ path: "verification/afternoon-audit-changes.png" });
});
