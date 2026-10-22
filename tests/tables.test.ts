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

let db: Database, actor: Actor, outletId: string, tables: any[], menu: any[];
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
      name: "Tables Owner",
      email: "tables-owner@example.test",
      password: "tables-test-password-123",
      restaurant: "Tables QA",
      outlet: "Main",
      qrEnabled: true,
      demo: true,
    },
    "tables-qa",
  );
  actor = await s.authenticate(db, account.token);
  const workspace = await s.workspace(db, actor);
  outletId = workspace.outletId;
  tables = workspace.tables;
  menu = workspace.menu;
});
after(async () => {
  await db?.close();
});
async function activate(table: any, device: string) {
  const visit = await s.connectGuest(db, table.public_key, device, device);
  await s.openSession(db, actor, key(), { tableId: table.id, guests: 1 });
  return visit;
}
const age = (table: any, minutes: number) =>
  db.query(
    "UPDATE table_sessions SET last_activity_at=now()-$2*interval '1 minute' WHERE table_id=$1 AND status<>'CLOSED'",
    [table.id, minutes],
  );

test("scanning and requesting activation never open a table; only staff activation unlocks the visit", async () => {
  const table = tables[0],
    device = "scan-activation";
  assert.equal(
    (await s.guestCatalog(db, table.public_key)).activationRequired,
    true,
  );
  assert.equal(
    (
      await db.query("SELECT id FROM table_sessions WHERE table_id=$1", [
        table.id,
      ])
    ).rows.length,
    0,
  );
  const visit = await s.connectGuest(db, table.public_key, device, "scan");
  const catalog = await s.guestCatalog(
    db,
    table.public_key,
    visit.token,
    device,
  );
  assert.equal(catalog.activationRequired, true);
  assert.equal(catalog.activationRequested, false);
  assert.equal(catalog.menu.length, 0);
  assert.equal(
    (await s.connectGuest(db, table.public_key, device, "scan", visit.token))
      .token,
    visit.token,
  );
  const another = await s.connectGuest(
    db,
    table.public_key,
    "another-guest",
    "another",
  );
  const otherCatalog = await s.guestCatalog(
    db,
    table.public_key,
    another.token,
    "another-guest",
  );
  assert.equal(otherCatalog.activationRequired, true);
  assert.equal(otherCatalog.order, null);
  await s.guestService(db, table.public_key, visit.token, device, key(), {
    kind: "HELP",
  });
  await Promise.all([
    s.guestService(db, table.public_key, visit.token, device, key(), {
      kind: "ACTIVATE_TABLE",
    }),
    s.guestService(
      db,
      table.public_key,
      another.token,
      "another-guest",
      key(),
      { kind: "ACTIVATE_TABLE" },
    ),
  ]);
  assert.equal(
    (await s.guestCatalog(db, table.public_key, visit.token, device))
      .activationRequested,
    true,
  );
  assert.equal(
    (
      await db.query("SELECT id FROM table_sessions WHERE table_id=$1", [
        table.id,
      ])
    ).rows.length,
    0,
  );
  const request = (await s.workspace(db, actor)).tasks.find(
    (task: any) => task.table_id === table.id && task.kind === "ACTIVATE_TABLE",
  );
  assert.ok(request);
  assert.equal(
    (
      await db.query(
        "SELECT id FROM service_requests WHERE table_id=$1 AND kind='ACTIVATE_TABLE'",
        [table.id],
      )
    ).rows.length,
    1,
  );
  await assert.rejects(
    () =>
      s.guestSubmit(db, table.public_key, visit.token, device, key(), {
        name: "Activation Guest",
        phone: "9123456790",
        items: [{ itemId: menu[0].id, quantity: 1 }],
      }),
    { code: "TABLE_ACTIVATION_REQUIRED" },
  );
  await assert.rejects(
    () =>
      s.guestService(db, table.public_key, visit.token, device, key(), {
        kind: "WATER",
      }),
    { code: "TABLE_ACTIVATION_REQUIRED" },
  );
  await assert.rejects(
    () => s.guestActivity(db, table.public_key, visit.token, device),
    { code: "TABLE_ACTIVATION_REQUIRED" },
  );
  await assert.rejects(
    () =>
      s.openSession(
        db,
        { ...actor, role: "KITCHEN", outletIds: [outletId] },
        key(),
        { tableId: table.id, guests: 2, activationRequestId: request.id },
      ),
    { code: "FORBIDDEN" },
  );
  await assert.rejects(
    () =>
      s.openSession(db, { ...actor, role: "CASHIER", outletIds: [] }, key(), {
        tableId: table.id,
        guests: 2,
        activationRequestId: request.id,
      }),
    { code: "OUTLET_FORBIDDEN" },
  );
  await assert.rejects(
    () =>
      s.serviceTask(db, actor, key(), {
        id: request.id,
        kind: "ACTIVATE_TABLE",
        state: "COMPLETED",
      }),
    { code: "STAFF_ACTIVATION_REQUIRED" },
  );
  const activationKey = key(),
    input = { tableId: table.id, guests: 2, activationRequestId: request.id };
  const opened = await s.openSession(db, actor, activationKey, input);
  assert.equal(
    (await s.openSession(db, actor, activationKey, input)).id,
    opened.id,
  );
  await assert.rejects(() => s.openSession(db, actor, key(), input), {
    code: "NOT_FOUND",
  });
  const ready = await s.guestCatalog(db, table.public_key, visit.token, device);
  assert.equal(ready.activationRequired, false);
  assert.equal(ready.activationRequested, false);
  assert.equal(ready.menu.length, menu.length);
  assert.equal(
    (
      await db.query<any>("SELECT state FROM service_requests WHERE id=$1", [
        request.id,
      ])
    ).rows[0].state,
    "COMPLETED",
  );
  await s.guestService(
    db,
    table.public_key,
    another.token,
    "another-guest",
    key(),
    { kind: "ACTIVATE_TABLE" },
  );
  const sessions = (
    await db.query<any>("SELECT * FROM table_sessions WHERE table_id=$1", [
      table.id,
    ])
  ).rows;
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].guests, 2);
  await s.guestService(db, table.public_key, visit.token, device, key(), {
    kind: "WATER",
  });
});

