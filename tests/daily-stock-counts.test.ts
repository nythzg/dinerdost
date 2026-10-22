import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createEmbeddedDatabase,
  createPostgresDatabase,
  type Database,
} from "@dinerdost/database";
import { businessDate, type Actor } from "@dinerdost/core";
import * as s from "@dinerdost/services";
let db: Database,
  owner: Actor,
  outletId: string,
  flour: string,
  salt: string,
  liquor: string,
  meal: string,
  batchId: string;
const key = () => randomUUID();
const today = () => businessDate();
before(async () => {
  db = process.env.TEST_DATABASE_URL
    ? createPostgresDatabase(process.env.TEST_DATABASE_URL)
    : await createEmbeddedDatabase();
  await db.migrate();
  await db.migrate();
  const a = await s.signup(
    db,
    {
      name: "Count QA",
      email: "count-qa@example.test",
      password: "count-qa-password-123",
      restaurant: "Physical count QA",
      outlet: "Main",
      qrEnabled: true,
      demo: false,
    },
    "count-qa",
  );
  owner = await s.authenticate(db, a.token);
  outletId = (await s.workspace(db, owner)).outletId;
  flour = (
    await s.addIngredient(db, owner, key(), {
      outletId,
      name: "Count flour",
      unit: "kg",
    })
  ).id;
  salt = (
    await s.addIngredient(db, owner, key(), {
      outletId,
      name: "Count salt",
      unit: "kg",
    })
  ).id;
  liquor = (
    await s.addIngredient(db, owner, key(), {
      outletId,
      name: "Count liquor",
      unit: "L",
      category: "LIQUOR",
    })
  ).id;
  batchId = (await receive(flour, 10000)).id;
  meal = (
    await s.saveMenu(db, owner, key(), {
      outletId,
      name: "Count meal",
      category: "Mains",
      price: 10000,
      taxBps: 0,
      unit: "portion",
      station: "Main kitchen",
    })
  ).id;
  await s.saveRecipe(db, owner, key(), {
    itemId: meal,
    ingredients: [{ id: flour, quantityMilli: 1000 }],
  });
});
after(async () => {
  await db?.close();
});
const receive = (ingredientId: string, quantityMilli: number) =>
  s.receiveStock(
    db,
    owner,
    key(),
    {
      ingredientId,
      quantityMilli,
      batchNumber: key(),
      unitCost: 1000,
      reference: "Count QA receipt",
      expiresAt: new Date(Date.now() + 72 * 3600000).toISOString(),
    },
    true,
  );
const record = (
  phase: "OPENING" | "CLOSING",
  ingredientId: string,
  quantityMilli: number,
  version = 0,
  note = "",
  requestKey = key(),
) =>
  s.recordStockCounts(db, owner, requestKey, {
    outletId,
    date: today(),
    phase,
    counts: [{ ingredientId, quantityMilli, version }],
    note,
  });
const report = () => s.stockCountReport(db, owner, { outletId, date: today() });
const stock = async () =>
  (
    await db.query(
      "SELECT id,on_hand,reserved,unit_cost,remaining_value FROM stock_batches ORDER BY id",
    )
  ).rows;

test("opening zero and physical counts are auditable observations; reminders do not block web orders", async () => {
  const before = await stock();
  assert.equal(
    (await s.workspace(db, owner)).stockCountStatus.missingOpening,
    3,
  );
  const request = key();
  await record("OPENING", flour, 10000, 0, "Opening physical count", request);
  await record("OPENING", flour, 10000, 0, "Opening physical count", request);
  await record("OPENING", salt, 0);
  assert.equal(
    (
      await db.query(
        "SELECT id FROM daily_stock_counts WHERE ingredient_id=$1",
        [flour],
      )
    ).rows.length,
    1,
  );
  assert.deepEqual(await stock(), before);
  assert.equal(
    (await s.workspace(db, owner)).stockCountStatus.missingOpening,
    1,
  );
  const order = await s.createRound(
    db,
    owner,
    key(),
    { outletId, type: "TAKEAWAY", items: [{ itemId: meal, quantity: 2 }] },
    true,
  );
  assert.equal(order.rounds[0].status, "ACCEPTED");
  assert.equal(
    (await report()).items.find((i) => i.id === flour)!.recipeUsage,
    2000,
  );
});

