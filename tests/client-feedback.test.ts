import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createEmbeddedDatabase,
  createPostgresDatabase,
  type Database,
} from "@dinerdost/database";
import { businessDate, paymentMethods, type Actor } from "@dinerdost/core";
import * as s from "@dinerdost/services";
import {publicMenu} from '../packages/services/src/public-menu';
let db: Database, actor: Actor, outletId: string, menu: any[], tables: any[];
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
      name: "Feedback Owner",
      email: "feedback@example.test",
      password: "feedback-test-password-123",
      restaurant: "Feedback QA",
      outlet: "Main",
      demo: true,
      qrEnabled: true,
    },
    "feedback",
  );
  actor = await s.authenticate(db, account.token);
  const data = await s.workspace(db, actor);
  outletId = data.outletId;
  menu = data.menu;
  tables = data.tables;
});
after(async () => {
  await db?.close();
});
const manager = () => ({
  ...actor,
  role: "MANAGER" as const,
  outletIds: [outletId],
});
const waiter = () => ({
  ...actor,
  role: "WAITER" as const,
  outletIds: [outletId],
});
async function newOrder(
  items = [{ itemId: menu[0].id, quantity: "1" }],
  extra: any = {},
) {
  return s.createRound(db, actor, key(), {
    outletId,
    type: "TAKEAWAY",
    items,
    ...extra,
  });
}

test("round editing deletes lines, enforces whole portions and preserves price options", async () => {
  const dish = await s.saveMenu(db, actor, key(), {
    outletId,
    name: "Option dish",
    category: "Mains",
    price: 10000,
    taxBps: 500,
    station: "Main kitchen",
    variants: [{ id: "large", name: "Large", price: 2000 }],
    modifiers: [{ id: "sauce", name: "Sauce", price: 1000 }],
  });
  let order = await newOrder([
    {
      itemId: dish.id,
      quantity: "1",
      variant: "large",
      modifiers: ["sauce"],
      note: "Less spice",
    } as any,
    { itemId: menu[1].id, quantity: "1" },
  ]);
  const original = order.rounds[0];
  const input = {
    version: original.version,
    submit: true,
    items: [
      {
        itemId: dish.id,
        quantity: "2",
        variant: "large",
        modifiers: ["sauce"],
        note: "Less spice",
      },
    ],
  };
  await assert.rejects(
    () =>
      s.editRound(db, actor, key(), order.id, original.id, {
        ...input,
        items: [{ ...input.items[0], quantity: "0.99" }],
      }),
    { code: "WHOLE_QUANTITY_REQUIRED" },
  );
  await assert.rejects(() =>
    s.editRound(db, actor, key(), order.id, original.id, {
      ...input,
      items: [],
    }),
  );
  const replay = key();
  order = await s.editRound(db, actor, replay, order.id, original.id, input);
  assert.equal(
    (await s.editRound(db, actor, replay, order.id, original.id, input))
      .rounds[0].version,
    original.version + 1,
  );
  assert.equal(order.rounds[0].items.length, 1);
  assert.equal(Number(order.rounds[0].items[0].quantity_milli), 2000);
  assert.equal(order.rounds[0].items[0].variant, "Large");
  assert.equal(order.rounds[0].items[0].note, "Less spice");
  assert.equal(Number(order.rounds[0].payable), 27300);
  await assert.rejects(
    () => s.editRound(db, actor, key(), order.id, original.id, input),
    { code: "VERSION_CONFLICT" },
  );
  order = await s.decideRound(db, actor, key(), order.id, original.id, {
    version: order.rounds[0].version,
    decision: "ACCEPT",
  });
  await assert.rejects(
    () =>
      s.editRound(db, actor, key(), order.id, original.id, {
        ...input,
        version: order.rounds[0].version,
      }),
    { code: "ROUND_LOCKED" },
  );
  const weighted = await s.saveMenu(db, actor, key(), {
    outletId,
    name: "Weighed salad",
    category: "Mains",
    price: 40000,
    taxBps: 0,
    station: "Main kitchen",
    unit: "kg",
  });
  const weightOrder = await newOrder([
    { itemId: weighted.id, quantity: "0.125" },
  ]);
  const adjusted = await s.editRound(
    db,
    actor,
    key(),
    weightOrder.id,
    weightOrder.rounds[0].id,
    {
      version: weightOrder.rounds[0].version,
      items: [{ itemId: weighted.id, quantity: "0.250" }],
    },
  );
  assert.equal(Number(adjusted.rounds[0].items[0].quantity_milli), 250);
});