test("idle expiry closes visits and requests, revokes grants, and polling does not reset activity", async () => {
  const table = tables[1],
    device = "idle-guest",
    visit = await activate(table, device);
  await s.guestService(db, table.public_key, visit.token, device, key(), {
    kind: "WATER",
  });
  const beforePoll = (
    await db.query<any>(
      "SELECT last_activity_at FROM table_sessions WHERE table_id=$1",
      [table.id],
    )
  ).rows[0].last_activity_at;
  await s.guestCatalog(db, table.public_key, visit.token, device);
  await s.workspace(db, actor);
  assert.equal(
    String(
      (
        await db.query<any>(
          "SELECT last_activity_at FROM table_sessions WHERE table_id=$1",
          [table.id],
        )
      ).rows[0].last_activity_at,
    ),
    String(beforePoll),
  );
  await age(table, 11);
  await s.workspace(db, {
    ...actor,
    role: "ACCOUNTANT",
    outletIds: [outletId],
  });
  const expired = await s.guestCatalog(
    db,
    table.public_key,
    visit.token,
    device,
  );
  assert.equal(expired.activationRequired, true);
  assert.equal(expired.connected, false);
  assert.equal(expired.menu.length, 0);
  assert.equal(
    (
      await db.query<any>(
        "SELECT status FROM table_sessions WHERE table_id=$1",
        [table.id],
      )
    ).rows[0].status,
    "CLOSED",
  );
  assert.equal(
    (
      await db.query<any>(
        "SELECT state FROM service_requests WHERE table_id=$1",
        [table.id],
      )
    ).rows[0].state,
    "CANCELLED",
  );
  assert.equal(
    (
      await db.query(
        "SELECT token_hash FROM public_grants WHERE table_id=$1 AND revoked_at IS NULL",
        [table.id],
      )
    ).rows.length,
    0,
  );
  await assert.rejects(
    () => s.guestActivity(db, table.public_key, visit.token, device),
    { code: "NOT_FOUND" },
  );
  const renewed = await s.connectGuest(
    db,
    table.public_key,
    device,
    "renew",
    visit.token,
  );
  assert.equal(
    (
      await db.query(
        "SELECT id FROM table_sessions WHERE table_id=$1 AND status='OPEN'",
        [table.id],
      )
    ).rows.length,
    0,
  );
  assert.equal(
    (await s.guestCatalog(db, table.public_key, renewed.token, device))
      .activationRequired,
    true,
  );
});

