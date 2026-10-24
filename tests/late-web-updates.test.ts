import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createEmbeddedDatabase,
  createPostgresDatabase,
  type Database,
} from "@dinerdost/database";
import {
  businessDate,
  splitExact,
  floorOutline,
  objectInFloor,
  roundAdjustment,
  type Actor,
} from "@dinerdost/core";
import * as s from "@dinerdost/services";
let db: Database, owner: Actor, w: any;
const key = () => randomUUID(),
  future = (hours = 72) => new Date(Date.now() + hours * 3600000).toISOString();
before(async () => {
  db = process.env.TEST_DATABASE_URL
    ? createPostgresDatabase(process.env.TEST_DATABASE_URL)
    : await createEmbeddedDatabase();
  await db.migrate();
  await db.migrate();
  const a = await s.signup(
    db,
    {
      name: "Late QA",
      email: "late-qa@example.test",
      password: "late-qa-test-password",
      restaurant: "Late QA",
      outlet: "Main",
      qrEnabled: true,
      demo: true,
    },
    "late-qa",
  );
  owner = await s.authenticate(db, a.token);
  w = await s.workspace(db, owner);
});
after(async () => {
  await db?.close();
});
async function detail(id: string) {
  return db.transaction(owner.restroId, (tx) => s.orderDetail(tx, owner, id));
}
async function menu(
  name: string,
  price = 50001,
  stream: "FOOD" | "BAR" = "FOOD",
) {
  return (
    await s.saveMenu(db, owner, key(), {
      outletId: w.outletId,
      name,
      category: stream === "BAR" ? "Bar" : "Food",
      price,
      taxBps: 0,
      station: "Shared",
      unit: "portion",
      stream,
      imageUrl: "/images/menu/samples/butter-naan.webp",
    })
  ).id;
}
async function ingredient(name: string, stream: "FOOD" | "BAR" = "FOOD") {
  return (
    await s.addIngredient(db, owner, key(), {
      outletId: w.outletId,
      name,
      unit: "kg",
      stream,
    })
  ).id;
}
async function receive(id: string, quantity = 10000, cost = 1000, hours = 72) {
  return s.receiveStock(
    db,
    owner,
    key(),
    {
      ingredientId: id,
      batchNumber: key(),
      quantityMilli: quantity,
      unitCost: cost,
      reference: "Late QA receipt",
      expiresAt: future(hours),
    },
    true,
  );
}
async function order(items: { itemId: string; quantity: number }[]) {
  // Preserve a held legacy/payment-gated fixture for expiry and reservation checks.
  // New web staff bypass is exercised in post-release-feedback.test.ts.
  const o = await s.createRound(db, owner, key(), {
    outletId: w.outletId,
    type: "TAKEAWAY",
    customer: { name: "Late Guest", phone: "9123456750" },
    items,
  });
  return s.decideRound(db, owner, key(), o.id, o.rounds[0].id, {
    version: o.rounds[0].version,
    decision: "ACCEPT",
  });
}
async function pay(id: string) {
  let o = await detail(id);
  await s.reviewRewards(db, owner, key(), o.id, o.rounds[0].id);
  o = await detail(id);
  await s.recordPayment(db, owner, key(), o.id, o.rounds[0].id, {
    version: o.rounds[0].version,
    method: "CASH",
    amount: Number(o.rounds[0].payable),
  });
  return detail(id);
}
async function settle(id: string) {
  const o = await detail(id),
    tickets = (await s.workspace(db, owner)).tickets.filter(
      (t: any) => t.order_id === id,
    );
  for (const t of tickets) {
    await s.kitchenDecision(db, owner, key(), t.id, { state: "PREPARING" });
    await s.kitchenDecision(db, owner, key(), t.id, { state: "READY" });
  }
  await s.serveRound(db, owner, key(), id, o.rounds[0].id);
  return s.generateBill(db, owner, key(), id, { final: true });
}
async function printMode(mode: "OFF" | "MANUAL" | "AUTO") {
  const outlet = (await s.workspace(db, owner)).outlets[0];
  await s.saveOutlet(db, owner, key(), {
    id: outlet.id,
    version: outlet.version,
    name: outlet.name,
    code: outlet.code,
    address: outlet.address,
    gstin: outlet.gstin,
    qrEnabled: outlet.qr_enabled,
    paymentPolicy: outlet.payment_policy,
    taxBps: Number(outlet.tax_bps),
    earnBps: Number(outlet.earn_bps),
    kotPrintMode: mode,
  });
}

