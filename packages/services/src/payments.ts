import { z } from "zod";
import type { Database } from "@dinerdost/database";
import {
  ensure,
  isManager,
  requirePermission,
  requireOutlet,
  paymentMethods,
  type Actor,
} from "@dinerdost/core";
import {
  audit,
  command,
  expectedVersion,
  id,
  num,
  one,
  scopedOrder,
} from "./shared";
import { evaluateEntitlements, orderDetail, releaseKot } from "./orders";
import { stepUp } from "./auth";
import { lockRewardReservations } from "./rewards";

export async function recordPayment(
  db: Database,
  actor: Actor,
  key: string,
  orderId: string,
  roundId: string,
  input: unknown,
  webFlow = false,
) {
  requirePermission(actor, "payments");
  ensure(!webFlow||!actor.application||actor.application==='MASTER','APPLICATION_FORBIDDEN','Use the application payment workflow.',403);
  const data = z
    .object({
      version: z.number().int(),
      method: z.enum(paymentMethods),
      amount: z.number().int().positive(),
      reference: z.string().trim().max(120).default(""),
    })
    .strict()
    .parse(input);
  return command(
    db,
    actor,
    key,
    "PAYMENT_RECORDED",
    {
      orderId,
      roundId,
      version: data.version,
      method: data.method,
      amount: data.amount,
      reference: data.reference,
    },
    async (tx) => {
      const order = await scopedOrder(tx, actor, orderId, true);
      ensure(
        !["SETTLED", "VOIDED", "REJECTED"].includes(order.status),
        "ORDER_LOCKED",
        "This order is closed.",
        409,
      );
      const outlet = await one(
        tx,
        "SELECT payment_methods FROM outlets WHERE id=$1 FOR SHARE",
        [order.outlet_id],
      );
      ensure(
        outlet.payment_methods.includes(data.method),
        "PAYMENT_METHOD_DISABLED",
        "This payment method is not enabled for this outlet.",
        409,
      );
      ensure(
        order.customer_id && order.customer_snapshot?.name,
        "IDENTITY_REQUIRED",
        "Customer name and phone are required before payment.",
      );
      const round = await one(
        tx,
        "SELECT * FROM order_rounds WHERE id=$1 AND order_id=$2 FOR UPDATE",
        [roundId, orderId],
      );
      expectedVersion(round.version, data.version);
      ensure(
        round.status === "ACCEPTED",
        "ORDER_NOT_ACCEPTED",
        "Accept this round before recording payment.",
        409,
      );
      if(webFlow&&(!actor.application||actor.application==='MASTER')&&num(round.quote_version)!==num(round.version)){
        await evaluateEntitlements(tx,actor,orderId,roundId);
        round.quote_version=round.version;
      }
      ensure(
        num(round.quote_version) === num(round.version),
        "ENTITLEMENTS_REQUIRED",
        "Review customer rewards before payment.",
      );
      ensure(
        data.amount <= num(round.payable) - num(round.paid),
        "PAYMENT_EXCEEDS_BALANCE",
        "Payment exceeds the remaining balance.",
        409,
      );
      ensure(
        data.method === "CASH" || data.reference.length >= 6,
        "REFERENCE_REQUIRED",
        "Enter the merchant or bank reference for the received payment.",
      );
      ensure(
        !(
          await tx.query(
            "SELECT id FROM payment_attempts WHERE round_id=$1 AND state IN ('AWAITING_VERIFICATION','UNKNOWN','INITIATED')",
            [roundId],
          )
        ).rows.length,
        "PAYMENT_ALREADY_PENDING",
        "Resolve the existing receipt before recording another payment.",
        409,
      );
      await lockRewardReservations(tx, round);
      const paymentId = id(),
        reference =
          data.method === "CASH" ? `CASH-${paymentId}` : data.reference;
      await tx.query(
        "INSERT INTO payment_attempts(id,restro_id,outlet_id,order_id,round_id,method,amount,order_version,state,reference,verified_by,verified_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'VERIFIED',$9,$10,now())",
        [
          paymentId,
          actor.restroId,
          order.outlet_id,
          orderId,
          roundId,
          data.method,
          data.amount,
          round.version,
          reference,
          actor.employeeId,
        ],
      );
      const paid = num(round.paid) + data.amount;
      await tx.query(
        "UPDATE order_rounds SET paid=$2,payment_status=$3 WHERE id=$1",
        [
          roundId,
          paid,
          paid === num(round.payable) ? "PAID" : "PARTIALLY_PAID",
        ],
      );
      if (paid === num(round.payable))
        await releaseKot(tx, actor, order, { ...round, paid });
      await tx.query("UPDATE orders SET version=version+1 WHERE id=$1", [
        orderId,
      ]);
      await audit(tx, actor, {
        action: data.method === "CASH" ? "CASH_RECEIVED" : "PAYMENT_RECORDED",
        entityType: "PAYMENT",
        entityId: paymentId,
        outletId: order.outlet_id,
        newState: { amount: data.amount, method: data.method, reference },
        reason: "Staff recorded and confirmed receipt in one step",
        impact: data.amount,
      });
      return { paymentId, order: await orderDetail(tx, actor, orderId) };
    },
  );
}

