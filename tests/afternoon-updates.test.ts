import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  createEmbeddedDatabase,
  createPostgresDatabase,
  type Database,
} from "@dinerdost/database";
import {
  floorOutline,
  floorEllipse,
  objectInFloor,
  validFloorOutline,
  businessDate,
  ellipseOutline,
  type Actor,
} from "@dinerdost/core";
import * as s from "@dinerdost/services";
let db: Database, owner: Actor, w: any;
const key = () => randomUUID();
test("legacy approved purchases backfill one expense without changing their source or financial documents", async () => {
  const vendor = await s.saveRecord(db, owner, key(), "vendors", {
      outletId: w.outletId,
      title: "Legacy QA vendor",
      data: {
        contact: "Supplier",
        phone: "",
        email: "",
        address: "",
        gstin: "",
      },
    }),
    purchase = await s.saveRecord(db, owner, key(), "purchases", {
      outletId: w.outletId,
      title: "Legacy approved purchase",
      data: {
        vendorId: vendor.id,
        reference: "LEGACY-QA",
        amount: 12300,
        note: "Original note",
      },
    });
  await db.query(
    "UPDATE records SET state='APPROVED',approved_by=$2,created_at='2025-01-10T10:00:00Z' WHERE id=$1",
    [purchase.id, owner.employeeId],
  );
  const before = (
      await db.query("SELECT * FROM records WHERE id=$1", [purchase.id])
    ).rows[0],
    sql = await readFile(
      new URL(
        "../packages/database/migrations/031_backfill_purchase_expenses.sql",
        import.meta.url,
      ),
      "utf8",
    );
  for (let i = 0; i < 2; i++) await db.transaction(null, (tx) => tx.query(sql));
  const posted: any = (
    await db.query(
      "SELECT * FROM records WHERE kind='expenses' AND data->>'sourcePurchaseId'=$1",
      [purchase.id],
    )
  ).rows;
  assert.equal(posted.length, 1);
  assert.equal(posted[0].data.amount, 12300);
  assert.equal(posted[0].data.date, "2025-01-10");
  assert.deepEqual(
    (await db.query("SELECT * FROM records WHERE id=$1", [purchase.id]))
      .rows[0],
    before,
  );
});
test("filtered bills and payments use issued amounts, item quantities and India dates", async () => {
  let order = await s.createRound(db, owner, key(), {
    outletId: w.outletId,
    type: "TAKEAWAY",
    customer: { name: "Filter Invoice Guest", phone: "9123456766" },
    items: [{ itemId: w.menu[1].id, quantity: 2 }],
  });
  order = await s.decideRound(db, owner, key(), order.id, order.rounds[0].id, {
    version: order.rounds[0].version,
    decision: "ACCEPT",
  });
  const amount = Number(order.rounds[0].payable);
  await s.recordPayment(db, owner, key(), order.id, order.rounds[0].id, {
    version: order.rounds[0].version,
    method: "CASH",
    amount,
  });
  for (const ticket of (await s.workspace(db, owner)).tickets.filter(
    (ticket: any) => ticket.order_id === order.id,
  )) {
    await s.kitchenDecision(db, owner, key(), ticket.id, {
      state: "PREPARING",
    });
    await s.kitchenDecision(db, owner, key(), ticket.id, { state: "READY" });
  }
  await s.serveRound(db, owner, key(), order.id, order.rounds[0].id);
  const invoice = await s.generateBill(db, owner, key(), order.id, {
    final: true,
  });
  const bills = await s.listActivity(db, owner, {
    kind: "invoices",
    outletId: w.outletId,
    from: businessDate(),
    to: businessDate(),
    minAmount: amount,
    maxAmount: amount,
    minQuantity: 2000,
    maxQuantity: 2000,
    status: "FINAL_TAX_INVOICE",
    search: invoice.number,
  });
  assert.equal(bills.items.length, 1);
  assert.equal(bills.items[0].id, invoice.id);
  const receipts = await s.listActivity(db, owner, {
    kind: "payments",
    outletId: w.outletId,
    from: businessDate(),
    to: businessDate(),
    minAmount: amount,
    maxAmount: amount,
    status: "CASH",
    search: String(order.number),
  });
  assert.equal(receipts.items.length, 1);
  assert.equal(receipts.items[0].order_id, order.id);
  assert.equal(
    (
      await s.listActivity(db, owner, {
        kind: "invoices",
        outletId: w.outletId,
        minQuantity: 3000,
      })
    ).items.some((row) => row.id === invoice.id),
    false,
  );
});
before(async () => {
  db = process.env.TEST_DATABASE_URL
    ? createPostgresDatabase(process.env.TEST_DATABASE_URL)
    : await createEmbeddedDatabase();
  await db.migrate();
  const account = await s.signup(
    db,
    {
      name: "Afternoon owner",
      email: "afternoon@example.test",
      password: "afternoon-owner-123",
      restaurant: "Afternoon QA",
      outlet: "Main",
      qrEnabled: true,
      demo: true,
    },
    "afternoon",
  );
  owner = await s.authenticate(db, account.token);
  w = await s.workspace(db, owner);
});
after(async () => {
  await db?.close();
});
test("inventory editing preserves stock history and restricts stale/unit/stream writes", async () => {
  const item = await s.addIngredient(db, owner, key(), {
    outletId: w.outletId,
    name: "Edit stock",
    unit: "kg",
    reorderMilli: 1000,
  });
  await s.updateIngredient(db, owner, key(), {
    id: item.id,
    version: 1,
    name: "Edited stock",
    unit: "kg",
    reorderMilli: 2000,
  });
  await assert.rejects(
    s.updateIngredient(db, owner, key(), {
      id: item.id,
      version: 1,
      name: "Stale stock",
      unit: "kg",
      reorderMilli: 0,
    }),
    { code: "VERSION_CONFLICT" },
  );
  await s.receiveStock(db, owner, key(), {
    ingredientId: item.id,
    batchNumber: "EDIT-BATCH",
    quantityMilli: 3000,
    unitCost: 10000,
    reference: "Edit fixture",
  });
  const before = (
    await db.query("SELECT * FROM stock_movements WHERE ingredient_id=$1", [
      item.id,
    ])
  ).rows;
  await assert.rejects(
    s.updateIngredient(db, owner, key(), {
      id: item.id,
      version: 2,
      name: "Edited stock",
      unit: "L",
      reorderMilli: 2000,
    }),
    { code: "UNIT_IN_USE" },
  );
  await assert.rejects(
    s.updateIngredient(db, { ...owner, role: "CASHIER" }, key(), {
      id: item.id,
      version: 2,
      name: "Denied",
      unit: "kg",
      reorderMilli: 0,
    }),
    { code: "FORBIDDEN" },
  );
  await assert.rejects(
    s.updateIngredient(db, { ...owner, role: "BARTENDER" }, key(), {
      id: item.id,
      version: 2,
      name: "Denied",
      unit: "kg",
      reorderMilli: 0,
    }),
    { code: "STREAM_FORBIDDEN" },
  );
  await s.updateIngredient(db, owner, key(), {
    id: item.id,
    version: 2,
    name: "Stock renamed",
    unit: "kg",
    reorderMilli: 3000,
  });
  assert.deepEqual(
    (
      await db.query("SELECT * FROM stock_movements WHERE ingredient_id=$1", [
        item.id,
      ])
    ).rows,
    before,
  );
  assert.equal(
    Number(
      (await s.workspace(db, owner)).ingredients.find(
        (i: any) => i.id === item.id,
      ).on_hand,
    ),
    3000,
  );
});
test("loyalty leaderboard ranks real account balances and excludes pending points", async () => {
  const order = await s.createRound(db, owner, key(), {
    outletId: w.outletId,
    type: "TAKEAWAY",
    customer: { name: "Ranked Guest", phone: "9123456759" },
    items: [{ itemId: w.menu[0].id, quantity: 1 }],
  });
  for (const [state, points] of [
    ["EARNED", 100],
    ["PENDING_EARN", 900],
  ])
    await db.query(
      "INSERT INTO loyalty_ledger(id,restro_id,outlet_id,customer_id,order_id,round_id,state,points,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        key(),
        owner.restroId,
        w.outletId,
        order.customer_id,
        order.id,
        order.rounds[0].id,
        state,
        points,
        "Synthetic leaderboard fixture",
      ],
    );
  const board = await s.loyaltyLeaderboard(db, owner, { outletId: w.outletId }),
    row: any = board.items.find((r) => r.id === order.customer_id);
  assert.equal(Number(row.points), 100);
  assert.equal(Number(row.earned), 100);
  assert.equal(Number(row.rank), 1);
  assert.equal(Object.hasOwn(row, "phone"), false);
  const search = await s.loyaltyLeaderboard(db, owner, {
    outletId: w.outletId,
    search: "Ranked",
  });
  assert.equal(search.items.length, 1);
  assert.equal(Number(search.items[0].rank), 1);
  await assert.rejects(
    s.loyaltyLeaderboard(
      db,
      { ...owner, role: "KITCHEN" },
      { outletId: w.outletId },
    ),
    { code: "FORBIDDEN" },
  );
  await assert.rejects(
    s.loyaltyLeaderboard(
      db,
      { ...owner, role: "CASHIER", outletIds: [] },
      { outletId: w.outletId },
    ),
    { code: "OUTLET_FORBIDDEN" },
  );
});
test("circle outlines persist with exact ellipse containment and normal polygon validation", async () => {
  const area = { width: 1200, height: 800 },
    outline = floorOutline("Circle", area);
  assert.equal(outline.length, 24);
  assert.ok(validFloorOutline(outline, area));
  assert.ok(floorEllipse(outline));
  assert.ok(
    floorEllipse(
      ellipseOutline({ x: 200.2, y: 0, width: 757.53, height: 800 }),
    ),
  );
  const object = {
    id: "circle-table",
    tableId: w.tables[0].id,
    kind: "TABLE" as const,
    label: "T01",
    x: 500,
    y: 350,
    width: 100,
    height: 100,
  };
  assert.ok(objectInFloor(object, outline));
  assert.equal(objectInFloor({ ...object, x: 200, y: 0 }, outline), false);
  await s.saveFloorPlan(db, owner, key(), {
    outletId: w.outletId,
    floor: "Main floor",
    version: 0,
    ...area,
    outline,
    objects: [object],
  });
  assert.deepEqual(
    (await s.workspace(db, owner)).floorPlans[0].outline,
    outline,
  );
});
test("menu photo upload persists, public endpoint only serves linked menu photos, and tenant/purpose guards hold", async () => {
  const asset = await s.storeAsset(
    db,
    owner,
    w.outletId,
    "MENU",
    Buffer.from("webp-example"),
    "image/webp",
  );
  await assert.rejects(s.readMenuAsset(db, asset.id));
  const item = w.menu[0];
  await s.saveMenu(db, owner, key(), {
    id: item.id,
    version: item.version,
    outletId: w.outletId,
    name: item.name,
    category: item.category,
    description: item.description,
    imageUrl: asset.url,
    price: Number(item.price),
    taxBps: item.tax_bps,
    station: item.station,
    unit: item.unit,
    variants: [],
    modifiers: [],
    active: true,
  });
  assert.equal(
    Buffer.from((await s.readMenuAsset(db, asset.id)).content).toString(),
    "webp-example",
  );
  await assert.rejects(
    s.storeAsset(
      db,
      { ...owner, role: "CASHIER" },
      w.outletId,
      "MENU",
      Buffer.from("x"),
      "image/webp",
    ),
    { code: "FORBIDDEN" },
  );
  const privateAsset = await s.storeAsset(
    db,
    owner,
    w.outletId,
    "STAFF_PHOTO",
    Buffer.from("private-photo"),
    "image/webp",
  );
  await assert.rejects(s.readMenuAsset(db, privateAsset.id));
  await assert.rejects(
    s.saveMenu(db, owner, key(), {
      outletId: w.outletId,
      name: "Wrong purpose",
      category: item.category,
      imageUrl: "/api/menu-images/" + privateAsset.id,
      price: 100,
      taxBps: 0,
      station: "Main kitchen",
    }),
  );
});
test("staff details and files are owner-only, omitted from workspace, saved atomically and version guarded", async () => {
  const photo = await s.storeAsset(
      db,
      owner,
      w.outletId,
      "STAFF_PHOTO",
      Buffer.from("staff-photo"),
      "image/webp",
    ),
    document = await s.storeAsset(
      db,
      owner,
      w.outletId,
      "STAFF_DOCUMENT",
      Buffer.from("%PDF-1.4 synthetic QA"),
      "application/pdf",
    );
  const details = {
    phone: "9123456750",
    address: "Synthetic QA address",
    pincode: "781001",
    photoId: photo.id,
    documentId: document.id,
    documentType: "PAN",
  };
  const member = await s.addEmployee(db, owner, key(), {
    name: "Private Staff",
    email: "private-staff@example.test",
    password: "private-staff-123",
    role: "CASHIER",
    outletIds: [w.outletId],
    salary: 10000,
    details,
  });
  const saved = await s.readStaffDetails(db, owner, member.id);
  assert.equal(saved.phone, details.phone);
  assert.equal(saved.document_id, document.id);
  for (const role of ["CASHIER", "MANAGER", "WAITER"] as const) {
    await assert.rejects(
      s.readStaffDetails(db, { ...owner, role }, member.id),
      { code: "FORBIDDEN" },
    );
    await assert.rejects(
      s.readPrivateAsset(db, { ...owner, role }, document.id),
      { code: "FORBIDDEN" },
    );
  }
  assert.equal(
    JSON.stringify(await s.workspace(db, owner)).includes(details.address),
    false,
  );
  assert.equal(
    JSON.stringify(
      await s.workspace(db, {
        ...owner,
        role: "MANAGER",
        outletIds: [w.outletId],
      }),
    ).includes(details.phone),
    false,
  );
  await s.updateEmployeeProfile(db, owner, key(), member.id, {
    version: saved.version,
    name: "Private Staff Updated",
    salary: 12000,
    details: { ...details, pincode: "781002" },
  });
  assert.equal(
    (await s.readStaffDetails(db, owner, member.id)).pincode,
    "781002",
  );
  await assert.rejects(
    s.updateEmployeeProfile(db, owner, key(), member.id, {
      version: saved.version,
      name: "Stale",
      salary: 0,
      details,
    }),
    { code: "VERSION_CONFLICT" },
  );
  const other = await s.signup(
    db,
    {
      name: "Other owner",
      email: "afternoon-other@example.test",
      password: "afternoon-other-123",
      restaurant: "Other",
      outlet: "Other",
      qrEnabled: false,
      demo: false,
    },
    "afternoon-other",
  );
  const otherActor = await s.authenticate(db, other.token);
  await assert.rejects(s.readPrivateAsset(db, otherActor, document.id));
  await assert.rejects(s.readStaffDetails(db, otherActor, member.id));
});
test("reservation identity binds to a registered customer and rejects a conflicting name", async () => {
  const at = new Date(Date.now() + 86400000).toISOString(),
    input = {
      outletId: w.outletId,
      title: "Booked Guest",
      data: {
        guest: "Booked Guest",
        phone: "9123456751",
        tableId: w.tables[1].id,
        guests: 2,
        at,
        durationMinutes: 60,
        note: "",
      },
    };
  const reservation = await s.saveRecord(
    db,
    owner,
    key(),
    "reservations",
    input,
  );
  const records = await s.listRecords(db, owner, "reservations", w.outletId),
    record: any = records.find((r: any) => r.id === reservation.id);
  assert.equal(record.data.phone, "+919123456751");
  const matches = await s.searchCustomers(db, owner, {
    outletId: w.outletId,
    query: "Booked",
  });
  assert.equal(matches.items[0].id, record.data.customerId);
  await assert.rejects(
    s.saveRecord(db, owner, key(), "reservations", {
      ...input,
      title: "Conflict",
      data: {
        ...input.data,
        guest: "Conflicting Guest",
        tableId: w.tables[2].id,
      },
    }),
    { code: "CUSTOMER_NAME_MISMATCH" },
  );
  const order = await s.createRound(db, owner, key(), {
    outletId: w.outletId,
    type: "TAKEAWAY",
    customer: { name: "Booked Guest", phone: "9123456751" },
    items: [{ itemId: w.menu[0].id, quantity: 1 }],
  });
  assert.equal(order.customer_id, record.data.customerId);
});
test("server record filters include old records past recent limits, paginate and enforce amount/date/assignment scope", async () => {
  for (let i = 0; i < 205; i++)
    await db.query(
      "INSERT INTO records(id,restro_id,outlet_id,kind,title,state,data,created_by,production_stream,created_at) VALUES($1,$2,$3,'expenses',$4,'APPROVED',$5::jsonb,$6,'FOOD',$7)",
      [
        key(),
        owner.restroId,
        w.outletId,
        "Expense " + i,
        JSON.stringify({
          category: "Other",
          amount: i === 0 ? 12345 : 100,
          date: i === 0 ? "2025-01-10" : "2026-10-20",
          reference: "QA-" + i,
          note: "",
        }),
        owner.employeeId,
        i === 0 ? "2025-01-10T10:00:00Z" : "2026-10-20T10:00:00Z",
      ],
    );
  const old = await s.listActivity(db, owner, {
    kind: "expenses",
    outletId: w.outletId,
    from: "2025-01-01",
    to: "2025-01-31",
    minAmount: 12000,
    maxAmount: 13000,
    search: "Expense 0",
  });
  assert.equal(old.items.length, 1);
  assert.equal(old.items[0].title, "Expense 0");
  const first = await s.listActivity(db, owner, {
      kind: "expenses",
      outletId: w.outletId,
    }),
    second = await s.listActivity(db, owner, {
      kind: "expenses",
      outletId: w.outletId,
      offset: 100,
    });
  assert.equal(first.items.length, 100);
  assert.equal(first.hasMore, true);
  assert.equal(
    new Set([...first.items, ...second.items].map((r) => r.id)).size,
    200,
  );
  await assert.rejects(
    s.listActivity(
      db,
      { ...owner, role: "MANAGER", outletIds: [w.outletId] },
      { kind: "expenses", outletId: w.outletId },
    ),
    { code: "FORBIDDEN" },
  );
  await assert.rejects(
    s.listActivity(db, owner, {
      kind: "expenses",
      outletId: w.outletId,
      from: "2026-10-20",
      to: "2025-01-01",
    }),
    { code: "DATE_RANGE" },
  );
});
test("inventory filters apply to movements while balances remain unchanged", async () => {
  const ingredient = await s.addIngredient(db, owner, key(), {
    outletId: w.outletId,
    name: "QA ingredient",
    unit: "kg",
    reorderMilli: 0,
  });
  await db.query(
    "INSERT INTO stock_movements(id,restro_id,outlet_id,ingredient_id,kind,delta_milli,cost,reason,actor_id,created_at) VALUES($1,$2,$3,$4,'RECEIPT',2000,5000,'Old movement',$5,'2025-01-10T10:00:00Z')",
    [key(), owner.restroId, w.outletId, ingredient.id, owner.employeeId],
  );
  const before = (await s.workspace(db, owner)).ingredients;
  const old = await s.listActivity(db, owner, {
    kind: "movements",
    outletId: w.outletId,
    from: "2025-01-01",
    to: "2025-01-31",
    minQuantity: 1000,
    maxQuantity: 3000,
    minAmount: 4900,
  });
  assert.equal(old.items.length, 1);
  assert.equal(old.items[0].reason, "Old movement");
  assert.deepEqual((await s.workspace(db, owner)).ingredients, before);
});
test("bill correction preserves saved defaults, later round tax and immutable provisional snapshots", async () => {
  const outlet = (await s.workspace(db, owner)).outlets[0];
  await s.saveTaxSettings(db, owner, key(), {
    outletId: w.outletId,
    version: outlet.version,
    taxes: [{ name: "GST", rateBps: 500 }],
  });
  let order = await s.createRound(db, owner, key(), {
    outletId: w.outletId,
    type: "TAKEAWAY",
    items: [{ itemId: w.menu[1].id, quantity: 1 }],
  });
  const printed = await s.generateBill(db, owner, key(), order.id, {});
  const input = {
    version: order.version,
    taxes: [{ name: "Owner tax", rateBps: 800 }],
    reason: "Requested correction",
  };
  await assert.rejects(
    s.changeOrderTax(db, { ...owner, role: "MANAGER" }, key(), order.id, input),
    { code: "FORBIDDEN" },
  );
  order = await s.changeOrderTax(db, owner, key(), order.id, input);
  assert.deepEqual(order.tax_components, input.taxes);
  assert.equal((await s.workspace(db, owner)).outlets[0].tax_bps, 500);
  order = await s.createRound(db, owner, key(), {
    outletId: w.outletId,
    orderId: order.id,
    version: order.version,
    type: "TAKEAWAY",
    items: [{ itemId: w.menu[1].id, quantity: 1 }],
  });
  assert.equal(Number(order.rounds[1].items[0].tax_bps), 800);
  assert.deepEqual(
    (await s.getInvoice(db, owner, printed.id)).snapshot,
    printed.snapshot,
  );
});
