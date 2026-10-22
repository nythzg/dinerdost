import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createEmbeddedDatabase,
  createPostgresDatabase,
  type Database,
} from "@dinerdost/database";
import { type Actor, businessDate } from "@dinerdost/core";
import * as s from "@dinerdost/services";
let db: Database, owner: Actor, other: Actor, w: any;
const key = () => randomUUID();
before(async () => {
  db = process.env.TEST_DATABASE_URL
    ? createPostgresDatabase(process.env.TEST_DATABASE_URL)
    : await createEmbeddedDatabase();
  await db.migrate();
  await db.migrate();
  for (const [index, email] of [
    "review-owner@example.test",
    "review-other@example.test",
  ].entries()) {
    const a = await s.signup(
      db,
      {
        name: "Review QA",
        email,
        password: "review-feedback-password",
        restaurant: "Review QA " + index,
        outlet: "Main",
        qrEnabled: true,
        demo: true,
      },
      "review-" + index,
    );
    const actor = await s.authenticate(db, a.token);
    if (index === 0) owner = actor;
    else other = actor;
  }
  w = await s.workspace(db, owner);
});
after(async () => {
  await db?.close();
});
async function item(id: string) {
  return (await s.workspace(db, owner)).ingredients.find(
    (i: any) => i.id === id,
  );
}
async function ingredient(
  name: string,
  category: "GENERAL" | "LIQUOR" = "GENERAL",
) {
  return (
    await s.addIngredient(db, owner, key(), {
      outletId: w.outletId,
      name,
      unit: category === "LIQUOR" ? "L" : "kg",
      category,
      purchaseRate: 1250,
    })
  ).id;
}
async function receive(id: string, quantity = 3000, cost = 1000) {
  return s.receiveStock(
    db,
    owner,
    key(),
    {
      ingredientId: id,
      quantityMilli: quantity,
      unitCost: cost,
      batchNumber: key(),
      reference: "Review QA receipt",
      expiresAt: new Date(Date.now() + 72 * 3600000).toISOString(),
    },
    true,
  );
}
async function dish(stockId: string, name: string) {
  const m = await s.saveMenu(db, owner, key(), {
    outletId: w.outletId,
    name,
    category: "Food",
    price: 20000,
    taxBps: 0,
    station: "Main kitchen",
    recipe: [{ id: stockId, quantityMilli: 1000 }],
  });
  return m.id;
}
async function order(id: string) {
  const o = await s.createRound(db, owner, key(), {
    outletId: w.outletId,
    type: "TAKEAWAY",
    customer: { name: "Review guest", phone: "9123456781" },
    items: [{ itemId: id, quantity: 1 }],
  });
  return s.decideRound(db, owner, key(), o.id, o.rounds[0].id, {
    version: o.rounds[0].version,
    decision: "ACCEPT",
  });
}
async function detail(id: string) {
  return db.transaction(owner.restroId, (tx) => s.orderDetail(tx, owner, id));
}
async function pay(id: string) {
  let o = await detail(id);
  await s.reviewRewards(db, owner, key(), id, o.rounds[0].id);
  o = await detail(id);
  await s.recordPayment(db, owner, key(), id, o.rounds[0].id, {
    version: o.rounds[0].version,
    method: "CASH",
    amount: Number(o.rounds[0].payable),
  });
  return detail(id);
}
async function settle(o: any) {
  for (const t of (await s.workspace(db, owner)).tickets.filter(
    (t: any) => t.order_id === o.id,
  )) {
    await s.kitchenDecision(db, owner, key(), t.id, { state: "PREPARING" });
    await s.kitchenDecision(db, owner, key(), t.id, { state: "READY" });
  }
  await s.serveRound(db, owner, key(), o.id, o.rounds[0].id);
  await s.generateBill(db, owner, key(), o.id, { final: true });
}
async function valuation(id: string, value: number) {
  const i = await item(id);
  return {
    ingredientId: id,
    version: i.version,
    expectedOnHand: Number(i.on_hand),
    expectedValue: Number(i.value),
    value,
    reason: "Correct current inventory value",
  };
}