test("QR scans require staff activation with automatic activation switched off", async () => {
  const table = tables[0],
    device = "activation-device";
  assert.equal(
    (await s.guestCatalog(db, table.public_key)).activationRequired,
    true,
  );
  const visit = await s.connectGuest(
    db,
    table.public_key,
    device,
    "activation",
  );
  const input = {
    name: "Activation Guest",
    phone: "9123456701",
    items: [{ itemId: menu[0].id, quantity: 1 }],
  };
  assert.equal(
    (
      await db.query("SELECT id FROM table_sessions WHERE table_id=$1", [
        table.id,
      ])
    ).rows.length,
    0,
  );
  assert.equal(
    (await s.guestCatalog(db, table.public_key, visit.token, device))
      .activationRequired,
    true,
  );
  await assert.rejects(
    () =>
      s.guestSubmit(db, table.public_key, visit.token, device, key(), input),
    { code: "TABLE_ACTIVATION_REQUIRED" },
  );
  await s.openSession(db, actor, key(), { tableId: table.id, guests: 1 });
  const order = await s.guestSubmit(
    db,
    table.public_key,
    visit.token,
    device,
    key(),
    input,
  );
  await assert.rejects(
    () =>
      s.closeTable(db, actor, key(), {
        tableId: table.id,
        reason: "Service complete",
      }),
    { code: "OUTSTANDING_ORDER" },
  );
  const staffOrder = await s.getOrder(db, actor, order.id);
  await s.decideRound(db, actor, key(), order.id, order.rounds[0].id, {
    version: staffOrder.rounds[0].version,
    decision: "REJECT",
    reason: "Test cancellation",
  });
  await s.closeTable(db, actor, key(), {
    tableId: table.id,
    reason: "Service complete",
  });
  const outlet = (await s.workspace(db, actor)).outlets[0];
  const policy = {
    outletId,
    version: outlet.version,
    enabled: true,
    autoActivate: false,
  };
  await assert.rejects(() => s.setQrPolicy(db, waiter(), key(), policy), {
    code: "FORBIDDEN",
  });
  await s.setQrPolicy(db, manager(), key(), policy);
  const autoVisit = await s.connectGuest(
    db,
    tables[1].public_key,
    "auto-device",
    "activation-auto",
  );
  assert.equal(
    (
      await db.query("SELECT id FROM table_sessions WHERE table_id=$1", [
        tables[1].id,
      ])
    ).rows.length,
    0,
  );
  await assert.rejects(
    () =>
      s.guestSubmit(
        db,
        tables[1].public_key,
        autoVisit.token,
        "auto-device",
        key(),
        { ...input, phone: "9123456702" },
      ),
    { code: "TABLE_ACTIVATION_REQUIRED" },
  );
  await s.openSession(db, actor, key(), { tableId: tables[1].id, guests: 1 });
  await s.guestSubmit(
    db,
    tables[1].public_key,
    autoVisit.token,
    "auto-device",
    key(),
    { ...input, phone: "9123456702" },
  );
  assert.equal(
    (
      await db.query("SELECT guests FROM table_sessions WHERE table_id=$1", [
        tables[1].id,
      ])
    ).rows[0].guests,
    1,
  );
});

