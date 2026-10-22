import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createEmbeddedDatabase,
  createPostgresDatabase,
  type Database,
} from "@dinerdost/database";
import { type Actor } from "@dinerdost/core";
import * as s from "@dinerdost/services";
import { audit } from "../packages/services/src/shared";
let db: Database, owner: Actor, foreign: Actor, w: any;
const key = () => randomUUID();

test("order detail table context remains scoped and identifies historical visits without changing financial records", async () => {
  const a = await visit();
  const created = await s.createRound(db, owner, key(), {
    outletId: w.outletId, sessionId: a.id, type: "DINE_IN", draft: true,
    items: [{ itemId: w.menu[0].id, quantity: 1 }],
  }, true);
  const first = await s.getOrder(db, owner, created.id);
  assert.equal(first.table.id, a.tableId);
  assert.equal(first.table.label, (await s.workspace(db, owner)).tables.find((t: any) => t.id === a.tableId).label);
  const beforeRead = await financial();
  await assert.rejects(s.getOrder(db, foreign, created.id));
  await assert.rejects(s.getOrder(db, { ...owner, role: "WAITER", employeeId: key(), outletIds: [w.outletId] }, created.id));
  await assert.rejects(s.getOrder(db, { ...owner, role: "MANAGER", outletIds: [] }, created.id));
  assert.deepEqual(await financial(), beforeRead);
  await s.voidRound(db, owner, key(), created.id, first.rounds[0].id, { version: first.rounds[0].version, reason: "Synthetic visit completed" });
  await s.closeTable(db, owner, key(), clear(a, [a.id]));
  const next = await s.openSession(db, owner, key(), { tableId: a.tableId, guests: 1 });
  const before = await financial(), old = await s.getOrder(db, owner, created.id);
  assert.equal(old.table.id, a.tableId); assert.equal(old.session_id, a.id);
  const current = await s.getTableBills(db, owner, a.tableId, true);
  assert(current.sessions.some((session: any) => session.id === next.id));
  assert(!current.sessions.some((session: any) => session.id === old.session_id));
  assert.deepEqual(await financial(), before);
  const takeaway = await s.createRound(db, owner, key(), { outletId: w.outletId, type: "TAKEAWAY", draft: true, items: [{ itemId: w.menu[0].id, quantity: 1 }] }, true);
  assert.equal(takeaway.table, null);
});
before(async () => {
  db = process.env.TEST_DATABASE_URL
    ? createPostgresDatabase(process.env.TEST_DATABASE_URL)
    : await createEmbeddedDatabase();
  await db.migrate();
  for (const index of [0, 1]) {
    const account = await s.signup(
      db,
      {
        name: "Clear QA",
        email: `clear-${index}@example.test`,
        password: "clear-table-test-password",
        restaurant: "Clear QA " + index,
        outlet: "Main",
        qrEnabled: true,
        demo: true,
      },
      "clear-" + index,
    );
    const actor = await s.authenticate(db, account.token);
    if (index) foreign = actor;
    else owner = actor;
  }
  w = await s.workspace(db, owner);
});
after(async () => {
  await db?.close();
});
async function visit() {
  const table = await s.saveTable(db, owner, key(), {
    outletId: w.outletId,
    label: key().slice(0, 8),
    seats: 4,
    floor: "Main floor",
  });
  const session = await s.openSession(db, owner, key(), {
    tableId: table.id,
    guests: 2,
  });
  return { tableId: table.id, id: session.id };
}
const clear = (a: { tableId: string }, sessionIds: string[]) => ({
  tableId: a.tableId,
  sessionIds,
  includeMerged: true,
  reason: "Guests departed; ready for new customers",
});
const merge = (a: { id: string }, b: { id: string }) =>
  s.sessionMerge(db, owner, key(), {
    parentId: a.id,
    childId: b.id,
    reason: "Join guest tables",
  });
