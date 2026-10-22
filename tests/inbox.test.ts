import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createEmbeddedDatabase,
  createPostgresDatabase,
  type Database,
} from "@dinerdost/database";
import type { Actor } from "@dinerdost/core";
import * as s from "@dinerdost/services";
let db: Database, owner: Actor, outletId: string, table: any, menu: any;
const key = () => randomUUID();
before(async () => {
  db = process.env.TEST_DATABASE_URL
    ? createPostgresDatabase(process.env.TEST_DATABASE_URL)
    : await createEmbeddedDatabase();
  await db.migrate();
  const account = await s.signup(
    db,
    {
      name: "Inbox owner",
      email: "inbox@example.test",
      password: "inbox-owner-password-123",
      restaurant: "Inbox QA",
      outlet: "Main",
      qrEnabled: true,
      demo: true,
    },
    "inbox",
  );
  owner = await s.authenticate(db, account.token);
  const data = await s.workspace(db, owner);
  outletId = data.outletId;
  table = data.tables[0];
  menu = data.menu[0];
});
after(async () => {
  await db?.close();
});
test("table activation and order notifications persist per account and never expose audit payloads", async () => {
  const visit = await s.connectGuest(
    db,
    table.public_key,
    "inbox-device",
    "inbox",
  );
  await s.guestService(
    db,
    table.public_key,
    visit.token,
    "inbox-device",
    key(),
    { kind: "ACTIVATE_TABLE" },
  );
  let feed = await s.notificationInbox(db, owner, { outletId });
  assert.equal(feed.items.length, 1);
  assert.equal(feed.unread, 1);
  assert.equal(
    feed.items[0].title,
    "Table activation requested · " + table.label,
  );
  const activation = feed.items[0];
  assert.equal(activation.path, "/app/tasks");
  assert.equal("newState" in activation, false);
  await s.readNotifications(db, owner, { outletId, ids: [activation.id] });
  feed = await s.notificationInbox(db, owner, { outletId });
  assert.equal(feed.unread, 0);
  assert.equal(feed.items[0].read, true);
  await s.openSession(db, owner, key(), { tableId: table.id, guests: 2 });
  await s.guestSubmit(
    db,
    table.public_key,
    visit.token,
    "inbox-device",
    key(),
    {
      name: "Private guest",
      phone: "9123456789",
      items: [{ itemId: menu.id, quantity: 1 }],
    },
  );
  feed = await s.notificationInbox(db, owner, { outletId });
  assert.equal(feed.unread, 1);
  assert.equal(feed.items.length, 2);
  assert.match(feed.items[0].title, /New order #/);
  assert.match(feed.items[0].path, /\/app\/orders\//);
  assert.equal(JSON.stringify(feed).includes("9123456789"), false);
  assert.equal(JSON.stringify(feed).includes("Private guest"), false);
  await s.readNotifications(db, owner, { outletId, through: feed.latest });
  assert.equal((await s.notificationInbox(db, owner, { outletId })).unread, 0);
});
test("notification history obeys current roles, outlets, waiter ownership and tenant isolation", async () => {
  const chef = {
    ...owner,
    employeeId: randomUUID(),
    role: "KITCHEN" as const,
    outletIds: [outletId],
  };
  assert.equal(
    (await s.notificationInbox(db, chef, { outletId })).items.length,
    0,
  );
  const waiter = {
    ...owner,
    employeeId: randomUUID(),
    role: "WAITER" as const,
    outletIds: [outletId],
  };
  assert.equal(
    (await s.notificationInbox(db, waiter, { outletId })).items.length,
    0,
  );
  await assert.rejects(
    () => s.notificationInbox(db, { ...waiter, outletIds: [] }, { outletId }),
    { code: "OUTLET_FORBIDDEN" },
  );
  const other = await s.signup(
    db,
    {
      name: "Other owner",
      email: "other-inbox@example.test",
      password: "other-inbox-password-123",
      restaurant: "Other inbox",
      outlet: "Main",
      qrEnabled: false,
      demo: true,
    },
    "other-inbox",
  );
  const actor = await s.authenticate(db, other.token);
  const data = await s.workspace(db, actor);
  assert.equal(
    (await s.notificationInbox(db, actor, { outletId: data.outletId })).items
      .length,
    0,
  );
  const foreign = (await s.notificationInbox(db, owner, { outletId })).items[0]
    .id;
  await s.readNotifications(db, actor, {
    outletId: data.outletId,
    ids: [foreign],
  });
  assert.equal(
    (
      await db.query(
        "SELECT * FROM notification_reads WHERE employee_id=$1 AND event_id=$2",
        [actor.employeeId, foreign],
      )
    ).rows.length,
    0,
  );
});
test("pagination has no duplicate events and mark-all uses the displayed cursor", async () => {
  const event = (
    await db.query<any>(
      "SELECT * FROM audit_events WHERE action='CUSTOMER_SERVICE_REQUESTED' LIMIT 1",
    )
  ).rows[0];
  // Real events are emitted through normal service requests and immutable audit writes.
  for (let i = 0; i < 53; i++) {
    const device = "pagination-" + i;
    await s.guestService(
      db,
      table.public_key,
      (await s.connectGuest(db, table.public_key, device, device)).token,
      device,
      key(),
      { kind: "WATER" },
    );
    const task = (await s.workspace(db, owner)).tasks.find(
      (t: any) => t.kind === "WATER" && t.state === "OPEN",
    );
    if (task) {
      await s.serviceTask(db, owner, key(), {
        id: task.id,
        sessionId: task.session_id,
        kind: "WATER",
        state: "ACCEPTED",
      });
      await s.serviceTask(db, owner, key(), {
        id: task.id,
        sessionId: task.session_id,
        kind: "WATER",
        state: "COMPLETED",
      });
    }
  }
  const first = await s.notificationInbox(db, owner, { outletId });
  assert.equal(first.items.length, 50);
  assert.ok(first.next);
  const second = await s.notificationInbox(db, owner, {
    outletId,
    before: first.next!,
  });
  assert.ok(second.items.length > 0);
  assert.equal(
    new Set([...first.items, ...second.items].map((e) => e.id)).size,
    first.items.length + second.items.length,
  );
  await s.readNotifications(db, owner, { outletId, through: first.latest });
  assert.equal((await s.notificationInbox(db, owner, { outletId })).unread, 0);
  await assert.rejects(() =>
    s.readNotifications(db, owner, {
      outletId,
      through: first.latest,
      ids: [event.id],
    }),
  );
});