test("deleted table labels can be recreated or copied without restoring archived identity, QR access or duplicate active labels", async () => {
  const input = {
    outletId: w.outletId,
    label: "T13",
    seats: 4,
    floor: "Main floor",
  };
  const oldId = (await s.saveTable(db, owner, key(), input)).id;
  let t = (await s.workspace(db, owner)).tables.find(
    (t: any) => t.id === oldId,
  );
  const visit = await s.connectGuest(
    db,
    t.public_key,
    "review-device",
    "review-ip",
  );
  const session = await s.openSession(db, owner, key(), {
    tableId: oldId,
    guests: 1,
  });
  await s.closeSession(db, owner, key(), session.id, {
    reason: "Synthetic session closed",
  });
  await s.removeTable(db, owner, key(), { tableId: oldId, version: t.version });
  const request = key(),
    fresh = await s.saveTable(db, owner, request, input);
  assert.deepEqual(await s.saveTable(db, owner, request, input), fresh);
  let current = await s.workspace(db, owner),
    active = current.tables.find((x: any) => x.id === fresh.id);
  assert.notEqual(active.id, t.id);
  assert.notEqual(active.public_key, t.public_key);
  await assert.rejects(() => s.saveTable(db, owner, key(), input));
  assert.equal(current.tables.filter((t: any) => t.label === "T13").length, 1);
  await assert.rejects(
    () => s.guestCatalog(db, t.public_key, visit.token, "review-device"),
    { code: "NOT_FOUND" },
  );
  assert.equal(
    (await db.query("SELECT id FROM table_sessions WHERE table_id=$1", [oldId]))
      .rows.length,
    1,
  );
  await s.removeTable(db, owner, key(), {
    tableId: active.id,
    version: active.version,
  });
  const plan = current.floorPlans.find((p: any) => p.floor === "Main floor");
  await s.saveFloorPlan(db, owner, key(), {
    outletId: w.outletId,
    floor: "Main floor",
    version: plan?.version ?? 0,
    objects: [
      {
        id: "reused-copy",
        kind: "TABLE",
        copyOfTableId: w.tables[0].id,
        label: "T13",
        x: 100,
        y: 100,
        width: 120,
        height: 90,
      },
    ],
  });
  current = await s.workspace(db, owner);
  assert.equal(current.tables.filter((t: any) => t.label === "T13").length, 1);
  assert.notEqual(
    current.tables.find((t: any) => t.label === "T13").id,
    fresh.id,
  );
  assert.equal(
    (
      await db.query(
        "SELECT id FROM dining_tables WHERE outlet_id=$1 AND label='T13'",
        [w.outletId],
      )
    ).rows.length,
    3,
  );
});

