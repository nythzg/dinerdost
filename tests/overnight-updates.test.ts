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
  quote,
  roundAdjustment,
  floorOutline,
  objectInArea,
  objectInFloor,
  type Actor,
  type FloorPlanObject,
} from "@dinerdost/core";
import * as s from "@dinerdost/services";
let db: Database, owner: Actor, w: any;
const key = () => randomUUID();
before(async () => {
  db = process.env.TEST_DATABASE_URL
    ? createPostgresDatabase(process.env.TEST_DATABASE_URL)
    : await createEmbeddedDatabase();
  await db.migrate();
  await db.migrate();
  const account = await s.signup(
    db,
    {
      name: "Overnight QA",
      email: "overnight@example.test",
      password: "overnight-test-owner-password",
      restaurant: "Overnight QA",
      outlet: "Main",
      qrEnabled: true,
      demo: true,
    },
    "overnight-qa",
  );
  owner = await s.authenticate(db, account.token);
  w = await s.workspace(db, owner);
});
after(async () => {
  await db?.close();
});
async function detail(orderId: string) {
  return db.transaction(owner.restroId, (tx) =>
    s.orderDetail(tx, owner, orderId),
  );
}
async function order(customer = true, web = true) {
  return s.createRound(
    db,
    owner,
    key(),
    {
      outletId: w.outletId,
      type: "TAKEAWAY",
      ...(customer
        ? { customer: { name: "Bill Guest", phone: "9123456780" } }
        : {}),
      items: [{ itemId: w.menu[0].id, quantity: 1 }],
    },
    web,
  );
}
async function staff(role: "WAITER" | "CASHIER" | "MANAGER") {
  const email = key() + "@example.test",
    password = "overnight-synthetic-password";
  await s.addEmployee(db, owner, key(), {
    name: role + " QA",
    email,
    password,
    role,
    outletIds: [w.outletId],
  });
  return s.authenticate(
    db,
    (await s.login(db, { email, password }, key())).token,
  );
}
async function paid(orderId: string) {
  let o = await detail(orderId),
    r = o.rounds[0];
  await s.reviewRewards(db, owner, key(), o.id, r.id);
  o = await detail(o.id);
  r = o.rounds[0];
  await s.recordPayment(db, owner, key(), o.id, r.id, {
    version: r.version,
    method: "CASH",
    amount: Number(r.payable),
  });
  return detail(o.id);
}
async function served(orderId: string) {
  const tickets = (await s.workspace(db, owner)).tickets.filter(
    (t: any) => t.order_id === orderId,
  );
  for (const t of tickets) {
    await s.kitchenDecision(db, owner, key(), t.id, { state: "PREPARING" });
    await s.kitchenDecision(db, owner, key(), t.id, { state: "READY" });
  }
  const o = await detail(orderId);
  await s.serveRound(db, owner, key(), orderId, o.rounds[0].id);
  return detail(orderId);
}

test("web staff submissions accept atomically and idempotently; native and customer submissions stay pending", async () => {
  const request = key(),
    input = {
      outletId: w.outletId,
      type: "TAKEAWAY",
      items: [{ itemId: w.menu[0].id, quantity: 1 }],
    };
  const first = await s.createRound(db, owner, request, input, true),
    again = await s.createRound(db, owner, request, input, true);
  assert.equal(first.id, again.id);
  assert.equal(first.rounds[0].status, "ACCEPTED");
  assert.equal(first.rounds[0].staff_entered, true);
  assert.equal(first.rounds[0].kot_status, "RELEASED");
  assert.equal(Number(first.rounds[0].paid), 0);
  assert.equal(
    (await s.createRound(db, owner, key(), input)).rounds[0].status,
    "PENDING",
  );
  const table = w.tables[0];
  await s.openSession(db, owner, key(), { tableId: table.id, guests: 1 });
  const visit = await s.connectGuest(
    db,
    table.public_key,
    "overnight-device",
    key(),
  );
  const guest = await s.guestSubmit(
    db,
    table.public_key,
    visit.token,
    "overnight-device",
    key(),
    { name: "QR QA", phone: "9123456781", items: input.items },
  );
  const customerOrder = await detail(guest.id);
  assert.equal(customerOrder.rounds[0].status, "PENDING");
  const added = await s.createRound(
    db,
    owner,
    key(),
    {
      outletId: w.outletId,
      sessionId: customerOrder.session_id,
      orderId: customerOrder.id,
      version: customerOrder.version,
      items: input.items,
    },
    true,
  );
  assert.equal(added.rounds[0].status, "PENDING");
  assert.equal(added.rounds[1].status, "ACCEPTED");
  assert.equal(added.status, "PENDING");
});

