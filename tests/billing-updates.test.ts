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

let db: Database,
  actor: Actor,
  outletId: string,
  menu: any[],
  serial = 0;
const key = () => randomUUID(),
  password = "billing-test-password-123";
before(async () => {
  db = process.env.TEST_DATABASE_URL
    ? createPostgresDatabase(process.env.TEST_DATABASE_URL)
    : await createEmbeddedDatabase();
  await db.migrate();
  await db.migrate();
  const account = await s.signup(
    db,
    {
      name: "Billing Owner",
      email: "billing@example.test",
      password,
      restaurant: "Billing QA",
      outlet: "Main",
      qrEnabled: true,
      demo: true,
    },
    "billing-qa",
  );
  actor = await s.authenticate(db, account.token);
  const workspace = await s.workspace(db, actor);
  outletId = workspace.outletId;
  menu = workspace.menu;
});
after(async () => {
  await db?.close();
});
async function order(accepted = true) {
  let result = await s.createRound(db, actor, key(), {
    outletId,
    type: "TAKEAWAY",
    items: [{ itemId: menu[0].id, quantity: 2 }],
    customer: {
      name: "Billing Guest " + ++serial,
      phone: "913000" + String(serial).padStart(4, "0"),
    },
  });
  if (accepted) {
    result = await s.decideRound(
      db,
      actor,
      key(),
      result.id,
      result.rounds[0].id,
      { version: result.rounds[0].version, decision: "ACCEPT" },
    );
    result = (
      await s.reviewRewards(db, actor, key(), result.id, result.rounds[0].id)
    ).order;
  }
  return result;
}

test("bill tax supports custom and menu rates, persists across edits and added rounds, and detects stale writes", async () => {
  let bill = await order(false);
  const original = bill,
    input = {
      version: bill.version,
      taxBps: 500,
      reason: "Client selected bill tax",
    },
    requestKey = key();
  bill = await s.changeOrderTax(db, actor, requestKey, bill.id, input);
  assert.equal(
    (await s.changeOrderTax(db, actor, requestKey, bill.id, input)).version,
    bill.version,
  );
  assert.equal(
    Number(bill.totals.tax),
    Math.round(Number(bill.totals.subtotal) * 0.05),
  );
  assert.equal(Number(bill.tax_bps_override), 500);
  await assert.rejects(
    () => s.changeOrderTax(db, actor, key(), bill.id, input),
    /changed|refresh/i,
  );
  bill = await s.editRound(db, actor, key(), bill.id, bill.rounds[0].id, {
    version: bill.rounds[0].version,
    items: [{ itemId: menu[0].id, quantity: 3 }],
  });
  assert.equal(Number(bill.rounds[0].items[0].tax_bps), 500);
  bill = await s.createRound(db, actor, key(), {
    outletId,
    orderId: bill.id,
    version: bill.version,
    type: "TAKEAWAY",
    items: [{ itemId: menu[1].id, quantity: 1 }],
  });
  assert.equal(Number(bill.rounds[1].items[0].tax_bps), 500);
  bill = await s.changeOrderTax(db, actor, key(), bill.id, {
    version: bill.version,
    taxBps: null,
    reason: "Restore menu tax rates",
  });
  assert.equal(bill.tax_bps_override, null);
  assert.equal(
    Number(bill.rounds[0].items[0].tax_bps),
    Number(original.rounds[0].items[0].tax_bps),
  );
  for (const taxBps of [-1, 10001, 0.5])
    await assert.rejects(() =>
      s.changeOrderTax(db, actor, key(), bill.id, {
        version: bill.version,
        taxBps,
        reason: "Invalid rate",
      }),
    );
});

test("tax changes release reserved rewards and require a fresh reward review before payment", async () => {
  let bill = await order();
  const couponId = key();
  await db.transaction(actor.restroId, (tx) =>
    tx.query(
      "INSERT INTO coupons(id,restro_id,outlet_id,code,discount_amount,expires_at) VALUES($1,$2,$3,'TAX-QA',100,now()+interval '1 hour')",
      [couponId, actor.restroId, outletId],
    ),
  );
  bill = (
    await s.applyEntitlement(db, actor, key(), bill.id, bill.rounds[0].id, {
      version: bill.rounds[0].version,
      couponId,
      points: 0,
    })
  ).order;
  assert.equal(Number(bill.totals.discount), 100);
  bill = await s.changeOrderTax(db, actor, key(), bill.id, {
    version: bill.version,
    taxBps: 750,
    reason: "Correct bill tax",
  });
  assert.equal(Number(bill.totals.discount), 0);
  assert.equal(
    (await db.query<any>("SELECT state FROM coupons WHERE id=$1", [couponId]))
      .rows[0].state,
    "AVAILABLE",
  );
  await assert.rejects(
    () =>
      s.recordPayment(db, actor, key(), bill.id, bill.rounds[0].id, {
        version: bill.rounds[0].version,
        method: "CASH",
        amount: Number(bill.totals.payable),
      }),
    { code: "ENTITLEMENTS_REQUIRED" },
  );
});

