import type { Database } from "@dinerdost/database";
import { ensure, type Actor, type Application } from "@dinerdost/core";
import { one } from "./shared";

const orders = ["createRound", "editRound", "decideRound", "identity", "customerProfile", "reward", "reviewRewards", "zeroTotal", "bill", "recordPrint", "serve", "void"];
const tables = ["tableActivity", "tableCapacity", "floor", "floorPlan", "exchangeTables", "closeTable", "openSession", "closeSession", "pair", "merge"];
const commands: Record<Exclude<Application, "MASTER">, readonly string[]> = {
  POS: [...orders, ...tables, "taxSettings", "recordPayment", "initiatePayment", "verifyPayment", "postpaid", "orderTax", "orderCharges", "table", "record", "recordDecision"],
  CAPTAIN: [...orders, ...tables, "service", "attendance", "record", "recordDecision"],
  KITCHEN: ["kitchen", "ingredient", "receipt", "wastage", "receivePurchase", "attendance", "record", "recordDecision"],
  BAR: ["kitchen", "menu", "recipe", "menuCategory", "ingredient", "receipt", "wastage", "receivePurchase", "attendance", "record", "recordDecision"],
  COMMAND: ["employeeProfile", "staffInvite", "revokeStaffInvite", "employeeRole", "employee", "employeeAccess", "shift", "paymentMethods", "qrPolicy", "outlet", "storefront", "record", "recordDecision", "verifyAudit", "recordPrint", "creditNote"],
};
const records: Record<Exclude<Application, "MASTER">, readonly string[]> = {
  POS: ["reservations"], CAPTAIN: ["checklists"], KITCHEN: ["vendors", "purchases", "expenses", "checklists"],
  BAR: ["vendors", "purchases"], COMMAND: ["expenses", "purchases", "brands", "campaigns"],
};
export async function requireApplicationCommand(db: Database, actor: Actor, data: { action: string; id?: string; kind?: string }) {
  const application = actor.application;
  if (!application || application === "MASTER") return;
  ensure(commands[application].includes(data.action), "APPLICATION_FORBIDDEN", "This operation is not available in this application.", 403);
  if (data.action === "record" || data.action === "recordDecision") {
    const kind = data.action === "record" ? data.kind : await db.transaction(actor.restroId, async tx => (await one(tx, "SELECT kind FROM records WHERE id=$1", [data.id])).kind);
    ensure(records[application].includes(kind), "APPLICATION_FORBIDDEN", "This record belongs to another operational application.", 403);
  }
}