test("legacy accepted staff items remain editable while unpaid/held; new drafts stay drafts until submitted", async () => {
  const pending = await order(true, false);
  const o = await s.decideRound(
      db,
      owner,
      key(),
      pending.id,
      pending.rounds[0].id,
      { version: pending.rounds[0].version, decision: "ACCEPT" },
    ),
    r = o.rounds[0];
  const input = {
      version: r.version,
      submit: true,
      items: [{ itemId: w.menu[0].id, quantity: 2 }],
    },
    request = key();
  const edited = await s.editRound(db, owner, request, o.id, r.id, input, true);
  assert.equal(edited.rounds[0].status, "ACCEPTED");
  assert.equal(Number(edited.rounds[0].items[0].quantity_milli), 2000);
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        await s.editRound(db, owner, request, o.id, r.id, input, true),
      ),
    ),
    JSON.parse(JSON.stringify(edited)),
  );
  await assert.rejects(
    () => s.editRound(db, owner, key(), o.id, r.id, input, true),
    { code: "VERSION_CONFLICT" },
  );
  const draft = await s.createRound(
    db,
    owner,
    key(),
    { outletId: w.outletId, type: "TAKEAWAY", draft: true, items: input.items },
    true,
  );
  assert.equal(draft.rounds[0].status, "DRAFT");
  const submitted = await s.editRound(
    db,
    owner,
    key(),
    draft.id,
    draft.rounds[0].id,
    { version: draft.rounds[0].version, submit: true, items: input.items },
    true,
  );
  assert.equal(submitted.rounds[0].status, "ACCEPTED");
  await paid(o.id);
  await assert.rejects(
    () =>
      s.editRound(
        db,
        owner,
        key(),
        o.id,
        r.id,
        { version: edited.rounds[0].version, items: input.items },
        true,
      ),
    { code: "ROUND_LOCKED" },
  );
});

test("manual discount and rounding reconcile through owner charges/tax, cash, invoice and immutable snapshots", async () => {
  let o = await order(),
    r = o.rounds[0];
  const request = key(),
    input = { version: r.version, discount: 123, roundToRupee: true };
  o = await s.changeRoundAdjustments(db, owner, request, o.id, r.id, input);
  assert.equal(
    (await s.changeRoundAdjustments(db, owner, request, o.id, r.id, input))
      .totals.payable,
    o.totals.payable,
  );
  assert.equal(o.totals.discount, 123);
  assert.equal(o.totals.payable % 100, 0);
  r = o.rounds[0];
  const beforeCharges = o.totals.payable;
  o = await s.changeRoundCharges(db, owner, key(), o.id, r.id, {
    version: r.version,
    charges: [{ name: "Packaging", amount: 37 }],
  });
  assert.equal(o.totals.discount, 123);
  assert.equal(o.totals.payable % 100, 0);
  const chargesAudit = (
    await db.query(
      "SELECT financial_impact FROM audit_events WHERE entity_id=$1 AND action='ORDER_CHARGES_CHANGED' ORDER BY sequence DESC LIMIT 1",
      [r.id],
    )
  ).rows[0];
  assert.equal(
    Number(chargesAudit.financial_impact),
    o.totals.payable - beforeCharges,
  );
  o = await s.changeOrderTax(db, owner, key(), o.id, {
    version: o.version,
    taxes: [
      { name: "CGST", rateBps: 250 },
      { name: "SGST", rateBps: 250 },
    ],
    reason: "Synthetic tax correction",
  });
  r = o.rounds[0];
  const calculated = quote(
    r.items.map((i: any) => ({
      unit_price: Number(i.unit_price),
      quantity_milli: Number(i.quantity_milli),
      tax_bps: Number(i.tax_bps),
    })),
    123,
  );
  assert.equal(
    o.totals.payable,
    calculated.payable + 37 + roundAdjustment(calculated.payable + 37, true),
  );
  assert.equal(o.totals.roundOff, Number(r.round_off));
  const provisional = await s.generateBill(db, owner, key(), o.id, {
    final: false,
  });
  o = await paid(o.id);
  await assert.rejects(
    () =>
      s.changeRoundAdjustments(db, owner, key(), o.id, r.id, {
        version: o.rounds[0].version,
        discount: 0,
        roundToRupee: false,
      }),
    { code: "ADJUSTMENTS_LOCKED" },
  );
  await served(o.id);
  const invoice = await s.generateBill(db, owner, key(), o.id, { final: true });
  assert.equal(
    invoice.snapshot.totals.payable,
    provisional.snapshot.totals.payable,
  );
  assert.equal(
    invoice.snapshot.totals.roundOff,
    provisional.snapshot.totals.roundOff,
  );
  const frozen = JSON.stringify(invoice.snapshot);
  await assert.rejects(
    () =>
      s.changeRoundAdjustments(db, owner, key(), o.id, r.id, {
        version: o.rounds[0].version,
        discount: 0,
        roundToRupee: false,
      }),
    { code: "ORDER_LOCKED" },
  );
  assert.equal(
    JSON.stringify(
      (await detail(o.id)).invoices.find((i) => i.id === invoice.id)!.snapshot,
    ),
    frozen,
  );
});