async function financial() {
  return db.transaction(owner.restroId, async (tx) => {
    const result: Record<string, unknown> = {};
    for (const table of [
      "orders",
      "order_rounds",
      "order_items",
      "payment_attempts",
      "invoices",
      "stock_movements",
      "order_item_costs",
    ])
      result[table] = (
        await tx.query(
          `SELECT * FROM ${table} ORDER BY ${table === "order_item_costs" ? "order_item_id" : "id"}`,
        )
      ).rows;
    return result;
  });
}
async function order(sessionId: string, webFlow = true) {
  return s.createRound(
    db,
    owner,
    key(),
    {
      outletId: w.outletId,
      sessionId,
      type: "DINE_IN",
      customer: { name: "Clear guest", phone: "9123456102" },
      items: [{ itemId: w.menu[0].id, quantity: 1 }],
    },
    webFlow,
  );
}
test("clearing a settled table preserves financial history, closes visits and revokes old customer grants", async () => {
  const a = await visit();
  const table = (await s.workspace(db, owner)).tables.find(
    (t: any) => t.id === a.tableId,
  );
  const guest = await s.connectGuest(
    db,
    table.public_key,
    "clear-guest",
    "clear-guest",
  );
  await s.guestService(
    db,
    table.public_key,
    guest.token,
    "clear-guest",
    key(),
    { kind: "WATER" },
  );
  const o = await order(a.id);
  const detail = (await s.reviewRewards(db, owner, key(), o.id, o.rounds[0].id))
    .order;
  await s.recordPayment(db, owner, key(), o.id, detail.rounds[0].id, {
    version: detail.rounds[0].version,
    method: "CASH",
    amount: Number(detail.rounds[0].payable),
  });
  for (const ticket of (await s.workspace(db, owner)).tickets.filter(
    (t: any) => t.order_id === o.id,
  )) {
    await s.kitchenDecision(db, owner, key(), ticket.id, {
      state: "PREPARING",
    });
    await s.kitchenDecision(db, owner, key(), ticket.id, { state: "READY" });
  }
  await s.serveRound(db, owner, key(), o.id, o.rounds[0].id);
  await s.generateBill(db, owner, key(), o.id, { final: true });
  const before = await financial(),
    input = clear(a, [a.id]),
    retry = key();
  await s.closeTable(db, owner, retry, input);
  await s.closeTable(db, owner, retry, input);
  assert.deepEqual(await financial(), before);
  const after = await s.workspace(db, owner);
  assert.equal(
    after.tables.find((t: any) => t.id === a.tableId).is_occupied,
    false,
  );
  assert.equal(
    after.sessions.some((v: any) => v.id === a.id),
    false,
  );
  assert.equal(
    (await s.getTableBills(db, owner, a.tableId, true)).sessions.length,
    0,
  );
  assert.equal((await s.getOrder(db, owner, o.id)).status, "SETTLED");
  assert.equal(
    Number(
      (
        await db.query(
          "SELECT count(*) AS n FROM public_grants WHERE table_id=$1 AND revoked_at IS NULL",
          [a.tableId],
        )
      ).rows[0].n,
    ),
    0,
  );
  assert.equal(
    after.tasks.some(
      (t: any) =>
        t.table_id === a.tableId &&
        ["OPEN", "ACCEPTED", "ESCALATED"].includes(t.state),
    ),
    false,
  );
  const next = await s.openSession(db, owner, key(), {
    tableId: a.tableId,
    guests: 1,
  });
  assert.notEqual(next.id, a.id);
  assert.equal(
    Number(
      (
        await db.query(
          "SELECT count(*) AS n FROM public_grants WHERE table_id=$1 AND revoked_at IS NULL",
          [a.tableId],
        )
      ).rows[0].n,
    ),
    0,
  );
  assert.equal((await s.verifyAudit(db, owner)).valid, true);
});
test("a merged clear rejects outstanding orders on any member atomically, then releases the entire group", async () => {
  const a = await visit(),
    b = await visit();
  await merge(a, b);
  const o = await order(b.id, false),
    input = clear(a, [a.id, b.id]);
  await assert.rejects(() => s.closeTable(db, owner, key(), input), {
    code: "OUTSTANDING_ORDER",
  });
  assert.equal(
    (await s.getTableBills(db, owner, a.tableId, true)).sessions.length,
    2,
  );
  await s.decideRound(db, owner, key(), o.id, o.rounds[0].id, {
    version: o.rounds[0].version,
    decision: "REJECT",
    reason: "Guest cancelled before preparation",
  });
  const before = await financial();
  await s.closeTable(db, owner, key(), input);
  assert.deepEqual(await financial(), before);
  for (const v of [a, b])
    assert.equal(
      (await s.getTableBills(db, owner, v.tableId, true)).sessions.length,
      0,
    );
});
test("stale clearing cannot close a new visit, a new split bill or a changed merged group", async () => {
  const a = await visit(),
    b = await visit();
  const stale = clear(a, [a.id]);
  await s.closeTable(db, owner, key(), stale);
  const next = await s.openSession(db, owner, key(), {
    tableId: a.tableId,
    guests: 1,
  });
  await assert.rejects(() => s.closeTable(db, owner, key(), stale), {
    code: "TABLE_VISIT_CHANGED",
  });
  const current = { ...a, id: next.id };
  await merge(current, b);
  await assert.rejects(
    () => s.closeTable(db, owner, key(), clear(a, [next.id])),
    { code: "TABLE_VISIT_CHANGED" },
  );
  const grouped = clear(a, [next.id, b.id]);
  await s.sessionDemerge(db, owner, key(), {
    parentId: next.id,
    childId: b.id,
    reason: "Separate guest tables",
  });
  await assert.rejects(() => s.closeTable(db, owner, key(), grouped), {
    code: "TABLE_VISIT_CHANGED",
  });
  const split = await s.openSession(db, owner, key(), {
    tableId: a.tableId,
    guests: 1,
    label: "BILL2",
  });
  await assert.rejects(
    () => s.closeTable(db, owner, key(), clear(a, [next.id])),
    { code: "TABLE_VISIT_CHANGED" },
  );
  assert.equal(
    (await s.getTableBills(db, owner, a.tableId, true)).sessions.length,
    2,
  );
  await s.closeTable(db, owner, key(), clear(a, [next.id, split.id]));
  assert.equal(
    (await s.getTableBills(db, owner, b.tableId, true)).sessions.length,
    1,
  );
});
test("clear table retains role, tenant, outlet and ownership guards across every merged visit", async () => {
  const a = await visit(),
    b = await visit();
  await merge(a, b);
  const input = clear(a, [a.id, b.id]);
  for (const [actor, code] of [
    [foreign, "NOT_FOUND"],
    [{ ...owner, role: "KITCHEN" }, "FORBIDDEN"],
    [{ ...owner, role: "CASHIER", outletIds: [] }, "OUTLET_FORBIDDEN"],
    [
      { ...owner, role: "WAITER", outletIds: [w.outletId] },
      "TABLE_NOT_ASSIGNED",
    ],
  ] as [Actor, string][]) {
    const denied =
      actor.role === "WAITER" ? { ...actor, employeeId: key() } : actor;
    await assert.rejects(() => s.closeTable(db, denied, key(), input), {
      code,
    });
  }
  const waiter = await s.addEmployee(db, owner, key(), {
    name: "Clear waiter",
    email: "clear-waiter@example.test",
    password: "clear-waiter-password",
    role: "WAITER",
    outletIds: [w.outletId],
  });
  const assigned: Actor = {
    ...owner,
    employeeId: waiter.id,
    role: "WAITER",
    outletIds: [w.outletId],
  };
  await db.transaction(owner.restroId, (tx) =>
    tx.query("UPDATE table_sessions SET owner_employee_id=$2 WHERE id=$1", [
      a.id,
      waiter.id,
    ]),
  );
  await assert.rejects(() => s.closeTable(db, assigned, key(), input), {
    code: "TABLE_NOT_ASSIGNED",
  });
  await db.transaction(owner.restroId, (tx) =>
    tx.query("UPDATE table_sessions SET owner_employee_id=$2 WHERE id=$1", [
      b.id,
      waiter.id,
    ]),
  );
  await s.closeTable(db, assigned, key(), input);
  assert.equal(
    (await s.getTableBills(db, owner, a.tableId, true)).sessions.length,
    0,
  );
});
test("concurrent order entry and table clearing cannot leave an open order on a closed visit", async () => {
  const a = await visit();
  const results = await Promise.allSettled([
    s.closeTable(db, owner, key(), clear(a, [a.id])),
    order(a.id),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const session = (
    await db.query("SELECT status FROM table_sessions WHERE id=$1", [a.id])
  ).rows[0];
  const orders = (
    await db.query("SELECT id FROM orders WHERE session_id=$1", [a.id])
  ).rows;
  assert.equal(session.status === "CLOSED", orders.length === 0);
});

test("one-click whole-group demerge checks every member and stale snapshot, then preserves visits and ledgers", async () => {
  const a = await visit(),
    b = await visit(),
    c = await visit();
  await merge(a, b);
  await merge(a, c);
  const input = {
    parentId: a.id,
    childId: b.id,
    all: true,
    sessionIds: [a.id, b.id, c.id],
    reason: "Staff separated all merged tables",
  };
  const before = await financial();
  await assert.rejects(
    () =>
      s.sessionDemerge(db, owner, key(), {
        ...input,
        sessionIds: [a.id, b.id],
      }),
    { code: "MERGE_CHANGED" },
  );
  const outsider = await s.addEmployee(db, owner, key(), {
    name: "Third table waiter",
    email: `third-${key()}@example.test`,
    password: "third-table-waiter-pass",
    role: "WAITER",
    outletIds: [w.outletId],
  });
  await db.transaction(owner.restroId, (tx) =>
    tx.query("UPDATE table_sessions SET owner_employee_id=$2 WHERE id=$1", [
      c.id,
      outsider.id,
    ]),
  );
  await assert.rejects(
    () =>
      s.sessionDemerge(
        db,
        { ...owner, role: "WAITER", outletIds: [w.outletId] },
        key(),
        input,
      ),
    { code: "TABLE_NOT_ASSIGNED" },
  );
  await assert.rejects(() => s.sessionDemerge(db, foreign, key(), input), {
    code: "NOT_FOUND",
  });
  await assert.rejects(
    () => s.sessionDemerge(db, { ...owner, role: "KITCHEN" }, key(), input),
    { code: "FORBIDDEN" },
  );
  await assert.rejects(
    () =>
      s.sessionDemerge(
        db,
        { ...owner, role: "CASHIER", outletIds: [] },
        key(),
        input,
      ),
    { code: "OUTLET_FORBIDDEN" },
  );
  assert.equal(
    (await s.getTableBills(db, owner, a.tableId, true)).members.length,
    3,
  );
  const retry = key();
  await s.sessionDemerge(db, owner, retry, input);
  await s.sessionDemerge(db, owner, retry, input);
  for (const v of [a, b, c]) {
    const current = await s.getTableBills(db, owner, v.tableId, true);
    assert.equal(current.members.length, 1);
    assert.equal(current.sessions.length, 1);
    assert.equal(current.sessions[0].id, v.id);
    assert.equal(current.sessions[0].parent_id, null);
  }
  assert.deepEqual(await financial(), before);
  assert.equal((await s.verifyAudit(db, owner)).valid, true);
});

test("Overview dine-in/takeaway counters count orders once within the India day and outlet, keeping other metrics intact", async () => {
  const baseline = (await s.workspace(db, owner)).metrics,
    a = await visit();
  let dine = await order(a.id, false);
  await s.createRound(db, owner, key(), {
    outletId: w.outletId,
    sessionId: a.id,
    orderId: dine.id,
    version: dine.version,
    type: "DINE_IN",
    items: [{ itemId: w.menu[0].id, quantity: 1 }],
  });
  const make = (type: string) =>
    s.createRound(db, owner, key(), {
      outletId: w.outletId,
      type,
      items: [{ itemId: w.menu[0].id, quantity: 1 }],
    });
  await make("TAKEAWAY");
  await make("DELIVERY");
  const old = await make("TAKEAWAY");
  await db.transaction(owner.restroId, async (tx) => {
    await tx.query(
      "UPDATE orders SET created_at=((now() AT TIME ZONE 'Asia/Kolkata')::date::timestamp AT TIME ZONE 'Asia/Kolkata')-interval '1 minute' WHERE id=$1",
      [old.id],
    );
    await tx.query(
      "UPDATE orders SET created_at=((now() AT TIME ZONE 'Asia/Kolkata')::date::timestamp AT TIME ZONE 'Asia/Kolkata')+interval '1 minute' WHERE id=$1",
      [dine.id],
    );
  });
  const after = (await s.workspace(db, owner)).metrics;
  assert.equal(Number(after.orders), Number(baseline.orders) + 3);
  assert.equal(Number(after.dineIn), Number(baseline.dineIn) + 1);
  assert.equal(Number(after.takeaway), Number(baseline.takeaway) + 1);
  assert.equal(Number(after.settled), Number(baseline.settled));
  assert.equal(
    (
      await s.workspace(db, {
        ...owner,
        role: "WAITER",
        outletIds: [w.outletId],
      })
    ).metrics,
    undefined,
  );
});

test("order summary counts every authorized order beyond the recent-list limit and maps cancelled states", async () => {
  const before = (await s.workspace(db, owner)).orderCounts;
  await db.transaction(owner.restroId, async (tx) => {
    await tx.query(
      "INSERT INTO orders(id,restro_id,outlet_id,source,type,created_by,status) SELECT gen_random_uuid(),$1,$2,'CASHIER_POS','TAKEAWAY',$3,'PENDING' FROM generate_series(1,205)",
      [owner.restroId, w.outletId, owner.employeeId],
    );
    for (const status of ["ACCEPTED", "VOIDED", "REJECTED"])
      await tx.query(
        "INSERT INTO orders(id,restro_id,outlet_id,source,type,created_by,status) VALUES($1,$2,$3,'CASHIER_POS','TAKEAWAY',$4,$5)",
        [key(), owner.restroId, w.outletId, owner.employeeId, status],
      );
  });
  const after = await s.workspace(db, owner);
  assert.equal(after.orders.length, 200);
  for (const [name, delta] of [
    ["All", 208],
    ["Active", 206],
    ["Pending", 205],
    ["Accepted", 1],
    ["Cancelled", 1],
    ["Rejected", 1],
    ["Settled", 0],
  ] as const)
    assert.equal(
      Number(after.orderCounts[name]),
      Number(before[name]) + delta,
      name,
    );
});

test("order summary does not classify audited table moves as prepared-food reallocation", async () => {
  const a = await visit(),
    b = await visit(),
    baseline = Number((await s.workspace(db, owner)).orderCounts.Reallocated);
  const first = await order(a.id, false),
    before = await financial();
  const move = () =>
    s.exchangeTables(db, owner, key(), {
      sourceTableId: a.tableId,
      targetTableId: b.tableId,
      reason: "Move synthetic guests",
    });
  await move();
  assert.deepEqual(await financial(), before);
  let current = await s.workspace(db, owner);
  assert.equal(Number(current.orderCounts.Reallocated), baseline);
  assert.equal(
    current.orders.find((o: any) => o.id === first.id).reallocated,
    false,
  );
  const later = await order(a.id, false);
  current = await s.workspace(db, owner);
  assert.equal(
    current.orders.find((o: any) => o.id === later.id).reallocated,
    false,
  );
  await move();
  await move();
  assert.equal(
    Number((await s.workspace(db, owner)).orderCounts.Reallocated),
    baseline,
  );
  const legacy = await visit(),
    legacyTarget = await visit(),
    oldOrder = await order(legacy.id, false);
  await db.transaction(owner.restroId, async (tx) => {
    await tx.query(
      "UPDATE table_sessions SET table_id=$2,label='LEGACY' WHERE id=$1",
      [legacy.id, legacyTarget.tableId],
    );
    await audit(tx, owner, {
      action: "TABLES_EXCHANGED",
      entityType: "TABLE",
      entityId: legacy.tableId,
      outletId: w.outletId,
      tableId: legacy.tableId,
      newState: {
        targetTableId: legacyTarget.tableId,
        sessionIds: [legacy.id],
      },
      reason: "Legacy move fixture",
    });
  });
  const postLegacy = await order(legacy.id, false);
  current = await s.workspace(db, owner);
  assert.equal(
    current.orders.find((o: any) => o.id === oldOrder.id).reallocated,
    false,
  );
  assert.equal(
    current.orders.find((o: any) => o.id === postLegacy.id).reallocated,
    false,
  );
  assert.equal(Number(current.orderCounts.Reallocated), baseline);
  assert.equal((await s.verifyAudit(db, owner)).valid, true);
});

test("order summaries and movement flags retain waiter assignment, outlet and tenant boundaries", async () => {
  const a = await visit(),
    b = await visit(),
    first = await order(a.id, false);
  const staff = await s.addEmployee(db, owner, key(), {
    name: "Count waiter",
    email: `count-${key()}@example.test`,
    password: "count-waiter-password",
    role: "WAITER",
    outletIds: [w.outletId],
  });
  await db.transaction(owner.restroId, (tx) =>
    tx.query("UPDATE table_sessions SET owner_employee_id=$2 WHERE id=$1", [
      a.id,
      staff.id,
    ]),
  );
  await s.exchangeTables(db, owner, key(), {
    sourceTableId: a.tableId,
    targetTableId: b.tableId,
    reason: "Move count waiter guests",
  });
  const actor: Actor = {
      ...owner,
      employeeId: staff.id,
      role: "WAITER",
      outletIds: [w.outletId],
    },
    visible = await s.workspace(db, actor);
  assert.equal(Number(visible.orderCounts.All), 1);
  assert.equal(Number(visible.orderCounts.Reallocated), 0);
  assert.deepEqual(
    visible.orders.map((o: any) => o.id),
    [first.id],
  );
  assert.equal(
    Number((await s.workspace(db, foreign)).orderCounts.Reallocated),
    0,
  );
  await assert.rejects(
    () => s.workspace(db, { ...actor, outletIds: [] }, w.outletId),
    { code: "OUTLET_FORBIDDEN" },
  );
});
