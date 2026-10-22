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
    ["Your name", "Order counts QA"],
    ["Restaurant name", "Order counts isolated QA"],
    ["First outlet", "Main"],
    ["Email", `order-counts-${randomUUID()}@example.test`],
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
test("Orders count boxes filter cancelled orders and exclude table moves from prepared-food counts on desktop and phone without changing bills", async ({
  page,
}) => {
  if (process.env.QA_BASE_URL) test.setTimeout(240000);
  await register(page);
  const w = await workspace(page),
    [a, b] = w.tables;
  const visit = await command(page, "openSession", {
    tableId: a.id,
    guests: 2,
  });
  const items = [
    {
      itemId: w.menu.find((m: any) => m.name === "Mint cooler").id,
      quantity: 1,
    },
  ];
  const first = await command(page, "createRound", {
    outletId: w.outletId,
    sessionId: visit.id,
    type: "DINE_IN",
    items,
  });
  await command(page, "exchangeTables", {
    sourceTableId: a.id,
    targetTableId: b.id,
    reason: "Move QA guest table",
  });
  const later = await command(page, "createRound", {
    outletId: w.outletId,
    sessionId: visit.id,
    type: "DINE_IN",
    items,
  });
  const cancelled = await command(page, "createRound", {
    outletId: w.outletId,
    type: "TAKEAWAY",
    draft: true,
    items,
  });
  await command(
    page,
    "void",
    {
      version: cancelled.rounds[0].version,
      reason: "Guest cancelled before submission",
    },
    { orderId: cancelled.id, roundId: cancelled.rounds[0].id },
  );
  const snapshot = await (
    await page.request.get("/api/orders/" + first.id)
  ).json();
  const current = await workspace(page),
    counts = current.orderCounts;
  expect(Number(counts.Reallocated)).toBe(0);
  expect(Number(counts.Cancelled)).toBe(1);
  await page.goto("/app/orders");
  const tabs = page.getByRole("group", { name: "Order counts", exact: true }),
    rows = page.locator(".orders-panel tbody tr");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await expect(tabs.getByRole("button")).toHaveCount(8);
    for (const name of [
      "Active",
      "Accepted",
      "Pending",
      "Cancelled",
      "Rejected",
      "Settled",
      "Reallocated",
      "All",
    ]) {
      const button = tabs.locator(`[data-view="${name}"]`);
      await expect(button.locator("strong")).toHaveText(String(counts[name]));
      expect(
        await button.evaluate((el) =>
          parseFloat(getComputedStyle(el).borderRadius),
        ),
      ).toBeGreaterThanOrEqual(10);
      expect(
        await button.evaluate((el) => el.getBoundingClientRect().height),
      ).toBeGreaterThanOrEqual(72);
    }
    await tabs.locator('[data-view="Cancelled"]').click();
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("#" + cancelled.number);
    await tabs.locator('[data-view="Reallocated"]').click();
    await expect(rows).toHaveCount(0);
    await tabs.locator('[data-view="All"]').click();
    await expect(rows).toHaveCount(3);
    await page
      .getByLabel("Search orders", { exact: true })
      .fill(String(first.number));
    await expect(rows).toHaveCount(1);
    await expect(tabs.locator('[data-view="All"] strong')).toHaveText(
      String(counts.All),
    );
    await page.getByLabel("Search orders", { exact: true }).fill("");
    await tabs.locator('[data-view="Accepted"]').focus();
    await page.keyboard.press("Space");
    await expect(tabs.locator('[data-view="Accepted"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `verification/order-count-boxes-${width}.png`,
    });
  }
  await page.getByLabel("Interface language").selectOption("hi");
  await expect(tabs.locator('[data-view="Reallocated"]')).toContainText(
    "तैयार भोजन पुनः आवंटित",
  );
  await page.getByLabel("Interface language").selectOption("en");
  expect(
    await (await page.request.get("/api/orders/" + first.id)).json(),
  ).toEqual(snapshot);
  await command(page, "exchangeTables", {
    sourceTableId: b.id,
    targetTableId: a.id,
    reason: "Return QA guest table",
  });
  await page.reload();
  await expect(tabs.locator('[data-view="Reallocated"] strong')).toHaveText(
    "0",
  );
  await tabs.locator('[data-view="Reallocated"]').click();
  await expect(rows).toHaveCount(0);
});