test("discount guards reject over-subtotal, stale versions, active uncertain payments and unauthorized roles", async () => {
  const o = await order(),
    r = o.rounds[0];
  await assert.rejects(
    () =>
      s.changeRoundAdjustments(db, owner, key(), o.id, r.id, {
        version: r.version,
        discount: Number(r.subtotal) + 1,
        roundToRupee: false,
      }),
    { code: "INVALID_NUMBER" },
  );
  await assert.rejects(
    () =>
      s.changeRoundAdjustments(
        db,
        { ...owner, role: "KITCHEN" },
        key(),
        o.id,
        r.id,
        { version: r.version, discount: 0, roundToRupee: false },
      ),
    { code: "FORBIDDEN" },
  );
  await s.reviewRewards(db, owner, key(), o.id, r.id);
  const payment = await s.initiatePayment(db, owner, key(), o.id, r.id, {
    version: r.version,
    method: "MANUAL_UPI",
    amount: Number(r.payable),
  });
  await assert.rejects(
    () =>
      s.changeRoundAdjustments(db, owner, key(), o.id, r.id, {
        version: r.version,
        discount: 1,
        roundToRupee: false,
      }),
    { code: "PAYMENT_ACTIVE" },
  );
  assert.ok(payment);
});

test("manual discounts replace coupons safely and zero-total authorization works without fake loyalty tokens", async () => {
  let o = await order(),
    r = o.rounds[0];
  o = await s.changeRoundAdjustments(db, owner, key(), o.id, r.id, {
    version: r.version,
    discount: 123,
    roundToRupee: true,
  });
  r = o.rounds[0];
  const beforeCoupon = o.totals.payable;
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
  assert.equal(Number(r.manual_discount), 0);
  assert.equal(o.totals.discount, 100);
  const rewardAudit = (
    await db.query(
      "SELECT financial_impact,new_state FROM audit_events WHERE entity_id=$1 AND action='TOKEN_RESERVED' ORDER BY sequence DESC LIMIT 1",
      [r.id],
    )
  ).rows[0];
  assert.equal(
    Number(rewardAudit.financial_impact),
    o.totals.payable - beforeCoupon,
  );
  assert.equal(
    Number((rewardAudit.new_state as { roundOff: number }).roundOff),
    Number(r.round_off),
  );
  o = await s.changeRoundAdjustments(db, owner, key(), o.id, r.id, {
    version: r.version,
    discount: Number(r.subtotal),
    roundToRupee: true,
  });
  r = o.rounds[0];
  assert.equal(o.totals.payable, 0);
  assert.equal(
    (await db.query("SELECT state FROM coupons WHERE id=$1", [coupon])).rows[0]
      .state,
    "AVAILABLE",
  );
  await s.reviewRewards(db, owner, key(), o.id, r.id);
  const released = await s.releaseZeroTotal(db, owner, key(), o.id, r.id, {
    version: r.version,
  });
  assert.equal(released.rounds[0].kot_status, "RELEASED");
});