test("purchase-rate edits are defaults only and retain existing stock balances, FIFO costs and version permissions", async () => {
  const id = await ingredient("Rate QA");
  const batch = await receive(id, 2000, 12000);
  let item = (await s.workspace(db, owner)).ingredients.find(
    (i: any) => i.id === id,
  );
  assert.equal(item.purchase_rate, null);
  const input = {
    id,
    version: item.version,
    name: item.name,
    unit: "kg",
    reorderMilli: 500,
    purchaseRate: 19999,
  };
  await s.updateIngredient(db, owner, key(), input);
  item = (await s.workspace(db, owner)).ingredients.find(
    (i: any) => i.id === id,
  );
  assert.equal(Number(item.purchase_rate), 19999);
  assert.equal(Number(item.on_hand), 2000);
  assert.equal(
    Number(
      (
        await db.query("SELECT unit_cost FROM stock_batches WHERE id=$1", [
          batch.id,
        ])
      ).rows[0].unit_cost,
    ),
    12000,
  );
  await assert.rejects(() => s.updateIngredient(db, owner, key(), input), {
    code: "VERSION_CONFLICT",
  });
  await assert.rejects(
    () =>
      s.updateIngredient(db, { ...owner, role: "CASHIER" }, key(), {
        ...input,
        version: item.version,
      }),
    { code: "FORBIDDEN" },
  );
  await s.updateIngredient(db, owner, key(), {
    ...input,
    version: item.version,
    purchaseRate: null,
  });
  assert.equal(
    (await s.workspace(db, owner)).ingredients.find((i: any) => i.id === id)
      .purchase_rate,
    null,
  );
});
test("future web receipts require a precise expiry for food and liquor; legacy callers retain their date-only contract", async () => {
  for (const category of ["GENERAL", "LIQUOR"] as const) {
    const id = (
      await s.addIngredient(db, owner, key(), {
        outletId: w.outletId,
        name: "Expiry " + category,
        unit: category === "LIQUOR" ? "L" : "kg",
        category,
      })
    ).id;
    const input = {
      ingredientId: id,
      batchNumber: key(),
      quantityMilli: 1000,
      unitCost: 1000,
      reference: "Expiry QA",
    };
    await assert.rejects(() => s.receiveStock(db, owner, key(), input, true), {
      code: "EXPIRY_REQUIRED",
    });
    await assert.rejects(
      () =>
        s.receiveStock(
          db,
          owner,
          key(),
          { ...input, expiresAt: future(-1) },
          true,
        ),
      { code: "EXPIRED_BATCH" },
    );
    await assert.rejects(
      () =>
        s.receiveStock(
          db,
          owner,
          key(),
          { ...input, expiresAt: future(), expiresOn: "2099-01-01" },
          true,
        ),
      { code: "EXPIRY_MISMATCH" },
    );
    const request = key(),
      expiresAt = future(),
      valid = { ...input, expiresAt };
    const receipt = await s.receiveStock(db, owner, request, valid, true);
    assert.deepEqual(
      await s.receiveStock(db, owner, request, valid, true),
      receipt,
    );
    const saved = (
      await db.query(
        "SELECT expires_on::text,expires_at FROM stock_batches WHERE id=$1",
        [receipt.id],
      )
    ).rows[0];
    assert.equal(String(saved.expires_on), businessDate(expiresAt));
    assert.equal(new Date(saved.expires_at as string).toISOString(), expiresAt);
    const legacy = await s.receiveStock(db, owner, key(), {
      ...input,
      batchNumber: key(),
    });
    assert.equal(
      (
        await db.query("SELECT expires_at FROM stock_batches WHERE id=$1", [
          legacy.id,
        ])
      ).rows[0].expires_at,
      null,
    );
  }
});
test("stock alerts use 48/24/12/6 hour phases, distinguish unknown/expired stock and obey food/bar/outlet scope", async () => {
  const id = await ingredient("Alert food"),
    bar = await ingredient("Alert bar", "BAR"),
    empty = await ingredient("No stock QA"),
    expected = new Map<string, string>();
  for (const [hours, phase] of [
    [4, "6H"],
    [10, "12H"],
    [20, "24H"],
    [40, "48H"],
    [60, "NONE"],
  ] as const) {
    const batch = await receive(id, 1000, 1000, hours);
    expected.set(batch.id, phase);
  }
  const expired = await receive(bar);
  await db.query(
    "UPDATE stock_batches SET expires_at=now()-interval '1 minute' WHERE id=$1",
    [expired.id],
  );
  const legacy = await s.receiveStock(db, owner, key(), {
    ingredientId: id,
    batchNumber: "Legacy unknown",
    quantityMilli: 1000,
    unitCost: 2000,
    reference: "Legacy QA",
  });
  const alerts = await s.stockAlerts(db, owner, { outletId: w.outletId });
  for (const [batchId, phase] of expected)
    assert.equal(
      alerts.batches.find((b) => b.id === batchId)?.phase,
      phase === "NONE" ? undefined : phase,
    );
  assert.equal(
    alerts.batches.find((b) => b.id === legacy.id)?.phase,
    "UNKNOWN",
  );
  assert.equal(
    alerts.batches.find((b) => b.id === expired.id)?.phase,
    undefined,
  );
  assert.ok(alerts.availability.some((i) => i.id === empty));
  assert.ok(alerts.availability.some((i) => i.id === bar));
  const barOnly = await s.stockAlerts(
    db,
    { ...owner, role: "BARTENDER" },
    { outletId: w.outletId },
  );
  assert.ok(barOnly.batches.every((i) => i.production_stream === "BAR"));
  await assert.rejects(
    () =>
      s.stockAlerts(
        db,
        { ...owner, role: "CASHIER" },
        { outletId: w.outletId },
      ),
    { code: "FORBIDDEN" },
  );
  await assert.rejects(
    () =>
      s.stockAlerts(
        db,
        { ...owner, role: "MANAGER", outletIds: [] },
        { outletId: w.outletId },
      ),
    { code: "OUTLET_FORBIDDEN" },
  );
});
test("daily waste lists actual immutable movements, units/costs and reconciles opening/closing stock", async () => {
  const id = await ingredient("Waste daily QA"),
    batch = await receive(id, 5000, 1350);
  const input = {
      batchId: batch.id,
      quantityMilli: 1250,
      reason: "Spilled during preparation",
    },
    request = key();
  await s.wasteStock(db, owner, request, input);
  await s.wasteStock(db, owner, request, input);
  const report = await s.wasteReport(db, owner, {
    outletId: w.outletId,
    date: businessDate(),
    search: "Waste daily QA",
  });
  assert.equal(report.items.length, 1);
  assert.equal(Number(report.items[0].quantity), 1250);
  assert.equal(Number(report.items[0].cost), 1688);
  assert.equal(report.items[0].unit, "kg");
  const summary = await s.stockSummary(db, owner, {
    outletId: w.outletId,
    date: businessDate(),
    search: "Waste daily QA",
  });
  assert.equal(Number(summary.items[0].closing), 3750);
  assert.equal(
    Number(summary.items[0].opening) + Number(summary.items[0].movement),
    3750,
  );
  await assert.rejects(
    () =>
      s.wasteReport(
        db,
        { ...owner, role: "CASHIER" },
        { outletId: w.outletId },
      ),
    { code: "FORBIDDEN" },
  );
  await assert.rejects(
    () =>
      s.wasteReport(db, owner, { outletId: w.outletId, date: "2026-02-31" }),
    { code: "INVALID_DATE" },
  );
});
test("KOT printing requires an authorized released round, separates station streams and never exposes bill/customer data", async () => {
  const food = await menu("Print food"),
    bar = await menu("Print bar", 10000, "BAR");
  const o = await order([
      { itemId: food, quantity: 1 },
      { itemId: bar, quantity: 2 },
    ]),
    r = o.rounds[0];
  await assert.rejects(() => s.kotReceipt(db, owner, o.id, r.id), {
    code: "KOT_PRINT_DISABLED",
  });
  await printMode("MANUAL");
  await assert.rejects(() => s.kotReceipt(db, owner, o.id, r.id), {
    code: "KOT_NOT_RELEASED",
  });
  await pay(o.id);
  const receipt = await s.kotReceipt(db, owner, o.id, r.id);
  assert.equal(receipt.tickets.length, 2);
  assert.ok(receipt.tickets.every((t) => t.items.length === 1));
  assert.ok(!JSON.stringify(receipt).includes("9123456750"));
  assert.ok(!JSON.stringify(receipt).includes("unit_price"));
  const kitchen = await s.kotReceipt(
      db,
      { ...owner, role: "KITCHEN" },
      o.id,
      r.id,
    ),
    bartender = await s.kotReceipt(
      db,
      { ...owner, role: "BARTENDER" },
      o.id,
      r.id,
    );
  assert.equal(kitchen.tickets.length, 1);
  assert.equal(kitchen.tickets[0].production_stream, "FOOD");
  assert.equal(bartender.tickets[0].production_stream, "BAR");
  await assert.rejects(
    () => s.kotReceipt(db, { ...owner, role: "WAITER" }, o.id, r.id),
    { code: "SESSION_REQUIRED" },
  );
  await assert.rejects(
    () => s.requestKotPrint(db, owner, key(), o.id, r.id, { automatic: true }),
    { code: "KOT_AUTO_DISABLED" },
  );
  const request = key(),
    printed = await s.requestKotPrint(db, owner, request, o.id, r.id, {});
  assert.ok(printed.url);
  const foodReceipt = await s.kotReceipt(db, owner, o.id, r.id, {streams:['FOOD'],layout:'COMBINED'});
  assert.equal(foodReceipt.layout,'COMBINED');
  assert.equal(foodReceipt.tickets.length,1);
  assert.equal(foodReceipt.tickets[0].production_stream,'FOOD');
  const barOnly = await s.requestKotPrint(db, owner, key(), o.id, r.id, {streams:['BAR'],layout:'SEPARATE'});
  assert.equal(barOnly.ticketIds.length,1);
  assert.equal(new URL(barOnly.url!,'http://localhost').searchParams.get('streams'),'BAR');
  const combined = await s.requestKotPrint(db, owner, key(), o.id, r.id, {streams:['FOOD','BAR'],layout:'COMBINED'});
  assert.equal(combined.ticketIds.length,2);
  assert.equal(new URL(combined.url!,'http://localhost').searchParams.get('layout'),'COMBINED');
  await assert.rejects(()=>s.kotReceipt(db,{...owner,role:'BARTENDER'},o.id,r.id,{streams:['FOOD'],layout:'COMBINED'}),{code:'KOT_NOT_RELEASED'});
  await assert.rejects(()=>s.kotReceipt(db,owner,o.id,r.id,{streams:[],layout:'COMBINED'}));
  await assert.rejects(()=>s.requestKotPrint(db,owner,key(),o.id,r.id,{streams:['FOOD','FOOD'],layout:'COMBINED'}));

  assert.deepEqual(
    await s.requestKotPrint(db, owner, request, o.id, r.id, {}),
    printed,
  );
  const after = await detail(o.id);
  assert.equal(Number(after.rounds[0].paid), Number(after.rounds[0].payable));
  assert.equal(after.rounds[0].kot_status, "RELEASED");
  await printMode("OFF");
  await assert.rejects(
    () => s.requestKotPrint(db, owner, key(), o.id, r.id, {}),
    { code: "KOT_PRINT_DISABLED" },
  );
  assert.equal(
    (await s.workspace(db, owner)).tickets.filter(
      (t: any) => t.order_id === o.id,
    ).length,
    2,
  );
});
test("automatic KOT print claims coordinate two terminals once while manual reprints remain available", async () => {
  await printMode("AUTO");
  const o = await order([{ itemId: w.menu[0].id, quantity: 1 }]);
  await pay(o.id);
  const r = o.rounds[0];
  const jobs = await Promise.all([
    s.requestKotPrint(db, owner, key(), o.id, r.id, { automatic: true }),
    s.requestKotPrint(db, owner, key(), o.id, r.id, { automatic: true }),
  ]);
  assert.equal(jobs.filter((j) => j.url).length, 1);
  assert.equal(jobs.filter((j) => j.alreadyRequested).length, 1);
  const events = (
    await db.query(
      "SELECT new_state FROM audit_events WHERE entity_id=$1 AND action='KOT_PRINT_REQUESTED'",
      [r.id],
    )
  ).rows;
  assert.equal(events.length, 1);
  assert.equal((events[0].new_state as any).physicalDeliveryConfirmed, false);
  const cashier = await s.workspace(db, { ...owner, role: "CASHIER" });
  assert.ok(cashier.kotPrintTickets.some((t: any) => t.order_id === o.id));
  assert.equal(cashier.tickets, undefined);
  assert.equal(
    (await s.workspace(db, { ...owner, application: "POS" })).kotPrintTickets,
    undefined,
  );
  assert.ok(!JSON.stringify(cashier.kotPrintTickets).includes("9123456750"));
  assert.ok((await s.requestKotPrint(db, owner, key(), o.id, r.id, {})).url);
  await assert.rejects(
    () =>
      s.requestKotPrint(
        db,
        { ...owner, role: "BARTENDER" },
        key(),
        o.id,
        r.id,
        { automatic: true },
      ),
    { code: "FORBIDDEN" },
  );
});
test("dish profit uses recorded FIFO allocations and allocated discounts; unknown costs remain unknown", async () => {
  assert.deepEqual(splitExact(2, [1, 1, 1]), [1, 1, 0]);
  assert.equal(
    splitExact(100, [9007199254740991n, 9007199254740990n]).reduce(
      (n, v) => n + v,
      0,
    ),
    100,
  );
  const stock = await ingredient("Profit stock"),
    a = await menu("Profit high", 50001),
    b = await menu("Demand high", 20003);
  await receive(stock, 100000, 1000);
  await s.saveRecipe(db, owner, key(), {
    itemId: a,
    ingredients: [{ id: stock, quantityMilli: 1000 }],
  });
  await s.saveRecipe(db, owner, key(), {
    itemId: b,
    ingredients: [{ id: stock, quantityMilli: 3000 }],
  });
  let o = await order([
    { itemId: a, quantity: 2 },
    { itemId: b, quantity: 1 },
  ]);
  o = await s.changeRoundAdjustments(db, owner, key(), o.id, o.rounds[0].id, {
    version: o.rounds[0].version,
    discount: 123,
    roundToRupee: true,
  });
  await pay(o.id);
  const invoice = await settle(o.id);
  const another = await order([{ itemId: b, quantity: 1 }]);
  await pay(another.id);
  await settle(another.id);
  const report = await s.dishReport(db, owner, {
    outletId: w.outletId,
    from: businessDate(),
    to: businessDate(),
    sort: "PROFIT",
  });
  assert.equal(report.items[0].item_id, a);
  assert.equal(Number(report.items.find((i) => i.item_id === a)?.cogs), 2000);
  assert.equal(Number(report.items.find((i) => i.item_id === b)?.cogs), 6000);
  const financial = await s.financialReport(db, owner, {
    outletId: w.outletId,
    from: businessDate(),
    to: businessDate(),
  });
  assert.equal(
    report.items.reduce((n, i) => n + Number(i.net_sales), 0),
    financial.netSales,
  );
  assert.equal(
    report.items.reduce((n, i) => n + Number(i.cogs), 0),
    financial.cogs,
  );
  const demand = await s.dishReport(db, owner, {
    outletId: w.outletId,
    from: businessDate(),
    to: businessDate(),
    sort: "DEMAND",
  });
  assert.equal(demand.items[0].item_id, b);
  const costs = (
    await db.query("SELECT * FROM order_item_costs WHERE round_id=$1", [
      o.rounds[0].id,
    ])
  ).rows;
  await assert.rejects(() =>
    db.query("UPDATE order_item_costs SET cost=0 WHERE order_item_id=$1", [
      costs[0].order_item_id,
    ]),
  );
  assert.equal(
    JSON.stringify(
      (await detail(o.id)).invoices.find((i) => i.id === invoice.id)?.snapshot,
    ),
    JSON.stringify(invoice.snapshot),
  );
  const unknown = await order([{ itemId: w.menu[0].id, quantity: 1 }]);
  await pay(unknown.id);
  await settle(unknown.id);
  assert.equal(
    (
      await s.dishReport(db, owner, {
        outletId: w.outletId,
        from: businessDate(),
        to: businessDate(),
        search: w.menu[0].name,
      })
    ).items[0].profit,
    null,
  );
  await assert.rejects(
    () =>
      s.dishReport(
        db,
        { ...owner, role: "CASHIER" },
        { from: businessDate(), to: businessDate() },
      ),
    { code: "FORBIDDEN" },
  );
});
test("editing accepted recipe items reuses released batch reservations and records only the new quantities", async () => {
  const stock = await ingredient("Edit recipe stock"),
    item = await menu("Edit recipe dish");
  await receive(stock, 10000, 1000);
  await s.saveRecipe(db, owner, key(), {
    itemId: item,
    ingredients: [{ id: stock, quantityMilli: 1000 }],
  });
  let o = await order([{ itemId: item, quantity: 1 }]);
  o = await s.editRound(
    db,
    owner,
    key(),
    o.id,
    o.rounds[0].id,
    {
      version: o.rounds[0].version,
      submit: true,
      items: [{ itemId: item, quantity: 3 }],
    },
    true,
  );
  const reserved = (await s.workspace(db, owner)).ingredients.find(
    (i: any) => i.id === stock,
  );
  assert.equal(Number(reserved.reserved), 3000);
  await pay(o.id);
  const after = (await s.workspace(db, owner)).ingredients.find(
    (i: any) => i.id === stock,
  );
  assert.equal(Number(after.on_hand), 7000);
  assert.equal(Number(after.reserved), 0);
  assert.equal(
    Number(
      (
        await db.query("SELECT cost FROM order_item_costs WHERE round_id=$1", [
          o.rounds[0].id,
        ])
      ).rows[0].cost,
    ),
    3000,
  );
});
test("stock expiring after reservation blocks kitchen release atomically without recording payment", async () => {
  const stock = await ingredient("Expire held stock"),
    item = await menu("Expire held dish");
  const old = await receive(stock, 1000, 1000);
  await s.saveRecipe(db, owner, key(), {
    itemId: item,
    ingredients: [{ id: stock, quantityMilli: 1000 }],
  });
  const o = await order([{ itemId: item, quantity: 1 }]);
  await db.query(
    "UPDATE stock_batches SET expires_at=now()-interval '1 minute' WHERE id=$1",
    [old.id],
  );
  await assert.rejects(() => pay(o.id), { code: "STOCK_EXPIRED" });
  const after = await detail(o.id);
  assert.equal(Number(after.rounds[0].paid), 0);
  assert.equal(after.rounds[0].kot_status, "HELD");
  assert.equal(
    (
      await db.query("SELECT id FROM payment_attempts WHERE order_id=$1", [
        o.id,
      ])
    ).rows.length,
    0,
  );
  await receive(stock, 1000, 1200);
  const edited = await s.editRound(
    db,
    owner,
    key(),
    o.id,
    after.rounds[0].id,
    {
      version: after.rounds[0].version,
      submit: true,
      items: [{ itemId: item, quantity: 1 }],
    },
    true,
  );
  await pay(edited.id);
  assert.equal(
    Number(
      (
        await db.query("SELECT on_hand FROM stock_batches WHERE id=$1", [
          old.id,
        ])
      ).rows[0].on_hand,
    ),
    0,
  );
});
test("web purchase deliveries require expiry on every batch and roll back partial receipts", async () => {
  const a = await ingredient("Delivery A"),
    b = await ingredient("Delivery B");
  const sorted = [a, b].sort();
  const vendor = await s.saveRecord(db, owner, key(), "vendors", {
    outletId: w.outletId,
    title: "Late supplier",
    data: { contact: "Supplier", phone: "", email: "", address: "", gstin: "" },
  });
  const purchase = await s.saveRecord(db, owner, key(), "purchases", {
    outletId: w.outletId,
    title: "Late delivery",
    data: {
      vendorId: vendor.id,
      amount: 10000,
      reference: "LATE-PUR",
      note: "",
    },
  });
  await s.recordDecision(db, owner, key(), purchase.id, {
    version: 1,
    state: "APPROVED",
    reason: "Approved delivery",
  });
  const input = {
    purchaseId: purchase.id,
    version: 2,
    reference: "LATE-GRN",
    lines: sorted.map((id, index) => ({
      ingredientId: id,
      batchNumber: key(),
      quantityMilli: 1000,
      unitCost: 1000,
      ...(index === 0 ? { expiresAt: future() } : {}),
    })),
  };
  await assert.rejects(() => s.receivePurchase(db, owner, key(), input, true), {
    code: "EXPIRY_REQUIRED",
  });
  assert.equal(
    (
      await db.query(
        "SELECT id FROM stock_batches WHERE ingredient_id=ANY($1::uuid[])",
        [sorted],
      )
    ).rows.length,
    0,
  );
  const receipt = await s.receivePurchase(
    db,
    owner,
    key(),
    {
      ...input,
      lines: input.lines.map((l) => ({ ...l, expiresAt: future() })),
    },
    true,
  );
  assert.equal(receipt.batches.length, 2);
  assert.ok(receipt.batches.every((b) => b.expiresAt));
});
test("QR and storefront identity suggestions use canonical linked pairs from the authorized device only", async () => {
  const table = w.tables[11];
  await s.openSession(db, owner, key(), { tableId: table.id, guests: 1 });
  const device = "Late device A",
    otherDevice = "Late device B",
    visit = await s.connectGuest(db, table.public_key, device, "late-ip"),
    other = await s.connectGuest(db, table.public_key, otherDevice, "late-ip");
  await s.guestSubmit(db, table.public_key, visit.token, device, key(), {
    name: "Private QA",
    phone: "9123456759",
    items: [{ itemId: w.menu[0].id, quantity: 1 }],
  });
  const own = await s.guestCatalog(db, table.public_key, visit.token, device),
    stranger = await s.guestCatalog(
      db,
      table.public_key,
      other.token,
      otherDevice,
    );
  assert.equal(own.identities.length, 1);
  assert.equal(own.identities[0].name, "Private QA");
  assert.equal(own.identities[0].phone, "+919123456759");
  assert.deepEqual(stranger.identities, []);
  assert.ok(!JSON.stringify(stranger).includes("9123456759"));
  assert.deepEqual(
    (await s.guestCatalog(db, table.public_key, "invalid", device)).identities,
    [],
  );
  const slug = "late-store",
    brand = await s.saveRecord(db, owner, key(), "brands", {
      outletId: w.outletId,
      title: "Private QA brand",
      data: { description: "QA", active: true },
    });
  await s.saveStorefront(db, owner, key(), {
    outletId: w.outletId,
    brandId: brand.id,
    slug,
    published: true,
  });
  const store = await s.connectStorefront(db, slug, device, "store-ip"),
    storeOther = await s.connectStorefront(db, slug, otherDevice, "other-ip");
  assert.equal(
    (await s.storefrontCatalog(db, slug, store.token, device)).identities[0]
      .phone,
    "+919123456759",
  );
  assert.deepEqual(
    (await s.storefrontCatalog(db, slug, storeOther.token, otherDevice))
      .identities,
    [],
  );
  assert.deepEqual((await s.storefrontCatalog(db, slug)).identities, []);
  const customer = own.identities[0],
    profile = await s.customerProfile(
      db,
      owner,
      String(customer.id),
      w.outletId,
    );
  await s.updateCustomerProfile(db, owner, key(), {
    customerId: customer.id,
    outletId: w.outletId,
    version: profile.version,
    name: "Private QA corrected",
    phone: "9123456760",
  });
  const updated = await s.storefrontCatalog(db, slug, store.token, device);
  assert.equal(updated.identities[0].name, "Private QA corrected");
  assert.equal(updated.identities[0].phone, "+919123456760");
  assert.equal(
    (
      await s.searchCustomers(db, owner, {
        outletId: w.outletId,
        query: "9123456760",
      })
    ).items[0].name,
    "Private QA corrected",
  );
});
test("menu recipe edits are atomic, retain existing ordering and record daily food/liquor usage with opening and closing", async () => {
  const stock = await ingredient("Usage food"),
    dish = await menu("Usage dish", 10000);
  await receive(stock, 10000, 1234);
  let item = (await s.workspace(db, owner)).menu.find(
    (m: any) => m.id === dish,
  );
  const data = {
    id: dish,
    version: item.version,
    outletId: w.outletId,
    name: item.name,
    category: item.category,
    description: "Usage description",
    price: Number(item.price),
    taxBps: 0,
    station: item.station,
    recipe: [{ id: stock, quantityMilli: 250 }],
  };
  await s.saveMenu(db, owner, key(), data);
  const o = await order([{ itemId: dish, quantity: 2 }]);
  item = (await s.workspace(db, owner)).menu.find((m: any) => m.id === dish);
  await assert.rejects(
    () =>
      s.saveMenu(db, owner, key(), {
        ...data,
        version: item.version,
        name: "Should roll back",
        recipe: [{ id: stock, quantityMilli: 500 }],
      }),
    { code: "ACTIVE_RESERVATIONS" },
  );
  assert.equal(
    (await s.workspace(db, owner)).menu.find((m: any) => m.id === dish).name,
    "Usage dish",
  );
  await s.saveMenu(db, owner, key(), { ...data, version: item.version });
  await pay(o.id);
  const liquor = (
    await s.addIngredient(db, owner, key(), {
      outletId: w.outletId,
      name: "Usage spirit",
      unit: "L",
      category: "LIQUOR",
    })
  ).id;
  await receive(liquor, 1000, 200000);
  const peg = (
    await s.saveMenu(db, owner, key(), {
      outletId: w.outletId,
      name: "Usage peg",
      category: "Bar",
      price: 10000,
      taxBps: 0,
      station: "Bar",
      unit: "peg",
      pegMl: 30,
      liquorIngredientId: liquor,
    })
  ).id;
  const barOrder = await order([{ itemId: peg, quantity: 2 }]);
  await pay(barOrder.id);
  const usage = await s.stockUsageReport(db, owner, {
    outletId: w.outletId,
    date: businessDate(),
  });
  const food = usage.items.find((i) => i.id === stock)!,
    bar = usage.items.find((i) => i.id === liquor)!;
  assert.equal(Number(food.opening), 0);
  assert.equal(Number(food.quantity), 500);
  assert.equal(Number(food.closing), 9500);
  assert.equal(Number(bar.quantity), 60);
  assert.equal(Number(bar.closing), 940);
  const summary = await s.stockSummary(db, owner, {
    outletId: w.outletId,
    date: businessDate(),
  });
  for (const row of usage.items) {
    const exact = summary.items.find((i) => i.id === row.id);
    assert.equal(Number(row.opening), Number(exact?.opening));
    assert.equal(Number(row.closing), Number(exact?.closing));
  }
  const onlyBar = await s.stockUsageReport(
    db,
    { ...owner, role: "BARTENDER" },
    { outletId: w.outletId },
  );
  assert.ok(onlyBar.items.every((i) => i.production_stream === "BAR"));
  await assert.rejects(
    () =>
      s.stockUsageReport(
        db,
        { ...owner, role: "CASHIER" },
        { outletId: w.outletId },
      ),
    { code: "FORBIDDEN" },
  );
});
test("Tables and Explore share additions/deletions and QR identity inside circle and concave floors, with stale drafts rejected", async () => {
  for (const shape of ["Circle", "L-shaped"] as const) {
    const floor = "Shared " + shape;
    await s.saveFloor(db, owner, key(), { outletId: w.outletId, name: floor });
    let plan = (await s.workspace(db, owner)).floorPlans.find(
      (p: any) => p.floor === floor,
    );
    await s.saveFloorPlan(db, owner, key(), {
      outletId: w.outletId,
      floor,
      version: plan.version,
      width: 800,
      height: 600,
      outline: floorOutline(shape, { width: 800, height: 600 }),
      objects: [],
    });
    plan = (await s.workspace(db, owner)).floorPlans.find(
      (p: any) => p.floor === floor,
    );
    const stale = plan.version;
    const tableId = (
      await s.saveTable(db, owner, key(), {
        outletId: w.outletId,
        floor,
        label: "Shared " + shape,
        seats: 4,
      })
    ).id;
    let current = await s.workspace(db, owner);
    plan = current.floorPlans.find((p: any) => p.floor === floor);
    const table = current.tables.find((t: any) => t.id === tableId),
      object = plan.objects.find((o: any) => o.tableId === tableId);
    assert.ok(objectInFloor(object, plan.outline));
    assert.equal(plan.version, stale + 1);
    await assert.rejects(
      () =>
        s.saveFloorPlan(db, owner, key(), {
          outletId: w.outletId,
          floor,
          version: stale,
          objects: [],
        }),
      { code: "VERSION_CONFLICT" },
    );
    await s.saveFloorPlan(db, owner, key(), {
      outletId: w.outletId,
      floor,
      version: plan.version,
      objects: [
        ...plan.objects,
        {
          id: "copy",
          kind: "TABLE",
          copyOfTableId: tableId,
          label: "Copy " + shape,
          x: 350,
          y: 220,
          width: 80,
          height: 60,
        },
      ],
    });
    current = await s.workspace(db, owner);
    const copy = current.tables.find((t: any) => t.label === "Copy " + shape);
    assert.ok(copy);
    assert.notEqual(copy.public_key, table.public_key);
    plan = current.floorPlans.find((p: any) => p.floor === floor);
    assert.ok(plan.objects.some((o: any) => o.tableId === copy.id));
    await s.removeTable(db, owner, key(), {
      tableId: copy.id,
      version: copy.version,
    });
    plan = (await s.workspace(db, owner)).floorPlans.find(
      (p: any) => p.floor === floor,
    );
    assert.ok(!plan.objects.some((o: any) => o.tableId === copy.id));
    await s.saveFloorPlan(db, owner, key(), {
      outletId: w.outletId,
      floor,
      version: plan.version,
      objects: [],
      deletedTables: [{ tableId, version: table.version }],
    });
    current = await s.workspace(db, owner);
    assert.ok(!current.tables.some((t: any) => t.id === tableId));
    assert.ok(
      !current.floorPlans.find((p: any) => p.floor === floor).objects.length,
    );
    await assert.rejects(() => s.guestCatalog(db, table.public_key), {
      code: "NOT_FOUND",
    });
  }
});
test("web downward rounding persists through charges and reward quotes while historical nearest rules remain intact", async () => {
  for (const amount of [17200, 17201, 17249, 17250, 17280, 0]) {
    assert.equal(
      amount + roundAdjustment(amount, true, "DOWN"),
      Math.floor(amount / 100) * 100,
    );
    assert.ok(roundAdjustment(amount, true, "DOWN") <= 0);
  }
  const item = await menu("Rounding QA", 17280);
  let o = await order([{ itemId: item, quantity: 1 }]);
  const legacy = await order([{ itemId: item, quantity: 1 }]);
  const historic = await s.changeRoundAdjustments(
    db,
    owner,
    key(),
    legacy.id,
    legacy.rounds[0].id,
    { version: legacy.rounds[0].version, discount: 0, roundToRupee: true },
  );
  assert.equal(Number(historic.rounds[0].payable), 17300);
  o = await s.changeRoundAdjustments(db, owner, key(), o.id, o.rounds[0].id, {
    version: o.rounds[0].version,
    discount: 0,
    roundToRupee: true,
    roundingMode: "DOWN",
  });
  assert.equal(Number(o.rounds[0].payable), 17200);
  assert.equal(Number(o.rounds[0].round_off), -80);
  o = await s.changeRoundCharges(db, owner, key(), o.id, o.rounds[0].id, {
    version: o.rounds[0].version,
    charges: [{ name: "Packing", amount: 70 }],
  });
  assert.equal(Number(o.rounds[0].payable), 17300);
  assert.equal(Number(o.rounds[0].round_off), -50);
  await pay(o.id);
  const bill = await settle(o.id);
  assert.equal(Number((await detail(o.id)).totals.payable), 17300);
  assert.ok(bill);
  assert.equal(Number((await detail(legacy.id)).rounds[0].payable), 17300);
});
test("new stock, KOT and costing operations retain the immutable audit chain", async () => {
  assert.equal((await s.verifyAudit(db, owner)).valid, true);
});
