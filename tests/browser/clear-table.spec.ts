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
    ["Your name", "Clear table QA"],
    ["Restaurant name", "Clear table isolated QA"],
    ["First outlet", "Main"],
    ["Email", `clear-${randomUUID()}@example.test`],
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
for (const width of [1440, 390])
  test(`Table billing clear at ${width}px keeps bills, frees merged tables and rejects stale confirmations`, async ({
    page,
  }) => {
    if (process.env.QA_BASE_URL) test.setTimeout(240000);
    await register(page);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const w = await workspace(page),
      tag = "Q47-" + width + "-" + randomUUID().slice(0, 5);
    const visits: { tableId: string; id: string; label: string }[] = [];
    for (const suffix of ["A", "B"]) {
      const label = tag + suffix;
      const table = await command(page, "table", {
        outletId: w.outletId,
        label,
        seats: 4,
        floor: "Main floor",
      });
      const visit = await command(page, "openSession", {
        tableId: table.id,
        guests: 2,
      });
      visits.push({ tableId: table.id, id: visit.id, label });
    }
    const [a, b] = visits;
    await command(page, "merge", {
      parentId: a.id,
      childId: b.id,
      reason: "Join synthetic guest tables",
    });
    const order = await command(page, "createRound", {
      outletId: w.outletId,
      sessionId: b.id,
      type: "DINE_IN",
      customer: { name: "Clear QA Guest", phone: "9123456103" },
      items: [
        {
          itemId: w.menu.find((m: any) => m.name === "Mint cooler").id,
          quantity: 1,
        },
      ],
    });
    await page.goto("/app/table-billing/" + a.tableId);
    const clear = page.getByRole("button", {
      name: "Clear table",
      exact: true,
    });
    await expect(clear).toBeDisabled();
    const reviewed = await command(
      page,
      "reviewRewards",
      {},
      { orderId: order.id, roundId: order.rounds[0].id },
    );
    const round = reviewed.order.rounds[0];
    await command(
      page,
      "recordPayment",
      { version: round.version, method: "CASH", amount: Number(round.payable) },
      { orderId: order.id, roundId: round.id },
    );
    for (const t of (await workspace(page)).tickets.filter(
      (t: any) => t.order_id === order.id,
    )) {
      await command(page, "kitchen", { state: "PREPARING" }, { id: t.id });
      await command(page, "kitchen", { state: "READY" }, { id: t.id });
    }
    await command(page, "serve", {}, { orderId: order.id, roundId: round.id });
    for (let copy = 0; copy < 3; copy++)
      await command(page, "bill", { final: false }, { orderId: order.id });
    await command(page, "bill", { final: true }, { orderId: order.id });
    const before = await (
      await page.request.get("/api/orders/" + order.id)
    ).json();
    await page.reload();
    await expect(clear).toBeEnabled();
    await page.screenshot({
      path: `verification/clear-table-settled-${width}.png`,
    });
    await expect(page.locator(".table-billing-toolbar")).toContainText(
      a.label + " & " + b.label + " (Merged)",
    );
    await clear.click();
    let dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(
      "Makes the table available for new customers. Existing bills are kept.",
    );
    await page.getByLabel("Close dialog").click();
    expect(
      (await workspace(page)).sessions.some((s: any) => s.id === a.id),
    ).toBe(true);
    await clear.click();
    await dialog
      .getByRole("button", { name: "Clear table", exact: true })
      .click();
    await expect(page).toHaveURL(/\/app\/floor$/);
    const ingredient = await command(page, "ingredient", {
      outletId: w.outletId,
      name: tag + " empty stock",
      unit: "kg",
    });
    await command(page, "createRound", {
      outletId: w.outletId,
      type: "TAKEAWAY",
      items: [
        {
          itemId: w.menu.find((m: any) => m.name === "Mint cooler").id,
          quantity: 1,
        },
      ],
    });
    const overview = await workspace(page);
    await page.goto("/app/overview");
    for (const [name, count] of [
      ["Dine-in orders today", overview.metrics.dineIn],
      ["Takeaway orders today", overview.metrics.takeaway],
    ])
      await expect(
        page
          .locator(".metric")
          .filter({ has: page.getByText(name, { exact: true }) })
          .locator("strong"),
      ).toHaveText(String(count));
    const stockPanel = page.getByRole("region", {
      name: "Stock alerts",
      exact: true,
    });
    await expect(stockPanel).toBeVisible();
    const attention = page.locator(".attention-panel");
    const notice = attention.locator(".attention-item").first();
    await expect(notice).toBeVisible();
    await page.screenshot({
      path: `verification/overview-updates-${width}.png`,
    });
    await notice.getByRole("button", { name: /Dismiss alert/ }).click();
    await expect(attention.locator(".attention-item")).toHaveCount(
      Math.min(3, overview.alerts.length - 1),
    );
    await stockPanel
      .getByRole("button", { name: "Close stock alerts", exact: true })
      .click();
    await expect(stockPanel).toHaveCount(0);
    const afterDismiss = await workspace(page);
    expect(afterDismiss.alerts).toEqual(overview.alerts);
    expect(
      afterDismiss.ingredients.find((i: any) => i.id === ingredient.id).on_hand,
    ).toBe(
      overview.ingredients.find((i: any) => i.id === ingredient.id).on_hand,
    );
    await page.reload();
    await expect(stockPanel).toHaveCount(0);
    await expect(attention.locator(".attention-item")).toHaveCount(
      Math.min(3, overview.alerts.length - 1),
    );
    await page.goto("/app/floor");
    for (const v of visits) {
      const card = page.locator(".table-card").filter({
        has: page.getByRole("heading", { name: v.label, exact: true }),
      });
      await expect(card).toContainText("Available");
      await expect(
        card.getByRole("button", { name: "Seat guests", exact: true }),
      ).toBeEnabled();
    }
    expect(
      await (await page.request.get("/api/orders/" + order.id)).json(),
    ).toEqual(before);
    await page.goto("/app/table-billing/" + a.tableId);
    await expect(page.locator(".table-billing-toolbar")).toContainText(
      "Available",
    );
    await expect(clear).toHaveCount(0);
    const next = await command(page, "openSession", {
      tableId: a.tableId,
      guests: 1,
    });
    await page.reload();
    await expect(clear).toBeEnabled();
    if (width === 390) {
      await page.getByLabel("Interface language").selectOption("hi");
      await expect(
        page.getByRole("button", { name: "टेबल खाली करें", exact: true }),
      ).toBeVisible();
      await page.getByLabel("Interface language").selectOption("en");
    }
    await page.screenshot({ path: `verification/clear-table-${width}.png` });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await clear.click();
    await command(page, "closeTable", {
      tableId: a.tableId,
      reason: "Synthetic stale-dialog check",
      sessionIds: [next.id],
      includeMerged: true,
    });
    const newest = await command(page, "openSession", {
      tableId: a.tableId,
      guests: 1,
    });
    await dialog
      .getByRole("button", { name: "Clear table", exact: true })
      .click();
    await expect(dialog).toBeVisible();
    await expect(
      page.getByText(
        "This table visit or merged group has changed. Refresh before clearing it.",
        { exact: true },
      ),
    ).toBeVisible();
    expect(
      (await workspace(page)).sessions.some((s: any) => s.id === newest.id),
    ).toBe(true);
    await page.getByLabel("Close dialog").click();
    await page.reload();
    await clear.click();
    await dialog
      .getByRole("button", { name: "Clear table", exact: true })
      .click();
    await expect(page).toHaveURL(/\/app\/floor$/);
  });