test("web postpaid has no reason/password input but retains policy, role, table and reconciliation checks", async () => {
  await db.query(
    "UPDATE outlets SET payment_policy='POSTPAID',qr_payment_mode='PAYMENT' WHERE id=$1",
    [w.outletId],
  );
  const table = w.tables[1],
    session = await s.openSession(db, owner, key(), {
      tableId: table.id,
      guests: 1,
    });
  const visit = await s.connectGuest(
    db,
    table.public_key,
    "postpaid-review-device",
    key(),
  );
  const submitted = await s.guestSubmit(
    db,
    table.public_key,
    visit.token,
    "postpaid-review-device",
    key(),
    {
      name: "Postpaid QA",
      phone: "9123456782",
      items: [{ itemId: w.menu[0].id, quantity: 1 }],
    },
    true,
  );
  const pending = await detail(submitted.id);
  const o = await s.decideRound(
      db,
      owner,
      key(),
      pending.id,
      pending.rounds[0].id,
      { version: pending.rounds[0].version, decision: "ACCEPT" },
    ),
    r = o.rounds[0];
  await assert.rejects(
    () =>
      s.authorizePostpaid(
        db,
        { ...owner, role: "CASHIER" },
        key(),
        o.id,
        r.id,
        { version: r.version },
        true,
      ),
    { code: "FORBIDDEN" },
  );
  await assert.rejects(() =>
    s.authorizePostpaid(db, owner, key(), o.id, r.id, { version: r.version }),
  );
  const authorized = await s.authorizePostpaid(
    db,
    owner,
    key(),
    o.id,
    r.id,
    { version: r.version },
    true,
  );
  assert.equal(authorized.rounds[0].postpaid_authorized, true);
  assert.equal(authorized.rounds[0].kot_status, "RELEASED");
  assert.equal(Number(authorized.rounds[0].paid), 0);
  const takeaway = await order();
  await assert.rejects(
    () =>
      s.authorizePostpaid(
        db,
        owner,
        key(),
        takeaway.id,
        takeaway.rounds[0].id,
        { version: takeaway.rounds[0].version },
        true,
      ),
    { code: "POSTPAID_NOT_ALLOWED" },
  );
  await db.query("UPDATE outlets SET payment_policy='PREPAID' WHERE id=$1", [
    w.outletId,
  ]);
});

test("all outlet waiters receive one ready event, with no identity leak or broadened order ownership", async () => {
  const first = await staff("WAITER"),
    second = await staff("WAITER");
  let o = await order();
  o = await paid(o.id);
  const ticket = (await s.workspace(db, owner)).tickets.find(
    (t: any) => t.order_id === o.id,
  );
  await s.kitchenDecision(db, owner, key(), ticket.id, { state: "PREPARING" });
  const request = key();
  await s.kitchenDecision(db, owner, request, ticket.id, { state: "READY" });
  await s.kitchenDecision(db, owner, request, ticket.id, { state: "READY" });
  for (const waiter of [first, second]) {
    const feed = await s.notificationInbox(db, waiter, {
      outletId: w.outletId,
    });
    const ready = feed.items.filter(
      (i) => i.kind === "ORDER_READY" && i.title.includes("#" + o.number),
    );
    assert.equal(ready.length, 1);
    assert.equal(ready[0].path, "/app/tasks#ready-orders");
    assert.equal(JSON.stringify(feed).includes("9123456780"), false);
    assert.ok(
      (await s.workspace(db, waiter)).readyTickets.some(
        (t: any) => t.id === ticket.id,
      ),
    );
    await assert.rejects(
      () =>
        db.transaction(waiter.restroId, (tx) =>
          s.orderDetail(tx, waiter, o.id),
        ),
      { code: "SESSION_REQUIRED" },
    );
  }
  await assert.rejects(
    () =>
      s.notificationInbox(
        db,
        { ...first, outletIds: [] },
        { outletId: w.outletId },
      ),
    { code: "OUTLET_FORBIDDEN" },
  );
});