test("table swaps preserve separate sessions and orders and revoke old table visits", async () => {
  const a = tables[2],
    b = tables[3];
  const main = await s.openSession(db, actor, key(), {
    tableId: a.id,
    guests: 2,
  });
  const split = await s.openSession(db, actor, key(), {
    tableId: a.id,
    guests: 1,
    label: "A",
  });
  const other = await s.openSession(db, actor, key(), {
    tableId: b.id,
    guests: 2,
  });
  const order = await newOrder(undefined, {
    sessionId: main.id,
    type: "DINE_IN",
  });
  const visit = await s.connectGuest(db, a.public_key, "move-device", "move");
  const input = {
    sourceTableId: a.id,
    targetTableId: b.id,
    reason: "Guests requested a table swap",
  };
  await assert.rejects(
    () =>
      s.exchangeTables(
        db,
        { ...waiter(), employeeId: randomUUID() },
        key(),
        input,
      ),
    { code: "TABLE_NOT_ASSIGNED" },
  );
  const token = key();
  await s.exchangeTables(db, actor, token, input);
  await s.exchangeTables(db, actor, token, input);
  const sessions = (
    await db.query<any>(
      "SELECT * FROM table_sessions WHERE id=ANY($1::uuid[])",
      [[main.id, split.id, other.id]],
    )
  ).rows;
  assert.equal(sessions.find((entry) => entry.id === main.id).table_id, b.id);
  assert.equal(sessions.find((entry) => entry.id === split.id).table_id, b.id);
  assert.equal(sessions.find((entry) => entry.id === other.id).table_id, a.id);
  assert.equal((await s.getOrder(db, actor, order.id)).session_id, main.id);
  assert.equal(
    (await s.guestCatalog(db, a.public_key, visit.token, "move-device"))
      .connected,
    false,
  );
});

test("custom categories can be renamed and removed while moving their dishes", async () => {
  await s.changeMenuCategory(db, manager(), key(), {
    outletId,
    name: "Chinese",
  });
  let category = (await s.workspace(db, actor)).categories.find(
    (entry: any) => entry.name === "Chinese",
  );
  await s.changeMenuCategory(db, manager(), key(), {
    outletId,
    id: category.id,
    version: category.version,
    name: "Indo Chinese",
  });
  category = (await s.workspace(db, actor)).categories.find(
    (entry: any) => entry.id === category.id,
  );
  const dish = await s.saveMenu(db, actor, key(), {
    outletId,
    name: "Hakka noodles",
    category: category.name,
    price: 20000,
    taxBps: 0,
    station: "Kitchen",
  });
  await assert.rejects(
    () =>
      s.changeMenuCategory(db, waiter(), key(), {
        outletId,
        name: "Forbidden",
      }),
    { code: "FORBIDDEN" },
  );
  await assert.rejects(
    () =>
      s.changeMenuCategory(db, actor, key(), {
        outletId,
        id: category.id,
        version: category.version,
        mode: "DELETE",
      }),
    { code: "CATEGORY_IN_USE" },
  );
  const target = (await s.workspace(db, actor)).categories.find(
    (entry: any) => entry.name === "Mains",
  );
  await s.changeMenuCategory(db, actor, key(), {
    outletId,
    id: category.id,
    version: category.version,
    mode: "DELETE",
    moveTo: target.id,
  });
  assert.equal(
    (await db.query("SELECT category FROM menu_items WHERE id=$1", [dish.id]))
      .rows[0].category,
    "Mains",
  );
});