test("current-stock valuation changes only remaining balances and future FIFO costs, preserving receipt rates and issued sales", async () => {
  const stock = await ingredient("Value QA"),
    a = await receive(stock, 3000, 1000),
    b = await receive(stock, 1000, 2000),
    menu = await dish(stock, "Valued dish");
  const old = await order(menu);
  await pay(old.id);
  await settle(old);
  const oldCogs = (await detail(old.id)).rounds[0].cogs,
    invoice = (
      await db.query(
        "SELECT id,md5(snapshot::text) AS digest FROM invoices WHERE order_id=$1",
        [old.id],
      )
    ).rows;
  const receipts = (
    await db.query(
      "SELECT id,cost FROM stock_movements WHERE ingredient_id=$1 AND kind='RECEIPT' ORDER BY id",
      [stock],
    )
  ).rows;
  const input = await valuation(stock, 10001),
    request = key();
  assert.equal(input.expectedValue, 4000);
  await s.changeStockValue(db, owner, request, input);
  await s.changeStockValue(db, owner, request, input);
  assert.equal(Number((await item(stock)).value), 10001);
  assert.equal(Number((await item(stock)).purchase_rate), 1250);
  const batches = (
    await db.query(
      "SELECT id,unit_cost,remaining_value,on_hand FROM stock_batches WHERE ingredient_id=$1 ORDER BY received_at,id",
      [stock],
    )
  ).rows;
  assert.equal(Number(batches[0].remaining_value), 5001);
  assert.equal(Number(batches[1].remaining_value), 5000);
  assert.equal(Number(batches[0].unit_cost), 1000);
  assert.equal(Number(batches[1].unit_cost), 2000);
  assert.deepEqual(
    (
      await db.query(
        "SELECT id,cost FROM stock_movements WHERE ingredient_id=$1 AND kind='RECEIPT' ORDER BY id",
        [stock],
      )
    ).rows,
    receipts,
  );
  assert.deepEqual(
    (
      await db.query(
        "SELECT id,md5(snapshot::text) AS digest FROM invoices WHERE order_id=$1",
        [old.id],
      )
    ).rows,
    invoice,
  );
  assert.equal((await detail(old.id)).rounds[0].cogs, oldCogs);
  const next = await order(menu);
  await pay(next.id);
  assert.equal(Number((await detail(next.id)).rounds[0].cogs), 2501);
  assert.equal(
    Number(
      (
        await db.query(
          "SELECT remaining_value FROM stock_batches WHERE id=$1",
          [a.id],
        )
      ).rows[0].remaining_value,
    ),
    2500,
  );
  await s.wasteStock(db, owner, key(), {
    batchId: a.id,
    quantityMilli: 1000,
    reason: "Valued remaining waste",
  });
  await s.wasteStock(db, owner, key(), {
    batchId: b.id,
    quantityMilli: 1000,
    reason: "Valued remaining waste",
  });
  assert.equal(Number((await item(stock)).value), 0);
  const waste = await s.wasteReport(db, owner, {
    outletId: w.outletId,
    date: businessDate(),
    search: "Value QA",
  });
  assert.equal(
    waste.items.reduce((n, r) => n + Number(r.cost), 0) + 2501,
    10001,
  );
  const adjustments = (
    await db.query(
      "SELECT * FROM stock_value_adjustments WHERE ingredient_id=$1",
      [stock],
    )
  ).rows;
  assert.equal(adjustments.length, 1);
  assert.equal(Number(adjustments[0].value_before), 4000);
  assert.equal(Number(adjustments[0].value_after), 10001);
  await assert.rejects(() =>
    db.query(
      "UPDATE stock_value_adjustments SET value_after=1 WHERE ingredient_id=$1",
      [stock],
    ),
  );
});

