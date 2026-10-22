import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createEmbeddedDatabase,
  createPostgresDatabase,
  type Database,
} from "@dinerdost/database";
import {
  type Actor,
  quote,
  quantityMilli,
  normalizePhone,
  businessDate,
  businessDateTime,
  businessLocalToISO,
} from "@dinerdost/core";
import {
  signup,
  authenticate,
  openSession,
  createRound,
  decideRound,
  identityGate,
  initiatePayment,
  verifyPayment,
  kitchenDecision,
  serveRound,
  generateBill,
  closeSession,
  getOrder,
  workspace,
  login,
  addEmployee,
  employeeAccess,
  saveOutlet,
  addIngredient,
  receiveStock,
  saveRecipe,
  applyEntitlement,
  reviewRewards,
  verifyAudit,
  pairingCode,
  pairGuest,
  guestCatalog,
  guestSubmit,
  guestService,
  voidRound,
  authorizePostpaid,
  releaseZeroTotal,
  connectGuest,
  setQrPolicy,
  setCustomerDeviceBan,
} from "@dinerdost/services";
let db: Database, actor: Actor, outletId: string, menu: any[], tables: any[];
const key = () => randomUUID();
before(async () => {
  db = process.env.TEST_DATABASE_URL
    ? createPostgresDatabase(process.env.TEST_DATABASE_URL)
    : await createEmbeddedDatabase();
  await db.migrate();
  await db.migrate();
  const account = await signup(
    db,
    {
      name: "Test Owner",
      email: "owner@example.test",
      password: "test-password-long-123",
      restaurant: "Test Restaurant",
      outlet: "Main",
      qrEnabled: false,
      demo: true,
      taxBps: 500,
    },
    "test",
  );
  actor = await authenticate(db, account.token);
  outletId = String((await db.query("SELECT id FROM outlets")).rows[0].id);
  menu = (await db.query("SELECT * FROM menu_items")).rows;
  tables = (await db.query("SELECT * FROM dining_tables")).rows;
});
after(async () => {
  await db?.close();
});
test("integer money, fractional units and Indian phone normalization", () => {
  assert.deepEqual(
    quote([{ unit_price: 12345, quantity_milli: 500, tax_bps: 500 }], 100),
    { subtotal: 6173, discount: 100, tax: 304, payable: 6377 },
  );
  assert.equal(quantityMilli("0.125"), 125);
  assert.equal(normalizePhone("98765 43210"), "+919876543210");
  assert.throws(() => quantityMilli("-1"));
  assert.throws(() => normalizePhone("123"));
});
test("tenant policy and role checks isolate records", async () => {
  const other = await signup(
    db,
    {
      name: "Other Owner",
      email: "other@example.test",
      password: "test-password-long-123",
      restaurant: "Other",
      outlet: "Other",
      qrEnabled: false,
    },
    "other",
  );
  await db.transaction(other.actor.restroId, async (tx) => {
    assert.equal((await tx.query("SELECT id FROM menu_items")).rows.length, 0);
    assert.equal((await tx.query("SELECT id FROM restaurants")).rows.length, 1);
    await assert.rejects(() => tx.query("SELECT * FROM users"));
  });
  await assert.rejects(
    () =>
      createRound(db, { ...actor, role: "KITCHEN" }, key(), {
        outletId,
        type: "TAKEAWAY",
        items: [{ itemId: menu[0].id, quantity: 1 }],
      }),
    { code: "FORBIDDEN" },
  );
});
test("full prepaid lifecycle is persisted, idempotent and independently billed", async () => {
  const session = await openSession(db, actor, key(), {
    tableId: tables[0].id,
    guests: 2,
  });
  const request = {
    outletId,
    sessionId: session.id,
    items: [
      { itemId: menu[0].id, quantity: 2 },
      { itemId: menu[4].id, quantity: 1 },
    ],
  };
  const requestKey = key();
  let order = await createRound(db, actor, requestKey, request);
  assert.equal(
    (await createRound(db, actor, requestKey, request)).id,
    order.id,
  );
  await assert.rejects(
    () =>
      createRound(db, actor, requestKey, {
        ...request,
        items: [{ itemId: menu[0].id, quantity: 3 }],
      }),
    { code: "IDEMPOTENCY_CONFLICT" },
  );
  let round = order.rounds[0];
  await assert.rejects(
    () =>
      initiatePayment(db, actor, key(), order.id, round.id, {
        version: round.version,
        method: "CASH",
        amount: Number(round.payable),
      }),
    { code: "IDENTITY_REQUIRED" },
  );
  order = await decideRound(db, actor, key(), order.id, round.id, {
    version: round.version,
    decision: "ACCEPT",
  });
  round = order.rounds[0];
  assert.equal((await db.query("SELECT id FROM kot_tickets")).rows.length, 0);
  const identity = await identityGate(db, actor, key(), order.id, round.id, {
    version: order.version,
    name: "Guest Name",
    phone: "9876543210",
  });
  order = identity.order;
  round = order.rounds[0];
  assert.equal(identity.entitlements.spendablePoints, 0);
  assert.equal(identity.entitlements.estimatedEarn > 0, true);
  const bill = await generateBill(db, actor, key(), order.id, { final: false });
  assert.equal(bill.document_type, "PROVISIONAL_BILL");
  assert.equal((await db.query("SELECT id FROM kot_tickets")).rows.length, 0);
  await assert.rejects(
    () => generateBill(db, actor, key(), order.id, { final: true }),
    { code: "SETTLEMENT_NOT_READY" },
  );
  const payment = await initiatePayment(db, actor, key(), order.id, round.id, {
    version: round.version,
    method: "CASH",
    amount: Number(round.payable),
  });
  order = await verifyPayment(db, actor, key(), payment.paymentId, {
    decision: "VERIFY",
    reason: "Cash counted",
  });
  assert.equal(order.rounds[0].payment_status, "PAID");
  const tickets = (
    await db.query<any>("SELECT * FROM kot_tickets WHERE round_id=$1", [
      round.id,
    ])
  ).rows;
  assert.equal(tickets.length, 2);
  for (const ticket of tickets) {
    await kitchenDecision(db, actor, key(), ticket.id, { state: "PREPARING" });
    await kitchenDecision(db, actor, key(), ticket.id, { state: "READY" });
  }
  order = await serveRound(db, actor, key(), order.id, round.id);
  assert.equal(order.rounds[0].kot_status, "SERVED");
  const final = await generateBill(db, actor, key(), order.id, { final: true });
  assert.equal(final.document_type, "FINAL_TAX_INVOICE");
  assert.equal(
    (await db.query("SELECT status FROM orders WHERE id=$1", [order.id])).rows
      .length,
    1,
  );
  await closeSession(db, actor, key(), session.id, {
    reason: "Guests departed",
  });
  assert.equal(
    (
      await db.query<any>(
        "SELECT points FROM loyalty_ledger WHERE round_id=$1 AND state='EARNED'",
        [round.id],
      )
    ).rows.length,
    1,
  );
});
test("audit and issued invoices resist mutation and excess reprints raise an alert", async () => {
  await assert.rejects(() =>
    db.query("UPDATE audit_events SET reason=$1", ["tampered"]),
  );
  await assert.rejects(() => db.query("DELETE FROM invoices"));
  const order = await createRound(db, actor, key(), {
    outletId,
    type: "TAKEAWAY",
    items: [{ itemId: menu[1].id, quantity: 1 }],
  });
  for (let i = 0; i < 3; i++)
    await generateBill(db, actor, key(), order.id, { final: false });
  assert.equal(
    (
      await db.query(
        "SELECT id FROM audit_events WHERE risk='CRITICAL' AND action='BILL_REPRINTED'",
      )
    ).rows.length,
    1,
  );
});