test("configured digital methods are staff verified and preserve payment and settlement guards", async () => {
  const outlet = (await s.workspace(db, actor)).outlets[0];
  await s.setPaymentMethods(db, manager(), key(), {
    outletId,
    version: outlet.version,
    methods: ["CARD", "ONLINE"],
  });
  let order = await newOrder(undefined, {
    customer: { name: "Card Guest", phone: "9123456703" },
  });
  order = await s.decideRound(db, actor, key(), order.id, order.rounds[0].id, {
    version: order.rounds[0].version,
    decision: "ACCEPT",
  });
  let round = order.rounds[0];
  await assert.rejects(
    () =>
      s.initiatePayment(db, actor, key(), order.id, round.id, {
        version: round.version,
        method: "CASH",
        amount: Number(round.payable),
      }),
    { code: "PAYMENT_METHOD_DISABLED" },
  );
  const attempt = await s.initiatePayment(
    db,
    actor,
    key(),
    order.id,
    round.id,
    { version: round.version, method: "CARD", amount: Number(round.payable) },
  );
  await assert.rejects(
    () =>
      s.verifyPayment(db, actor, key(), attempt.paymentId, {
        decision: "VERIFY",
        reason: "Receipt checked",
      }),
    { code: "REFERENCE_REQUIRED" },
  );
  order = await s.verifyPayment(db, actor, key(), attempt.paymentId, {
    decision: "VERIFY",
    reason: "Terminal receipt checked",
    reference: "CARD-QA-123456",
  });
  assert.equal(order.rounds[0].payment_status, "PAID");
  assert.equal(order.rounds[0].kot_status, "RELEASED");
  await assert.rejects(
    () => s.generateBill(db, actor, key(), order.id, { final: true }),
    { code: "SETTLEMENT_NOT_READY" },
  );
  const current = (await s.workspace(db, actor)).outlets[0];
  await s.setPaymentMethods(db, actor, key(), {
    outletId,
    version: current.version,
    methods: [...paymentMethods],
  });
});

test("reservations hold a specific table, reject conflicts, notify all floor staff and seat the named booking", async () => {
  const table = tables[4],
    at = new Date(Date.now() + 10 * 60000).toISOString();
  const input = {
    outletId,
    title: "Reserved Guest",
    data: {
      guest: "Reserved Guest",
      phone: "9123456704",
      guests: 2,
      at,
      tableId: table.id,
      durationMinutes: 90,
      note: "Window table",
    },
  };
  await s.openSession(db, actor, key(), { tableId: table.id, guests: 2 });
  const booking = await s.saveRecord(db, actor, key(), "reservations", input);
  await assert.rejects(
    () => s.saveRecord(db, actor, key(), "reservations", input),
    { code: "TABLE_ALREADY_RESERVED" },
  );
  const notices = (
    await s.workspace(db, { ...waiter(), employeeId: randomUUID() })
  ).reservationNotices;
  assert.equal(
    notices.find((entry: any) => entry.id === booking.id).guest,
    "Reserved Guest",
  );
  assert.equal(Object.hasOwn(notices[0], "phone"), false);
  await s.closeTable(db, actor, key(), {
    tableId: table.id,
    reason: "Prepare for the reservation",
  });
  await db.query(
    "UPDATE table_reservations SET starts_at=now()-interval '1 minute' WHERE id=$1",
    [booking.id],
  );
  await assert.rejects(
    () => s.openSession(db, actor, key(), { tableId: table.id, guests: 2 }),
    { code: "TABLE_RESERVED" },
  );
  const session = await s.openSession(db, actor, key(), {
    tableId: table.id,
    guests: 2,
    reservationId: booking.id,
  });
  await assert.rejects(
    () =>
      s.saveRecord(db, actor, key(), "reservations", {
        ...input,
        id: booking.id,
        version: 1,
      }),
    { code: "RESERVATION_IN_USE" },
  );
  assert.equal(
    (
      await db.query("SELECT session_id FROM table_reservations WHERE id=$1", [
        booking.id,
      ])
    ).rows[0].session_id,
    session.id,
  );
  await s.closeTable(db, actor, key(), {
    tableId: table.id,
    reason: "Reservation guests departed",
  });
  assert.equal(
    (
      await db.query("SELECT state FROM table_reservations WHERE id=$1", [
        booking.id,
      ])
    ).rows[0].state,
    "COMPLETED",
  );
});

test("service rejection requires a reason and records the exact request", async () => {
  const session = await s.openSession(db, actor, key(), {
    tableId: tables[5].id,
    guests: 1,
  });
  const task = await s.serviceTask(db, actor, key(), {
    sessionId: session.id,
    kind: "WATER",
    state: "OPEN",
  });
  const input = {
    id: task.id,
    sessionId: session.id,
    kind: "WATER",
    state: "REJECTED",
  };
  await assert.rejects(() => s.serviceTask(db, actor, key(), input), {
    code: "REASON_REQUIRED",
  });
  await s.serviceTask(db, actor, key(), {
    ...input,
    reason: "Water service unavailable",
  });
  const saved = (
    await db.query<any>("SELECT * FROM service_requests WHERE id=$1", [task.id])
  ).rows[0];
  assert.equal(saved.state, "REJECTED");
  assert.equal(saved.rejection_reason, "Water service unavailable");
  await s.serviceTask(db, actor, key(), {
    sessionId: session.id,
    kind: "WATER",
    state: "OPEN",
  });
});