test("variance includes receipts, recipe snapshots and waste; closed totals stay frozen after later movements and recipe edits", async () => {
  await receive(flour, 3000);
  await s.wasteStock(db, owner, key(), {
    batchId,
    quantityMilli: 500,
    reason: "Count QA documented spill",
  });
  const before = await stock();
  await record("CLOSING", flour, 10000);
  const row = (await report()).items.find((i) => i.id === flour)!;
  assert.equal(row.receipts, 3000);
  assert.equal(row.recipeUsage, 2000);
  assert.equal(row.waste, 500);
  assert.equal(row.other, 0);
  assert.equal(row.expectedClosing, 10500);
  assert.equal(row.variance, -500);
  assert.deepEqual(await stock(), before);
  await receive(flour, 1000);
  await s.saveRecipe(db, owner, key(), {
    itemId: meal,
    ingredients: [{ id: flour, quantityMilli: 2000 }],
  });
  const later = (await report()).items.find((i) => i.id === flour)!;
  for (const field of [
    "receipts",
    "recipeUsage",
    "waste",
    "expectedClosing",
    "variance",
  ] as const)
    assert.equal(later[field], row[field]);
});

test("count corrections append versions, preserve the ledger snapshot and reject stale, reasonless or locked-opening writes", async () => {
  const initial = (
    await db.query(
      "SELECT * FROM daily_stock_counts WHERE ingredient_id=$1 AND phase='CLOSING'",
      [flour],
    )
  ).rows[0];
  await assert.rejects(record("CLOSING", flour, 10500, 1), {
    code: "COUNT_CORRECTION_REASON",
  });
  await assert.rejects(
    record("CLOSING", flour, 10500, 0, "Correct transcription"),
    { code: "VERSION_CONFLICT" },
  );
  await record("CLOSING", flour, 10500, 1, "Correct transcription");
  const entries = (
    await db.query(
      "SELECT * FROM daily_stock_counts WHERE ingredient_id=$1 AND phase='CLOSING' ORDER BY version",
      [flour],
    )
  ).rows;
  assert.equal(entries.length, 2);
  assert.equal(Number(entries[0].quantity_milli), 10000);
  for (const field of [
    "ledger_total",
    "recipe_total",
    "receipt_total",
    "waste_total",
    "system_on_hand",
  ])
    assert.equal(String(entries[1][field]), String(initial[field]));
  assert.equal(
    new Date(String(entries[1].effective_at)).toISOString(),
    new Date(String(initial.effective_at)).toISOString(),
  );
  assert.equal((await report()).items.find((i) => i.id === flour)!.variance, 0);
  await assert.rejects(
    record("OPENING", flour, 9000, 1, "Attempt late opening edit"),
    { code: "OPENING_COUNT_LOCKED" },
  );
  assert.equal((await s.verifyAudit(db, owner)).valid, true);
});

test("counts require an opening before closing; invalid, duplicate, cross-outlet and historical writes roll back atomically", async () => {
  await assert.rejects(record("CLOSING", liquor, 0), {
    code: "OPENING_COUNT_REQUIRED",
  });
  for (const quantity of [-1, 0.5, 1000000001])
    await assert.rejects(record("OPENING", liquor, quantity));
  const input = {
    outletId,
    date: today(),
    phase: "OPENING",
    counts: [{ ingredientId: liquor, quantityMilli: 1000, version: 0 }],
  };
  await assert.rejects(
    s.recordStockCounts(db, owner, key(), {
      ...input,
      counts: [input.counts[0], input.counts[0]],
    }),
    { code: "DUPLICATE_COUNT" },
  );
  await assert.rejects(
    s.recordStockCounts(db, owner, key(), { ...input, date: "2000-01-01" }),
    { code: "COUNT_DATE_LOCKED" },
  );
  await assert.rejects(
    s.recordStockCounts(db, owner, key(), { ...input, date: "2099-01-01" }),
    { code: "COUNT_DATE_LOCKED" },
  );
  await assert.rejects(
    s.recordStockCounts(db, owner, key(), {
      ...input,
      counts: [
        ...input.counts,
        { ingredientId: key(), quantityMilli: 0, version: 0 },
      ],
    }),
    { code: "NOT_FOUND" },
  );
  assert.equal(
    (
      await db.query(
        "SELECT id FROM daily_stock_counts WHERE ingredient_id=$1",
        [liquor],
      )
    ).rows.length,
    0,
  );
  const other = await s.saveOutlet(db, owner, key(), {
    name: "Other outlet",
    code: "OTHER",
    qrEnabled: false,
    taxBps: 0,
  });
  await assert.rejects(
    s.recordStockCounts(db, owner, key(), { ...input, outletId: other.id }),
    { code: "NOT_FOUND" },
  );
});