test("approved and completed checklists edit with versions, assignment scope and state preserved", async () => {
  const data = {
    due: businessDate(),
    employeeId: owner.employeeId,
    instructions: "Check the entry",
  };
  const saved = await s.saveRecord(db, owner, key(), "checklists", {
    outletId: w.outletId,
    title: "Entry QA",
    data,
  });
  await s.recordDecision(db, owner, key(), saved.id, {
    version: 1,
    state: "APPROVED",
    reason: "Approved task",
  });
  let record = (await s.listRecords(db, owner, "checklists", w.outletId)).find(
    (r: any) => r.id === saved.id,
  )!;
  await s.saveRecord(db, owner, key(), "checklists", {
    outletId: w.outletId,
    id: record.id,
    version: record.version,
    title: "Entry updated",
    data: { ...data, instructions: "Check every entry" },
  });
  record = (await s.listRecords(db, owner, "checklists", w.outletId)).find(
    (r: any) => r.id === saved.id,
  )!;
  assert.equal(record.state, "APPROVED");
  assert.equal(record.title, "Entry updated");
  await s.recordDecision(db, owner, key(), saved.id, {
    version: record.version,
    state: "COMPLETED",
    reason: "Finished task",
  });
  record = (await s.listRecords(db, owner, "checklists", w.outletId)).find(
    (r: any) => r.id === saved.id,
  )!;
  const request = key(),
    input = {
      outletId: w.outletId,
      id: record.id,
      version: record.version,
      title: "Completed updated",
      data,
    };
  await s.saveRecord(db, owner, request, "checklists", input);
  await s.saveRecord(db, owner, request, "checklists", input);
  assert.equal(
    (await s.listRecords(db, owner, "checklists", w.outletId)).find(
      (r: any) => r.id === saved.id,
    )!.state,
    "COMPLETED",
  );
  await assert.rejects(
    () => s.saveRecord(db, owner, key(), "checklists", input),
    { code: "VERSION_CONFLICT" },
  );
  await assert.rejects(
    () =>
      s.saveRecord(db, owner, key(), "checklists", {
        outletId: w.outletId,
        title: "Invalid assignment",
        data: { ...data, employeeId: key() },
      }),
    { code: "NOT_FOUND" },
  );
});

test("leaderboard uses India calendar periods and actual earned ledger entries while retaining current balances", async () => {
  const old = await s.createRound(db, owner, key(), {
      outletId: w.outletId,
      type: "TAKEAWAY",
      customer: { name: "Historic QA", phone: "9123456784" },
      items: [{ itemId: w.menu[0].id, quantity: 1 }],
    }),
    recent = await s.createRound(db, owner, key(), {
      outletId: w.outletId,
      type: "TAKEAWAY",
      customer: { name: "Period QA", phone: "9123456783" },
      items: [{ itemId: w.menu[0].id, quantity: 1 }],
    });
  await db.query(
    "INSERT INTO loyalty_ledger(id,restro_id,outlet_id,customer_id,order_id,round_id,state,points,reason,created_at) VALUES($1,$2,$3,$4,$5,$6,'EARNED',1000,'Old QA earnings',date_trunc('year',now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'-interval '1 day')",
    [
      key(),
      owner.restroId,
      w.outletId,
      old.customer_id,
      old.id,
      old.rounds[0].id,
    ],
  );
  await db.query(
    "INSERT INTO loyalty_ledger(id,restro_id,outlet_id,customer_id,order_id,round_id,state,points,reason) VALUES($1,$2,$3,$4,$5,$6,'EARNED',25,'Recent QA earnings')",
    [
      key(),
      owner.restroId,
      w.outletId,
      recent.customer_id,
      recent.id,
      recent.rounds[0].id,
    ],
  );
  for (const period of ["YEAR", "MONTH", "WEEK"]) {
    const ranked = await s.loyaltyLeaderboard(db, owner, {
      outletId: w.outletId,
      period,
    });
    const current = ranked.items.find((i: any) => i.id === recent.customer_id)!,
      historic = ranked.items.find((i: any) => i.id === old.customer_id)!;
    assert.equal(Number(current.period_earned), 25);
    assert.equal(Number(historic.period_earned), 0);
    assert.ok(Number(historic.points) >= 1000);
    assert.ok(Number(current.rank) < Number(historic.rank));
  }
  const overall = await s.loyaltyLeaderboard(db, owner, {
    outletId: w.outletId,
    period: "OVERALL",
  });
  assert.equal(overall.items[0].id, old.customer_id);
});

