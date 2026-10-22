import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createEmbeddedDatabase,
  createPostgresDatabase,
  type Database,
} from "@dinerdost/database";
import { type Actor } from "@dinerdost/core";
import * as s from "@dinerdost/services";
let db: Database, owner: Actor, foreign: Actor, w: any;
const key = () => randomUUID();
before(async () => {
  db = process.env.TEST_DATABASE_URL
    ? createPostgresDatabase(process.env.TEST_DATABASE_URL)
    : await createEmbeddedDatabase();
  await db.migrate();
  for (const index of [0, 1]) {
    const a = await s.signup(
      db,
      {
        name: "Merge QA Owner",
        email: `merge-${index}@example.test`,
        password: "merge-demerge-tests-123",
        restaurant: "Merge QA",
        outlet: "Main",
        qrEnabled: true,
        demo: true,
      },
      "merge-" + index,
    );
    const actor = await s.authenticate(db, a.token);
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
  return { ...session, tableId: table.id };
}
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
    ])
      result[table] = (
        await tx.query(`SELECT * FROM ${table} ORDER BY id`)
      ).rows;
    return result;
  });
}
const merge = (parentId: string, childId: string) =>
  s.sessionMerge(db, owner, key(), {
    parentId,
    childId,
    reason: "Join guest tables",
  });

test("merged web billing reads linked visits without combining ledgers or exposing another waiter's orders", async () => {
  const a = await visit(),
    b = await visit();
  const input = {
    outletId: w.outletId,
    type: "DINE_IN",
    items: [{ itemId: w.menu[0].id, quantity: 1 }],
  };
  const first = await s.createRound(
    db,
    owner,
    key(),
    { ...input, sessionId: a.id },
    true,
  );
  const second = await s.createRound(
    db,
    owner,
    key(),
    { ...input, sessionId: b.id },
    true,
  );
  await merge(a.id, b.id);
  const before = await financial();
  assert.equal((await s.getTableBills(db, owner, a.tableId)).orders.length, 1);
  for (const tableId of [a.tableId, b.tableId]) {
    const bill = await s.getTableBills(db, owner, tableId, true);
    assert.equal(bill.members.length, 2);
    assert.deepEqual(
      new Set(bill.orders.map((o) => o.id)),
      new Set([first.id, second.id]),
    );
  }
  const waiter = await s.addEmployee(db, owner, key(), {
    name: "Merged waiter",
    email: "merged-waiter@example.test",
    password: "merged-waiter-password-123",
    role: "WAITER",
    outletIds: [w.outletId],
  });
  await db.transaction(owner.restroId, (tx) =>
    tx.query("UPDATE table_sessions SET owner_employee_id=$2 WHERE id=$1", [
      b.id,
      waiter.id,
    ]),
  );
  const actor = { ...owner, role: "WAITER" as const, employeeId: waiter.id };
  assert.equal(
    (await s.getTableBills(db, actor, a.tableId, true)).orders.length,
    0,
  );
  assert.deepEqual(
    (await s.getTableBills(db, actor, b.tableId, true)).orders.map((o) => o.id),
    [second.id],
  );
  await assert.rejects(() => s.getTableBills(db, foreign, a.tableId, true), {
    code: "NOT_FOUND",
  });
  await assert.rejects(
    () => s.getTableBills(db, { ...actor, outletIds: [] }, b.tableId, true),
    { code: "OUTLET_FORBIDDEN" },
  );
  assert.deepEqual(await financial(), before);
});