test("only the owner can edit tax and unresolved receipts lock the bill", async () => {
  const bill = await order(),
    input = { version: bill.version, taxBps: 500, reason: "Correct rate" };
  await assert.rejects(
    () =>
      s.changeOrderTax(
        db,
        { ...actor, role: "CASHIER" },
        key(),
        bill.id,
        input,
      ),
    { code: "FORBIDDEN" },
  );
  await assert.rejects(
    () =>
      s.changeOrderTax(
        db,
        { ...actor, role: "MANAGER", outletIds: [] },
        key(),
        bill.id,
        input,
      ),
    { code: "FORBIDDEN" },
  );
  const pending = await s.initiatePayment(
    db,
    actor,
    key(),
    bill.id,
    bill.rounds[0].id,
    { version: bill.rounds[0].version, method: "CASH", amount: 1 },
  );
  await assert.rejects(
    () => s.changeOrderTax(db, actor, key(), bill.id, input),
    { code: "PAYMENT_ACTIVE" },
  );
  await s.verifyPayment(db, actor, key(), pending.paymentId, {
    decision: "UNKNOWN",
    reason: "Receipt unresolved",
  });
  await assert.rejects(
    () =>
      s.recordPayment(db, actor, key(), bill.id, bill.rounds[0].id, {
        version: bill.rounds[0].version,
        method: "CASH",
        amount: 1,
      }),
    { code: "PAYMENT_ALREADY_PENDING" },
  );
  assert.equal(Number((await s.getOrder(db, actor, bill.id)).totals.paid), 0);
});

test("one-step cash recording is idempotent, handles partial payments, and reaches an immutable final invoice", async () => {
  let bill = await order(),
    round = bill.rounds[0];
  const input = { version: round.version, method: "CASH", amount: 1 },
    requestKey = key();
  const receipt = await s.recordPayment(
    db,
    actor,
    requestKey,
    bill.id,
    round.id,
    input,
  );
  assert.equal(
    (await s.recordPayment(db, actor, requestKey, bill.id, round.id, input))
      .paymentId,
    receipt.paymentId,
  );
  bill = receipt.order;
  round = bill.rounds[0];
  assert.equal(Number(round.paid), 1);
  assert.equal(round.kot_status, "HELD");
  assert.equal(round.payments.length, 1);
  assert.equal(round.payments[0].state, "VERIFIED");
  await assert.rejects(
    () =>
      s.changeOrderTax(db, actor, key(), bill.id, {
        version: bill.version,
        taxBps: 500,
        reason: "Tax after receipt",
      }),
    { code: "TAX_LOCKED" },
  );
  await assert.rejects(
    () => s.generateBill(db, actor, key(), bill.id, { final: true }),
    { code: "SETTLEMENT_NOT_READY" },
  );
  bill = (
    await s.recordPayment(db, actor, key(), bill.id, round.id, {
      version: round.version,
      method: "CASH",
      amount: Number(round.payable) - 1,
    })
  ).order;
  assert.equal(bill.rounds[0].payment_status, "PAID");
  assert.equal(bill.rounds[0].kot_status, "RELEASED");
  for (const ticket of (
    await db.query<any>("SELECT id FROM kot_tickets WHERE round_id=$1", [
      round.id,
    ])
  ).rows) {
    await s.kitchenDecision(db, actor, key(), ticket.id, {
      state: "PREPARING",
    });
    await s.kitchenDecision(db, actor, key(), ticket.id, { state: "READY" });
  }
  await s.serveRound(db, actor, key(), bill.id, round.id);
  const invoice = await s.generateBill(db, actor, key(), bill.id, {
    final: true,
  });
  assert.equal(invoice.document_type, "FINAL_TAX_INVOICE");
  bill = await s.getOrder(db, actor, bill.id);
  await assert.rejects(
    () =>
      s.changeOrderTax(db, actor, key(), bill.id, {
        version: bill.version,
        taxBps: 0,
        reason: "Closed bill",
      }),
    { code: "ORDER_LOCKED" },
  );
  await assert.rejects(
    () => s.recordPayment(db, actor, key(), bill.id, round.id, input),
    { code: "ORDER_LOCKED" },
  );
});