test("one phone belongs to one customer name across staff and QR ordering", async () => {
  const customer = { name: "Bound Customer", phone: "9123456705" };
  const first = await newOrder(undefined, { customer });
  const same = await newOrder(undefined, {
    customer: { ...customer, name: " bound   customer " },
  });
  assert.equal(same.customer_id, first.customer_id);
  assert.equal(same.customer_snapshot.name, "Bound Customer");
  await assert.rejects(
    () =>
      newOrder(undefined, {
        customer: { ...customer, name: "Different Customer" },
      }),
    { code: "CUSTOMER_NAME_MISMATCH" },
  );
  const device = "bound-device",
    table = tables[6];
  const visit = await s.connectGuest(db, table.public_key, device, "bound");
  await s.openSession(db, actor, key(), { tableId: table.id, guests: 1 });
  await assert.rejects(
    () =>
      s.guestSubmit(db, table.public_key, visit.token, device, key(), {
        ...customer,
        name: "Different QR Customer",
        items: [{ itemId: menu[0].id, quantity: 1 }],
      }),
    { code: "CUSTOMER_NAME_MISMATCH" },
  );
});

test("approved purchases post one expense and checklists require a real active employee", async () => {
  const vendor = await s.saveRecord(db, actor, key(), "vendors", {
    outletId,
    title: "Farm vendor",
    data: {
      category: "Mushrooms",
      description: "Fresh oyster mushrooms",
      contact: "Vendor Contact",
      phone: "",
      email: "",
      address: "",
      gstin: "",
    },
  });
  const purchase = await s.saveRecord(db, actor, key(), "purchases", {
    outletId,
    title: "Mushroom delivery",
    data: {
      vendorId: vendor.id,
      reference: "PURCHASE-QA-1",
      amount: 25000,
      note: "Fresh stock",
    },
  });
  const approval = key();
  await s.recordDecision(db, actor, approval, purchase.id, {
    version: 1,
    state: "APPROVED",
    reason: "Purchase approved",
  });
  await s.recordDecision(db, actor, approval, purchase.id, {
    version: 1,
    state: "APPROVED",
    reason: "Purchase approved",
  });
  const expenses: any[] = await s.listRecords(db, actor, "expenses", outletId);
  assert.equal(
    expenses.filter((entry: any) => entry.data.sourcePurchaseId === purchase.id)
      .length,
    1,
  );
  assert.equal(
    expenses.find((entry: any) => entry.data.sourcePurchaseId === purchase.id)
      .data.amount,
    25000,
  );
  const checklist = {
    outletId,
    title: "Clean kitchen",
    data: {
      employeeId: actor.employeeId,
      due: businessDate(),
      instructions: "Clean the work surface",
    },
  };
  await s.saveRecord(db, actor, key(), "checklists", checklist);
  await assert.rejects(() =>
    s.saveRecord(db, actor, key(), "checklists", {
      ...checklist,
      data: { ...checklist.data, employeeId: randomUUID() },
    }),
  );
});

