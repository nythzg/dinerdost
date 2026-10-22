import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  createEmbeddedDatabase,
  createPostgresDatabase,
  type Database,
} from "@dinerdost/database";
import { taxBreakdown, type Actor } from "@dinerdost/core";
import * as s from "@dinerdost/services";

let db: Database, owner: Actor, w: any, food: any, bar: any;
const key = () => randomUUID();
before(async () => {
  db = process.env.TEST_DATABASE_URL
    ? createPostgresDatabase(process.env.TEST_DATABASE_URL)
    : await createEmbeddedDatabase();
  await db.migrate();
  const a = await s.signup(
    db,
    {
      name: "Web owner",
      email: "web-updates@example.test",
      password: "web-updates-owner-123",
      restaurant: "Web Updates",
      outlet: "Main",
      qrEnabled: true,
      demo: true,
    },
    "web-updates",
  );
  owner = await s.authenticate(db, a.token);
  w = await s.workspace(db, owner);
  food = w.menu.find((m: any) => m.name === "Butter naan");
  bar = w.menu.find((m: any) => m.name === "Mint cooler");
});
after(async () => {
  await db?.close();
});
async function create(
  name: string,
  phone: string,
  items = [{ itemId: food.id, quantity: 1 }],
) {
  return s.createRound(db, owner, key(), {
    outletId: w.outletId,
    type: "TAKEAWAY",
    customer: { name, phone },
    items,
  });
}
async function settle(order: any) {
  order = await s.decideRound(db, owner, key(), order.id, order.rounds[0].id, {
    version: order.rounds[0].version,
    decision: "ACCEPT",
  });
  await s.recordPayment(db, owner, key(), order.id, order.rounds[0].id, {
    version: order.rounds[0].version,
    method: "CASH",
    amount: Number(order.rounds[0].payable),
  });
  for (const ticket of (await s.workspace(db, owner)).tickets.filter(
    (t: any) => t.order_id === order.id,
  )) {
    await s.kitchenDecision(db, owner, key(), ticket.id, {
      state: "PREPARING",
    });
    await s.kitchenDecision(db, owner, key(), ticket.id, { state: "READY" });
  }
  await s.serveRound(db, owner, key(), order.id, order.rounds[0].id);
  return s.generateBill(db, owner, key(), order.id, { final: true });
}
test("table capacity persists 3/8/10 seats without changing QR/session identities and guards guests/stale writes", async () => {
  const saved = await s.saveTable(db, owner, key(), {
    outletId: w.outletId,
    label: "Three seats",
    seats: 3,
    floor: "Main floor",
  });
  let table = (await s.workspace(db, owner)).tables.find(
    (t: any) => t.id === saved.id,
  );
  assert.equal(table.seats, 3);
  const qr = table.public_key;
  const input = { tableId: table.id, version: table.version, seats: 10 },
    request = key();
  const result = await s.updateTableCapacity(db, owner, request, input);
  assert.deepEqual(
    await s.updateTableCapacity(db, owner, request, input),
    result,
  );
  await assert.rejects(s.updateTableCapacity(db, owner, key(), input), {
    code: "VERSION_CONFLICT",
  });
  const session = await s.openSession(db, owner, key(), {
    tableId: table.id,
    guests: 8,
  });
  await assert.rejects(
    s.updateTableCapacity(db, owner, key(), { ...input, version: 2, seats: 3 }),
    { code: "CAPACITY_IN_USE" },
  );
  await s.updateTableCapacity(db, owner, key(), {
    ...input,
    version: 2,
    seats: 8,
  });
  const updated = await s.workspace(db, owner);
  table = updated.tables.find((t: any) => t.id === table.id);
  assert.equal(table.public_key, qr);
  assert.equal(table.seats, 8);
  assert.ok(
    updated.sessions.some((s: any) => s.id === session.id && s.guests === 8),
  );
  await assert.rejects(
    s.updateTableCapacity(db, { ...owner, role: "CASHIER" }, key(), {
      ...input,
      version: 3,
      seats: 10,
    }),
    { code: "FORBIDDEN" },
  );
});
test("customer contact corrections preserve the individual points account and issued documents", async () => {
  const order = await create("Alice Guest", "9123456789"),
    invoice = await settle(order);
  await create("Another Guest", "9123456790");
  const matches = await s.searchCustomers(db, owner, {
    outletId: w.outletId,
    query: "Ali",
  });
  assert.equal(matches.items[0].id, order.customer_id);
  assert.equal(
    (
      await s.searchCustomers(db, owner, {
        outletId: w.outletId,
        query: "+91 9123456789",
      })
    ).items[0].id,
    order.customer_id,
  );
  const before = await s.customerProfile(
    db,
    owner,
    order.customer_id,
    w.outletId,
  );
  assert.ok(before.points > 0);
  await db.query("UPDATE customers SET otp_verified=true WHERE id=$1", [
    order.customer_id,
  ]);
  const input = {
    customerId: before.id,
    outletId: w.outletId,
    version: before.version,
    name: "Alice Corrected",
    phone: "9123456791",
  };
  await assert.rejects(
    s.updateCustomerProfile(db, owner, key(), {
      ...input,
      phone: "9123456790",
    }),
    { code: "CUSTOMER_PHONE_IN_USE" },
  );
  await assert.rejects(
    s.updateCustomerProfile(db, { ...owner, role: "CASHIER" }, key(), input),
    { code: "FORBIDDEN" },
  );
  await s.updateCustomerProfile(db, owner, key(), input);
  const after = await s.customerProfile(db, owner, before.id, w.outletId);
  assert.equal(after.id, before.id);
  assert.equal(after.points, before.points);
  assert.equal(after.otp_verified, false);
  assert.equal(
    (await create("Alice Corrected", "9123456791")).customer_id,
    before.id,
  );
  assert.deepEqual(
    (await s.getInvoice(db, owner, invoice.id)).snapshot,
    invoice.snapshot,
  );
  await assert.rejects(s.updateCustomerProfile(db, owner, key(), input), {
    code: "VERSION_CONFLICT",
  });
});
test("named taxes are saved once, snapshotted per order and retained on edits, later rounds and bills", async () => {
  let outlet = (await s.workspace(db, owner)).outlets[0];
  const taxes = [
    { name: "CGST", rateBps: 250 },
    { name: "SGST", rateBps: 250 },
  ];
  await s.saveTaxSettings(db, owner, key(), {
    outletId: w.outletId,
    version: outlet.version,
    taxes,
  });
  let order = await create("Tax Guest", "9123456792");
  assert.equal(order.tax_bps_override, 500);
  assert.deepEqual(order.tax_components, taxes);
  assert.equal(order.totals.tax, 300);
  const provisional = await s.generateBill(db, owner, key(), order.id, {});
  assert.deepEqual(
    provisional.snapshot.taxes.map((tax: any) => [tax.name, tax.amount]),
    [
      ["CGST", 150],
      ["SGST", 150],
    ],
  );
  outlet = (await s.workspace(db, owner)).outlets[0];
  await s.saveTaxSettings(db, owner, key(), {
    outletId: w.outletId,
    version: outlet.version,
    taxes: [{ name: "VAT", rateBps: 900 }],
  });
  order = await s.createRound(db, owner, key(), {
    outletId: w.outletId,
    orderId: order.id,
    version: order.version,
    type: "TAKEAWAY",
    items: [{ itemId: food.id, quantity: 1 }],
  });
  assert.equal(order.totals.tax, 600);
  assert.deepEqual(order.tax_components, taxes);
  assert.equal((await create("New Tax Guest", "9123456793")).totals.tax, 540);
  assert.deepEqual(
    (await s.getInvoice(db, owner, provisional.id)).snapshot,
    provisional.snapshot,
  );
  const corrected=await s.changeOrderTax(db, owner, key(), order.id, {version:order.version,taxes:[{name:"Exempt",rateBps:0}],reason:"Owner correction"});
  assert.equal(corrected.totals.tax,0);
  assert.deepEqual((await s.getInvoice(db,owner,provisional.id)).snapshot,provisional.snapshot);
  await assert.rejects(
    s.saveTaxSettings(
      db,
      { ...owner, role: "CASHIER", application: "POS" },
      key(),
      { outletId: w.outletId, version: outlet.version, taxes },
    ),
    { code: "FORBIDDEN" },
  );
  const rounded = taxBreakdown(
    2,
    ["A", "B", "C", "D"].map((name) => ({ name, rateBps: 25 })),
  );
  assert.equal(
    rounded.reduce((sum, tax) => sum + tax.amount, 0),
    2,
  );
  assert.ok(rounded.every((tax) => tax.amount >= 0));
});
test("QR quotes use the same saved tax configuration as staff quotes and public images stay safe", async () => {
  const table = w.tables[2],
    visit = await s.connectGuest(
      db,
      table.public_key,
      "web-tax-device",
      "web-tax",
    );
  await s.openSession(db, owner, key(), { tableId: table.id, guests: 1 });
  const catalog = await s.guestCatalog(
    db,
    table.public_key,
    visit.token,
    "web-tax-device",
  );
  assert.equal(catalog.menu.find((m: any) => m.id === food.id)!.tax_bps, 900);
  assert.deepEqual(catalog.taxComponents, [{ name: "VAT", rateBps: 900 }]);
  assert.ok(
    catalog.menu
      .find((m: any) => m.id === food.id)!
      .image_url.startsWith("/images/menu/samples/"),
  );
  const order = await s.guestSubmit(
    db,
    table.public_key,
    visit.token,
    "web-tax-device",
    key(),
    {
      name: "QR Tax Guest",
      phone: "9123456794",
      items: [{ itemId: food.id, quantity: 1 }],
    },
  );
  assert.equal(Number(order.rounds[0].tax), 540);
  const menuInput = {
    id: food.id,
    version: food.version,
    outletId: w.outletId,
    name: food.name,
    category: food.category,
    price: Number(food.price),
    taxBps: food.tax_bps,
    station: food.station,
  };
  await assert.rejects(
    s.saveMenu(db, owner, key(), {
      ...menuInput,
      imageUrl: "javascript:alert(1)",
    }),
  );
  await s.saveMenu(db, owner, key(), {
    ...menuInput,
    imageUrl: "https://images.example.test/restaurant-naan.webp",
  });
  assert.equal(
    (await s.workspace(db, owner)).menu.find((m: any) => m.id === food.id)
      .image_is_sample,
    false,
  );
  assert.equal((await s.verifyAudit(db, owner)).valid, true);
});
test("legacy mixed KOTs split without changing order/bill values and ordinary web chef accounts cannot access bar tickets", async () => {
  const current = (await s.workspace(db, owner)).menu.find(
    (item: any) => item.id === bar.id,
  );
  await s.saveMenu(db, owner, key(), {
    id: current.id,
    version: current.version,
    outletId: w.outletId,
    name: current.name,
    category: current.category,
    price: Number(current.price),
    taxBps: current.tax_bps,
    station: food.station,
    stream: "BAR",
  });
  const order = await create("Mixed Guest", "9123456795", [
    { itemId: food.id, quantity: 1 },
    { itemId: bar.id, quantity: 1 },
  ]);
  const invoice = await settle(order);
  const original = (
    await db.query(
      "SELECT id,production_stream FROM kot_tickets WHERE order_id=$1",
      [order.id],
    )
  ).rows;
  const legacy = original.find(
    (ticket) => ticket.production_stream === "FOOD",
  )!.id;
  await db.query(
    "DELETE FROM kot_tickets WHERE order_id=$1 AND production_stream='BAR'",
    [order.id],
  );
  await db.query(
    "UPDATE kot_tickets SET production_stream='LEGACY' WHERE id=$1",
    [legacy],
  );
  const migration = await readFile(
    "packages/database/migrations/025_split_legacy_kots.sql",
    "utf8",
  );
  await db.transaction(null, (tx) => tx.query(migration));
  await db.transaction(null, (tx) => tx.query(migration));
  const tickets = (
    await db.query("SELECT * FROM kot_tickets WHERE order_id=$1", [order.id])
  ).rows as any[];
  assert.equal(tickets.length, 2);
  assert.equal(
    tickets.find((ticket: any) => ticket.production_stream === "FOOD").id,
    legacy,
  );
  assert.ok(tickets.every((ticket) => ticket.status === "SERVED"));
  const chef = {
    ...owner,
    role: "KITCHEN" as const,
    application: "MASTER" as const,
  };
  assert.ok(
    (await s.workspace(db, chef)).tickets.every(
      (ticket: any) => ticket.production_stream === "FOOD",
    ),
  );
  await assert.rejects(
    s.kitchenDecision(
      db,
      chef,
      key(),
      tickets.find((ticket: any) => ticket.production_stream === "BAR").id,
      { state: "PREPARING" },
    ),
    { code: "STREAM_FORBIDDEN" },
  );
  assert.deepEqual(
    (await s.getInvoice(db, owner, invoice.id)).snapshot,
    invoice.snapshot,
  );
  assert.equal(
    (
      await db.query(
        "SELECT tgenabled FROM pg_trigger WHERE tgname='enforce_kot_authority'",
      )
    ).rows[0].tgenabled,
    "O",
  );
});