test("staff can reject activation, guests can retry, and requests cannot activate another table", async () => {
  const table = tables[8],
    device = "rejected-activation";
  const visit = await s.connectGuest(db, table.public_key, device, device);
  const request = async () => {
    await s.guestService(db, table.public_key, visit.token, device, key(), {
      kind: "ACTIVATE_TABLE",
    });
    return (await s.workspace(db, actor)).tasks.find(
      (task: any) =>
        task.table_id === table.id &&
        task.kind === "ACTIVATE_TABLE" &&
        task.state === "OPEN",
    );
  };
  const pending = await request();
  await assert.rejects(
    () =>
      s.serviceTask(db, actor, key(), {
        id: pending.id,
        kind: "ACTIVATE_TABLE",
        state: "REJECTED",
        reason: "",
      }),
    { code: "REASON_REQUIRED" },
  );
  await s.serviceTask(db, actor, key(), {
    id: pending.id,
    kind: "ACTIVATE_TABLE",
    state: "REJECTED",
    reason: "Please wait for cleaning",
  });
  assert.equal(
    (await s.guestCatalog(db, table.public_key, visit.token, device))
      .activationRequested,
    false,
  );
  const retry = await request();
  assert.notEqual(retry.id, pending.id);
  await assert.rejects(
    () =>
      s.openSession(db, actor, key(), {
        tableId: tables[9].id,
        guests: 2,
        activationRequestId: retry.id,
      }),
    { code: "NOT_FOUND" },
  );
  assert.equal(
    (
      await db.query(
        "SELECT id FROM table_sessions WHERE table_id=ANY($1::uuid[])",
        [[table.id, tables[9].id]],
      )
    ).rows.length,
    0,
  );
  await s.openSession(db, actor, key(), { tableId: table.id, guests: 2 });
  assert.equal(
    (
      await db.query<any>("SELECT state FROM service_requests WHERE id=$1", [
        retry.id,
      ])
    ).rows[0].state,
    "COMPLETED",
  );
  assert.equal((await s.verifyAudit(db, actor)).valid, true);
});

test("actual customer interaction extends activity and unsettled orders prevent automatic closure", async () => {
  const table = tables[2],
    device = "active-guest",
    visit = await activate(table, device);
  await age(table, 9);
  await s.touchTableActivity(db, actor, { tableId: table.id });
  await assert.rejects(
    () =>
      s.touchTableActivity(
        db,
        { ...actor, role: "WAITER", employeeId: randomUUID() },
        { tableId: table.id },
      ),
    { code: "TABLE_NOT_ASSIGNED" },
  );
  await age(table, 9);
  await s.guestActivity(db, table.public_key, visit.token, device);
  assert.equal(
    (
      await db.query<any>(
        "SELECT last_activity_at>now()-interval '1 minute' AS fresh FROM table_sessions WHERE table_id=$1",
        [table.id],
      )
    ).rows[0].fresh,
    true,
  );
  const order = await s.guestSubmit(
    db,
    table.public_key,
    visit.token,
    device,
    key(),
    {
      name: "Active Guest",
      phone: "9123456792",
      items: [{ itemId: menu[0].id, quantity: 1 }],
    },
  );
  await age(table, 11);
  assert.equal(
    (await s.workspace(db, actor)).sessions.some(
      (session: any) => session.table_id === table.id,
    ),
    true,
  );
  assert.equal(
    (await s.guestCatalog(db, table.public_key, visit.token, device)).order?.id,
    order.id,
  );
  const staffOrder = await s.getOrder(db, actor, order.id);
  await s.decideRound(db, actor, key(), order.id, order.rounds[0].id, {
    version: staffOrder.rounds[0].version,
    decision: "REJECT",
    reason: "Guest cancelled before preparation",
  });
  assert.equal(
    (
      await db.query<any>(
        "SELECT last_activity_at>now()-interval '1 minute' AS fresh FROM table_sessions WHERE table_id=$1",
        [table.id],
      )
    ).rows[0].fresh,
    true,
  );
  await age(table, 11);
  assert.equal(
    (await s.workspace(db, actor)).sessions.some(
      (session: any) => session.table_id === table.id,
    ),
    false,
  );
});

