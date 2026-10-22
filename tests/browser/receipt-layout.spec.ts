import { test, expect, type Page } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { appendFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
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
async function workspace(page: Page) {
  return (await page.request.get("/api/workspace")).json();
}
test("configured thermal bills match the receipt structure on phone and 80mm print without changing issued data", async ({
  page,
  browser,
}) => {
  if (!process.env.QA_BASE_URL)
    await page.setExtraHTTPHeaders({
      "x-forwarded-for": "10." + [...randomBytes(3)].join("."),
    });
  const email = "receipt-" + randomUUID() + "@example.test";
  await page.goto("/signup");
  for (const [label, value] of [
    ["Your name", "Receipt QA"],
    ["Restaurant name", "Diner Dost Café"],
    ["First outlet", "Main"],
    ["Email", email],
    ["Password", randomBytes(24).toString("base64url")],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel("Customer QR ordering").selectOption("off");
  await page.getByLabel("Add a sample menu and 12 tables").check();
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.waitForURL("**/app/overview");
  if (process.env.QA_ACCOUNTS_FILE)
    await appendFile(
      process.env.QA_ACCOUNTS_FILE,
      JSON.stringify({ email }) + "\n",
    );
  let w = await workspace(page),
    outlet = w.outlets[0];
  await command(page, "outlet", {
    id: outlet.id,
    version: outlet.version,
    name: "Main",
    code: outlet.code,
    address: "12 Market Road\nGuwahati, Assam - 781001",
    gstin: "22AAAAA0000A1Z5",
    qrEnabled: false,
    paymentPolicy: "PREPAID",
    taxBps: 0,
    earnBps: 200,
  });
  await page.goto("/app/outlets");
  await page.getByRole("button", { name: "Bill details", exact: true }).click();
  const logo = await sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180"><circle cx="120" cy="80" r="65" fill="none" stroke="black" stroke-width="4"/><text x="120" y="100" text-anchor="middle" font-family="serif" font-weight="bold" font-size="58">DD</text></svg>',
    ),
  )
    .png()
    .toBuffer();
  await page.getByLabel("Bill logo", { exact: true }).setInputFiles({
    name: "qa-logo.png",
    mimeType: "image/png",
    buffer: logo,
  });
  await expect(
    page.getByRole("link", { name: "View logo", exact: true }),
  ).toBeVisible();
  for (const [label, value] of [
    ["Business phone", "9000000000"],
    ["FSSAI licence no.", "12345678901234"],
    ["Feedback email", "feedback@example.test"],
    ["Thank-you message", "Thank You, Visit Again!!!"],
    ["Delivery footer", "Available on Swiggy & Zomato!!"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page
    .getByRole("button", { name: "Save bill details", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  w = await workspace(page);
  outlet = w.outlets[0];
  await command(page, "taxSettings", {
    outletId: outlet.id,
    version: outlet.version,
    taxes: [
      { name: "CGST", rateBps: 250 },
      { name: "SGST", rateBps: 250 },
    ],
  });
  const session = await command(page, "openSession", {
      tableId: w.tables[2].id,
      guests: 2,
    }),
    dishes = w.menu.filter((item: any) => item.unit === "portion");
  let order = await command(page, "createRound", {
    outletId: w.outletId,
    sessionId: session.id,
    type: "DINE_IN",
    customer: { name: "Sample Guest", phone: "9123456778" },
    items: dishes.slice(0, 3).map((item: any, index: number) => ({
      itemId: item.id,
      quantity: index ? 1 : 2,
    })),
  });
  const provisional = await command(page, "bill", {}, { orderId: order.id });
  await page.goto("/invoice/" + provisional.id);
  await expect(
    page.getByText("PROVISIONAL BILL · NOT A TAX INVOICE", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Outstanding", { exact: true })).toBeVisible();
  await expect(page.locator(".receipt-items thead th")).toHaveText([
    "Item",
    "Qty.",
    "Price",
    "Amount",
  ]);
  await page
    .locator(".receipt-logo")
    .evaluate((image: HTMLImageElement) => image.decode());
  await page
    .locator(".thermal-receipt")
    .screenshot({ path: "verification/thermal-provisional.png" });
  expect(order.rounds[0].status).toBe("ACCEPTED");
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
    (ticket: any) => ticket.order_id === order.id,
  )) {
    await command(page, "kitchen", { state: "PREPARING" }, { id: ticket.id });
    await command(page, "kitchen", { state: "READY" }, { id: ticket.id });
  }
  await command(page, "serve", undefined, {
    orderId: order.id,
    roundId: order.rounds[0].id,
  });
  const invoice = await command(
    page,
    "bill",
    { final: true },
    { orderId: order.id },
  );
  await page.goto("/invoice/" + invoice.id);
  const receipt = page.getByRole("article", {
    name: "Final tax invoice",
    exact: true,
  });
  await expect(receipt).toBeVisible();
  await expect(page.locator(".receipt-provisional")).toHaveCount(0);
  await expect(
    receipt.getByText("Dine In: " + w.tables[2].label, { exact: true }),
  ).toBeVisible();
  await expect(
    receipt.getByText("Total Qty: 4", { exact: true }),
  ).toBeVisible();
  await expect(receipt.getByText("CGST 2.5%", { exact: true })).toBeVisible();
  await expect(receipt.getByText("SGST 2.5%", { exact: true })).toBeVisible();
  await expect(
    receipt.getByText("Cashier: Receipt QA", { exact: true }),
  ).toBeVisible();
  await page
    .locator(".receipt-logo")
    .evaluate((image: HTMLImageElement) => image.decode());
  expect(
    await receipt.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await receipt.screenshot({ path: "verification/thermal-final.png" });
  await page.setViewportSize({ width: 390, height: 1000 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "verification/thermal-mobile.png",
    fullPage: true,
  });
  await page.evaluate(() => {
    window.print = () => {
      document.body.dataset.printInvoked = "true";
    };
  });
  await page
    .getByRole("button", { name: "Print / save PDF", exact: true })
    .click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-print-invoked",
    "true",
  );
  await page.emulateMedia({ media: "print" });
  await expect(
    page.getByRole("button", { name: "Print / save PDF" }),
  ).toBeHidden();
  const pdf = await page.pdf({
      path: "verification/thermal-receipt.pdf",
      preferCSSPageSize: true,
      printBackground: true,
    }),
    mediaBox = pdf
      .toString("latin1")
      .match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/);
  expect(mediaBox, "PDF has an 80mm paper width").toBeTruthy();
  expect(Number(mediaBox![1])).toBeCloseTo((80 / 25.4) * 72, 0);
  expect(Number(mediaBox![2])).toBeLessThan(800);
  await page.screenshot({
    path: "verification/thermal-print.png",
    fullPage: true,
  });
  await writeFile(
    "verification/thermal-layout-acceptance.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        invoiceId: invoice.id,
        mediaBox: mediaBox?.slice(1),
        checks: [
          "owner configuration",
          "logo upload",
          "snapshot fields",
          "four columns",
          "taxes",
          "quantity",
          "phone overflow",
          "80mm PDF",
          "provisional labeling",
          "immutable issued data",
          "anonymous asset denied",
        ],
      },
      null,
      2,
    ),
  );
  const anonymous = await browser.newContext();
  expect(
    (
      await anonymous.request.get(
        new URL(
          "/api/receipt-images/" + invoice.snapshot.receipt.logoId,
          page.url(),
        ).href,
      )
    ).status(),
  ).toBe(401);
  await anonymous.close();
  w = await workspace(page);
  await command(page, "receiptSettings", {
    outletId: w.outletId,
    version: w.outlets[0].version,
    settings: { footer: "Changed footer" },
  });
  expect(
    (await (await page.request.get("/api/invoices/" + invoice.id)).json())
      .snapshot,
  ).toEqual(invoice.snapshot);
  await page.reload();
  await expect(
    receipt.getByText("Thank You, Visit Again!!!", { exact: true }),
  ).toBeVisible();
});