test("shift attendance uses real employees, manager permissions, server times and one row per shift/day", async () => {
  const shift = await s.saveShift(db, manager(), key(), {
    outletId,
    name: "Morning",
    start: "09:00",
    end: "17:00",
  });
  await assert.rejects(
    () =>
      s.saveShift(db, waiter(), key(), {
        outletId,
        name: "Denied",
        start: "09:00",
        end: "17:00",
      }),
    { code: "FORBIDDEN" },
  );
  const input = {
    outletId,
    employeeId: actor.employeeId,
    shiftId: shift.id,
    date: businessDate(),
    mode: "CHECK_IN",
  };
  const token = key();
  const first = await s.markAttendance(db, manager(), token, input);
  assert.equal(
    (await s.markAttendance(db, manager(), token, input)).id,
    first.id,
  );
  await assert.rejects(() => s.markAttendance(db, manager(), key(), input), {
    code: "VERSION_CONFLICT",
  });
  await s.saveShift(db, manager(), key(), {
    id: shift.id,
    version: 1,
    outletId,
    name: "Morning",
    start: "09:00",
    end: "17:00",
    active: false,
  });
  await s.markAttendance(db, manager(), key(), {
    ...input,
    mode: "CHECK_OUT",
    version: 1,
  });
  const record = (
    await db.query<any>("SELECT * FROM employee_attendance WHERE id=$1", [
      first.id,
    ])
  ).rows[0];
  assert.ok(record.checked_in_at);
  assert.ok(record.checked_out_at);
  assert.equal(record.source, "MANUAL");
  assert.equal((await s.workspace(db, manager())).attendance.length, 1);
});

test("peg quantities charge whole pegs and consume the configured liquor volume", async () => {
  const liquor = await s.addIngredient(db, actor, key(), {
    outletId,
    name: "QA whisky",
    unit: "L",
    category: "LIQUOR",
  });
  await s.receiveStock(db, actor, key(), {
    ingredientId: liquor.id,
    batchNumber: "BOTTLE-1",
    quantityMilli: 1000,
    unitCost: 100000,
    reference: "LIQUOR-QA-1",
  });
  const item = await s.saveMenu(db, actor, key(), {
    outletId,
    name: "Whisky 30 ml",
    category: "Liquor",
    price: 12000,
    taxBps: 0,
    station: "Bar",
    unit: "peg",
    pegMl: 30,
    liquorIngredientId: liquor.id,
  });
  await assert.rejects(
    () => newOrder([{ itemId: item.id, quantity: "0.99" }]),
    { code: "WHOLE_QUANTITY_REQUIRED" },
  );
  let order = await newOrder([{ itemId: item.id, quantity: "2" }], {
    customer: { name: "Peg Guest", phone: "9123456706" },
  });
  assert.equal(Number(order.rounds[0].payable), 24000);
  order = await s.decideRound(db, actor, key(), order.id, order.rounds[0].id, {
    version: order.rounds[0].version,
    decision: "ACCEPT",
  });
  assert.equal(
    Number(
      (
        await db.query(
          "SELECT reserved FROM stock_batches WHERE ingredient_id=$1",
          [liquor.id],
        )
      ).rows[0].reserved,
    ),
    60,
  );
  const attempt = await s.initiatePayment(
    db,
    actor,
    key(),
    order.id,
    order.rounds[0].id,
    { version: order.rounds[0].version, method: "CASH", amount: 24000 },
  );
  await s.verifyPayment(db, actor, key(), attempt.paymentId, {
    decision: "VERIFY",
    reason: "Cash counted",
  });
  assert.equal(
    Number(
      (
        await db.query(
          "SELECT on_hand FROM stock_batches WHERE ingredient_id=$1",
          [liquor.id],
        )
      ).rows[0].on_hand,
    ),
    940,
  );
});

