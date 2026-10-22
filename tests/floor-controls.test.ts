import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createEmbeddedDatabase,
  createPostgresDatabase,
  type Database,
} from "@dinerdost/database";
import {
  floorOutline,
  objectInFloor,
  validFloorOutline,
  type Actor,
} from "@dinerdost/core";
import * as s from "@dinerdost/services";
let db: Database, owner: Actor, w: any;
const key = () => randomUUID();
before(async () => {
  db = process.env.TEST_DATABASE_URL
    ? createPostgresDatabase(process.env.TEST_DATABASE_URL)
    : await createEmbeddedDatabase();
  await db.migrate();
  const account = await s.signup(
    db,
    {
      name: "Floor controls",
      email: "floor-controls@example.test",
      password: "floor-controls-test-123",
      restaurant: "Custom floors",
      outlet: "Main",
      qrEnabled: true,
      demo: true,
    },
    "floor-controls",
  );
  owner = await s.authenticate(db, account.token);
  w = await s.workspace(db, owner);
});
after(async () => {
  await db?.close();
});
async function policy(autoActivate: boolean) {
  const outlet = (await s.workspace(db, owner)).outlets[0];
  return s.setQrPolicy(db, owner, key(), {
    outletId: outlet.id,
    version: outlet.version,
    enabled: true,
    autoActivate,
  });
}
test("management switches staff/automatic activation; concurrent scans share one session and disabling preserves active visits", async () => {
  const table = w.tables[0],
    device = "policy-guest";
  let visit = await s.connectGuest(db, table.public_key, device, "policy");
  assert.equal(
    (await s.guestCatalog(db, table.public_key, visit.token, device))
      .activationRequired,
    true,
  );
  await s.guestService(db, table.public_key, visit.token, device, key(), {
    kind: "ACTIVATE_TABLE",
  });
  await policy(true);
  await Promise.all([
    s.connectGuest(db, table.public_key, device, "policy", visit.token),
    s.connectGuest(db, table.public_key, "policy-guest-2", "policy-2"),
  ]);
  let current = await s.workspace(db, owner),
    sessions = current.sessions.filter(
      (session: any) => session.table_id === table.id,
    );
  assert.equal(sessions.length, 1);
  assert.equal(
    (await s.guestCatalog(db, table.public_key, visit.token, device))
      .activationRequired,
    false,
  );
  assert.equal(
    current.tasks.find(
      (task: any) =>
        task.table_id === table.id && task.kind === "ACTIVATE_TABLE",
    )?.state,
    "COMPLETED",
  );
  await policy(false);
  assert.equal(
    (await s.guestCatalog(db, table.public_key, visit.token, device))
      .activationRequired,
    false,
  );
  const inactive = w.tables[1],
    pending = await s.connectGuest(
      db,
      inactive.public_key,
      "staff-mode",
      "staff-mode",
    );
  assert.equal(
    (await s.guestCatalog(db, inactive.public_key, pending.token, "staff-mode"))
      .activationRequired,
    true,
  );
  const outlet = (await s.workspace(db, owner)).outlets[0];
  await assert.rejects(
    s.setQrPolicy(db, { ...owner, role: "CASHIER" }, key(), {
      outletId: w.outletId,
      version: outlet.version,
      enabled: true,
      autoActivate: true,
    }),
    { code: "FORBIDDEN" },
  );
  await assert.rejects(
    s.setQrPolicy(db, owner, key(), {
      outletId: w.outletId,
      version: outlet.version - 1,
      enabled: true,
      autoActivate: true,
    }),
    { code: "VERSION_CONFLICT" },
  );
});
test("auto activation preserves reservations, ambiguous separate bills, disabled ordering, and idle expiry", async () => {
  await policy(true);
  const reserved = w.tables[2],
    split = w.tables[3];
  await s.saveRecord(db, owner, key(), "reservations", {
    outletId: w.outletId,
    title: "Reserved guest",
    data: {
      tableId: reserved.id,
      guest: "Reserved Guest",
      phone: "9123456888",
      guests: 2,
      at: new Date(Date.now() + 600000).toISOString(),
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
    "reserved-policy",
    "reserved-policy",
  );
  assert.equal(
    (
      await s.guestCatalog(
        db,
        reserved.public_key,
        visit.token,
        "reserved-policy",
      )
    ).activationRequired,
    true,
  );
  await s.guestService(
    db,
    reserved.public_key,
    visit.token,
    "reserved-policy",
    key(),
    { kind: "HELP" },
  );
  await s.openSession(db, owner, key(), {
    tableId: split.id,
    guests: 1,
    label: "A",
  });
  await s.openSession(db, owner, key(), {
    tableId: split.id,
    guests: 1,
    label: "B",
  });
  const separate = await s.connectGuest(
    db,
    split.public_key,
    "split-policy",
    "split-policy",
  );
  assert.equal(
    (await s.guestCatalog(db, split.public_key, separate.token, "split-policy"))
      .activationRequired,
    true,
  );
  assert.equal(
    (await s.workspace(db, owner)).sessions.filter(
      (session: any) => session.table_id === split.id,
    ).length,
    2,
  );
  const table = w.tables[0];
  await db.query(
    "UPDATE table_sessions SET last_activity_at=now()-interval '11 minutes' WHERE table_id=$1",
    [table.id],
  );
  const expired = await s.guestCatalog(db, table.public_key);
  assert.equal(expired.activationRequired, true);
  assert.equal(
    (await s.workspace(db, owner)).sessions.filter(
      (session: any) => session.table_id === table.id,
    ).length,
    0,
  );
  const rescan = await s.connectGuest(
    db,
    table.public_key,
    "rescan-policy",
    "rescan-policy",
  );
  assert.equal(
    (await s.guestCatalog(db, table.public_key, rescan.token, "rescan-policy"))
      .activationRequired,
    false,
  );
  const outlet = (await s.workspace(db, owner)).outlets[0];
  await s.setQrPolicy(db, owner, key(), {
    outletId: w.outletId,
    version: outlet.version,
    enabled: false,
  });
  await assert.rejects(
    s.connectGuest(
      db,
      w.tables[4].public_key,
      "paused-policy",
      "paused-policy",
    ),
    { code: "QR_DISABLED" },
  );
  await s.setQrPolicy(db, owner, key(), {
    outletId: w.outletId,
    version: outlet.version + 1,
    enabled: true,
    autoActivate: false,
  });
});
test("custom floors add/rename with version and role guards while retaining table, QR, sessions and saved outlines", async () => {
  const input = { outletId: w.outletId, name: "Rooftop" },
    request = key();
  await s.saveFloor(db, owner, request, input);
  await s.saveFloor(db, owner, request, input);
  await s.saveFloor(db, owner, key(), { outletId: w.outletId, name: "Garden" });
  await assert.rejects(
    s.saveFloor(db, owner, key(), { ...input, name: "rooftop" }),
    { code: "FLOOR_NAME_TAKEN" },
  );
  const t = w.tables[0],
    outline = floorOutline("L-shaped", { width: 1200, height: 800 });
  await s.saveFloorPlan(db, owner, key(), {
    outletId: w.outletId,
    floor: t.floor,
    version: 0,
    outline,
    objects: [
      {
        id: "existing",
        kind: "TABLE",
        tableId: t.id,
        label: t.label,
        x: 50,
        y: 60,
        width: 150,
        height: 100,
      },
    ],
  });
  const before = await s.workspace(db, owner),
    session = before.sessions.find((session: any) => session.table_id === t.id);
  await s.saveFloor(db, owner, key(), {
    outletId: w.outletId,
    previousName: t.floor,
    name: "Ground lounge",
    version: 1,
  });
  const after = await s.workspace(db, owner),
    table = after.tables.find((table: any) => table.id === t.id),
    plan = after.floorPlans.find((plan: any) => plan.floor === "Ground lounge");
  assert.equal(table.public_key, t.public_key);
  assert.equal(table.floor, "Ground lounge");
  assert.deepEqual(plan.outline, outline);
  await s.updateTableCapacity(db,owner,key(),{tableId:t.id,version:table.version,seats:table.seats,floor:"Garden"});
  const moved=await s.workspace(db,owner);
  assert.equal(moved.tables.find((table:any)=>table.id===t.id).floor,"Garden");
  assert.equal(moved.tables.find((table:any)=>table.id===t.id).public_key,t.public_key);
  assert.equal(moved.floorPlans.find((plan:any)=>plan.floor==="Ground lounge").objects.length,0);
  assert.ok(moved.sessions.some((entry:any)=>entry.id===session.id && entry.table_id===t.id));
  assert.equal(
    after.sessions.find((entry: any) => entry.id === session.id).table_id,
    t.id,
  );
  await assert.rejects(
    s.saveFloor(db, owner, key(), {
      outletId: w.outletId,
      previousName: "Ground lounge",
      name: "Lobby",
      version: 1,
    }),
    { code: "VERSION_CONFLICT" },
  );
  await assert.rejects(
    s.saveFloor(db, { ...owner, role: "WAITER" }, key(), {
      outletId: w.outletId,
      name: "Hidden",
    }),
    { code: "FORBIDDEN" },
  );
  await assert.rejects(
    s.saveFloor(db, { ...owner, role: "MANAGER", outletIds: [] }, key(), {
      outletId: w.outletId,
      name: "Hidden",
    }),
    { code: "OUTLET_FORBIDDEN" },
  );
});
test("concave outlines reject crossing edges and tables over cut-outs; old clients retain the saved outline", async () => {
  const area = { width: 1200, height: 800 },
    outline = floorOutline("U-shaped", area),
    base = {
      id: "fixture",
      kind: "WALL" as const,
      label: "Wall",
      x: 50,
      y: 50,
      width: 100,
      height: 100,
    };
  assert.equal(validFloorOutline(outline, area), true);
  assert.equal(objectInFloor(base, outline), true);
  assert.equal(
    objectInFloor({ ...base, x: 200, width: 800, height: 500 }, outline),
    false,
  );
  assert.equal(
    validFloorOutline(
      [
        { x: 0, y: 0 },
        { x: 1200, y: 800 },
        { x: 1200, y: 0 },
        { x: 0, y: 800 },
      ],
      area,
    ),
    false,
  );
  await s.saveFloorPlan(db, owner, key(), {
    outletId: w.outletId,
    floor: "Rooftop",
    version: 1,
    outline,
    objects: [base],
  });
  await s.saveFloorPlan(db, owner, key(), {
    outletId: w.outletId,
    floor: "Rooftop",
    version: 2,
    objects: [{ ...base, x: 60 }],
  });
  assert.deepEqual(
    (await s.workspace(db, owner)).floorPlans.find(
      (p: any) => p.floor === "Rooftop",
    ).outline,
    outline,
  );
  await assert.rejects(
    s.saveFloorPlan(db, owner, key(), {
      outletId: w.outletId,
      floor: "Rooftop",
      version: 3,
      outline,
      objects: [{ ...base, x: 200, width: 800, height: 500 }],
    }),
    { code: "OUTSIDE_FLOOR_OUTLINE" },
  );
  assert.equal((await s.verifyAudit(db, owner)).valid, true);
});
