import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createEmbeddedDatabase, createPostgresDatabase, type Database } from "@dinerdost/database";
import { businessDate, type Actor, type Application, type Role } from "@dinerdost/core";
import * as s from "@dinerdost/services";
let db: Database, owner: Actor, outletId: string, menu: any[];
const key = () => randomUUID(); const password = "application-role-password-123";
const emails: Partial<Record<Role, string>> = {};
async function account(role: Role, application: Application) {
  const reply = await s.login(db, { email: emails[role], password, application }, "app-test");
  return s.authenticate(db, reply.token);
}
before(async () => {
  db = process.env.TEST_DATABASE_URL ? createPostgresDatabase(process.env.TEST_DATABASE_URL) : await createEmbeddedDatabase();
  await db.migrate();
  const reply = await s.signup(db, { name: "App Owner", email: "apps-owner@example.test", password, restaurant: "Application QA", outlet: "Main", qrEnabled: true, demo: true }, "apps");
  owner = await s.authenticate(db, reply.token); emails.OWNER = "apps-owner@example.test";
  const w = await s.workspace(db, owner); outletId = w.outletId; menu = w.menu;
  for (const role of ["CASHIER", "WAITER", "KITCHEN", "BARTENDER", "ACCOUNTANT"] as const) {
    emails[role] = role.toLowerCase() + "-apps@example.test";
    await s.addEmployee(db, owner, key(), { name: role, email: emails[role], password, role, outletIds: [outletId] });
  }
});
after(async () => { await db?.close() });
test("server-bound application sessions restrict roles, data, commands and existing session role changes", async () => {
  for (const [role, app] of [["CASHIER", "COMMAND"], ["WAITER", "POS"], ["KITCHEN", "BAR"], ["BARTENDER", "KITCHEN"]] as [Role, Application][])
    await assert.rejects(account(role, app), { code: "APPLICATION_FORBIDDEN" });
  const pos = await account("CASHIER", "POS");
  const w = await s.workspace(db, pos); assert.ok(w.metrics); assert.ok(w.tables); assert.ok(w.payments);
  for (const field of ["ingredients", "employees", "audit", "tickets", "attendance"]) assert.equal(w[field], undefined);
  await assert.rejects(s.addIngredient(db, pos, key(), { outletId, name: "Denied", unit: "kg" }), { code: "FORBIDDEN" });
  const command = await account("OWNER", "COMMAND");
  assert.equal((await s.workspace(db, command)).tables, undefined);
  await assert.rejects(s.openSession(db, command, key(), { tableId: w.tables[0].id, guests: 1 }), { code: "FORBIDDEN" });
  const waiterReply = await s.login(db, { email: emails.WAITER, password, application: "CAPTAIN" }, "role-change");
  const waiter = await s.authenticate(db, waiterReply.token);
  await s.updateEmployeeRole(db, owner, key(), waiter.employeeId, { version: 1, role: "CASHIER", outletIds: [outletId], active: true, password });
  await assert.rejects(s.authenticate(db, waiterReply.token), { code: "UNAUTHENTICATED" });
  await s.updateEmployeeRole(db, owner, key(), waiter.employeeId, { version: 2, role: "WAITER", outletIds: [outletId], active: true, password });
});
test("food and bar KDS split a mixed station, exclude the other stream and enforce direct-write scope", async () => {
  const food = menu.find(m => m.name === "Paneer tikka"), bar = menu.find(m => m.name === "Mint cooler");
  await db.query("UPDATE menu_items SET station='Shared pass' WHERE id=ANY($1::uuid[])", [[food.id, bar.id]]);
  let order = await s.createRound(db, owner, key(), { outletId, type: "TAKEAWAY", customer: { name: "App guest", phone: "9123456789" }, items: [{ itemId: food.id, quantity: 1 }, { itemId: bar.id, quantity: 1 }] });
  order = await s.decideRound(db, owner, key(), order.id, order.rounds[0].id, { version: order.rounds[0].version, decision: "ACCEPT" });
  await s.recordPayment(db, owner, key(), order.id, order.rounds[0].id, { version: order.rounds[0].version, method: "CASH", amount: Number(order.rounds[0].payable) });
  const chef = await account("KITCHEN", "KITCHEN"), bartender = await account("BARTENDER", "BAR");
  const f = await s.workspace(db, chef), b = await s.workspace(db, bartender);
  assert.equal(f.tickets.length, 1); assert.equal(b.tickets.length, 1);
  assert.equal(f.tickets[0].production_stream, "FOOD"); assert.equal(b.tickets[0].production_stream, "BAR");
  assert.deepEqual(f.tickets[0].items.map((i: any) => i.name), [food.name]);
  assert.deepEqual(b.tickets[0].items.map((i: any) => i.name), [bar.name]);
  for (const w of [f, b]) for (const field of ["customers", "orders", "payments", "invoices", "employees", "audit"]) assert.equal(w[field], undefined);
  await assert.rejects(s.kitchenDecision(db, chef, key(), b.tickets[0].id, { state: "PREPARING" }), { code: "STREAM_FORBIDDEN" });
  await s.kitchenDecision(db, chef, key(), f.tickets[0].id, { state: "PREPARING" });
  await s.kitchenDecision(db, chef, key(), f.tickets[0].id, { state: "READY" });
  await assert.rejects(s.serveRound(db, owner, key(), order.id, order.rounds[0].id), { code: "FOOD_NOT_READY" });
  await s.kitchenDecision(db, bartender, key(), b.tickets[0].id, { state: "PREPARING" });
  await s.kitchenDecision(db, bartender, key(), b.tickets[0].id, { state: "READY" });
  await s.serveRound(db, owner, key(), order.id, order.rounds[0].id);
  const alerts = await s.notificationInbox(db, chef, { outletId });
  assert.ok(alerts.items.length > 0); assert.ok(alerts.items.every((a: any) => ["KITCHEN_TICKET", "ORDER_READY"].includes(a.kind)));
});
test("food/bar stock and procurement are isolated; staff see only their own attendance and assignments", async () => {
  const chef = await account("KITCHEN", "KITCHEN"), bartender = await account("BARTENDER", "BAR"), waiter = await account("WAITER", "CAPTAIN");
  const food = await s.addIngredient(db, chef, key(), { outletId, name: "Food flour", unit: "kg" });
  const liquor = await s.addIngredient(db, bartender, key(), { outletId, name: "Bar whisky", unit: "L", category: "LIQUOR" });
  await assert.rejects(s.receiveStock(db, chef, key(), { ingredientId: liquor.id, batchNumber: "DENIED", quantityMilli: 1000, unitCost: 100, reference: "Scope test" }), { code: "STREAM_FORBIDDEN" });
  await assert.rejects(s.addIngredient(db, chef, key(), { outletId, name: "Wrong stream", unit: "L", category: "LIQUOR" }), { code: "STREAM_FORBIDDEN" });
  const vendor = await s.saveRecord(db, bartender, key(), "vendors", { outletId, title: "Bar supplier", data: { contact: "Supplier", phone: "", email: "", address: "", gstin: "", permitReference: "PERMIT-TEST" } });
  const rows = await s.listRecords(db, chef, "vendors", outletId); assert.equal(rows.length, 0);
  await assert.rejects(s.saveRecord(db, chef, key(), "purchases", { outletId, title: "Wrong vendor", data: { vendorId: vendor.id, reference: "Scope", amount: 100, note: "" } }), { code: "STREAM_FORBIDDEN" });
  assert.equal((await s.workspace(db, bartender)).ingredients.some((i: any) => i.id === food.id), false);
  const shift = await s.saveShift(db, owner, key(), { outletId, name: "Morning", start: "09:00", end: "18:00" });
  await s.markAttendance(db, waiter, key(), { outletId, shiftId: shift.id, employeeId: waiter.employeeId, date: businessDate(), mode: "CHECK_IN" });
  await assert.rejects(s.markAttendance(db, waiter, key(), { outletId, shiftId: shift.id, employeeId: chef.employeeId, date: businessDate(), mode: "CHECK_IN" }), { code: "FORBIDDEN" });
  const w = await s.workspace(db, waiter); assert.equal(w.attendance.length, 1); assert.equal(w.attendance[0].employee_id, waiter.employeeId);
  await s.saveRecord(db, owner, key(), "checklists", { outletId, title: "Chef duty", data: { due: businessDate(), employeeId: chef.employeeId, instructions: "Station opening" } });
  assert.equal((await s.listRecords(db, waiter, "checklists", outletId)).length, 0);
  assert.equal((await s.listRecords(db, chef, "checklists", outletId)).length, 1);
  assert.equal((await s.verifyAudit(db, owner)).valid, true);
});