test("reserved table guests can call a waiter before seating and repeats do not duplicate requests", async () => {
  const table = tables[10],
    device = "unseated-service-device";
  const outlet = (await s.workspace(db, actor)).outlets[0];
  await s.setQrPolicy(db, actor, key(), {
    outletId,
    version: outlet.version,
    enabled: true,
    autoActivate: false,
  });
  const reservation = await s.saveRecord(db, actor, key(), "reservations", {
    outletId,
    title: "Reserved Service Guest",
    data: {
      tableId: table.id,
      guest: "Reserved Service Guest",
      phone: "9123456799",
      guests: 2,
      at: new Date(Date.now() + 10 * 60000).toISOString(),
      durationMinutes: 90,
      note: "",
    },
  });
  await db.query(
    "UPDATE table_reservations SET starts_at=now()-interval '1 minute' WHERE table_id=$1",
    [table.id],
  );
  const visit = await s.connectGuest(
    db,
    table.public_key,
    device,
    "unseated-service",
  );
  const service = () =>
    s.guestService(db, table.public_key, visit.token, device, key(), {
      kind: "HELP",
    });
  await service();
  await service();
  assert.equal(
    (
      await db.query("SELECT id FROM table_sessions WHERE table_id=$1", [
        table.id,
      ])
    ).rows.length,
    0,
  );
  const requests = (
    await db.query<any>("SELECT * FROM service_requests WHERE table_id=$1", [
      table.id,
    ])
  ).rows;
  assert.equal(requests.length, 1);
  assert.equal(requests[0].session_id, null);
  assert.equal(
    (await s.guestCatalog(db, table.public_key, visit.token, device))
      .activationRequired,
    true,
  );
  await assert.rejects(
    () =>
      s.guestSubmit(db, table.public_key, visit.token, device, key(), {
        name: "Service Guest",
        phone: "9123456799",
        items: [{ itemId: menu[0].id, quantity: 1 }],
      }),
    { code: "TABLE_ACTIVATION_REQUIRED" },
  );
  const createWaiter = async (name: string) => {
    const employee = await s.addEmployee(db, actor, key(), {
      name,
      email: name + "@example.test",
      password: "service-test-password-123",
      role: "WAITER",
      outletIds: [outletId],
    });
    const row = (
      await db.query<any>("SELECT * FROM employees WHERE id=$1", [employee.id])
    ).rows[0];
    return {
      ...actor,
      employeeId: row.id,
      userId: row.user_id,
      role: "WAITER" as const,
      outletIds: [outletId],
    };
  };
  const first = await createWaiter("ServiceWaiterOne"),
    second = await createWaiter("ServiceWaiterTwo");
  assert.equal(
    (await s.workspace(db, first)).tasks.some(
      (task: any) => task.id === requests[0].id,
    ),
    true,
  );
  const taskInput = {
    id: requests[0].id,
    sessionId: null,
    kind: "HELP",
    state: "ACCEPTED",
  };
  await assert.rejects(
    () => s.serviceTask(db, { ...first, outletIds: [] }, key(), taskInput),
    { code: "OUTLET_FORBIDDEN" },
  );
  await s.serviceTask(db, first, key(), taskInput);
  await assert.rejects(
    () =>
      s.serviceTask(db, second, key(), { ...taskInput, state: "COMPLETED" }),
    { code: "TABLE_NOT_ASSIGNED" },
  );
  await assert.rejects(
    () =>
      s.serviceTask(db, first, key(), {
        ...taskInput,
        state: "REJECTED",
        reason: "",
      }),
    { code: "REASON_REQUIRED" },
  );
  await s.serviceTask(db, first, key(), { ...taskInput, state: "COMPLETED" });
  await service();
  assert.equal(
    (
      await db.query("SELECT id FROM service_requests WHERE table_id=$1", [
        table.id,
      ])
    ).rows.length,
    2,
  );
  await s.openSession(db, actor, key(), {
    tableId: table.id,
    guests: 2,
    reservationId: reservation.id,
  });
  assert.equal(
    (await s.guestCatalog(db, table.public_key, visit.token, device))
      .activationRequired,
    false,
  );
  await s.closeTable(db, actor, key(), {
    tableId: table.id,
    reason: "Service complete",
  });
  assert.equal(
    (
      await db.query(
        "SELECT id FROM service_requests WHERE table_id=$1 AND state='OPEN'",
        [table.id],
      )
    ).rows.length,
    0,
  );
});

test("feedback changes and rejected requests leave a valid audit chain", async () => {
  assert.equal((await s.verifyAudit(db, actor)).valid, true);
});

