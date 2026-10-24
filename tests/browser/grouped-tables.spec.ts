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

test("POS category buttons stay large and rounded on desktop and phone while filtering preserves the cart", async ({
  page,
}) => {
  await register(page);
  await page.goto("/app/pos");
  const categories = page.getByRole("group", {
    name: "Menu categories",
    exact: true,
  });
  const all = categories.getByRole("button", { name: "All", exact: true });
  const cards = page.locator(".menu-card");
  await expect(cards).toHaveCount(6);
  await cards
    .filter({ has: page.getByText("Mint cooler", { exact: true }) })
    .locator(".dish-select")
    .click();
  const cart = page.locator(".cart-items");
  await expect(
    page.getByLabel("Mint cooler quantity", { exact: true }),
  ).toHaveValue("1");
  const before = await cart.innerText();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await all.click();
    await expect(all).toHaveAttribute("aria-pressed", "true");
    const sizes = await categories.getByRole("button").evaluateAll((els) =>
      els.map((el) => {
        const s = getComputedStyle(el),
          b = el.getBoundingClientRect();
        return {
          height: b.height,
          font: parseFloat(s.fontSize),
          radius: parseFloat(s.borderRadius),
          border: s.borderTopStyle,
          labelFits: el.scrollWidth <= el.clientWidth,
          color: s.color,
          background: s.backgroundColor,
          selected: el.getAttribute("aria-pressed") === "true",
        };
      }),
    );
    for (const button of sizes) {
      expect(button.height).toBeGreaterThanOrEqual(48);
      expect(button.font).toBeGreaterThanOrEqual(16);
      expect(button.radius).toBeGreaterThanOrEqual(10);
      expect(button.border).toBe("solid");
      expect(button.labelFits).toBe(true);
      expect(button.color).toBe(
        button.selected ? "rgb(255, 255, 255)" : "rgb(25, 63, 48)",
      );
      expect(button.background).toBe(
        button.selected ? "rgb(25, 63, 48)" : "rgb(255, 255, 255)",
      );
    }
    if (width === 390) {
      expect(
        await categories.evaluate((el) => el.scrollWidth > el.clientWidth),
      ).toBe(true);
      await categories.getByRole("button").last().click();
      expect(await categories.evaluate((el) => el.scrollLeft)).toBeGreaterThan(
        0,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    const breads = categories.getByRole("button", {
      name: "Breads",
      exact: true,
    });
    await breads.click();
    await expect(breads).toHaveAttribute("aria-pressed", "true");
    await expect(all).toHaveAttribute("aria-pressed", "false");
    await expect(cards).toHaveCount(1);
    await expect(cards).toContainText("Butter naan");
    expect(await cart.innerText()).toBe(before);
    await categories
      .getByRole("button", { name: "Beverages", exact: true })
      .focus();
    await page.keyboard.press("Tab");
    await expect(breads).toBeFocused();
    await breads.press("Enter");
    await expect(cards).toHaveCount(1);
    await all.click();
    await expect(cards).toHaveCount(6);
    if(!await page.getByRole('searchbox',{name:'Search menu',exact:true}).isVisible())await page.getByRole('button',{name:'Search menu',exact:true}).click();await page.getByRole('searchbox',{name:'Search menu',exact:true}).fill("Mint cooler");
    await expect(cards).toHaveCount(1);
    await expect(cards).toContainText("Mint cooler");
    if(!await page.getByRole('searchbox',{name:'Search menu',exact:true}).isVisible())await page.getByRole('button',{name:'Search menu',exact:true}).click();await page.getByRole('searchbox',{name:'Search menu',exact:true}).fill("");
    expect(await cart.innerText()).toBe(before);
    await page.screenshot({
      path: `verification/pos-category-boxes-${width}.png`,
    });
    await categories.screenshot({
      path: `verification/pos-category-strip-${width}.png`,
    });
  }
});

test("phone Ingredient label stays readable in normal, hover and focus states", async ({
  page,
}) => {
  await register(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/inventory");
  const button = page.getByRole("button", { name: "Ingredient", exact: true });
  for (const state of ["normal", "hover", "focus"]) {
    if (state === "hover") await button.hover();
    if (state === "focus") await button.focus();
    await expect(button).toBeVisible();
    expect(await button.evaluate((el) => getComputedStyle(el).color)).toBe(
      "rgb(25, 63, 48)",
    );
    expect(
      await button.evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe("rgb(255, 255, 255)");
  }
  await page
    .locator(".panel-heading")
    .screenshot({ path: "verification/ingredient-phone-contrast.png" });
  await button.click();
  await expect(
    page.getByRole("dialog", { name: "Add ingredient", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Ingredient name", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Close dialog").click();
});

test("Explore two-finger pinch zooms around its midpoint without opening or changing a table", async ({
  page,
}) => {
  await register(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/floor-plan");
  const viewport = page.getByLabel("Floor canvas viewport", { exact: true });
  const camera = page.locator(".floor-camera"),
    frame = await viewport.boundingBox();
  expect(
    await viewport.evaluate((el) => getComputedStyle(el).borderTopStyle),
  ).toBe("dotted");
  await expect(viewport.locator(".floor-layout-bounds")).toHaveAttribute(
    "stroke-dasharray",
    "1 7",
  );
  await expect(viewport.locator(".floor-layout-bounds")).toHaveAttribute(
    "vector-effect",
    "non-scaling-stroke",
  );
  const client = await page.context().newCDPSession(page);
  const scale = () =>
    camera.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
  const perform = async (start: number, end: number) => {
    const b = (await viewport.boundingBox())!,
      center = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: center.x - start, y: center.y, id: 1 },
        { x: center.x + start, y: center.y, id: 2 },
      ],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: center.x - end, y: center.y, id: 1 },
        { x: center.x + end, y: center.y, id: 2 },
      ],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  };
  const before = await scale();
  await perform(35, 70);
  await expect.poll(scale).toBeGreaterThan(before * 1.8);
  const zoomed = await scale();
  await perform(70, 35);
  await expect.poll(scale).toBeLessThan(zoomed * 0.6);
  expect(await viewport.boundingBox()).toEqual(frame);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Arrange", exact: true }).click();
  const objects = () =>
    page
      .locator(".plan-object")
      .evaluateAll((els) => els.map((e) => e.getAttribute("style")));
  const positions = await objects();
  await perform(35, 65);
  expect(await objects()).toEqual(positions);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => window.visualViewport?.scale)).toBe(1);
  await page.screenshot({ path: "verification/explore-pinch-phone.png" });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("Explore moving content stays behind the outer dotted frame on every edge at desktop and phone sizes", async ({
  page,
}) => {
  await register(page);
  await page.goto("/app/floor-plan");
  const viewport = page.getByLabel("Floor canvas viewport", { exact: true });
  const table = page.locator(".plan-table").first();
  await expect(table).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const arranging of [false, true]) {
      if (arranging)
        await page
          .getByRole("button", { name: "Arrange", exact: true })
          .click();
      const geometry = await page
        .locator(".plan-object")
        .evaluateAll((els) => els.map((e) => e.getAttribute("style")));
      const frame = (await viewport.boundingBox())!;
      for (const magnification of [1, 4]) {
        const scale = () =>
          page
            .locator(".floor-camera")
            .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
        if (magnification === 1) {
          await page.getByLabel("Fit floor to view", { exact: true }).click();
          await expect.poll(scale).toBeLessThanOrEqual(1);
        }
        while ((await scale()) < magnification) {
          const before = await scale();
          await page.getByLabel("Zoom in floor plan", { exact: true }).click();
          await expect.poll(scale).toBeGreaterThan(before);
        }
        if (magnification === 4) expect(await scale()).toBe(4);
        for (const edge of ["left", "right", "top", "bottom"]) {
          const horizontal = edge === "left" || edge === "right";
          const point = {
            x:
              edge === "left"
                ? frame.x + 3
                : edge === "right"
                  ? frame.x + frame.width - 3
                  : frame.x + frame.width / 2,
            y:
              edge === "top"
                ? frame.y + 3
                : edge === "bottom"
                  ? frame.y + frame.height - 3
                  : frame.y + frame.height / 2,
          };
          const box = (await table.boundingBox())!;
          await page.mouse.move(
            frame.x + frame.width / 2,
            frame.y + frame.height / 2,
          );
          await page.mouse.wheel(
            box.x + box.width / 2 - point.x,
            box.y + box.height / 2 - point.y,
          );
          const hit = (p: { x: number; y: number }) =>
            page.evaluate(
              (p) =>
                !!document
                  .elementFromPoint(p.x, p.y)
                  ?.closest(
                    ".plan-object,.plan-resize-handle,.floor-outline-boundary",
                  ),
              p,
            );
          // Moving content still exists just inside the frame, but cannot cover its edge.
          const inside = {
            x: point.x + (horizontal ? (edge === "left" ? 8 : -8) : 0),
            y: point.y + (!horizontal ? (edge === "top" ? 8 : -8) : 0),
          };
          await expect.poll(() => hit(inside)).toBe(true);
          expect(
            await hit(point),
            `${width}px ${edge} frame must remain clear`,
          ).toBe(false);
          const outside = {
            x: point.x + (horizontal ? (edge === "left" ? -4 : 4) : 0),
            y: point.y + (!horizontal ? (edge === "top" ? -4 : 4) : 0),
          };
          expect(await hit(outside)).toBe(false);
          expect(await viewport.boundingBox()).toEqual(frame);
        }
      }
      expect(
        await page
          .locator(".plan-object")
          .evaluateAll((els) => els.map((e) => e.getAttribute("style"))),
      ).toEqual(geometry);
      await page.screenshot({
        path: `verification/explore-hard-frame-${width}-${arranging ? "arrange" : "view"}.png`,
      });
      if (arranging)
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
    }
  }
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("grouped table card holds all member bills, seats and QR codes, and demerge restores separate cards", async ({
  page,
}) => {
  if (process.env.QA_BASE_URL) test.setTimeout(240000);
  await register(page);
  const w = await workspace(page),
    members = w.tables
      .filter((t: any) => ["T01", "T02", "T03"].includes(t.label))
      .sort((a: any, b: any) => a.label.localeCompare(b.label));
  const visits = [];
  for (const table of members)
    visits.push(
      await command(page, "openSession", { tableId: table.id, guests: 2 }),
    );
  for (const index of [0, 2])
    await command(page, "createRound", {
      outletId: w.outletId,
      sessionId: visits[index].id,
      type: "DINE_IN",
      items: [{ itemId: w.menu[0].id, quantity: 1 }],
    });
  for (const child of visits.slice(1))
    await command(page, "merge", {
      parentId: visits[0].id,
      childId: child.id,
      reason: "Join QA tables",
    });
  await page.goto("/app/floor");
  const group = page.locator(".table-card").filter({
    has: page.getByRole("heading", {
      name: "T01 & T02 & T03 (Merged)",
      exact: true,
    }),
  });
  await expect(group).toBeVisible();
  await expect(page.locator(".table-card")).toHaveCount(10);
  await expect(group).toContainText("12 seats");
  await expect(group.locator(".session-info")).toHaveCount(3);
  await group.getByRole("button", { name: "Details", exact: true }).click();
  await expect(
    page.getByLabel("Table bill", { exact: true }).locator("option"),
  ).toHaveCount(2);
  await expect(page.locator(".table-billing-toolbar")).toContainText(
    "T01 & T02 & T03 (Merged)",
  );
  await expect(
    page.getByLabel("Table bill").locator("option").filter({ hasText: "T03" }),
  ).toHaveCount(1);
  await page.goto("/app/floor");
  await group.getByRole("button", { name: "Table QR", exact: true }).click();
  await expect(page.getByLabel("Table QR for").locator("option")).toHaveCount(
    3,
  );
  await page.getByLabel("Table QR for").selectOption(members[1].id);
  await expect(page.getByRole("dialog")).toContainText("T02");
  await page.getByLabel("Close dialog", { exact: true }).click();
  await group.getByLabel("Edit T01 capacity", { exact: true }).click();
  await page.getByLabel("Table capacity for").selectOption(members[1].id);
  await page.getByLabel("Seats", { exact: true }).fill("6");
  await save(page);
  await expect(group).toContainText("14 seats");
  await page.getByLabel("Actions for T01", { exact: true }).click();
  await page.screenshot({ path: "verification/grouped-tables-desktop.png" });
  await page.keyboard.press("Escape");
  await expect(group).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(group).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "verification/grouped-tables-mobile.png" });
  await page.getByLabel("Actions for T01", { exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Demerge tables", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".table-card")).toHaveCount(12);
  for (const table of members)
    await expect(
      page.getByRole("heading", { name: table.label, exact: true }),
    ).toBeVisible();
  const after = await workspace(page);
  for (const t of members)
    expect(after.tables.find((v: any) => v.id === t.id).public_key).toBe(
      t.public_key,
    );
  await page.goto("/app/floor-plan");
  await expect(page.locator(".plan-object.plan-table")).toHaveCount(12);
});

test("Menu header buttons, search and category text remain visible and usable on desktop and mobile", async ({
  page,
}) => {
  await register(page);
  await page.goto("/app/menu");
  const toolbar = page.locator(".menu-toolbar");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const name of ["Categories", "Recipes", "Add dish", "Add liquor"]) {
      const button = toolbar.getByRole(name === "Recipes" ? "link" : "button", {
        name,
        exact: true,
      });
      await expect(button).toBeVisible();
      expect(await button.evaluate((e) => getComputedStyle(e).color)).toBe(
        "rgb(25, 63, 48)",
      );
    }
    for (const control of [
      toolbar.getByLabel("Filter menu category"),
      toolbar.getByLabel("Search dishes"),
    ])
      expect(await control.evaluate((e) => getComputedStyle(e).color)).toBe(
        "rgb(25, 63, 48)",
      );
    await toolbar.screenshot({
      path: `verification/menu-contrast-${width}.png`,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await toolbar
    .getByRole("button", { name: "Categories", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Close dialog").click();
  await toolbar.getByRole("button", { name: "Add dish", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Add menu item", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Close dialog").click();
  await toolbar.getByLabel("Search dishes").fill("Mint cooler");
  await expect(
    page.getByRole("row").filter({ hasText: "Mint cooler" }),
  ).toHaveCount(1);
});
