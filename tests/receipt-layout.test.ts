import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  createEmbeddedDatabase,
  createPostgresDatabase,
  type Database,
} from "@dinerdost/database";
import type { Actor } from "@dinerdost/core";
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
      name: "Receipt owner",
      email: "receipt@example.test",
      password: "receipt-owner-123",
      restaurant: "Receipt QA",
      outlet: "Main",
      qrEnabled: true,
      demo: true,
    },
    "receipt-qa",
  );
  owner = await s.authenticate(db, account.token);
  w = await s.workspace(db, owner);
});
after(async () => {
  await db?.close();
});
test("receipt settings are owner-only, versioned, tenant-bound and cannot use private staff files as logos", async () => {
  const content = await readFile(
      new URL(
        "../apps/web/public/images/menu/samples/butter-naan.webp",
        import.meta.url,
      ),
    ),
    logo = await s.storeAsset(
      db,
      owner,
      w.outletId,
      "RECEIPT_LOGO",
      content,
      "image/webp",
    ),
    privateFile = await s.storeAsset(
      db,
      owner,
      w.outletId,
      "STAFF_PHOTO",
      content,
      "image/webp",
    ),
    input = {
      outletId: w.outletId,
      version: w.outlets[0].version,
      settings: {
        logoId: logo.id,
        phone: "9000000000",
        fssai: "12345678901234",
        email: "qa@example.test",
        footer: "Thank You, Visit Again!!!",
        deliveryText: "Delivery available",
      },
    };
  await assert.rejects(
    s.saveReceiptSettings(db, { ...owner, role: "MANAGER" }, key(), input),
    { code: "FORBIDDEN" },
  );
  await assert.rejects(
    s.saveReceiptSettings(db, owner, key(), {
      ...input,
      settings: { ...input.settings, logoId: privateFile.id },
    }),
    { code: "NOT_FOUND" },
  );
  const requestKey = key();
  await s.saveReceiptSettings(db, owner, requestKey, input);
  await s.saveReceiptSettings(db, owner, requestKey, input);
  await assert.rejects(s.saveReceiptSettings(db, owner, key(), input), {
    code: "VERSION_CONFLICT",
  });
  assert.deepEqual(
    (await s.workspace(db, owner)).outlets[0].receipt_settings,
    input.settings,
  );
  assert.deepEqual(
    Buffer.from(
      (await s.readReceiptAsset(db, { ...owner, role: "CASHIER" }, logo.id))
        .content,
    ),
    content,
  );
  await assert.rejects(
    s.readReceiptAsset(db, { ...owner, role: "KITCHEN" }, logo.id),
    { code: "FORBIDDEN" },
  );
  await assert.rejects(s.readReceiptAsset(db, owner, privateFile.id), {
    code: "NOT_FOUND",
  });
  await assert.rejects(s.readMenuAsset(db, logo.id), { code: "NOT_FOUND" });
  const second = await s.signup(
      db,
      {
        name: "Other receipt owner",
        email: "receipt-other@example.test",
        password: "receipt-other-123",
        restaurant: "Other receipt QA",
        outlet: "Main",
        qrEnabled: false,
      },
      "receipt-other",
    ),
    other = await s.authenticate(db, second.token),
    ow = await s.workspace(db, other);
  await assert.rejects(s.readReceiptAsset(db, other, logo.id), {
    code: "NOT_FOUND",
  });
  await assert.rejects(
    s.saveReceiptSettings(db, other, key(), {
      ...input,
      outletId: ow.outletId,
      version: ow.outlets[0].version,
    }),
    { code: "NOT_FOUND" },
  );
  assert.equal((await s.verifyAudit(db, owner)).valid, true);
});
test("thermal bill captures branding, cashier, table and named taxes without changing totals or issued snapshots", async () => {
  let outlet = (await s.workspace(db, owner)).outlets[0];
  await s.saveTaxSettings(db, owner, key(), {
    outletId: w.outletId,
    version: outlet.version,
    taxes: [
      { name: "CGST", rateBps: 250 },
      { name: "SGST", rateBps: 250 },
    ],
  });
  const table = w.tables[0],
    session = await s.openSession(db, owner, key(), {
      tableId: table.id,
      guests: 2,
    });
  let order = await s.createRound(db, owner, key(), {
    outletId: w.outletId,
    sessionId: session.id,
    type: "DINE_IN",
    customer: { name: "Receipt Guest", phone: "9123456789" },
    items: [
      {
        itemId: w.menu.find((item: any) => item.unit === "portion").id,
        quantity: 2,
      },
    ],
  });
  const provisional = await s.generateBill(db, owner, key(), order.id, {});
  assert.equal(provisional.snapshot.tableLabel, table.label);
  assert.equal(provisional.snapshot.orderType, "DINE_IN");
  assert.equal(provisional.snapshot.actor, owner.name);
  assert.equal(provisional.snapshot.receipt.email, "qa@example.test");
  assert.deepEqual(provisional.snapshot.totals, order.totals);
  assert.deepEqual(
    provisional.snapshot.taxes.map((tax: any) => tax.name),
    ["CGST", "SGST"],
  );
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
    (ticket: any) => ticket.order_id === order.id,
  )) {
    await s.kitchenDecision(db, owner, key(), ticket.id, {
      state: "PREPARING",
    });
    await s.kitchenDecision(db, owner, key(), ticket.id, { state: "READY" });
  }
  await s.serveRound(db, owner, key(), order.id, order.rounds[0].id);
  const final = await s.generateBill(db, owner, key(), order.id, {
    final: true,
  });
  assert.equal(
    Number(final.snapshot.totals.payable),
    Number(order.totals.payable),
  );
  assert.equal(final.snapshot.totals.outstanding, 0);
  outlet = (await s.workspace(db, owner)).outlets[0];
  await s.saveReceiptSettings(db, owner, key(), {
    outletId: w.outletId,
    version: outlet.version,
    settings: { phone: "9111111111", footer: "New footer" },
  });
  for (const issued of [provisional, final])
    assert.deepEqual(
      (await s.getInvoice(db, owner, issued.id)).snapshot,
      issued.snapshot,
    );
  assert.equal(
    (await s.generateBill(db, owner, key(), order.id, { final: true })).id,
    final.id,
  );
});