test("valuation is atomic and refuses reserved stock, stale quantities/values and concurrent edits", async () => {
  const stock = await ingredient("Guarded value"),
    batch = await receive(stock),
    menu = await dish(stock, "Guarded dish"),
    input = await valuation(stock, 30001);
  const o = await order(menu);
  await assert.rejects(() => s.changeStockValue(db, owner, key(), input), {
    code: "STOCK_RESERVED",
  });
  assert.equal(
    (
      await db.query(
        "SELECT id FROM stock_value_adjustments WHERE ingredient_id=$1",
        [stock],
      )
    ).rows.length,
    0,
  );
  await pay(o.id);
  await assert.rejects(() => s.changeStockValue(db, owner, key(), input), {
    code: "STOCK_CHANGED",
  });
  const fresh = await valuation(stock, 20101);
  const results = await Promise.allSettled([
    s.changeStockValue(db, owner, key(), fresh),
    s.changeStockValue(db, owner, key(), { ...fresh, value: 20102 }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  assert.equal(
    (
      await db.query(
        "SELECT id FROM stock_value_adjustments WHERE ingredient_id=$1",
        [stock],
      )
    ).rows.length,
    1,
  );
  const stale = await valuation(stock, 9000);
  await receive(stock, 1000, 2000);
  await assert.rejects(() => s.changeStockValue(db, owner, key(), stale), {
    code: "STOCK_CHANGED",
  });
  assert.equal(
    Number(
      (
        await db.query("SELECT unit_cost FROM stock_batches WHERE id=$1", [
          batch.id,
        ])
      ).rows[0].unit_cost,
    ),
    1000,
  );
});

test("inventory deletion guards balances/recipes, archives only empty items and keeps recorded history and reports", async () => {
  const stock = await ingredient("Archive value"),
    batch = await receive(stock, 1000, 1000),
    menu = await dish(stock, "Archive dish");
  let i = await item(stock);
  await assert.rejects(
    () =>
      s.archiveIngredient(db, owner, key(), {
        ingredientId: stock,
        version: i.version,
      }),
    { code: "STOCK_IN_USE" },
  );
  const o = await order(menu);
  await pay(o.id);
  await assert.rejects(
    () =>
      s.archiveIngredient(db, owner, key(), {
        ingredientId: stock,
        version: i.version,
      }),
    { code: "RECIPE_IN_USE" },
  );
  await s.saveRecipe(db, owner, key(), { itemId: menu, ingredients: [] });
  const input = { ingredientId: stock, version: i.version },
    request = key();
  await s.archiveIngredient(db, owner, request, input);
  await s.archiveIngredient(db, owner, request, input);
  assert.equal(await item(stock), undefined);
  assert.ok(
    (await db.query("SELECT retired_at FROM ingredients WHERE id=$1", [stock]))
      .rows[0].retired_at,
  );
  assert.equal(
    (
      await db.query("SELECT id FROM stock_movements WHERE ingredient_id=$1", [
        stock,
      ])
    ).rows.length,
    2,
  );
  assert.equal(
    Number(
      (
        await db.query("SELECT unit_cost FROM stock_batches WHERE id=$1", [
          batch.id,
        ])
      ).rows[0].unit_cost,
    ),
    1000,
  );
  assert.ok(
    !(
      await s.stockAlerts(db, owner, { outletId: w.outletId })
    ).availability.some((r) => r.id === stock),
  );
  assert.ok(
    (await s.stockUsageReport(db, owner, { outletId: w.outletId })).items.some(
      (r) => r.id === stock,
    ),
  );
  await assert.rejects(() => receive(stock), { code: "NOT_FOUND" });
  await assert.rejects(
    () =>
      s.updateIngredient(db, owner, key(), {
        id: stock,
        version: i.version,
        name: "Do not restore",
        unit: "kg",
        reorderMilli: 0,
      }),
    { code: "NOT_FOUND" },
  );
  await assert.rejects(
    () =>
      s.saveRecipe(db, owner, key(), {
        itemId: menu,
        ingredients: [{ id: stock, quantityMilli: 1 }],
      }),
    { code: "NOT_FOUND" },
  );
});

test("valuation and deletion preserve inventory role, outlet, stream, native-application and tenant isolation", async () => {
  const stock = await ingredient("Scoped stock");
  await receive(stock);
  const input = await valuation(stock, 1);
  for (const role of ["CASHIER", "WAITER"] as const)
    await assert.rejects(
      () => s.changeStockValue(db, { ...owner, role }, key(), input),
      { code: "FORBIDDEN" },
    );
  await assert.rejects(
    () => s.changeStockValue(db, { ...owner, role: "BARTENDER" }, key(), input),
    { code: "STREAM_FORBIDDEN" },
  );
  await assert.rejects(
    () =>
      s.changeStockValue(
        db,
        { ...owner, role: "MANAGER", outletIds: [] },
        key(),
        input,
      ),
    { code: "OUTLET_FORBIDDEN" },
  );
  await assert.rejects(() => s.changeStockValue(db, other, key(), input), {
    code: "NOT_FOUND",
  });
  await assert.rejects(
    () =>
      s.archiveIngredient(db, other, key(), {
        ingredientId: stock,
        version: input.version,
      }),
    { code: "NOT_FOUND" },
  );
  await assert.rejects(
    () =>
      s.requireApplicationCommand(
        db,
        { ...owner, application: "POS" },
        { action: "stockValue" },
      ),
    { code: "APPLICATION_FORBIDDEN" },
  );
  const bar = await ingredient("Scoped spirit", "LIQUOR");
  await receive(bar);
  await s.changeStockValue(
    db,
    { ...owner, role: "BARTENDER" },
    key(),
    await valuation(bar, 12345),
  );
  assert.equal(Number((await item(bar)).value), 12345);
});

test("large proportional remaining costs use exact arithmetic and the new audit records reconcile", async () => {
  assert.equal(
    s.consumedStockValue(
      { remaining_value: 1000000000000, on_hand: 1000000000 },
      999999999,
    ),
    999999999000,
  );
  assert.equal(
    s.consumedStockValue({ remaining_value: 1, on_hand: 3000 }, 1000),
    0,
  );
  assert.equal((await s.verifyAudit(db, owner)).valid, true);
  assert.equal(
    await db.transaction(
      other.restroId,
      async (tx) =>
        (await tx.query("SELECT id FROM stock_value_adjustments")).rows.length,
    ),
    0,
  );
});

async function qrMode(mode: "ORDER_ONLY" | "PAYMENT") {
  const outlet = (await s.workspace(db, owner)).outlets.find(
    (o: any) => o.id === w.outletId,
  )!;
  return s.saveOutlet(db, owner, key(), {
    id: outlet.id,
    version: outlet.version,
    name: outlet.name,
    code: outlet.code,
    address: outlet.address,
    gstin: outlet.gstin,
    qrEnabled: true,
    qrPaymentMode: mode,
    paymentPolicy: outlet.payment_policy,
    taxBps: Number(outlet.tax_bps),
    earnBps: Number(outlet.earn_bps),
  });
}
async function qrOrder(index: number, mode: "ORDER_ONLY" | "PAYMENT") {
  await qrMode(mode);
  const table = w.tables[index],
    device = key();
  await s.openSession(db, owner, key(), { tableId: table.id, guests: 1 });
  const visit = await s.connectGuest(db, table.public_key, device, key());
  const o = await s.guestSubmit(
    db,
    table.public_key,
    visit.token,
    device,
    key(),
    {
      name: "QR Flow QA",
      phone: "9123456782",
      items: [{ itemId: w.menu[0].id, quantity: 1 }],
    },
    true,
  );
  return detail(o.id);
}

test("web staff submissions send once to kitchen without credit approval or fake payment; native and QR staff additions retain scope", async () => {
  const input = {
      outletId: w.outletId,
      type: "TAKEAWAY",
      customer: { name: "Flow guest", phone: "9123456783" },
      items: [{ itemId: w.menu[0].id, quantity: 1 }],
    },
    request = key();
  const first = await s.createRound(db, owner, request, input, true),
    again = await s.createRound(db, owner, request, input, true);
  assert.equal(first.id, again.id);
  assert.equal(first.rounds[0].payment_gate, "STAFF");
  assert.equal(first.rounds[0].status, "ACCEPTED");
  assert.equal(first.rounds[0].kot_status, "RELEASED");
  assert.equal(first.rounds[0].postpaid_authorized, false);
  assert.equal(Number(first.rounds[0].paid), 0);
  assert.equal(first.rounds[0].payments.length, 0);
  assert.equal(
    (await s.workspace(db, owner)).tickets.filter(
      (t: any) => t.round_id === first.rounds[0].id,
    ).length,
    1,
  );
  await assert.rejects(
    () =>
      s.authorizePostpaid(
        db,
        owner,
        key(),
        first.id,
        first.rounds[0].id,
        { version: first.rounds[0].version },
        true,
      ),
    { code: "POSTPAID_NOT_ALLOWED" },
  );
  const native = await s.createRound(db, owner, key(), input);
  assert.equal(native.rounds[0].status, "PENDING");
  assert.equal(native.rounds[0].kot_status, "HELD");
  assert.equal(native.rounds[0].payment_gate, "LEGACY");
  const qr = await qrOrder(7, "PAYMENT"),
    added = await s.createRound(
      db,
      owner,
      key(),
      {
        outletId: w.outletId,
        sessionId: qr.session_id,
        orderId: qr.id,
        version: qr.version,
        items: input.items,
      },
      true,
    );
  assert.equal(added.rounds[0].status, "PENDING");
  assert.equal(added.rounds[0].kot_status, "HELD");
  assert.equal(added.rounds[1].status, "ACCEPTED");
  assert.equal(added.rounds[1].kot_status, "RELEASED");
  assert.equal(added.rounds[1].payment_gate, "STAFF");
  assert.equal(Number(added.rounds[1].paid), 0);
  await assert.rejects(
    () =>
      s.editRound(
        db,
        owner,
        key(),
        first.id,
        first.rounds[0].id,
        { version: first.rounds[0].version, submit: true, items: input.items },
        true,
      ),
    { code: "ROUND_LOCKED" },
  );
});

test("customer QR modes snapshot new rounds, retain acceptance and limit postpaid to manager-approved payment rounds", async () => {
  const only = await qrOrder(8, "ORDER_ONLY");
  assert.equal(only.rounds[0].status, "PENDING");
  assert.equal(only.rounds[0].payment_gate, "QR_ORDER_ONLY");
  assert.equal(only.rounds[0].kot_status, "HELD");
  const accepted = await s.decideRound(
    db,
    owner,
    key(),
    only.id,
    only.rounds[0].id,
    { version: only.rounds[0].version, decision: "ACCEPT" },
  );
  assert.equal(accepted.rounds[0].kot_status, "RELEASED");
  assert.equal(Number(accepted.rounds[0].paid), 0);
  assert.equal(accepted.rounds[0].postpaid_authorized, false);
  await assert.rejects(
    () =>
      s.authorizePostpaid(
        db,
        owner,
        key(),
        accepted.id,
        accepted.rounds[0].id,
        { version: accepted.rounds[0].version },
        true,
      ),
    { code: "POSTPAID_NOT_ALLOWED" },
  );
  const payment = await qrOrder(9, "PAYMENT"),
    held = await s.decideRound(
      db,
      owner,
      key(),
      payment.id,
      payment.rounds[0].id,
      { version: payment.rounds[0].version, decision: "ACCEPT" },
    );
  assert.equal(held.rounds[0].kot_status, "HELD");
  assert.equal(held.rounds[0].payment_gate, "QR_PAYMENT");
  await assert.rejects(
    () =>
      s.authorizePostpaid(
        db,
        { ...owner, role: "CASHIER" },
        key(),
        held.id,
        held.rounds[0].id,
        { version: held.rounds[0].version },
        true,
      ),
    { code: "FORBIDDEN" },
  );
  await qrMode("ORDER_ONLY");
  await assert.rejects(
    () =>
      s.authorizePostpaid(
        db,
        owner,
        key(),
        held.id,
        held.rounds[0].id,
        { version: held.rounds[0].version },
        true,
      ),
    { code: "POSTPAID_NOT_ALLOWED" },
  );
  assert.equal((await detail(held.id)).rounds[0].kot_status, "HELD");
  assert.equal((await detail(held.id)).rounds[0].payment_gate, "QR_PAYMENT");
  await qrMode("PAYMENT");
  const released = await s.authorizePostpaid(
    db,
    owner,
    key(),
    held.id,
    held.rounds[0].id,
    { version: held.rounds[0].version },
    true,
  );
  assert.equal(released.rounds[0].kot_status, "RELEASED");
  assert.equal(released.rounds[0].postpaid_authorized, true);
  assert.equal(Number(released.rounds[0].paid), 0);
  assert.equal(
    (await detail(accepted.id)).rounds[0].payment_gate,
    "QR_ORDER_ONLY",
  );
});

test("deferred web kitchen release preserves unpaid bill adjustments and costs while payment and owner guards remain enforced", async () => {
  const stock = await ingredient("Deferred staff stock"),
    batch = await receive(stock, 1000, 1000),
    menu = await dish(stock, "Deferred kitchen dish");
  let o = await s.createRound(
      db,
      owner,
      key(),
      {
        outletId: w.outletId,
        type: "TAKEAWAY",
        customer: { name: "Flow guest", phone: "9123456783" },
        items: [{ itemId: menu, quantity: 1 }],
      },
      true,
    ),
    r = o.rounds[0];
  assert.equal(r.kot_status, "RELEASED");
  assert.equal(Number(r.cogs), 1000);
  assert.equal(Number((await item(stock)).on_hand), 0);
  o = await s.changeRoundAdjustments(db, owner, key(), o.id, r.id, {
    version: r.version,
    discount: 101,
    roundToRupee: true,
    roundingMode: "DOWN",
  });
  r = o.rounds[0];
  await assert.rejects(
    () =>
      s.changeRoundCharges(
        db,
        { ...owner, role: "CASHIER" },
        key(),
        o.id,
        r.id,
        { version: r.version, charges: [{ name: "Packaging", amount: 100 }] },
      ),
    { code: "FORBIDDEN" },
  );
  o = await s.changeRoundCharges(db, owner, key(), o.id, r.id, {
    version: r.version,
    charges: [{ name: "Packaging", amount: 100 }],
  });
  r = o.rounds[0];
  o = await s.changeOrderTax(db, owner, key(), o.id, {
    version: o.version,
    taxes: [
      { name: "CGST", rateBps: 250 },
      { name: "SGST", rateBps: 250 },
    ],
    reason: "Deferred unpaid bill tax",
  });
  r = o.rounds[0];
  assert.equal(Number(r.cogs), 1000);
  assert.equal(Number(r.paid), 0);
  assert.equal(r.kot_status, "RELEASED");
  const ticket = (await s.workspace(db, owner)).tickets.find(
    (t: any) => t.round_id === r.id,
  );
  await s.kitchenDecision(db, owner, key(), ticket.id, { state: "PREPARING" });
  await s.kitchenDecision(db, owner, key(), ticket.id, { state: "READY" });
  await s.serveRound(db, owner, key(), o.id, r.id);
  o = await detail(o.id);
  await assert.rejects(
    () => s.generateBill(db, owner, key(), o.id, { final: true }),
    { code: "SETTLEMENT_NOT_READY" },
  );
  o = await pay(o.id);
  assert.equal(Number(o.rounds[0].paid), Number(o.rounds[0].payable));
  assert.equal(Number(o.rounds[0].cogs), 1000);
  await assert.rejects(
    () =>
      s.changeRoundAdjustments(db, owner, key(), o.id, r.id, {
        version: o.rounds[0].version,
        discount: 0,
        roundToRupee: false,
      }),
    { code: "ADJUSTMENTS_LOCKED" },
  );
  const ledger = (
    await db.query(
      "SELECT cost FROM stock_movements WHERE batch_id=$1 AND kind='RECIPE_CONSUMPTION'",
      [batch.id],
    )
  ).rows;
  assert.equal(ledger.length, 1);
  assert.equal(Number(ledger[0].cost), 1000);
  const final = await s.generateBill(db, owner, key(), o.id, { final: true });
  assert.ok(final.id);
});

test("zero-total deferred web bills require a current authorized reward quote and cannot reuse an unlocked coupon", async () => {
  const menu = await s.saveMenu(db, owner, key(), {
    outletId: w.outletId,
    name: "Zero quote QA",
    category: "Food",
    price: 100,
    taxBps: 0,
    station: "Main kitchen",
  });
  let o = await s.createRound(
      db,
      owner,
      key(),
      {
        outletId: w.outletId,
        type: "TAKEAWAY",
        customer: { name: "Zero guest", phone: "9123456784" },
        items: [{ itemId: menu.id, quantity: 1 }],
      },
      true,
    ),
    r = o.rounds[0];
  const coupon = key();
  await db.query(
    "INSERT INTO coupons(id,restro_id,outlet_id,code,discount_amount,expires_at) VALUES($1,$2,$3,$4,100,now()+interval '1 day')",
    [coupon, owner.restroId, w.outletId, key()],
  );
  o = (
    await s.applyEntitlement(db, owner, key(), o.id, r.id, {
      version: r.version,
      couponId: coupon,
    })
  ).order;
  r = o.rounds[0];
  assert.equal(Number(r.payable), 0);
  assert.equal(r.kot_status, "RELEASED");
  const ticket = (await s.workspace(db, owner)).tickets.find(
    (t: any) => t.round_id === r.id,
  );
  await s.kitchenDecision(db, owner, key(), ticket.id, { state: "PREPARING" });
  await s.kitchenDecision(db, owner, key(), ticket.id, { state: "READY" });
  await s.serveRound(db, owner, key(), o.id, r.id);
  await assert.rejects(
    () => s.generateBill(db, owner, key(), o.id, { final: true }),
    { code: "SETTLEMENT_NOT_READY" },
  );
  await db.query(
    "UPDATE coupons SET reserved_until=now()-interval '1 second' WHERE id=$1",
    [coupon],
  );
  await assert.rejects(
    () =>
      s.releaseZeroTotal(db, owner, key(), o.id, r.id, { version: r.version }),
    { code: "REWARD_EXPIRED" },
  );
  assert.equal((await detail(o.id)).rounds[0].payment_status, "REQUIRED");
  o = (
    await s.applyEntitlement(db, owner, key(), o.id, r.id, {
      version: r.version,
      couponId: coupon,
    })
  ).order;
  r = o.rounds[0];
  o = await s.releaseZeroTotal(db, owner, key(), o.id, r.id, {
    version: r.version,
  });
  r = o.rounds[0];
  assert.equal(r.payment_status, "PAID");
  assert.equal(r.payments.length, 0);
  await assert.rejects(
    () =>
      s.changeRoundAdjustments(db, owner, key(), o.id, r.id, {
        version: r.version,
        discount: 0,
        roundToRupee: false,
      }),
    { code: "ADJUSTMENTS_LOCKED" },
  );
  await assert.rejects(
    () =>
      s.applyEntitlement(db, owner, key(), o.id, r.id, {
        version: r.version,
        couponId: coupon,
      }),
    { code: "QUOTE_LOCKED" },
  );
  await assert.rejects(
    () =>
      s.changeRoundCharges(db, owner, key(), o.id, r.id, {
        version: r.version,
        charges: [],
      }),
    { code: "CHARGES_LOCKED" },
  );
  await assert.rejects(
    () =>
      s.changeOrderTax(db, owner, key(), o.id, {
        version: o.version,
        taxBps: 0,
        reason: "Cannot edit authorized zero bill",
      }),
    { code: "TAX_LOCKED" },
  );
  const invoice = await s.generateBill(db, owner, key(), o.id, { final: true });
  assert.ok(invoice.id);
  assert.equal(
    (await db.query("SELECT state FROM coupons WHERE id=$1", [coupon])).rows[0]
      .state,
    "REDEEMED",
  );
  assert.equal((await detail(o.id)).totals.paid, 0);
});