test("cached command responses cannot bypass a revoked outlet assignment", async () => {
  await addEmployee(db, actor, key(), {
    name: "Cached Access Test",
    email: "cached-manager@example.test",
    password: "test-password-long-123",
    role: "MANAGER",
    outletIds: [outletId],
  });
  const session = await login(
    db,
    {
      email: "cached-manager@example.test",
      password: "test-password-long-123",
    },
    "cached-scope-test",
  );
  const manager = await authenticate(db, session.token);
  const order = await createRound(db, actor, key(), {
    outletId,
    type: "TAKEAWAY",
    items: [{ itemId: menu[0].id, quantity: 1 }],
  });
  const input = {
      version: order.version,
      name: "Restricted Guest",
      phone: "9354678901",
    },
    requestKey = key();
  await identityGate(
    db,
    manager,
    requestKey,
    order.id,
    order.rounds[0].id,
    input,
  );
  await assert.rejects(
    () =>
      identityGate(
        db,
        { ...manager, outletIds: [] },
        requestKey,
        order.id,
        order.rounds[0].id,
        input,
      ),
    { code: "IDEMPOTENCY_CONFLICT" },
  );
});
async function acceptedOrder(itemId = menu[1].id, quantity = 1) {
  let order = await createRound(db, actor, key(), {
    outletId,
    type: "TAKEAWAY",
    items: [{ itemId, quantity }],
  });
  return decideRound(db, actor, key(), order.id, order.rounds[0].id, {
    version: order.rounds[0].version,
    decision: "ACCEPT",
  });
}
test("business-day expiry and reservation times use India time across midnight", async () => {
  assert.equal(businessDate("2026-10-16T19:00:00Z"), "2026-10-17");
  assert.equal(businessDateTime("2026-10-16T19:00:00Z"), "2026-10-17T00:30");
  assert.equal(
    businessLocalToISO("2026-10-17T00:30"),
    "2026-10-16T19:00:00.000Z",
  );
  assert.throws(() => businessLocalToISO("2026-02-31T12:00"));
  await db.transaction(actor.restroId, async (tx) => {
    const day = (await tx.query("SELECT current_date::text AS day")).rows[0]
      .day;
    assert.equal(day, businessDate());
  });
});
async function identify(order: any, phone = "9123456789") {
  return identityGate(db, actor, key(), order.id, order.rounds.at(-1).id, {
    version: order.version,
    name: "Test Guest",
    phone,
  });
}
test("proportionate discount allocation never makes a line negative", () => {
  for (let count = 1; count <= 12; count++) {
    const items = Array.from({ length: count }, (_, index) => ({
      unit_price: index + 1,
      quantity_milli: 1000,
      tax_bps: 10000,
    }));
    const subtotal = items.reduce((s, i) => s + i.unit_price, 0);
    for (let discount = 0; discount <= subtotal; discount++) {
      const total = quote(items, discount);
      assert.equal(total.tax, subtotal - discount);
      assert.equal(total.payable, 2 * (subtotal - discount));
    }
  }
});
test("Add More preserves accepted rounds and rejection cannot close the earlier accepted round", async () => {
  let order = await acceptedOrder();
  const original = order.rounds[0];
  await assert.rejects(
    () =>
      import("@dinerdost/services").then((s) =>
        s.editRound(db, actor, key(), order.id, original.id, {
          version: original.version,
          items: [{ itemId: menu[0].id, quantity: 4 }],
        }),
      ),
    { code: "ROUND_LOCKED" },
  );
  order = await createRound(db, actor, key(), {
    outletId,
    orderId: order.id,
    version: order.version,
    type: "TAKEAWAY",
    items: [{ itemId: menu[3].id, quantity: 1 }],
  });
  const added = order.rounds[1];
  order = await decideRound(db, actor, key(), order.id, added.id, {
    version: added.version,
    decision: "REJECT",
    reason: "Guest changed their mind",
  });
  assert.equal(order.status, "ACCEPTED");
  assert.equal(order.rounds[0].payable, original.payable);
  assert.equal(order.rounds[0].status, "ACCEPTED");
});
test("partial and uncertain payments cannot release the kitchen early", async () => {
  let { order } = await identify(await acceptedOrder());
  const round = order.rounds[0],
    amount = Number(round.payable),
    part = Math.floor(amount / 2);
  const first = await initiatePayment(db, actor, key(), order.id, round.id, {
    version: round.version,
    method: "CASH",
    amount: part,
  });
  order = await verifyPayment(db, actor, key(), first.paymentId, {
    decision: "VERIFY",
    reason: "Partial cash counted",
  });
  assert.equal(order.rounds[0].kot_status, "HELD");
  const second = await initiatePayment(db, actor, key(), order.id, round.id, {
    version: round.version,
    method: "MANUAL_UPI",
    amount: amount - part,
  });
  await verifyPayment(db, actor, key(), second.paymentId, {
    decision: "UNKNOWN",
    reason: "Bank confirmation unavailable",
  });
  await assert.rejects(
    () =>
      initiatePayment(db, actor, key(), order.id, round.id, {
        version: round.version,
        method: "CASH",
        amount: amount - part,
      }),
    { code: "PAYMENT_ALREADY_PENDING" },
  );
  order = await verifyPayment(db, actor, key(), second.paymentId, {
    decision: "VERIFY",
    reason: "Merchant account checked",
    reference: "TEST-UTR-" + key(),
  });
  assert.equal(order.rounds[0].kot_status, "RELEASED");
  assert.equal(Number(order.rounds[0].paid), amount);
  await assert.rejects(
    () =>
      verifyPayment(db, actor, key(), second.paymentId, {
        decision: "VERIFY",
        reason: "Repeated decision",
        reference: "OTHER-UTR",
      }),
    { code: "PAYMENT_LOCKED" },
  );
});
test("FIFO stock reservations are atomic and overselling rolls back state and audit", async () => {
  const ingredient = await addIngredient(db, actor, key(), {
    outletId,
    name: "Limited flour",
    unit: "kg",
    reorderMilli: 500,
  });
  await receiveStock(db, actor, key(), {
    ingredientId: ingredient.id,
    batchNumber: "FIFO-A",
    quantityMilli: 1000,
    unitCost: 10000,
    reference: "TEST-GRN-A",
  });
  await saveRecipe(db, actor, key(), {
    itemId: menu[3].id,
    ingredients: [{ id: ingredient.id, quantityMilli: 750 }],
  });
  const orders = await Promise.all(
    [1, 2].map(() =>
      createRound(db, actor, key(), {
        outletId,
        type: "TAKEAWAY",
        items: [{ itemId: menu[3].id, quantity: 1 }],
      }),
    ),
  );
  const results = await Promise.allSettled(
    orders.map((order) =>
      decideRound(db, actor, key(), order.id, order.rounds[0].id, {
        version: order.rounds[0].version,
        decision: "ACCEPT",
      }),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  const batch = (
    await db.query<any>("SELECT * FROM stock_batches WHERE ingredient_id=$1", [
      ingredient.id,
    ])
  ).rows[0];
  assert.equal(Number(batch.reserved), 750);
  assert.equal(Number(batch.on_hand), 1000);
  const successful = results.find(
    (r) => r.status === "fulfilled",
  ) as PromiseFulfilledResult<any>;
  const { order } = await identify(successful.value);
  const payment = await initiatePayment(
    db,
    actor,
    key(),
    order.id,
    order.rounds[0].id,
    {
      version: order.rounds[0].version,
      method: "CASH",
      amount: Number(order.rounds[0].payable),
    },
  );
  await verifyPayment(db, actor, key(), payment.paymentId, {
    decision: "VERIFY",
    reason: "Cash counted",
  });
  const after = (
    await db.query<any>("SELECT * FROM stock_batches WHERE id=$1", [batch.id])
  ).rows[0];
  assert.equal(Number(after.on_hand), 250);
  assert.equal(Number(after.reserved), 0);
  assert.equal(
    (
      await db.query<any>(
        "SELECT cost FROM stock_movements WHERE round_id=$1",
        [order.rounds[0].id],
      )
    ).rows[0].cost.toString(),
    "7500",
  );
});
test("expired coupon reservations cannot be spent after another order claims the token", async () => {
  const first = (await identify(await acceptedOrder())).order;
  const second = (await identify(await acceptedOrder())).order;
  const couponId = key();
  await db.query(
    "INSERT INTO coupons(id,restro_id,outlet_id,code,discount_amount,expires_at) VALUES($1,$2,$3,$4,1000,now()+interval '1 day')",
    [couponId, actor.restroId, outletId, "TEST-" + key()],
  );
  let rewarded = await applyEntitlement(
    db,
    actor,
    key(),
    first.id,
    first.rounds[0].id,
    { version: first.rounds[0].version, couponId },
  );
  await assert.rejects(
    () =>
      applyEntitlement(db, actor, key(), second.id, second.rounds[0].id, {
        version: second.rounds[0].version,
        couponId,
      }),
    { code: "TOKEN_RESERVED" },
  );
  await db.query(
    "UPDATE coupons SET reserved_until=now()-interval '1 minute' WHERE id=$1",
    [couponId],
  );
  await applyEntitlement(db, actor, key(), second.id, second.rounds[0].id, {
    version: second.rounds[0].version,
    couponId,
  });
  await assert.rejects(
    () =>
      initiatePayment(db, actor, key(), first.id, first.rounds[0].id, {
        version: rewarded.order.rounds[0].version,
        method: "CASH",
        amount: Number(rewarded.order.rounds[0].payable),
      }),
    { code: "REWARD_EXPIRED" },
  );
  const before = Number(rewarded.order.rounds[0].payable);
  rewarded = await identityGate(
    db,
    actor,
    key(),
    first.id,
    first.rounds[0].id,
    { version: rewarded.order.version, name: "New Guest", phone: "9234567890" },
  );
  assert.equal(Number(rewarded.order.rounds[0].discount), 0);
  assert.ok(Number(rewarded.order.rounds[0].payable) > before);
});
test("concurrent identical requests create one parent order", async () => {
  const requestKey = key(),
    input = {
      outletId,
      type: "TAKEAWAY",
      items: [{ itemId: menu[0].id, quantity: 1 }],
    };
  const results = await Promise.all([
    createRound(db, actor, requestKey, input),
    createRound(db, actor, requestKey, input),
  ]);
  assert.equal(results[0].id, results[1].id);
  assert.equal(
    (
      await db.query("SELECT id FROM order_rounds WHERE order_id=$1", [
        results[0].id,
      ])
    ).rows.length,
    1,
  );
});
test("staff accounts enforce assigned tables, narrow read models and immediate revocation", async () => {
  const person = await addEmployee(db, actor, key(), {
    name: "Kitchen Test",
    email: "kitchen@example.test",
    password: "test-password-long-123",
    role: "KITCHEN",
    outletIds: [outletId],
  });
  const session = await login(
    db,
    { email: "kitchen@example.test", password: "test-password-long-123" },
    "kitchen-test",
  );
  const kitchen = await authenticate(db, session.token);
  const view = await workspace(db, kitchen, outletId);
  assert.ok(view.tickets);
  assert.equal(view.customers, undefined);
  assert.equal(view.audit, undefined);
  assert.equal(view.orders, undefined);
  assert.equal(view.employees, undefined);
  await assert.rejects(() => getOrder(db, kitchen, key()), {
    code: "FORBIDDEN",
  });
  await employeeAccess(db, actor, key(), person.id, {
    active: false,
    password: "test-password-long-123",
  });
  await assert.rejects(() => authenticate(db, session.token), {
    code: "UNAUTHENTICATED",
  });
});
test("QR off leaves staff ordering available; pairing is single-use, device-bound and revocable", async () => {
  const table = tables[2];
  await assert.rejects(() => guestCatalog(db, table.public_key), {
    code: "QR_DISABLED",
  });
  const outlet = (
    await db.query<any>("SELECT * FROM outlets WHERE id=$1", [outletId])
  ).rows[0];
  await saveOutlet(db, actor, key(), {
    id: outlet.id,
    version: outlet.version,
    name: outlet.name,
    code: outlet.code,
    qrEnabled: true,
    taxBps: outlet.tax_bps,
  });
  const session = await openSession(db, actor, key(), {
    tableId: table.id,
    guests: 2,
  });
  const code = await pairingCode(db, actor, key(), session.id);
  const paired = await pairGuest(
    db,
    table.public_key,
    { code: code.code },
    "test-device-123",
    "test-qr",
  );
  await assert.rejects(
    () =>
      pairGuest(
        db,
        table.public_key,
        { code: code.code },
        "another-device",
        "test-qr",
      ),
    { code: "NOT_FOUND" },
  );
  assert.equal(
    (await guestCatalog(db, table.public_key, paired.token, "test-device-123"))
      .paired,
    true,
  );
  assert.equal(
    (await guestCatalog(db, table.public_key, paired.token, "wrong-device"))
      .paired,
    false,
  );
  await assert.rejects(
    () =>
      guestSubmit(db, table.public_key, paired.token, "wrong-device", key(), {
        name: "QR Guest",
        phone: "9345678901",
        items: [{ itemId: menu[0].id, quantity: 1 }],
      }),
    { code: "NOT_FOUND" },
  );
  const order = await guestSubmit(
    db,
    table.public_key,
    paired.token,
    "test-device-123",
    key(),
    {
      name: "QR Guest",
      phone: "9345678901",
      items: [{ itemId: menu[0].id, quantity: 1 }],
    },
  );
  assert.equal(order.status, "PENDING");
  assert.equal(order.rounds[0].kot_status, "HELD");
  await guestService(
    db,
    table.public_key,
    paired.token,
    "test-device-123",
    key(),
    { kind: "WATER" },
  );
  await assert.rejects(
    () =>
      closeSession(db, actor, key(), session.id, { reason: "Testing close" }),
    { code: "OUTSTANDING_ORDER" },
  );
  const staffOrder = await getOrder(db, actor, order.id);
  await voidRound(db, actor, key(), order.id, staffOrder.rounds[0].id, {
    version: staffOrder.rounds[0].version,
    reason: "QA request completed",
  });
  await closeSession(db, actor, key(), session.id, { reason: "QA guest left" });
  assert.equal(
    (await guestCatalog(db, table.public_key, paired.token, "test-device-123"))
      .paired,
    false,
  );
});
test("code-free QR ordering needs a staff-opened table and isolates devices", async () => {
  const policy = (
    await db.query("SELECT version FROM outlets WHERE id=$1", [outletId])
  ).rows[0];
  await setQrPolicy(db, actor, key(), {
    outletId,
    version: policy.version,
    enabled: true,
    autoActivate: false,
  });
  const table = tables[10];
  const visit = await connectGuest(
    db,
    table.public_key,
    "scan-device-a",
    "scan-ip",
  );
  assert.equal(
    (
      await connectGuest(
        db,
        table.public_key,
        "scan-device-a",
        "scan-ip",
        visit.token,
      )
    ).token,
    visit.token,
  );
  assert.equal(
    (
      await db.query("SELECT id FROM table_sessions WHERE table_id=$1", [
        table.id,
      ])
    ).rows.length,
    0,
  );
  await openSession(db, actor, key(), { tableId: table.id, guests: 1 });
  assert.equal(
    (await guestCatalog(db, table.public_key, visit.token, "scan-device-a"))
      .connected,
    true,
  );
  const payload = {
    name: "Scan Guest",
    phone: "9234567892",
    items: [{ itemId: menu[0].id, quantity: 1 }],
  };
  const requestKey = key();
  const order = await guestSubmit(
    db,
    table.public_key,
    visit.token,
    "scan-device-a",
    requestKey,
    payload,
  );
  assert.equal(order.status, "PENDING");
  assert.equal(order.rounds[0].kot_status, "HELD");
  assert.equal(
    (
      await guestSubmit(
        db,
        table.public_key,
        visit.token,
        "scan-device-a",
        requestKey,
        payload,
      )
    ).id,
    order.id,
  );
  assert.equal(
    (
      await db.query("SELECT id FROM table_sessions WHERE table_id=$1", [
        table.id,
      ])
    ).rows.length,
    1,
  );
  const other = await connectGuest(
    db,
    table.public_key,
    "scan-device-b",
    "scan-ip",
  );
  assert.equal(
    (await guestCatalog(db, table.public_key, other.token, "scan-device-b"))
      .order,
    null,
  );
  assert.equal(
    (
      await guestCatalog(
        db,
        tables[11].public_key,
        visit.token,
        "scan-device-a",
      )
    ).connected,
    false,
  );
  await assert.rejects(
    () =>
      guestSubmit(
        db,
        table.public_key,
        visit.token,
        "stolen-device",
        key(),
        payload,
      ),
    { code: "NOT_FOUND" },
  );
  const otherOrder = await guestSubmit(
    db,
    table.public_key,
    other.token,
    "scan-device-b",
    key(),
    { ...payload, name: "Other Guest", phone: "9234567893" },
  );
  assert.notEqual(otherOrder.id, order.id);
  assert.equal(
    (
      await db.query("SELECT id FROM table_sessions WHERE table_id=$1", [
        table.id,
      ])
    ).rows.length,
    1,
  );
  const unbound = await connectGuest(
    db,
    tables[11].public_key,
    "unbound-device",
    "scan-ip",
  );
  const outlet = (
    await db.query<any>("SELECT * FROM outlets WHERE id=$1", [outletId])
  ).rows[0];
  await assert.rejects(
    () =>
      setQrPolicy(db, { ...actor, role: "WAITER" }, key(), {
        outletId,
        version: outlet.version,
        enabled: false,
      }),
    { code: "FORBIDDEN" },
  );
  await setQrPolicy(db, actor, key(), {
    outletId,
    version: outlet.version,
    enabled: false,
  });
  await assert.rejects(
    () => connectGuest(db, table.public_key, "another", "scan-ip"),
    { code: "QR_DISABLED" },
  );
  await assert.rejects(
    () =>
      guestService(db, table.public_key, visit.token, "scan-device-a", key(), {
        kind: "HELP",
      }),
    { code: "NOT_FOUND" },
  );
  await setQrPolicy(db, actor, key(), {
    outletId,
    version: outlet.version + 1,
    enabled: true,
  });
  assert.equal(
    (
      await guestCatalog(
        db,
        tables[11].public_key,
        unbound.token,
        "unbound-device",
      )
    ).connected,
    false,
  );
});

test("audit chain verifies after all successful and failed workflows", async () => {
  const result = await verifyAudit(db, actor);
  assert.equal(result.valid, true);
  assert.ok(result.checked > 20);
});

test("postpaid requires manager confirmation and locks rewards through kitchen release", async () => {
  const outlet = (
    await db.query<any>("SELECT * FROM outlets WHERE id=$1", [outletId])
  ).rows[0];
  await saveOutlet(db, actor, key(), {
    id: outlet.id,
    version: outlet.version,
    name: outlet.name,
    code: outlet.code,
    qrEnabled: true,
    paymentPolicy: "POSTPAID",
    taxBps: outlet.tax_bps,
  });
  const session = await openSession(db, actor, key(), {
    tableId: tables[4].id,
    guests: 1,
  });
  let order = await createRound(db, actor, key(), {
    outletId,
    sessionId: session.id,
    items: [{ itemId: menu[1].id, quantity: 1 }],
  });
  order = await decideRound(db, actor, key(), order.id, order.rounds[0].id, {
    version: order.rounds[0].version,
    decision: "ACCEPT",
  });
  order = (await identify(order)).order;
  const couponId = key();
  await db.query(
    "INSERT INTO coupons(id,restro_id,outlet_id,code,discount_amount,expires_at) VALUES($1,$2,$3,$4,1000,now()+interval '1 day')",
    [couponId, actor.restroId, outletId, "POSTPAID-" + key()],
  );
  order = (
    await applyEntitlement(db, actor, key(), order.id, order.rounds[0].id, {
      version: order.rounds[0].version,
      couponId,
    })
  ).order;
  await assert.rejects(
    () =>
      authorizePostpaid(db, actor, key(), order.id, order.rounds[0].id, {
        version: order.rounds[0].version,
        reason: "Approved table credit",
        password: "wrong-password",
      }),
    { code: "STEP_UP_FAILED" },
  );
  order = await authorizePostpaid(
    db,
    actor,
    key(),
    order.id,
    order.rounds[0].id,
    {
      version: order.rounds[0].version,
      reason: "Approved table credit",
      password: "test-password-long-123",
    },
  );
  assert.equal(order.rounds[0].kot_status, "RELEASED");
  assert.equal(
    (await db.query<any>("SELECT state FROM coupons WHERE id=$1", [couponId]))
      .rows[0].state,
    "LOCKED",
  );
  await assert.rejects(
    () =>
      applyEntitlement(db, actor, key(), order.id, order.rounds[0].id, {
        version: order.rounds[0].version,
        points: 0,
      }),
    { code: "QUOTE_LOCKED" },
  );
});
test("zero-value rounds require identity and a current reward quote before kitchen release", async () => {
  const { saveMenu } = await import("@dinerdost/services");
  const free = await saveMenu(db, actor, key(), {
    outletId,
    name: "Complimentary water",
    category: "Beverages",
    price: 0,
    taxBps: 0,
    station: "Bar",
  });
  let order = await acceptedOrder(free.id);
  await assert.rejects(
    () =>
      releaseZeroTotal(db, actor, key(), order.id, order.rounds[0].id, {
        version: order.rounds[0].version,
      }),
    { code: "IDENTITY_REQUIRED" },
  );
  order = (await identify(order)).order;
  order = await releaseZeroTotal(
    db,
    actor,
    key(),
    order.id,
    order.rounds[0].id,
    { version: order.rounds[0].version },
  );
  assert.equal(order.rounds[0].payment_status, "PAID");
  assert.equal(order.rounds[0].kot_status, "RELEASED");
});
test("manager audits exclude owner activity and access to another outlet is denied", async () => {
  const employee = await addEmployee(db, actor, key(), {
    name: "Manager Test",
    email: "manager@example.test",
    password: "test-password-long-123",
    role: "MANAGER",
    outletIds: [outletId],
  });
  const session = await login(
    db,
    { email: "manager@example.test", password: "test-password-long-123" },
    "manager-test",
  );
  const manager = await authenticate(db, session.token);
  const view = await workspace(db, manager, outletId);
  assert.equal(
    view.audit.some((a: any) => a.actor_role === "OWNER"),
    false,
  );
  assert.equal(view.employees, undefined);
  assert.equal(view.alerts, undefined);
  await assert.rejects(() => workspace(db, manager, key()), {
    code: "OUTLET_FORBIDDEN",
  });
});
test("duplicate physical receipts do not double stock and posted loyalty cannot be edited", async () => {
  const ingredient = await addIngredient(db, actor, key(), {
    outletId,
    name: "Receipt check",
    unit: "unit",
  });
  const input = {
    ingredientId: ingredient.id,
    batchNumber: "LOT-01",
    quantityMilli: 2000,
    unitCost: 100,
    reference: "INVOICE-01",
  };
  await receiveStock(db, actor, key(), input);
  await assert.rejects(() => receiveStock(db, actor, key(), input), {
    code: "23505",
  });
  assert.equal(
    (
      await db.query("SELECT id FROM stock_batches WHERE ingredient_id=$1", [
        ingredient.id,
      ])
    ).rows.length,
    1,
  );
  await assert.rejects(() =>
    db.query("UPDATE loyalty_ledger SET points=999999 WHERE state='EARNED'"),
  );
});

test("temporary customer browser bans enforce outlet scope, role checks, expiry and early lifting", async () => {
  const outlet = (
    await db.query("SELECT version FROM outlets WHERE id=$1", [outletId])
  ).rows[0];
  await setQrPolicy(db, actor, key(), {
    outletId,
    version: outlet.version,
    enabled: true,
    autoActivate: true,
  });
  const table = tables[0],
    device = "temporary-ban-device";
  if (
    !(await workspace(db, actor)).sessions.some(
      (session: any) => session.table_id === table.id,
    )
  )
    await openSession(db, actor, key(), { tableId: table.id, guests: 1 });
  const visit = await connectGuest(db, table.public_key, device, "ban-test");
  const payload = {
    name: "Ban test guest",
    phone: "9345678902",
    items: [{ itemId: menu[0].id, quantity: 1 }],
  };
  const submittedKey = key();
  const order = await guestSubmit(
    db,
    table.public_key,
    visit.token,
    device,
    submittedKey,
    payload,
  );
  const access = (await getOrder(db, actor, order.id)).deviceAccess as any;
  assert.equal(access.blocked, false);
  assert.equal(
    (await getOrder(db, { ...actor, role: "CASHIER" }, order.id)).deviceAccess,
    null,
  );
  const input = {
    mode: "BAN",
    minutes: 60,
    reason: "Repeated unwanted requests",
    version: access.version,
  };
  await assert.rejects(
    () =>
      setCustomerDeviceBan(
        db,
        { ...actor, role: "CASHIER" },
        key(),
        order.id,
        input,
      ),
    /role cannot/,
  );
  await assert.rejects(
    () =>
      setCustomerDeviceBan(
        db,
        { ...actor, role: "MANAGER", outletIds: [] },
        key(),
        order.id,
        input,
      ),
    /not assigned/,
  );
  await assert.rejects(() =>
    setCustomerDeviceBan(db, actor, key(), order.id, {
      ...input,
      minutes: 10080,
    }),
  );
  const foreign = (
    await db.query("SELECT id FROM restaurants WHERE id<>$1 LIMIT 1", [
      actor.restroId,
    ])
  ).rows[0];
  await assert.rejects(() =>
    setCustomerDeviceBan(
      db,
      { ...actor, restroId: String(foreign.id) },
      key(),
      order.id,
      input,
    ),
  );
  const banKey = key();
  await setCustomerDeviceBan(db, actor, banKey, order.id, input);
  await setCustomerDeviceBan(db, actor, banKey, order.id, input);
  const blocked = (await getOrder(db, actor, order.id)).deviceAccess as any;
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.version, access.version + 1);
  assert.ok(new Date(blocked.banned_until).getTime() > Date.now() + 59 * 60000);
  const denied = (error: any) =>
    error.code === "DEVICE_TEMPORARILY_BANNED" && error.status === 403;
  await assert.rejects(
    () =>
      guestSubmit(
        db,
        table.public_key,
        visit.token,
        device,
        submittedKey,
        payload,
      ),
    denied,
  );
  await assert.rejects(
    () => guestCatalog(db, table.public_key, visit.token, device),
    denied,
  );
  await assert.rejects(
    () => guestCatalog(db, table.public_key, undefined, device),
    denied,
  );
  await assert.rejects(
    () => connectGuest(db, tables[1].public_key, device, "ban-test"),
    denied,
  );
  await assert.rejects(
    () =>
      pairGuest(db, table.public_key, { code: "123456" }, device, "ban-test"),
    denied,
  );
  await assert.rejects(
    () =>
      guestSubmit(db, table.public_key, visit.token, device, key(), {
        ...payload,
        version: order.version,
      }),
    denied,
  );
  await assert.rejects(
    () =>
      guestService(db, table.public_key, visit.token, device, key(), {
        kind: "HELP",
      }),
    denied,
  );
  const innocent = await connectGuest(
    db,
    table.public_key,
    "unrelated-browser",
    "ban-test",
  );
  assert.equal(
    (
      await guestCatalog(
        db,
        table.public_key,
        innocent.token,
        "unrelated-browser",
      )
    ).connected,
    true,
  );
  const otherOutletId = key(),
    otherTableId = key(),
    otherTableKey = key().replaceAll("-", "") + "abcd1234";
  await db.transaction(actor.restroId, async (tx) => {
    await tx.query(
      "INSERT INTO outlets(id,restro_id,name,code,qr_enabled,payment_policy) VALUES($1,$2,'Ban scope test','BAN_SCOPE',true,'PREPAID')",
      [otherOutletId, actor.restroId],
    );
    await tx.query(
      "INSERT INTO dining_tables(id,restro_id,outlet_id,label,seats,public_key) VALUES($1,$2,$3,'Scope table',4,$4)",
      [otherTableId, actor.restroId, otherOutletId, otherTableKey],
    );
  });
  await connectGuest(db, otherTableKey, device, "ban-test");
  await assert.rejects(
    () =>
      setCustomerDeviceBan(db, actor, key(), order.id, {
        mode: "LIFT",
        reason: "Manager reviewed",
        version: access.version,
      }),
    /changed|refresh/i,
  );
  await setCustomerDeviceBan(db, actor, key(), order.id, {
    mode: "LIFT",
    reason: "Manager reviewed",
    version: blocked.version,
  });
  assert.equal(
    (await guestCatalog(db, table.public_key, visit.token, device)).order?.id,
    order.id,
  );
  const lifted = (await getOrder(db, actor, order.id)).deviceAccess as any;
  await setCustomerDeviceBan(db, actor, key(), order.id, {
    ...input,
    minutes: 15,
    version: lifted.version,
  });
  await db.query(
    "UPDATE customer_devices SET banned_until=now()-interval '1 second' WHERE banned_from_order_id=$1",
    [order.id],
  );
  assert.equal(
    (await guestCatalog(db, table.public_key, visit.token, device)).connected,
    true,
  );
  assert.equal(
    ((await getOrder(db, actor, order.id)).deviceAccess as any).blocked,
    false,
  );
  await db.query(
    "UPDATE public_grants SET revoked_at=now() WHERE order_id=$1",
    [order.id],
  );
  assert.ok((await getOrder(db, actor, order.id)).deviceAccess);
  const events = (
    await db.query(
      "SELECT action FROM audit_events WHERE entity_id=$1 AND action IN ('CUSTOMER_DEVICE_BANNED','CUSTOMER_DEVICE_BAN_LIFTED')",
      [order.id],
    )
  ).rows;
  assert.equal(events.length, 3);
  assert.equal((await verifyAudit(db, actor)).valid, true);
  assert.equal((await getOrder(db, actor, order.id)).status, "PENDING");
});