test("rotated rectangles respect concave/circle floor boundaries and area bounds", () => {
  const object: FloorPlanObject = {
    id: "rotate",
    kind: "RECEPTION",
    label: "Reception",
    x: 320,
    y: 200,
    width: 180,
    height: 70,
    rotation: 45,
  };
  assert.ok(objectInArea(object, { width: 1200, height: 800 }));
  assert.ok(
    objectInFloor(object, floorOutline("Circle", { width: 1200, height: 800 })),
  );
  assert.equal(
    objectInArea(
      { ...object, x: 0, y: 0, rotation: 45 },
      { width: 1200, height: 800 },
    ),
    false,
  );
  assert.equal(
    objectInFloor(
      { ...object, x: 600, y: 420, width: 180, height: 160, rotation: 45 },
      floorOutline("L-shaped", { width: 1200, height: 800 }),
    ),
    false,
  );
});

test("floor rotation and boundary settings persist with versions; legacy omitted rotations stay saved", async () => {
  const floor = "Rotation QA";
  await s.saveFloor(db, owner, key(), { outletId: w.outletId, name: floor });
  const object = {
    id: "reception-qa",
    kind: "RECEPTION",
    label: "Reception QA",
    x: 300,
    y: 200,
    width: 180,
    height: 70,
    rotation: 45,
  };
  await s.saveFloorPlan(db, owner, key(), {
    outletId: w.outletId,
    floor,
    version: 1,
    width: 1200,
    height: 800,
    objects: [object],
    boundaryStyle: "WALLS",
  });
  let plan = (await s.workspace(db, owner)).floorPlans.find(
    (p: any) => p.floor === floor,
  );
  assert.equal(plan.objects[0].rotation, 45);
  assert.equal(plan.boundary_style, "WALLS");
  const { rotation, ...legacy } = object;
  await s.saveFloorPlan(db, owner, key(), {
    outletId: w.outletId,
    floor,
    version: plan.version,
    objects: [legacy],
  });
  plan = (await s.workspace(db, owner)).floorPlans.find(
    (p: any) => p.floor === floor,
  );
  assert.equal(plan.objects[0].rotation, rotation);
  assert.equal(plan.boundary_style, "WALLS");
  await assert.rejects(() =>
    s.saveFloorPlan(db, owner, key(), {
      outletId: w.outletId,
      floor,
      version: plan.version,
      objects: [{ ...object, rotation: 16 }],
    }),
  );
  await assert.rejects(
    () =>
      s.saveFloorPlan(db, owner, key(), {
        outletId: w.outletId,
        floor,
        version: plan.version,
        objects: [{ ...object, x: 0, y: 0 }],
      }),
    { code: "OUTSIDE_FLOOR_PLAN" },
  );
});

test("table deletion hides retired tables and revokes QR while preserving history; busy tables cannot be removed", async () => {
  const tableId = (
    await s.saveTable(db, owner, key(), {
      outletId: w.outletId,
      label: "DEL-QA",
      seats: 4,
      floor: "Main floor",
    })
  ).id;
  let table = (await s.workspace(db, owner)).tables.find(
    (t: any) => t.id === tableId,
  );
  const session = await s.openSession(db, owner, key(), { tableId, guests: 1 });
  await assert.rejects(
    () => s.removeTable(db, owner, key(), { tableId, version: table.version }),
    { code: "TABLE_IN_USE" },
  );
  await s.closeSession(db, owner, key(), session.id, {
    reason: "Synthetic table closed",
  });
  await assert.rejects(
    () =>
      s.removeTable(db, { ...owner, role: "MANAGER" }, key(), {
        tableId,
        version: table.version,
      }),
    { code: "FORBIDDEN" },
  );
  const request = key();
  await s.removeTable(db, owner, request, { tableId, version: table.version });
  await s.removeTable(db, owner, request, { tableId, version: table.version });
  assert.equal(
    (await s.workspace(db, owner)).tables.some((t: any) => t.id === tableId),
    false,
  );
  assert.equal(
    Number(
      (
        await db.query(
          "SELECT count(*) AS n FROM table_sessions WHERE table_id=$1",
          [tableId],
        )
      ).rows[0].n,
    ),
    1,
  );
  await assert.rejects(() => s.guestCatalog(db, table.public_key), {
    code: "NOT_FOUND",
  });
  await assert.rejects(
    () => s.openSession(db, owner, key(), { tableId, guests: 1 }),
    { code: "NOT_FOUND" },
  );
});

