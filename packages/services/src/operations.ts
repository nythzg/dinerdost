import { z } from "zod";
import type { Database } from "@dinerdost/database";
import {
  ensure,
  isManager,
  requireOutlet,
  requirePermission,
  type Actor,
} from "@dinerdost/core";
import {
  audit,
  command,
  expectedVersion,
  id,
  one,
  scopedOrder,
} from "./shared";
import { releaseStock } from "./stock";
import { orderDetail } from "./orders";
export async function voidRound(
  db: Database,
  actor: Actor,
  key: string,
  orderId: string,
  roundId: string,
  input: unknown,
) {
  requirePermission(actor, "accept");
  ensure(
    isManager(actor),
    "FORBIDDEN",
    "A manager must authorize a void.",
    403,
  );
  const data = z
    .object({
      version: z.number().int(),
      reason: z.string().trim().min(5).max(500),
    })
    .strict()
    .parse(input);
  return command(
    db,
    actor,
    key,
    "ROUND_VOIDED",
    { orderId, roundId, ...data },
    async (tx) => {
      const order = await scopedOrder(tx, actor, orderId, true);
      const round = await one(
        tx,
        "SELECT * FROM order_rounds WHERE id=$1 AND order_id=$2 FOR UPDATE",
        [roundId, orderId],
      );
      expectedVersion(round.version, data.version);
      ensure(
        !["SETTLED", "VOIDED"].includes(order.status) &&
          round.kot_status === "HELD" &&
          Number(round.paid) === 0,
        "VOID_BLOCKED",
        "Only unpaid rounds held from the kitchen can be voided.",
        409,
      );
      const attempts = (
        await tx.query(
          "SELECT id FROM payment_attempts WHERE round_id=$1 AND state NOT IN ('REJECTED','FAILED')",
          [roundId],
        )
      ).rows;
      ensure(
        !attempts.length,
        "PAYMENT_RECONCILIATION_REQUIRED",
        "Reconcile the payment before voiding this round.",
        409,
      );
      await releaseStock(tx, roundId);
      await tx.query(
        "UPDATE coupons SET state='AVAILABLE',round_id=NULL,round_version=NULL,reserved_until=NULL WHERE round_id=$1 AND state IN ('RESERVED','LOCKED')",
        [roundId],
      );
      await tx.query(
        "UPDATE loyalty_reservations SET state='RELEASED' WHERE round_id=$1",
        [roundId],
      );
      await tx.query(
        "UPDATE order_rounds SET status='VOIDED',version=version+1 WHERE id=$1",
        [roundId],
      );
      await tx.query(
        "UPDATE orders SET version=version+1,status=CASE WHEN EXISTS(SELECT 1 FROM order_rounds WHERE order_id=$1 AND status NOT IN ('VOIDED','REJECTED')) THEN 'ACCEPTED' ELSE 'VOIDED' END WHERE id=$1",
        [orderId],
      );
      await audit(tx, actor, {
        action:
          order.bill_print_count > 0
            ? "VOID_AFTER_PROVISIONAL_BILL"
            : "ROUND_VOIDED",
        entityType: "ORDER_ROUND",
        entityId: roundId,
        outletId: order.outlet_id,
        reason: data.reason,
        impact: -Number(round.payable),
        risk: order.bill_print_count > 0 ? "CRITICAL" : "WARNING",
      });
      return orderDetail(tx, actor, orderId);
    },
  );
}
export async function serviceTask(
  db: Database,
  actor: Actor,
  key: string,
  input: unknown,
) {
  requirePermission(actor, "sessions");
  const data = z
    .object({
      sessionId: z.uuid().nullish(),
      id: z.uuid().optional(),
      kind: z.enum([
        "WATER",
        "CUTLERY",
        "CLEANUP",
        "BILL",
        "HELP",
        "ACTIVATE_TABLE",
        "ASSISTANCE",
      ]),
      state: z.enum(["OPEN", "ACCEPTED", "COMPLETED", "REJECTED"]),
      reason: z.string().trim().max(500).default(""),
    })
    .strict()
    .parse(input);
  if (data.kind === "ACTIVATE_TABLE")
    ensure(
      data.state === "REJECTED" && !data.sessionId,
      "STAFF_ACTIVATION_REQUIRED",
      "Use Activate table to approve this request.",
      409,
    );
  return command(
    db,
    actor,
    key,
    "SERVICE_REQUEST_CHANGED",
    data,
    async (tx) => {
      if (!data.sessionId) {
        ensure(
          data.id && data.state !== "OPEN",
          "SERVICE_REFERENCE_REQUIRED",
          "Choose an existing table request.",
        );
        const task = await one(
          tx,
          "SELECT * FROM service_requests WHERE id=$1 AND session_id IS NULL AND kind=$2 AND state IN ('OPEN','ACCEPTED','ESCALATED') FOR UPDATE",
          [data.id, data.kind],
        );
        requireOutlet(actor, task.outlet_id);
        ensure(
          actor.role !== "WAITER" ||
            !task.owner_id ||
            task.owner_id === actor.employeeId,
          "TABLE_NOT_ASSIGNED",
          "This request is assigned to another employee.",
          403,
        );
        if (data.state === "REJECTED")
          ensure(
            data.reason.length >= 3,
            "REASON_REQUIRED",
            "Enter a reason for rejecting this request.",
          );
        ensure(
          data.state === "REJECTED" ||
            (data.state === "ACCEPTED"
              ? task.state === "OPEN"
              : ["ACCEPTED", "ESCALATED"].includes(task.state)),
          "INVALID_STATE",
          "Accept the service request before completing it.",
          409,
        );
        await tx.query(
          "UPDATE service_requests SET state=$2,owner_id=COALESCE(owner_id,$3),rejection_reason=$4,accepted_at=CASE WHEN $2='ACCEPTED' THEN now() ELSE accepted_at END,completed_at=CASE WHEN $2='COMPLETED' THEN now() ELSE NULL END WHERE id=$1",
          [
            task.id,
            data.state,
            actor.employeeId,
            data.state === "REJECTED" ? data.reason : "",
          ],
        );
        await audit(tx, actor, {
          action: "SERVICE_" + data.state,
          entityType: "SERVICE_REQUEST",
          entityId: task.id,
          outletId: task.outlet_id,
          tableId: task.table_id,
          newState: data,
          reason: data.reason,
        });
        return { id: task.id };
      }
      const session = await one(
        tx,
        "SELECT * FROM table_sessions WHERE id=$1 AND status='OPEN' FOR UPDATE",
        [data.sessionId],
      );
      requireOutlet(actor, session.outlet_id);
      ensure(
        actor.role !== "WAITER" ||
          session.owner_employee_id === actor.employeeId,
        "TABLE_NOT_ASSIGNED",
        "This table is not assigned to you.",
        403,
      );
      let taskId: string;
      if (data.state === "OPEN") {
        taskId = id();
        await tx.query(
          "INSERT INTO service_requests(id,restro_id,outlet_id,session_id,kind,owner_id) VALUES($1,$2,$3,$4,$5,$6)",
          [
            taskId,
            actor.restroId,
            session.outlet_id,
            session.id,
            data.kind,
            session.owner_employee_id,
          ],
        );
      } else {
        if (data.state === "REJECTED")
          ensure(
            data.reason.length >= 3,
            "REASON_REQUIRED",
            "Enter a reason for rejecting this request.",
          );
        const task = await one(
          tx,
          "SELECT * FROM service_requests WHERE session_id=$1 AND kind=$2 AND ($3::uuid IS NULL OR id=$3) AND state IN ('OPEN','ACCEPTED','ESCALATED') FOR UPDATE",
          [session.id, data.kind, data.id ?? null],
        );
        ensure(
          data.state === "REJECTED"
            ? true
            : data.state === "ACCEPTED"
              ? task.state === "OPEN"
              : ["ACCEPTED", "ESCALATED"].includes(task.state),
          "INVALID_STATE",
          "Accept the service request before completing it.",
          409,
        );
        taskId = task.id;
        await tx.query(
          "UPDATE service_requests SET state=$2,rejection_reason=$3,accepted_at=CASE WHEN $2='ACCEPTED' THEN now() ELSE accepted_at END,completed_at=CASE WHEN $2='COMPLETED' THEN now() ELSE NULL END WHERE id=$1",
          [taskId, data.state, data.state === "REJECTED" ? data.reason : ""],
        );
      }
      await audit(tx, actor, {
        action: "SERVICE_" + data.state,
        entityType: "SERVICE_REQUEST",
        entityId: taskId,
        outletId: session.outlet_id,
        newState: data,
        reason: data.reason,
      });
      return { id: taskId };
    },
  );
}