test("one-step digital receipts require references, reject duplicates across methods, and preserve balance on failure", async () => {
  const outlet = (await s.workspace(db, actor)).outlets[0];
  await s.setPaymentMethods(db, actor, key(), {
    outletId,
    version: outlet.version,
    methods: ["CASH", "MANUAL_UPI", "UPI_QR", "UPI_PHONE", "CARD", "ONLINE"],
  });
  const bill = await order(),
    round = bill.rounds[0],
    base = { version: round.version, amount: 1 };
  await assert.rejects(
    () =>
      s.recordPayment(db, actor, key(), bill.id, round.id, {
        ...base,
        method: "CARD",
      }),
    { code: "REFERENCE_REQUIRED" },
  );
  await assert.rejects(
    () =>
      s.recordPayment(
        db,
        { ...actor, role: "WAITER" },
        key(),
        bill.id,
        round.id,
        { ...base, method: "CASH" },
      ),
    { code: "FORBIDDEN" },
  );
  await assert.rejects(
    () =>
      s.recordPayment(
        db,
        { ...actor, role: "CASHIER", outletIds: [] },
        key(),
        bill.id,
        round.id,
        { ...base, method: "CASH" },
      ),
    { code: "OUTLET_FORBIDDEN" },
  );
  for (const method of [
    "MANUAL_UPI",
    "UPI_QR",
    "UPI_PHONE",
    "CARD",
    "ONLINE",
  ]) {
    const result = await s.recordPayment(db, actor, key(), bill.id, round.id, {
      ...base,
      method,
      reference: "received-" + method,
    });
    assert.equal(result.order.rounds[0].payments.at(-1).state, "VERIFIED");
  }
  await assert.rejects(
    () =>
      s.recordPayment(db, actor, key(), bill.id, round.id, {
        ...base,
        method: "CARD",
        reference: "RECEIVED-MANUAL_UPI",
      }),
    /duplicate|receipt|unique/i,
  );
  assert.equal(Number((await s.getOrder(db, actor, bill.id)).totals.paid), 5);
  await assert.rejects(
    () =>
      s.recordPayment(db, actor, key(), bill.id, round.id, {
        ...base,
        method: "CASH",
        amount: Number(round.payable),
      }),
    { code: "PAYMENT_EXCEEDS_BALANCE" },
  );
});

test("cashier one-step receipts need no extra password even above the old threshold", async () => {
  const bill = await order(),
    round = bill.rounds[0];
  await db.query("UPDATE outlets SET high_value_threshold=1 WHERE id=$1", [
    outletId,
  ]);
  const cashier = { ...actor, role: "CASHIER" as const, outletIds: [outletId] };
  const result = await s.recordPayment(db, cashier, key(), bill.id, round.id, {
    version: round.version,
    method: "CASH",
    amount: 1,
  });
  assert.equal(Number(result.order.totals.paid), 1);
  assert.equal((await s.verifyAudit(db, actor)).valid, true);
});

test("QR added rounds retain a bill tax override while a new order starts with menu tax", async () => {
  const table = (await s.workspace(db, actor)).tables[0],
    device = "tax-qr-guest";
  const visit = await s.connectGuest(db, table.public_key, device, "tax-qr");
  await s.openSession(db, actor, key(), { tableId: table.id, guests: 1 });
  const input = {
    name: "QR Tax Guest",
    phone: "9134567893",
    items: [{ itemId: menu[0].id, quantity: 1 }],
  };
  let bill = await s.guestSubmit(
    db,
    table.public_key,
    visit.token,
    device,
    key(),
    input,
  );
  let detail = await s.getOrder(db, actor, bill.id);
  detail = await s.changeOrderTax(db, actor, key(), bill.id, {
    version: detail.version,
    taxBps: 500,
    reason: "Correct QR bill tax",
  });
  const catalog = await s.guestCatalog(
    db,
    table.public_key,
    visit.token,
    device,
  );
  assert.equal(catalog.order?.tax_bps_override, 500);
  bill = await s.guestSubmit(db, table.public_key, visit.token, device, key(), {
    ...input,
    version: catalog.order!.version,
  });
  detail = await s.getOrder(db, actor, bill.id);
  assert.equal(Number(detail.rounds[1].items[0].tax_bps), 500);
  for (const round of detail.rounds)
    await s.decideRound(db, actor, key(), bill.id, round.id, {
      version: round.version,
      decision: "REJECT",
      reason: "Guest cancelled this order",
    });
  const next = await s.guestSubmit(
    db,
    table.public_key,
    visit.token,
    device,
    key(),
    input,
  );
  assert.notEqual(next.id, bill.id);
  const nextDetail = await s.getOrder(db, actor, next.id);
  assert.equal(nextDetail.tax_bps_override, null);
  assert.equal(
    Number(nextDetail.rounds[0].items[0].tax_bps),
    Number(menu[0].tax_bps),
  );
  assert.equal((await s.verifyAudit(db, actor)).valid, true);
});