test("split visits close together only when all are idle and reserved tables cannot self-activate", async () => {
  const table = tables[3];
  await s.openSession(db, actor, key(), { tableId: table.id, guests: 1 });
  await s.openSession(db, actor, key(), {
    tableId: table.id,
    guests: 1,
    label: "A",
  });
  await age(table, 11);
  await db.query(
    "UPDATE table_sessions SET last_activity_at=now() WHERE table_id=$1 AND label='A'",
    [table.id],
  );
  assert.equal(
    (await s.workspace(db, actor)).sessions.filter(
      (session: any) => session.table_id === table.id,
    ).length,
    2,
  );
  await age(table, 11);
  assert.equal(
    (await s.workspace(db, actor)).sessions.filter(
      (session: any) => session.table_id === table.id,
    ).length,
    0,
  );
  const reserved = tables[4],
    device = "reserved-visitor";
  const reservation = await s.saveRecord(db, actor, key(), "reservations", {
    outletId,
    title: "Booked Guest",
    data: {
      tableId: reserved.id,
      guest: "Booked Guest",
      phone: "9123456793",
      guests: 2,
      at: new Date(Date.now() + 10 * 60000).toISOString(),
      durationMinutes: 90,
      note: "",
    },
  });
  await db.query(
    "UPDATE table_reservations SET starts_at=now()-interval '1 minute' WHERE table_id=$1",
    [reserved.id],
  );
  const visit = await s.connectGuest(
    db,
    reserved.public_key,
    device,
    "reserved",
  );
  assert.equal(
    (await s.guestCatalog(db, reserved.public_key, visit.token, device))
      .activationRequired,
    true,
  );
  assert.equal(
    (
      await db.query("SELECT id FROM table_sessions WHERE table_id=$1", [
        reserved.id,
      ])
    ).rows.length,
    0,
  );
  await s.guestService(db, reserved.public_key, visit.token, device, key(), {
    kind: "HELP",
  });
  await s.guestService(db, reserved.public_key, visit.token, device, key(), {
    kind: "ACTIVATE_TABLE",
  });
  const activation = (await s.workspace(db, actor)).tasks.find(
    (task: any) =>
      task.table_id === reserved.id && task.kind === "ACTIVATE_TABLE",
  );
  await assert.rejects(
    () =>
      s.openSession(db, actor, key(), {
        tableId: reserved.id,
        guests: 2,
        activationRequestId: activation.id,
      }),
    { code: "TABLE_RESERVED" },
  );
  await assert.rejects(
    () =>
      s.guestService(db, reserved.public_key, visit.token, device, key(), {
        kind: "WATER",
      }),
    { code: "TABLE_ACTIVATION_REQUIRED" },
  );
  await s.openSession(db, actor, key(), {
    tableId: reserved.id,
    guests: 2,
    reservationId: reservation.id,
    activationRequestId: activation.id,
  });
  assert.equal(
    (await s.guestCatalog(db, reserved.public_key, visit.token, device))
      .activationRequired,
    false,
  );
});