test('category course assignment persists across renames and reads without changing dishes or recorded orders',async()=>{
 await s.changeMenuCategory(db,manager(),key(),{outletId,name:'Coffee sweets',menuCourse:'dessert'});
 let category=(await s.workspace(db,actor)).categories.find((row:any)=>row.name==='Coffee sweets');
 const dish=await s.saveMenu(db,actor,key(),{outletId,name:'Category course pastry',category:category.name,price:10000,taxBps:500,station:'Kitchen'});
 const order=await newOrder([{itemId:dish.id,quantity:'1'}]),original=await s.getOrder(db,actor,order.id);
 const before=(await s.workspace(db,actor)).menu.find((row:any)=>row.id===dish.id);
 assert.equal(before.menu_course,'dessert');
 const input={outletId,id:category.id,version:category.version,name:category.name,menuCourse:'starter'},request=key();
 await s.changeMenuCategory(db,manager(),request,input);await s.changeMenuCategory(db,manager(),request,input);
 const data=await s.workspace(db,actor);category=data.categories.find((row:any)=>row.id===category.id);
 assert.equal(category.menu_course,'starter');assert.equal(category.version,input.version+1);
 assert.equal(data.menu.find((row:any)=>row.id===dish.id).version,before.version);
 await assert.rejects(s.changeMenuCategory(db,actor,key(),input),{code:'VERSION_CONFLICT'});
 await s.changeMenuCategory(db,manager(),key(),{outletId,id:category.id,version:category.version,name:'Sweet bites'});
 let catalog=await db.transaction(actor.restroId,tx=>publicMenu(tx,outletId));
 assert.equal(catalog.items.find(row=>row.id===dish.id)!.menu_course,'starter');
 assert.equal(catalog.items.find(row=>row.id===dish.id)!.category,'Sweet bites');
 assert.deepEqual(await s.getOrder(db,actor,order.id),original);
 const target=(await s.workspace(db,actor)).categories.find((row:any)=>row.name==='Desserts');
 await s.changeMenuCategory(db,actor,key(),{outletId,id:target.id,version:target.version,name:target.name,menuCourse:'dessert'});
 category=(await s.workspace(db,actor)).categories.find((row:any)=>row.id===category.id);
 await s.changeMenuCategory(db,actor,key(),{outletId,id:category.id,version:category.version,mode:'DELETE',moveTo:target.id});
 catalog=await db.transaction(actor.restroId,tx=>publicMenu(tx,outletId));assert.equal(catalog.items.find(row=>row.id===dish.id)!.menu_course,'dessert');
 assert.deepEqual(await s.getOrder(db,actor,order.id),original);
});

test('category course assignment validates values, tenant and outlet scopes, permissions and database constraints',async()=>{
 const input={outletId,name:'Category guard',menuCourse:'main'};
 await assert.rejects(s.changeMenuCategory(db,waiter(),key(),input),{code:'FORBIDDEN'});
 await assert.rejects(s.changeMenuCategory(db,{...manager(),outletIds:[]},key(),input),{code:'OUTLET_FORBIDDEN'});
 await assert.rejects(s.changeMenuCategory(db,actor,key(),{...input,menuCourse:'unknown'}),{name:'ZodError'});
 const signed=await s.signup(db,{name:'Category foreign',email:'category-foreign@example.test',password:'category-foreign-password',restaurant:'Category foreign',outlet:'Main',qrEnabled:true,demo:true},'category-foreign');
 const foreign=await s.authenticate(db,signed.token);await assert.rejects(s.changeMenuCategory(db,foreign,key(),input),{code:'NOT_FOUND'});
 const category=(await s.workspace(db,actor)).categories[0];
 await assert.rejects(db.transaction(actor.restroId,tx=>tx.query('UPDATE menu_categories SET menu_course=$2 WHERE id=$1',[category.id,'unknown'])),{code:'23514'});
 await s.saveOutlet(db,actor,key(),{name:'Category second outlet',code:'C2',qrEnabled:true,paymentPolicy:'PREPAID',taxBps:0});
 const second=(await s.workspace(db,actor)).outlets.find((row:any)=>row.id!==outletId);
 await assert.rejects(s.changeMenuCategory(db,actor,key(),{...input,outletId:second.id,id:category.id,version:category.version}),{code:'NOT_FOUND'});
});