test("inventory permissions, outlet/tenant scope and food/bar separation apply to count writes and reports", async () => {
  const cashier = { ...owner, role: "CASHIER" as const },
    bar = { ...owner, role: "BARTENDER" as const, application: "BAR" as const };
  await assert.rejects(
    s.recordStockCounts(db, cashier, key(), {
      outletId,
      date: today(),
      phase: "OPENING",
      counts: [{ ingredientId: liquor, quantityMilli: 0, version: 0 }],
    }),
    { code: "FORBIDDEN" },
  );
  await assert.rejects(s.stockCountReport(db, cashier, { outletId }), {
    code: "FORBIDDEN",
  });
  await assert.rejects(
    s.recordStockCounts(db, bar, key(), {
      outletId,
      date: today(),
      phase: "OPENING",
      counts: [{ ingredientId: salt, quantityMilli: 0, version: 1 }],
      note: "Wrong stream correction",
    }),
    { code: "STREAM_FORBIDDEN" },
  );
  const result = await s.stockCountReport(db, bar, { outletId });
  assert.deepEqual(
    result.items.map((i) => i.id),
    [liquor],
  );
  const wrongOutlet = { ...owner, role: "MANAGER" as const, outletIds: [] };
  await assert.rejects(s.stockCountReport(db, wrongOutlet, { outletId }), {
    code: "OUTLET_FORBIDDEN",
  });
  const stranger = await s.signup(
    db,
    {
      name: "Other tenant",
      email: "count-other@example.test",
      password: "count-other-password-123",
      restaurant: "Other tenant",
      outlet: "Main",
      qrEnabled: false,
      demo: false,
    },
    "count-other",
  );
  const other = await s.authenticate(db, stranger.token);
  const foreign = await db.transaction(other.restroId, (tx) =>
    tx.query("SELECT id FROM daily_stock_counts"),
  );
  assert.equal(foreign.rows.length, 0);
  await assert.rejects(s.stockCountReport(db, other, { outletId }));
  await assert.rejects(
    db.transaction(owner.restroId, (tx) =>
      tx.query("UPDATE daily_stock_counts SET quantity_milli=0"),
    ),
  );
  await assert.rejects(
    db.transaction(owner.restroId, (tx) =>
      tx.query("DELETE FROM daily_stock_counts"),
    ),
  );
});

test("search, historical incomplete days and missing recipes never invent usage or reset a count to zero", async () => {
  const filtered = await s.stockCountReport(db, owner, {
    outletId,
    search: "flour",
  });
  assert.equal(filtered.items.length, 1);
  const past = await s.stockCountReport(db, owner, {
    outletId,
    date: "2000-01-01",
  });
  assert.ok(
    past.items.every(
      (i) =>
        i.opening === null && i.expectedClosing === null && i.variance === null,
    ),
  );
  await assert.rejects(
    s.stockCountReport(db, owner, { outletId, date: "2099-01-01" }),
  );
  await s.saveMenu(db, owner, key(), {
    outletId,
    name: "No recipe dish",
    category: "Mains",
    price: 1000,
    taxBps: 0,
    unit: "portion",
    station: "Main kitchen",
  });
  assert.equal((await report()).missingRecipes, 1);
  assert.equal(
    (await report()).items.find((i) => i.id === salt)!.opening!.quantityMilli,
    0,
  );
});

