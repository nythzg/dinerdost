import { z } from "zod";
import type { Database } from "@dinerdost/database";
import {
  ensure,
  requireOutlet,
  requirePermission,
  businessDate,
  type Actor,
  type Permission,
  can,
} from "@dinerdost/core";
import { audit, command, expectedVersion, id, json, one } from "./shared";
import { holdReservation } from "./reservations";
import { bindCustomer } from "./customer-identity";
import { actorStream, requireInventoryStream } from "./operational-access";
const text = z.string().trim().min(1).max(250),
  money = z.number().int().min(0).max(1000000000);
const definitions = {
  reservations: {
    permission: "sessions",
    schema: z
      .object({
        guest: text,
        phone: z.string().trim().min(10).max(25),
        guests: z.number().int().min(1).max(100),
        at: z.iso.datetime(),
        tableId: z.uuid(),
        durationMinutes: z.number().int().min(15).max(720).default(90),
        note: z.string().max(500).default(""),
      })
      .strict(),
  },
  vendors: {
    permission: "procurement",
    schema: z
      .object({
        contact: text,
        phone: z.string().max(20),
        email: z.email().or(z.literal("")),
        address: z.string().max(500),
        gstin: z.string().max(15),
        category: z.string().trim().max(80).default(""),
        description: z.string().trim().max(500).default(""),
        permitReference: z.string().trim().max(120).default(""),
      })
      .strict(),
  },
  purchases: {
    permission: "procurement",
    schema: z
      .object({
        vendorId: z.uuid(),
        reference: text,
        amount: money,
        note: z.string().max(500),
      })
      .strict(),
  },
  expenses: {
    permission: "finance",
    schema: z
      .object({
        category: z.enum([
          "Rent",
          "Utilities",
          "Maintenance",
          "Supplies",
          "Other",
        ]),
        amount: money,
        date: z.iso.date(),
        reference: text,
        note: z.string().max(500),
      })
      .strict(),
  },
  checklists: {
    permission: "sessions",
    schema: z
      .object({
        due: z.iso.date(),
        employeeId: z.uuid(),
        instructions: z.string().trim().min(1).max(2000),
      })
      .strict(),
  },
  brands: {
    permission: "settings",
    schema: z
      .object({ description: z.string().max(500), active: z.boolean() })
      .strict(),
  },
  campaigns: {
    permission: "customers",
    schema: z
      .object({
        audience: z.enum(["All opted-in", "New", "Returning", "At risk"]),
        message: z.string().trim().min(1).max(1000),
      })
      .strict(),
  },
} as const;
export type RecordKind = keyof typeof definitions;
function definition(kind: string) {
  ensure(
    Object.hasOwn(definitions, kind),
    "UNKNOWN_RESOURCE",
    "This module is unavailable.",
    404,
  );
  return definitions[kind as RecordKind];
}
export async function listRecords(
  db: Database,
  actor: Actor,
  kind: string,
  outletId: string,
) {
  const def = definition(kind);
  if (kind === "expenses" && can(actor, "ownExpenses")) {
    /* Only own drafts are returned below. */
  } else if (kind === "checklists" && can(actor, "ownChecklists")) {
    /* Only assigned duties are returned below. */
  } else requirePermission(actor, def.permission as Permission);
  requireOutlet(actor, outletId);
  return db.transaction(
    actor.restroId,
    async (tx) =>
      (
        await tx.query(
          "SELECT * FROM records WHERE kind=$1 AND outlet_id=$2 AND ($3::text IS NULL OR production_stream=$3 OR kind NOT IN ('vendors','purchases','expenses')) AND (NOT $4 OR created_by=$5) AND (NOT $6 OR data->>'employeeId'=$5::text) ORDER BY created_at DESC LIMIT 200",
          [
            kind,
            outletId,
            actorStream(actor),
            kind === "expenses" && !can(actor, "finance"),
            actor.employeeId,
            kind === "checklists" && can(actor, "ownChecklists"),
          ],
        )
      ).rows,
  );
}
export async function saveRecord(
  db: Database,
  actor: Actor,
  key: string,
  kind: string,
  input: unknown,
) {
  const def = definition(kind);
  if (
    !(kind === "expenses" && can(actor, "ownExpenses")) &&
    !(kind === "checklists" && can(actor, "ownChecklists"))
  )
    requirePermission(actor, def.permission as Permission);
  const data = z
    .object({
      id: z.uuid().optional(),
      version: z.number().int().optional(),
      outletId: z.uuid(),
      title: text,
      data: z.unknown(),
      stream: z.enum(["FOOD", "BAR"]).optional(),
    })
    .strict()
    .parse(input);
  requireOutlet(actor, data.outletId);
  const values = def.schema.parse(data.data);
  return command(
    db,
    actor,
    key,
    "RECORD_SAVED",
    { kind, ...data, data: values },
    async (tx) => {
      if (kind === "reservations") {
        const reservation = values as {
          guest: string;
          phone: string;
          customerId?: string;
        };
        const bound = await bindCustomer(
          tx,
          actor.restroId,
          reservation.guest,
          reservation.phone,
        );
        reservation.guest = bound.snapshot.name;
        reservation.phone = bound.snapshot.phone;
        reservation.customerId = bound.customer.id;
      }
      const recordId = data.id ?? id();
      let stream: string | null = ["vendors", "purchases", "expenses"].includes(
        kind,
      )
        ? (data.stream ?? actorStream(actor) ?? "FOOD")
        : null;
      if (kind === "purchases") {
        const vendor = await one(
          tx,
          "SELECT production_stream FROM records WHERE id=$1 AND kind='vendors' AND outlet_id=$2 AND state<>'CANCELLED'",
          [(values as { vendorId: string }).vendorId, data.outletId],
        );
        stream = vendor.production_stream ?? "FOOD";
      }
      if (stream)
        requireInventoryStream(actor, stream === "BAR" ? "LIQUOR" : "GENERAL");
      if (kind === "checklists" && can(actor, "ownChecklists"))
        ensure(
          (values as { employeeId: string }).employeeId === actor.employeeId,
          "FORBIDDEN",
          "Only your assigned duties are available in this application.",
          403,
        );
      if (kind === "checklists") {
        const assigned = await one(
          tx,
          "SELECT role,outlet_ids FROM employees WHERE id=$1 AND active=true",
          [(values as { employeeId: string }).employeeId],
        );
        ensure(
          assigned.role === "OWNER" ||
            assigned.outlet_ids.includes(data.outletId),
          "OUTLET_FORBIDDEN",
          "Choose an active employee assigned to this outlet.",
          403,
        );
      }
      let previous = null;
      if (data.id) {
        previous = await one(
          tx,
          "SELECT * FROM records WHERE id=$1 AND kind=$2 AND outlet_id=$3 FOR UPDATE",
          [data.id, kind, data.outletId],
        );
        expectedVersion(previous.version, data.version ?? 0);
        if (actorStream(actor))
          requireInventoryStream(
            actor,
            previous.production_stream === "BAR" ? "LIQUOR" : "GENERAL",
          );
        if (kind === "expenses" && !can(actor, "finance"))
          ensure(
            previous.created_by === actor.employeeId,
            "FORBIDDEN",
            "Only your own expense drafts can be edited.",
            403,
          );
        if (kind === "checklists" && can(actor, "ownChecklists"))
          ensure(
            previous.data.employeeId === actor.employeeId,
            "FORBIDDEN",
            "This task is assigned to another employee.",
            403,
          );
        if (kind === "vendors" && previous.production_stream !== stream) {
          ensure(
            !(
              await tx.query(
                "SELECT id FROM records WHERE kind='purchases' AND data->>'vendorId'=$1",
                [previous.id],
              )
            ).rows.length,
            "VENDOR_IN_USE",
            "A vendor with purchases must retain its stock stream.",
            409,
          );
        }
        ensure(
          previous.state === "DRAFT" ||
            (kind === "vendors" && previous.state !== "CANCELLED") ||
            (kind === "checklists" &&
              ["APPROVED", "COMPLETED"].includes(previous.state)) ||
            (kind === "reservations" && previous.state === "APPROVED"),
          "RECORD_LOCKED",
          "Approved records cannot be edited.",
          409,
        );
        if (kind === "reservations") {
          const booking = (
            await tx.query(
              "SELECT state FROM table_reservations WHERE id=$1 FOR UPDATE",
              [recordId],
            )
          ).rows[0];
          ensure(
            !booking || booking.state === "HELD",
            "RESERVATION_IN_USE",
            "A seated or closed reservation cannot be rescheduled.",
            409,
          );
        }
        await tx.query(
          "UPDATE records SET title=$2,data=$3::jsonb,production_stream=$4,version=version+1 WHERE id=$1",
          [recordId, data.title, json(values), stream],
        );
      } else
        await tx.query(
          "INSERT INTO records(id,restro_id,outlet_id,kind,title,data,created_by,production_stream) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8)",
          [
            recordId,
            actor.restroId,
            data.outletId,
            kind,
            data.title,
            json(values),
            actor.employeeId,
            stream,
          ],
        );
      if (kind === "reservations")
        await holdReservation(
          tx,
          recordId,
          actor.restroId,
          data.outletId,
          values,
        );
      if (kind === "purchases")
        await one(
          tx,
          "SELECT id FROM records WHERE id=$1 AND kind='vendors' AND outlet_id=$2",
          [(values as { vendorId: string }).vendorId, data.outletId],
        );
      await audit(tx, actor, {
        action: kind.toUpperCase() + "_SAVED",
        entityType: kind.toUpperCase(),
        entityId: recordId,
        outletId: data.outletId,
        oldState: previous,
        newState: { title: data.title, data: values, stream },
      });
      return { id: recordId };
    },
  );
}
export async function recordDecision(
  db: Database,
  actor: Actor,
  key: string,
  recordId: string,
  input: unknown,
) {
  const data = z
    .object({
      version: z.number().int(),
      state: z.enum(["APPROVED", "CANCELLED", "COMPLETED"]),
      reason: z.string().trim().min(3).max(500),
    })
    .strict()
    .parse(input);
  return command(
    db,
    actor,
    key,
    "RECORD_DECISION",
    { recordId, ...data },
    async (tx) => {
      const record = await one(
        tx,
        "SELECT * FROM records WHERE id=$1 FOR UPDATE",
        [recordId],
      );
      const def = definition(record.kind);
      if (!(record.kind === "checklists" && can(actor, "ownChecklists")))
        requirePermission(actor, def.permission as Permission);
      requireOutlet(actor, record.outlet_id);
      if (["vendors", "purchases", "expenses"].includes(record.kind))
        requireInventoryStream(
          actor,
          record.production_stream === "BAR" ? "LIQUOR" : "GENERAL",
        );
      if (record.kind === "checklists" && can(actor, "ownChecklists"))
        ensure(
          record.data.employeeId === actor.employeeId &&
            data.state === "COMPLETED",
          "FORBIDDEN",
          "You can complete only your assigned tasks.",
          403,
        );
      expectedVersion(record.version, data.version);
      ensure(
        record.state === "DRAFT" ||
          (record.state === "APPROVED" &&
            (data.state === "COMPLETED" ||
              (record.kind === "reservations" && data.state === "CANCELLED"))),
        "RECORD_LOCKED",
        "This record has already been closed.",
        409,
      );
      if (["expenses", "purchases"].includes(record.kind))
        ensure(
          ["OWNER", "ACCOUNTANT"].includes(actor.role),
          "APPROVAL_REQUIRED",
          "The owner or accountant must approve financial records.",
          403,
        );
      ensure(
        record.kind !== "campaigns" || data.state !== "COMPLETED",
        "PROVIDER_REQUIRED",
        "Campaign sending requires a connected messaging provider.",
      );
      await tx.query(
        "UPDATE records SET state=$2,version=version+1,approved_by=$3 WHERE id=$1",
        [recordId, data.state, actor.employeeId],
      );
      if (
        record.kind === "reservations" &&
        ["CANCELLED", "COMPLETED"].includes(data.state)
      )
        await tx.query("UPDATE table_reservations SET state=$2 WHERE id=$1", [
          record.id,
          data.state,
        ]);
      if (record.kind === "purchases" && data.state === "APPROVED") {
        const expenseId = id();
        const expense = {
          category: "Supplies",
          amount: Number(record.data.amount),
          date: businessDate(),
          reference: record.data.reference,
          note: record.data.note ?? "",
          sourcePurchaseId: record.id,
        };
        await tx.query(
          "INSERT INTO records(id,restro_id,outlet_id,kind,title,state,data,created_by,approved_by,production_stream) VALUES($1,$2,$3,'expenses',$4,'APPROVED',$5::jsonb,$6,$6,$7)",
          [
            expenseId,
            actor.restroId,
            record.outlet_id,
            record.title,
            json(expense),
            actor.employeeId,
            record.production_stream,
          ],
        );
        await audit(tx, actor, {
          action: "PURCHASE_EXPENSE_POSTED",
          entityType: "EXPENSES",
          entityId: expenseId,
          outletId: record.outlet_id,
          newState: expense,
          reason: "Approved purchase posted automatically",
          impact: -expense.amount,
        });
      }
      await audit(tx, actor, {
        action: record.kind.toUpperCase() + "_" + data.state,
        entityType: record.kind.toUpperCase(),
        entityId: recordId,
        outletId: record.outlet_id,
        oldState: { state: record.state },
        newState: { state: data.state },
        reason: data.reason,
        impact:
          record.kind === "expenses" && data.state === "APPROVED"
            ? -Number(record.data.amount)
            : 0,
      });
      return { ok: true };
    },
  );
}