test("owner-only named charges survive recalculation, preserve bill snapshots, and lock after receipt", async () => {
  let bill = await order(false),
    round = bill.rounds[0];
  const input = {
    version: round.version,
    charges: [{ name: "Packaging fee", amount: 1250 }],
  };
  for (const role of ["MANAGER", "CASHIER", "WAITER"] as const) {
    await assert.rejects(
      () =>
        s.changeRoundCharges(
          db,
          { ...actor, role, outletIds: [outletId] },
          key(),
          bill.id,
          round.id,
          input,
        ),
      { code: "FORBIDDEN" },
    );
    await assert.rejects(
      () =>
        s.changeOrderTax(
          db,
          { ...actor, role, outletIds: [outletId] },
          key(),
          bill.id,
          { version: bill.version, taxBps: 500, reason: "Non-owner tax" },
        ),
      { code: "FORBIDDEN" },
    );
  }
  const requestKey = key(),
    originalPayable = Number(round.payable);
  bill = await s.changeRoundCharges(
    db,
    actor,
    requestKey,
    bill.id,
    round.id,
    input,
  );
  assert.equal(
    (
      await s.changeRoundCharges(
        db,
        actor,
        requestKey,
        bill.id,
        round.id,
        input,
      )
    ).version,
    bill.version,
  );
  assert.equal(Number(bill.totals.charges), 1250);
  assert.equal(Number(bill.totals.payable), originalPayable + 1250);
  const snapshot = await s.generateBill(db, actor, key(), bill.id, {
    final: false,
  });
  assert.equal(snapshot.snapshot.charges[0].name, "Packaging fee");
  bill = await s.getOrder(db, actor, bill.id);
  bill = await s.changeOrderTax(db, actor, key(), bill.id, {
    version: bill.version,
    taxBps: 500,
    reason: "Correct food tax",
  });
  assert.equal(
    Number(bill.totals.payable),
    Number(bill.totals.subtotal) + Number(bill.totals.tax) + 1250,
  );
  bill = await s.editRound(db, actor, key(), bill.id, round.id, {
    version: bill.rounds[0].version,
    items: [{ itemId: menu[0].id, quantity: 3 }],
  });
  assert.equal(Number(bill.rounds[0].charges_total), 1250);
  assert.equal(
    Number(bill.totals.payable),
    Number(bill.totals.subtotal) + Number(bill.totals.tax) + 1250,
  );
  await assert.rejects(
    () => s.changeRoundCharges(db, actor, key(), bill.id, round.id, input),
    /changed|refresh/i,
  );
  await assert.rejects(() =>
    s.changeRoundCharges(db, actor, key(), bill.id, round.id, {
      version: bill.rounds[0].version,
      charges: [{ name: "Bad", amount: -1 }],
    }),
  );
  await assert.rejects(
    () =>
      s.changeRoundCharges(db, actor, key(), bill.id, round.id, {
        version: bill.rounds[0].version,
        charges: [
          { name: "Fee", amount: 1 },
          { name: "fee", amount: 1 },
        ],
      }),
    { code: "DUPLICATE_CHARGE" },
  );
  bill = await s.changeRoundCharges(db, actor, key(), bill.id, round.id, {
    version: bill.rounds[0].version,
    charges: [],
  });
  assert.equal(Number(bill.totals.charges), 0);
  assert.equal(Number(snapshot.snapshot.totals.charges), 1250);
  bill = await s.changeRoundCharges(db, actor, key(), bill.id, round.id, {
    version: bill.rounds[0].version,
    charges: [{ name: "Packaging fee", amount: 500 }],
  });
  bill = await s.decideRound(db, actor, key(), bill.id, round.id, {
    version: bill.rounds[0].version,
    decision: "ACCEPT",
  });
  bill = (await s.reviewRewards(db, actor, key(), bill.id, round.id)).order;
  bill = (
    await s.recordPayment(db, actor, key(), bill.id, round.id, {
      version: bill.rounds[0].version,
      method: "CASH",
      amount: 1,
    })
  ).order;
  await assert.rejects(
    () =>
      s.changeRoundCharges(db, actor, key(), bill.id, round.id, {
        version: bill.rounds[0].version,
        charges: [],
      }),
    { code: "CHARGES_LOCKED" },
  );
  assert.equal((await s.verifyAudit(db, actor)).valid, true);
});