test("Service read model carries guarded round readiness; direct serving requires all stations and retains audit/order totals", async () => {
  const drink = (
    await s.saveMenu(db, owner, key(), {
      outletId,
      name: "Service drink",
      category: "Drinks",
      price: 1000,
      taxBps: 0,
      unit: "portion",
      station: "Bar",
      stream: "BAR",
    })
  ).id;
  const order = await s.createRound(
    db,
    owner,
    key(),
    {
      outletId,
      type: "TAKEAWAY",
      items: [
        { itemId: meal, quantity: 1 },
        { itemId: drink, quantity: 1 },
      ],
    },
    true,
  );
  const tickets = (await s.workspace(db, owner, outletId)).tickets.filter(
    (t: any) => t.order_id === order.id,
  );
  assert.equal(tickets.length, 2);
  await s.kitchenDecision(db, owner, key(), tickets[0].id, {
    state: "PREPARING",
  });
  await s.kitchenDecision(db, owner, key(), tickets[0].id, { state: "READY" });
  let ready = (await s.workspace(db, owner, outletId)).readyTickets.filter(
    (t: any) => t.order_id === order.id,
  );
  assert.equal(ready.length, 1);
  assert.equal(ready[0].round_id, order.rounds[0].id);
  assert.notEqual(ready[0].round_kot_status, "READY");
  await assert.rejects(
    s.serveRound(db, owner, key(), order.id, order.rounds[0].id),
    { code: "FOOD_NOT_READY" },
  );
  await s.kitchenDecision(db, owner, key(), tickets[1].id, {
    state: "PREPARING",
  });
  await s.kitchenDecision(db, owner, key(), tickets[1].id, { state: "READY" });
  ready = (await s.workspace(db, owner, outletId)).readyTickets.filter(
    (t: any) => t.order_id === order.id,
  );
  assert.equal(ready.length, 2);
  assert.ok(ready.every((t: any) => t.round_kot_status === "READY"));
  await assert.rejects(
    s.serveRound(
      db,
      { ...owner, role: "KITCHEN" },
      key(),
      order.id,
      order.rounds[0].id,
    ),
    { code: "FORBIDDEN" },
  );
  const requestKey = key();
  const served = await s.serveRound(
    db,
    owner,
    requestKey,
    order.id,
    order.rounds[0].id,
  );
  await s.serveRound(db, owner, requestKey, order.id, order.rounds[0].id);
  assert.equal(served.status, "SERVED");
  assert.equal(served.rounds[0].payable, order.rounds[0].payable);
  assert.equal(served.rounds[0].paid, order.rounds[0].paid);
  assert.equal(
    (await s.workspace(db, owner, outletId)).readyTickets.filter(
      (t: any) => t.order_id === order.id,
    ).length,
    0,
  );
  assert.equal((await s.verifyAudit(db, owner)).valid, true);
});

test("concurrent count submissions cannot overwrite one another", async () => {
  const results = await Promise.allSettled([record("OPENING", liquor, 0), record("OPENING", liquor, 1000)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  const rejected = results.find(r => r.status === "rejected") as PromiseRejectedResult;
  assert.equal(rejected.reason.code, "VERSION_CONFLICT");
  assert.equal((await db.query("SELECT id FROM daily_stock_counts WHERE ingredient_id=$1 AND phase='OPENING'", [liquor])).rows.length, 1);
});

test("daily reports paginate without hiding additional stock items", async () => {
  const fixtures = Array.from({ length: 101 }, (_, n) => ({ id: key(), name: "Pagination QA " + String(n).padStart(3, "0") }));
  await db.transaction(owner.restroId, tx => tx.query("INSERT INTO ingredients(id,restro_id,outlet_id,name,unit) SELECT x.id,$1,$2,x.name,'kg' FROM jsonb_to_recordset($3::jsonb) AS x(id uuid,name text)", [owner.restroId, outletId, JSON.stringify(fixtures)]));
  const first = await s.stockCountReport(db, owner, { outletId, search: "Pagination QA", offset: 0 });
  const second = await s.stockCountReport(db, owner, { outletId, search: "Pagination QA", offset: 100 });
  assert.equal(first.items.length, 100); assert.equal(first.hasMore, true);
  assert.equal(second.items.length, 1); assert.equal(second.hasMore, false);
  assert.equal(new Set([...first.items, ...second.items].map(i => i.id)).size, 101);
});

test("customer QR orders remain available when opening stock counts are missing", async () => {
  assert.ok((await s.workspace(db, owner, outletId)).stockCountStatus.missingOpening > 0);
  const created = await s.saveTable(db, owner, key(), { outletId, label: "QR count QA", seats: 2, floor: "Main floor" });
  const table = (await s.workspace(db, owner, outletId)).tables.find((t: any) => t.id === created.id);
  const device = "daily-count-qr-device";
  const visit = await s.connectGuest(db, table.public_key, device, "daily-count-qr");
  await s.openSession(db, owner, key(), { tableId: table.id, guests: 1 });
  const guest = await s.guestSubmit(db, table.public_key, visit.token, device, key(), {
    name: "Count QR guest", phone: "9123456799", items: [{ itemId: meal, quantity: 1 }],
  }, true);
  assert.equal((await db.query("SELECT source FROM orders WHERE id=$1", [guest.id])).rows[0].source, "CUSTOMER_QR");
  assert.equal(guest.status, "PENDING");
  assert.equal(guest.rounds.length, 1);
  assert.ok((await s.workspace(db, owner, outletId)).stockCountStatus.missingOpening > 0);
});