test("Arrange table deletion is atomic with layout save and rolls back when a session starts", async () => {
  const floor = "Delete QA";
  await s.saveFloor(db, owner, key(), { outletId: w.outletId, name: floor });
  const tableId = (
    await s.saveTable(db, owner, key(), {
      outletId: w.outletId,
      label: "DELETE-LAYOUT",
      seats: 4,
      floor,
    })
  ).id;
  const session = await s.openSession(db, owner, key(), { tableId, guests: 1 });
  const input = {
    outletId: w.outletId,
    floor,
    version: (await s.workspace(db, owner)).floorPlans.find(
      (p: any) => p.floor === floor,
    ).version,
    objects: [],
    deletedTables: [{ tableId, version: 1 }],
    boundaryStyle: "WALLS",
  };
  await assert.rejects(() => s.saveFloorPlan(db, owner, key(), input), {
    code: "TABLE_IN_USE",
  });
  assert.equal(
    (await s.workspace(db, owner)).floorPlans.find(
      (p: any) => p.floor === floor,
    ).boundary_style,
    "STROKE",
  );
  await s.closeSession(db, owner, key(), session.id, {
    reason: "Synthetic table closed",
  });
  await s.saveFloorPlan(db, owner, key(), input);
  assert.equal(
    (await s.workspace(db, owner)).tables.some((t: any) => t.id === tableId),
    false,
  );
});

test("opening/closing stock reconciles at India midnight without changing present balances", async () => {
  const item = (
    await s.addIngredient(db, owner, key(), {
      outletId: w.outletId,
      name: "Midnight QA",
      unit: "unit",
      reorderMilli: 0,
    })
  ).id;
  const batch = { id: key() };
  const now = businessDate(),
    start = new Date(now + "T00:00:00+05:30"),
    receivedAt = new Date(start.getTime() - 1).toISOString();
  await db.query(
    "INSERT INTO stock_batches(id,restro_id,outlet_id,ingredient_id,batch_number,on_hand,unit_cost,received_at) VALUES($1,$2,$3,$4,'MIDNIGHT',10000,100,$5)",
    [batch.id, owner.restroId, w.outletId, item, receivedAt],
  );
  await db.query(
    "INSERT INTO stock_movements(id,restro_id,outlet_id,ingredient_id,batch_id,kind,delta_milli,cost,reason,actor_id,created_at) VALUES($1,$2,$3,$4,$5,'RECEIPT',10000,1000,'Historical QA receipt',$6,$7)",
    [
      key(),
      owner.restroId,
      w.outletId,
      item,
      batch.id,
      owner.employeeId,
      receivedAt,
    ],
  );
  await s.wasteStock(db, owner, key(), {
    batchId: batch.id,
    quantityMilli: 2000,
    reason: "Synthetic stock wastage",
  });
  const result = await s.stockSummary(db, owner, {
    outletId: w.outletId,
    date: now,
    search: "Midnight QA",
  });
  assert.equal(result.items.length, 1);
  assert.equal(Number(result.items[0].opening), 10000);
  assert.equal(Number(result.items[0].movement), -2000);
  assert.equal(Number(result.items[0].closing), 8000);
  const barItem = await s.addIngredient(db, owner, key(), {
    outletId: w.outletId,
    name: "Midnight QA bar garnish",
    unit: "unit",
    stream: "BAR",
  });
  const foodOnly = await s.stockSummary(
    db,
    { ...owner, role: "KITCHEN", application: "KITCHEN" },
    {
      outletId: w.outletId,
      search: "Midnight QA",
    },
  );
  const barOnly = await s.stockSummary(
    db,
    { ...owner, role: "BARTENDER" },
    {
      outletId: w.outletId,
      search: "Midnight QA",
    },
  );
  assert.deepEqual(
    foodOnly.items.map((i) => i.id),
    [item],
  );
  assert.deepEqual(
    barOnly.items.map((i) => i.id),
    [barItem.id],
  );
  assert.equal(
    Number(
      (await s.workspace(db, owner)).ingredients.find((i: any) => i.id === item)
        .on_hand,
    ),
    8000,
  );
  await assert.rejects(
    () =>
      s.stockSummary(
        db,
        { ...owner, role: "CASHIER" },
        { outletId: w.outletId },
      ),
    { code: "FORBIDDEN" },
  );
  await assert.rejects(
    () =>
      s.stockSummary(db, owner, { outletId: w.outletId, date: "2026-02-31" }),
    { code: "INVALID_DATE" },
  );
});

test("the audit chain remains valid after new financial, floor, checklist and table commands", async () => {
  const verified = await s.verifyAudit(db, owner);
  assert.equal(verified.valid, true);
});