test("floor plans persist, validate actual tables, reject stale edits and enforce owner/manager scope", async () => {
  const table = tables[5];
  const object = {
    id: "table-" + table.id,
    kind: "TABLE",
    tableId: table.id,
    label: table.label,
    x: 100,
    y: 100,
    width: 140,
    height: 100,
  };
  const input = {
    outletId,
    floor: table.floor,
    version: 0,
    objects: [
      object,
      {
        id: "entry",
        kind: "ENTRY",
        label: "Entry",
        x: 20,
        y: 700,
        width: 150,
        height: 70,
      },
    ],
  };
  const manager = { ...actor, role: "MANAGER" as const, outletIds: [outletId] };
  await assert.rejects(
    () => s.saveFloorPlan(db, { ...manager, outletIds: [] }, key(), input),
    { code: "OUTLET_FORBIDDEN" },
  );
  await assert.rejects(
    () => s.saveFloorPlan(db, { ...actor, role: "WAITER" }, key(), input),
    { code: "FORBIDDEN" },
  );
  const replay = key();
  await s.saveFloorPlan(db, manager, replay, input);
  await s.saveFloorPlan(db, manager, replay, input);
  const plan = (await s.workspace(db, actor)).floorPlans[0];
  assert.equal(plan.version, 1);
  assert.equal(plan.objects[0].tableId, table.id);
  await s.saveFloorPlan(db, manager, key(), {
    ...input,
    version: 1,
    objects: [{ ...object, x: 200 }],
  });
  await assert.rejects(
    () => s.saveFloorPlan(db, manager, key(), { ...input, version: 1 }),
    /changed|refresh/i,
  );
  await assert.rejects(
    () =>
      s.saveFloorPlan(db, manager, key(), {
        ...input,
        version: 2,
        objects: [{ ...object, tableId: randomUUID() }],
      }),
    { code: "INVALID_TABLE" },
  );
  await assert.rejects(
    () =>
      s.saveFloorPlan(db, manager, key(), {
        ...input,
        version: 2,
        objects: [object, object],
      }),
    { code: "DUPLICATE_OBJECT" },
  );
  await assert.rejects(() =>
    s.saveFloorPlan(db, manager, key(), {
      ...input,
      version: 2,
      objects: [{ ...object, x: 1190 }],
    }),
  );
  const other = await s.signup(
    db,
    {
      name: "Other Owner",
      email: "other-tables@example.test",
      password: "another-tables-test-123",
      restaurant: "Other Tables",
      outlet: "Other",
      qrEnabled: true,
      demo: true,
    },
    "other-tables",
  );
  assert.equal((await s.workspace(db, other.actor)).floorPlans.length, 0);
});

test("table billing lists separate orders without exposing another waiter's or restaurant's bills", async () => {
  const table = tables[6];
  const main = await s.openSession(db, actor, key(), {
    tableId: table.id,
    guests: 2,
  });
  const split = await s.openSession(db, actor, key(), {
    tableId: table.id,
    guests: 2,
    label: "A",
  });
  for (const session of [main, split])
    await s.createRound(db, actor, key(), {
      outletId,
      sessionId: session.id,
      type: "DINE_IN",
      items: [{ itemId: menu[0].id, quantity: 1 }],
    });
  const bills = await s.getTableBills(db, actor, table.id);
  assert.equal(bills.sessions.length, 2);
  assert.equal(bills.orders.length, 2);
  assert.equal(
    (
      await s.getTableBills(
        db,
        { ...actor, role: "WAITER", employeeId: randomUUID() },
        table.id,
      )
    ).orders.length,
    0,
  );
  await assert.rejects(
    () =>
      s.getTableBills(
        db,
        { ...actor, role: "WAITER", outletIds: [] },
        table.id,
      ),
    { code: "OUTLET_FORBIDDEN" },
  );
  const foreign = (
    await db.query<any>(
      "SELECT restro_id FROM dining_tables WHERE restro_id<>$1 LIMIT 1",
      [actor.restroId],
    )
  ).rows[0];
  await assert.rejects(
    () =>
      s.getTableBills(db, { ...actor, restroId: foreign.restro_id }, table.id),
    { code: "NOT_FOUND" },
  );
});

test("automatic table closure and floor-plan edits preserve the audit chain", async () => {
  assert.equal((await s.verifyAudit(db, actor)).valid, true);
  const auto = (
    await db.query<any>(
      "SELECT actor_role,reason FROM audit_events WHERE restro_id=$1 AND action='TABLE_AUTO_CLOSED'",
      [actor.restroId],
    )
  ).rows;
  assert.ok(auto.length >= 3);
  assert.ok(auto.every((event) => event.actor_role === "SYSTEM"));
});
