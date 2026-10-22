import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createEmbeddedDatabase, createPostgresDatabase, type Database } from "@dinerdost/database";
import { businessDate, type Actor } from "@dinerdost/core";
import * as s from "@dinerdost/services";
let db: Database, owner: Actor, w: any, ingredient: any, purchase: any;
const key = () => randomUUID();
before(async () => {
  db = process.env.TEST_DATABASE_URL ? createPostgresDatabase(process.env.TEST_DATABASE_URL) : await createEmbeddedDatabase(); await db.migrate();
  const a = await s.signup(db, { name: "Supply owner", email: "supply-owner@example.test", password: "supply-owner-password-123", restaurant: "Supply QA", outlet: "Main", qrEnabled: true, demo: true }, "supply");
  owner = await s.authenticate(db, a.token); w = await s.workspace(db, owner);
  ingredient = await s.addIngredient(db, owner, key(), { outletId: w.outletId, name: "Flour", unit: "kg" });
  const vendor = await s.saveRecord(db, owner, key(), "vendors", { outletId: w.outletId, title: "Supplier", data: { contact: "Supplier", phone: "", email: "", address: "", gstin: "" } });
  purchase = await s.saveRecord(db, owner, key(), "purchases", { outletId: w.outletId, title: "Flour delivery", data: { vendorId: vendor.id, amount: 20000, reference: "PUR-1", note: "" } });
  await s.recordDecision(db, owner, key(), purchase.id, { version: 1, state: "APPROVED", reason: "Approved purchase" });
});
after(async () => { await db?.close() });
test("purchase receiving atomically creates FIFO batches once and preserves the existing expense", async () => {
  const input = { purchaseId: purchase.id, version: 2, reference: "GRN-1", lines: [{ ingredientId: ingredient.id, batchNumber: "FLOUR-1", quantityMilli: 2000, unitCost: 10000 }] };
  await assert.rejects(s.receivePurchase(db, owner, key(), { ...input, lines: [{ ...input.lines[0], quantityMilli: 3000 }] }), { code: "RECEIPT_VALUE_EXCEEDS_PURCHASE" });
  assert.equal((await s.workspace(db, owner)).batches.length, 0);
  const request = key(), result = await s.receivePurchase(db, owner, request, input);
  assert.deepEqual(await s.receivePurchase(db, owner, request, input), result);
  const updated = await s.workspace(db, owner); assert.equal(updated.batches.length, 1); assert.equal(Number(updated.ingredients[0].on_hand), 2000);
  assert.equal((await s.listRecords(db, owner, "expenses", w.outletId)).length, 1);
  assert.equal((await s.listRecords(db, owner, "purchases", w.outletId))[0].state, "COMPLETED");
  await assert.rejects(s.receivePurchase(db, owner, key(), { ...input, version: 3 }), { code: "PURCHASE_NOT_APPROVED" });
  await assert.rejects(db.query("UPDATE purchase_receipts SET reference='tampered' WHERE id=$1", [result.id]));
});
async function settle() {
  let order = await s.createRound(db, owner, key(), { outletId: w.outletId, type: "TAKEAWAY", customer: { name: "Report guest", phone: "9123456789" }, items: [{ itemId: w.menu[0].id, quantity: 1 }] });
  order = await s.decideRound(db, owner, key(), order.id, order.rounds[0].id, { version: order.rounds[0].version, decision: "ACCEPT" });
  await s.recordPayment(db, owner, key(), order.id, order.rounds[0].id, { version: order.rounds[0].version, method: "CASH", amount: Number(order.rounds[0].payable) });
  const tickets = (await s.workspace(db, owner)).tickets.filter((t: any) => t.order_id === order.id);
  for (const t of tickets) { await s.kitchenDecision(db, owner, key(), t.id, { state: "PREPARING" }); await s.kitchenDecision(db, owner, key(), t.id, { state: "READY" }); }
  await s.serveRound(db, owner, key(), order.id, order.rounds[0].id); await s.generateBill(db, owner, key(), order.id, { final: true });
  return order.id;
}
test("P&L uses complete issued invoices and avoids counting stock purchases twice", async () => {
  await s.saveRecipe(db, owner, key(), { itemId: w.menu[0].id, ingredients: [{ id: ingredient.id, quantityMilli: 500 }] });
  const expense = await s.saveRecord(db, owner, key(), "expenses", { outletId: w.outletId, title: "Utility", data: { category: "Utilities", amount: 1000, date: businessDate(), reference: "UTILITY-1", note: "" } });
  await s.recordDecision(db, owner, key(), expense.id, { version: 1, state: "APPROVED", reason: "Approved utility" });
  await settle();
  const r = await s.financialReport(db, owner, { outletId: w.outletId, from: businessDate(), to: businessDate() });
  assert.equal(r.receipts, Number(w.menu[0].price)); assert.equal(r.orders, 1); assert.equal(r.cogs, 5000);
  assert.equal(r.stockPurchases, 20000); assert.equal(r.expenses, 1000); assert.equal(r.operatingResult, Number(w.menu[0].price) - 6000);
  assert.equal(r.methods[0].method, "CASH");
  await assert.rejects(s.financialReport(db, { ...owner, role: "CASHIER", application: "POS" }, { from: businessDate(), to: businessDate() }), { code: "FORBIDDEN" });
});
test("prep forecasts stay absent without enough actual history and use whole portion quantities", async () => {
  assert.deepEqual((await s.prepPlan(db, owner, { outletId: w.outletId })).items, []);
  await s.saveRecipe(db, owner, key(), { itemId: w.menu[0].id, ingredients: [] });
  for (let week = 1; week <= 4; week++) {
    const id = await settle(); await db.query("UPDATE orders SET created_at=now()-$2*interval '7 days' WHERE id=$1", [id, week]);
  }
  const plan = await s.prepPlan(db, owner, { outletId: w.outletId }); assert.equal(plan.items[0].samples, 4); assert.equal(plan.items[0].quantityMilli, 1000);
  assert.equal((await s.verifyAudit(db, owner)).valid, true);
});