test("merge/demerge repeat cycles preserve occupied sessions, orders, paid bills and QR identity", async () => {
  const a = await visit(),
    b = await visit(),
    c = await visit();
  const o = await s.createRound(
    db,
    owner,
    key(),
    {
      outletId: w.outletId,
      sessionId: b.id,
      type: "DINE_IN",
      customer: { name: "Merge Guest", phone: "9123456101" },
      items: [{ itemId: w.menu[0].id, quantity: 1 }],
    },
    true,
  );
  await s.reviewRewards(db, owner, key(), o.id, o.rounds[0].id);
  let d = await db.transaction(owner.restroId, (tx) =>
    s.orderDetail(tx, owner, o.id),
  );
  await s.recordPayment(db, owner, key(), o.id, d.rounds[0].id, {
    version: d.rounds[0].version,
    method: "CASH",
    amount: Number(d.rounds[0].payable),
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
  const before = await financial();
  const identities = (await s.workspace(db, owner)).tables.map((t: any) => [
    t.id,
    t.public_key,
  ]);
  await merge(a.id, b.id);
  await merge(a.id, c.id);
  const detach = {
      parentId: a.id,
      childId: b.id,
      reason: "Guests requested separate tables",
    },
    retry = key();
  await s.sessionDemerge(db, owner, retry, detach);
  await s.sessionDemerge(db, owner, retry, detach);
  let sessions = (await s.workspace(db, owner)).sessions;
  assert.equal(sessions.find((v: any) => v.id === b.id).parent_id, null);
  assert.equal(sessions.find((v: any) => v.id === c.id).parent_id, a.id);
  await merge(a.id, b.id);
  await s.sessionDemerge(db, owner, key(), detach);
  await s.sessionDemerge(db, owner, key(), { ...detach, childId: c.id });
  sessions = (await s.workspace(db, owner)).sessions;
  for (const v of [a, b, c]) {
    const current = sessions.find((session: any) => session.id === v.id);
    assert.equal(current.table_id, v.tableId);
    assert.equal(current.status, "OPEN");
    assert.equal(current.parent_id, null);
  }
  assert.deepEqual(await financial(), before);
  assert.deepEqual(
    (await s.workspace(db, owner)).tables.map((t: any) => [t.id, t.public_key]),
    identities,
  );
  assert.equal(
    (await s.getTableBills(db, owner, b.tableId)).orders[0].id,
    o.id,
  );
  assert.equal((await s.verifyAudit(db, owner)).valid, true);
});

test("demerge enforces tenant, role, outlet, ownership and current group, with no partial changes", async () => {
  const a = await visit(),
    b = await visit(),
    c = await visit();
  await merge(a.id, b.id);
  const input = {
    parentId: a.id,
    childId: b.id,
    reason: "Separate guest tables",
  };
  for (const [actor, code] of [
    [foreign, "NOT_FOUND"],
    [{ ...owner, role: "CHEF" }, "FORBIDDEN"],
    [{ ...owner, role: "WAITER", outletIds: [] }, "OUTLET_FORBIDDEN"],
    [{ ...owner, role: "WAITER", employeeId: key() }, "TABLE_NOT_ASSIGNED"],
  ] as const)
    await assert.rejects(
      () => s.sessionDemerge(db, actor as Actor, key(), input),
      { code },
    );
  await assert.rejects(
    () => s.sessionDemerge(db, owner, key(), { ...input, parentId: c.id }),
    { code: "MERGE_CHANGED" },
  );
  assert.equal(
    (await s.workspace(db, owner)).sessions.find((v: any) => v.id === b.id)
      .parent_id,
    a.id,
  );
  await s.sessionDemerge(db, owner, key(), input);
  await assert.rejects(() => s.sessionDemerge(db, owner, key(), input), {
    code: "MERGE_CHANGED",
  });
});

test("concurrent merges cannot create chains, and a closed parent can be safely detached", async () => {
  const a = await visit(),
    b = await visit(),
    c = await visit();
  await merge(a.id, b.id);
  await assert.rejects(() => merge(c.id, a.id), {
    code: "MERGE_CHAIN_BLOCKED",
  });
  const split = await s.openSession(db, owner, key(), {
    tableId: c.tableId,
    guests: 1,
    label: "A",
  });
  await assert.rejects(() => merge(c.id, split.id), { code: "INVALID_MERGE" });
  await s.closeSession(db, owner, key(), a.id, {
    reason: "Parent guests left",
  });
  await s.sessionDemerge(db, owner, key(), {
    parentId: a.id,
    childId: b.id,
    reason: "Separate remaining guests",
  });
  const x = await visit(),
    y = await visit(),
    z = await visit();
  const results = await Promise.allSettled([
    merge(x.id, z.id),
    merge(y.id, z.id),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.filter((r) => r.status === "rejected").length, 1);
  const current = (await s.workspace(db, owner)).sessions.find(
    (v: any) => v.id === z.id,
  );
  assert.ok([x.id, y.id].includes(current.parent_id));
  assert.equal((await s.verifyAudit(db, owner)).valid, true);
});