export async function initiatePayment(
  db: Database,
  actor: Actor,
  key: string,
  orderId: string,
  roundId: string,
  input: unknown,
) {
  requirePermission(actor, "payments");
  const data = z
    .object({
      version: z.number().int(),
      method: z.enum([...paymentMethods, "GATEWAY", "TERMINAL"]),
      amount: z.number().int().positive(),
    })
    .strict()
    .parse(input);
  ensure(
    (paymentMethods as readonly string[]).includes(data.method),
    "INTEGRATION_NOT_CONFIGURED",
    "Connect and verify the payment provider before using this method.",
    503,
  );
  return command(
    db,
    actor,
    key,
    "PAYMENT_INITIATED",
    { orderId, roundId, ...data },
    async (tx) => {
      const order = await scopedOrder(tx, actor, orderId, true);
      const outlet = await one(
        tx,
        "SELECT payment_methods FROM outlets WHERE id=$1 FOR SHARE",
        [order.outlet_id],
      );
      ensure(
        outlet.payment_methods.includes(data.method),
        "PAYMENT_METHOD_DISABLED",
        "This payment method is not enabled for this outlet.",
        409,
      );
      ensure(
        order.customer_id && order.customer_snapshot?.name,
        "IDENTITY_REQUIRED",
        "Customer name and phone are required before payment.",
      );
      const round = await one(
        tx,
        "SELECT * FROM order_rounds WHERE id=$1 AND order_id=$2 FOR UPDATE",
        [roundId, orderId],
      );
      expectedVersion(round.version, data.version);
      ensure(
        round.status === "ACCEPTED",
        "ORDER_NOT_ACCEPTED",
        "Accept this round before starting payment.",
        409,
      );
      ensure(
        num(round.quote_version) === num(round.version),
        "ENTITLEMENTS_REQUIRED",
        "Evaluate customer rewards before payment.",
      );
      ensure(
        data.amount <= num(round.payable) - num(round.paid),
        "PAYMENT_EXCEEDS_BALANCE",
        "Payment exceeds the remaining balance.",
      );
      const existing = (
        await tx.query(
          "SELECT id FROM payment_attempts WHERE round_id=$1 AND state IN ('AWAITING_VERIFICATION','UNKNOWN','INITIATED')",
          [roundId],
        )
      ).rows;
      ensure(
        !existing.length,
        "PAYMENT_ALREADY_PENDING",
        "Verify or reconcile the existing payment before creating another.",
        409,
      );
      await lockRewardReservations(tx, round);
      const paymentId = id();
      await tx.query(
        "INSERT INTO payment_attempts(id,restro_id,outlet_id,order_id,round_id,method,amount,order_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          paymentId,
          actor.restroId,
          order.outlet_id,
          orderId,
          roundId,
          data.method,
          data.amount,
          round.version,
        ],
      );
      await tx.query(
        "UPDATE order_rounds SET payment_status='AWAITING_VERIFICATION' WHERE id=$1",
        [roundId],
      );
      await audit(tx, actor, {
        action: "PAYMENT_INITIATED",
        entityType: "PAYMENT",
        entityId: paymentId,
        outletId: order.outlet_id,
        newState: {
          orderId,
          roundId,
          amount: data.amount,
          method: data.method,
          state: "AWAITING_VERIFICATION",
        },
      });
      return { paymentId, order: await orderDetail(tx, actor, orderId) };
    },
  );
}
export async function verifyPayment(
  db: Database,
  actor: Actor,
  key: string,
  paymentId: string,
  input: unknown,
) {
  requirePermission(actor, "payments");
  const data = z
    .object({
      decision: z.enum(["VERIFY", "REJECT", "UNKNOWN"]),
      reason: z.string().trim().min(3).max(500),
      reference: z.string().trim().max(120).default(""),
    })
    .strict()
    .parse(input);
  return command(
    db,
    actor,
    key,
    "PAYMENT_DECISION",
    {
      paymentId,
      decision: data.decision,
      reason: data.reason,
      reference: data.reference,
    },
    async (tx) => {
      const locked = await one(
        tx,
        "SELECT * FROM payment_attempts WHERE id=$1 FOR UPDATE",
        [paymentId],
      );
      const order = await scopedOrder(tx, actor, locked.order_id, true);
      ensure(
        ["AWAITING_VERIFICATION", "UNKNOWN"].includes(locked.state),
        "PAYMENT_LOCKED",
        "This payment decision is already recorded.",
        409,
      );
      const round = await one(
        tx,
        "SELECT * FROM order_rounds WHERE id=$1 FOR UPDATE",
        [locked.round_id],
      );
      expectedVersion(round.version, num(locked.order_version));
      if (data.decision === "VERIFY") {
        ensure(
          locked.method === "CASH" || data.reference.length >= 6,
          "REFERENCE_REQUIRED",
          "Enter the merchant receipt or bank reference you actually verified.",
        );
        const paid = num(round.paid) + num(locked.amount);
        ensure(
          paid <= num(round.payable),
          "PAYMENT_EXCEEDS_BALANCE",
          "The receipt exceeds the remaining payable amount.",
          409,
        );
        await tx.query(
          "UPDATE payment_attempts SET state='VERIFIED',reference=$2,verified_by=$3,verified_at=now() WHERE id=$1",
          [paymentId, data.reference || `CASH-${paymentId}`, actor.employeeId],
        );
        await tx.query(
          "UPDATE order_rounds SET paid=$2,payment_status=$3 WHERE id=$1",
          [
            round.id,
            paid,
            paid === num(round.payable) ? "PAID" : "PARTIALLY_PAID",
          ],
        );
        if (paid === num(round.payable))
          await releaseKot(tx, actor, order, { ...round, paid });
        await audit(tx, actor, {
          action:
            locked.method === "CASH" ? "CASH_RECEIVED" : "PAYMENT_VERIFIED",
          entityType: "PAYMENT",
          entityId: paymentId,
          outletId: order.outlet_id,
          newState: {
            amount: num(locked.amount),
            method: locked.method,
            reference: data.reference,
          },
          reason: data.reason,
          impact: num(locked.amount),
        });
      } else {
        const state = data.decision === "UNKNOWN" ? "UNKNOWN" : "REJECTED";
        await tx.query("UPDATE payment_attempts SET state=$2 WHERE id=$1", [
          paymentId,
          state,
        ]);
        await tx.query(
          "UPDATE order_rounds SET payment_status=$2 WHERE id=$1",
          [round.id, state],
        );
        await audit(tx, actor, {
          action: "PAYMENT_" + state,
          entityType: "PAYMENT",
          entityId: paymentId,
          outletId: order.outlet_id,
          reason: data.reason,
          newState: { state },
        });
      }
      return orderDetail(tx, actor, order.id);
    },
  );
}
export async function setPaymentMethods(
  db: Database,
  actor: Actor,
  key: string,
  input: unknown,
) {
  ensure(
    isManager(actor),
    "FORBIDDEN",
    "Only an owner or manager can choose payment methods.",
    403,
  );
  const data = z
    .object({
      outletId: z.uuid(),
      version: z.number().int(),
      methods: z
        .array(z.enum(paymentMethods))
        .min(1)
        .max(paymentMethods.length),
    })
    .strict()
    .parse(input);
  requireOutlet(actor, data.outletId);
  ensure(
    new Set(data.methods).size === data.methods.length,
    "DUPLICATE_METHOD",
    "Choose each payment method once.",
  );
  return command(
    db,
    actor,
    key,
    "PAYMENT_METHODS_CHANGED",
    data,
    async (tx) => {
      const before = await one(
        tx,
        "SELECT payment_methods,version FROM outlets WHERE id=$1 FOR UPDATE",
        [data.outletId],
      );
      expectedVersion(before.version, data.version);
      await tx.query(
        "UPDATE outlets SET payment_methods=$2,version=version+1 WHERE id=$1",
        [data.outletId, data.methods],
      );
      await audit(tx, actor, {
        action: "PAYMENT_METHODS_CHANGED",
        entityType: "OUTLET",
        entityId: data.outletId,
        outletId: data.outletId,
        oldState: before,
        newState: { methods: data.methods },
      });
      return { ok: true };
    },
  );
}
export async function authorizePostpaid(
  db: Database,
  actor: Actor,
  key: string,
  orderId: string,
  roundId: string,
  input: unknown,
  webFlow = false,
) {
  requirePermission(actor, "payments");
  ensure(!webFlow||!actor.application||actor.application==='MASTER','APPLICATION_FORBIDDEN','Use the application postpaid workflow.',403);
  ensure(isManager(actor), "FORBIDDEN", "Manager approval is required.", 403);
  const data = z
    .object({
      version: z.number().int(),
      reason: webFlow
        ? z
            .string()
            .trim()
            .max(500)
            .default("Staff authorized configured table credit")
        : z.string().trim().min(5).max(500),
      password: webFlow ? z.string().optional() : z.string().min(1),
    })
    .strict()
    .parse(input);
  if (!webFlow) await stepUp(db, actor, data.password!);
  return command(
    db,
    actor,
    key,
    "POSTPAID_AUTHORIZED",
    { orderId, roundId, version: data.version, reason: data.reason },
    async (tx) => {
      const order = await scopedOrder(tx, actor, orderId, true);
      const round = await one(
        tx,
        "SELECT * FROM order_rounds WHERE id=$1 AND order_id=$2 FOR UPDATE",
        [roundId, orderId],
      );
      expectedVersion(round.version, data.version);
      const outlet = await one(tx, "SELECT * FROM outlets WHERE id=$1", [
        order.outlet_id,
      ]);
      if (webFlow)
        ensure(
          order.source === "CUSTOMER_QR" &&
            !round.staff_entered &&
            outlet.qr_enabled &&
            outlet.qr_payment_mode === "PAYMENT" &&
            ["QR_PAYMENT", "LEGACY"].includes(round.payment_gate),
          "POSTPAID_NOT_ALLOWED",
          "Postpaid approval is only available for customer QR payment orders.",
          409,
        );
      ensure(
        ((webFlow && ["QR_PAYMENT","LEGACY"].includes(round.payment_gate)) ||
          outlet.payment_policy === "POSTPAID") &&
          order.session_id,
        "POSTPAID_NOT_ALLOWED",
        "Postpaid authorization requires a configured, active table session.",
      );
      await one(
        tx,
        "SELECT id FROM table_sessions WHERE id=$1 AND status='OPEN'",
        [order.session_id],
        "The table session is closed.",
      );
      ensure(
        order.customer_id,
        "IDENTITY_REQUIRED",
        "Record the customer before authorizing credit.",
      );
      await evaluateEntitlements(tx, actor, orderId, roundId);
      const active = (
        await tx.query(
          "SELECT id FROM payment_attempts WHERE round_id=$1 AND state IN ('AWAITING_VERIFICATION','UNKNOWN','INITIATED')",
          [roundId],
        )
      ).rows;
      ensure(
        !active.length,
        "PAYMENT_RECONCILIATION_REQUIRED",
        "Reconcile the active payment before authorizing postpaid.",
        409,
      );
      await lockRewardReservations(tx, round);
      const authorizedGate=webFlow&&round.payment_gate==='LEGACY'?'QR_PAYMENT':round.payment_gate;
      await tx.query(
        "UPDATE order_rounds SET postpaid_authorized=true,payment_status='AUTHORIZED_POSTPAID',payment_gate=$2 WHERE id=$1",
        [roundId,authorizedGate],
      );
      await audit(tx, actor, {
        action: "POSTPAID_AUTHORIZED",
        entityType: "ORDER_ROUND",
        entityId: roundId,
        outletId: order.outlet_id,
        oldState: {paymentGate:round.payment_gate},
        newState: { amount: num(round.payable),paymentGate:authorizedGate },
        reason: data.reason,
        risk: "WARNING",
      });
      await releaseKot(tx, actor, order, {
        ...round,
        payment_gate:authorizedGate,
        postpaid_authorized: true,
      });
      return orderDetail(tx, actor, orderId);
    },
  );
}
