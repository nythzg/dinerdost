import { z } from "zod";
import {settleReplacementRewards} from './web-replacements';
import type { Database } from "@dinerdost/database";
import {
  can,
  ensure,
  requirePermission,
  taxBreakdown,
  type Actor,
} from "@dinerdost/core";
import { audit, command, id, json, num, one, scopedOrder } from "./shared";
import { orderDetail } from "./orders";

export async function generateBill(
  db: Database,
  actor: Actor,
  key: string,
  orderId: string,
  input: unknown,
) {
  requirePermission(actor, "bill");
  const data = z
    .object({ final: z.boolean().default(false) })
    .strict()
    .parse(input);
  return command(
    db,
    actor,
    key,
    data.final ? "INVOICE_ISSUED" : "PROVISIONAL_BILL_GENERATED",
    { orderId, ...data },
    async (tx) => {
      const order = await scopedOrder(tx, actor, orderId, true);
      ensure(!(await tx.query('SELECT id FROM web_replacements WHERE source_order_id=$1',[orderId])).rows.length,'ALREADY_REPLACED','Use the linked replacement; the original bill remains preserved.',409);
      const detail = await orderDetail(tx, actor, orderId);
      if (data.final) {
        ensure(
          order.customer_id && order.customer_snapshot,
          "IDENTITY_REQUIRED",
          "Customer details are required for the final invoice.",
        );
        ensure(
          detail.rounds.some((r) => r.status === "ACCEPTED"),
          "NO_ACCEPTED_ORDER",
          "There are no accepted rounds to settle.",
        );
        ensure(
          detail.rounds.every(
            (r) =>
              ["REJECTED", "VOIDED"].includes(r.status) ||
              (r.status === "ACCEPTED" &&
                r.kot_status === "SERVED" &&
                (!(
                  ["STAFF", "QR_ORDER_ONLY"].includes(r.payment_gate) &&
                  num(r.payable) === 0
                ) ||
                  (r.payment_status === "PAID" &&
                    num(r.quote_version) === num(r.version))) &&
                num(r.paid) === num(r.payable)),
          ),
          "SETTLEMENT_NOT_READY",
          "Serve all accepted rounds and clear the outstanding balance before final settlement.",
          409,
        );
        const pending = await tx.query(
          "SELECT id FROM payment_attempts WHERE order_id=$1 AND state IN ('AWAITING_VERIFICATION','UNKNOWN','INITIATED')",
          [orderId],
        );
        ensure(
          !pending.rows.length,
          "PAYMENT_RECONCILIATION_REQUIRED",
          "Reconcile pending payment attempts before settlement.",
          409,
        );
        const existing = (
          await tx.query(
            "SELECT * FROM invoices WHERE order_id=$1 AND document_type='FINAL_TAX_INVOICE'",
            [orderId],
          )
        ).rows[0];
        if (existing) return existing;
      }
      const restaurant = await one(
        tx,
        "SELECT * FROM restaurants WHERE id=$1",
        [actor.restroId],
      );
      const outlet = await one(tx, "SELECT * FROM outlets WHERE id=$1", [
        order.outlet_id,
      ]);
      const table = order.session_id
        ? (
            await tx.query(
              "SELECT t.label FROM table_sessions s JOIN dining_tables t ON t.id=s.table_id WHERE s.id=$1",
              [order.session_id],
            )
          ).rows[0]
        : null;
      const documentId = id();
      const count = num(order.bill_print_count) + 1;
      const number = data.final
        ? `${outlet.code}-INV-${String(order.number).padStart(6, "0")}`
        : `${outlet.code}-PB-${String(order.number).padStart(6, "0")}-${count}`;
      const snapshot = {
        restaurant: { name: restaurant.name, restroId: restaurant.id },
        outlet: {
          name: outlet.name,
          address: outlet.address,
          gstin: outlet.gstin,
        },
        customer: order.customer_snapshot,
        receipt: outlet.receipt_settings,
        orderType: order.type,
        tableLabel: table?.label ?? null,
        orderNumber: order.number,
        items: detail.rounds
          .filter((r) => r.status !== "REJECTED" && r.status !== "VOIDED")
          .flatMap((r) => r.items),
        totals: detail.totals,
        taxes: taxBreakdown(detail.totals.tax, order.tax_components),
        charges: detail.rounds
          .filter((round) => !["REJECTED", "VOIDED"].includes(round.status))
          .flatMap((round) => round.charges ?? []),
        documentType: data.final ? "FINAL_TAX_INVOICE" : "PROVISIONAL_BILL",
        number,
        issuedAt: new Date().toISOString(),
        actor: actor.name,
        replacement:(await tx.query('SELECT snapshot FROM web_replacements WHERE target_order_id=$1',[orderId])).rows[0]?.snapshot??null,
      };
      const document = await one(
        tx,
        "INSERT INTO invoices(id,restro_id,outlet_id,order_id,number,document_type,snapshot,created_by) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8) RETURNING *",
        [
          documentId,
          actor.restroId,
          order.outlet_id,
          orderId,
          number,
          snapshot.documentType,
          json(snapshot),
          actor.employeeId,
        ],
      );
      if (!data.final)
        await tx.query("UPDATE orders SET bill_print_count=$2 WHERE id=$1", [
          orderId,
          count,
        ]);
      else {
        await settleReplacementRewards(tx,actor,orderId,documentId);
        await tx.query(
          "UPDATE orders SET status='SETTLED',version=version+1 WHERE id=$1",
          [orderId],
        );
        for (const round of detail.rounds.filter(
          (r) => r.status === "ACCEPTED",
        )) {
          const pending = await tx.query(
            "SELECT * FROM loyalty_ledger WHERE round_id=$1 AND state='PENDING_EARN'",
            [round.id],
          );
          const points = num(pending.rows[0]?.points);
          await tx.query(
            "INSERT INTO loyalty_ledger(id,restro_id,outlet_id,customer_id,order_id,round_id,state,points,settlement_ref,reason) VALUES($1,$2,$3,$4,$5,$6,'EARNED',$7,$8,'Qualifying final settlement') ON CONFLICT(round_id,state) DO NOTHING",
            [
              id(),
              actor.restroId,
              order.outlet_id,
              order.customer_id,
              orderId,
              round.id,
              points,
              documentId,
            ],
          );
          const reservation = (
            await tx.query(
              "SELECT * FROM loyalty_reservations WHERE round_id=$1 AND state IN ('LOCKED','RESERVED') FOR UPDATE",
              [round.id],
            )
          ).rows[0];
          if (reservation) {
            await tx.query(
              "INSERT INTO loyalty_ledger(id,restro_id,outlet_id,customer_id,order_id,round_id,state,points,settlement_ref,reason) VALUES($1,$2,$3,$4,$5,$6,'REDEEMED',$7,$8,'Points used on settled order') ON CONFLICT(round_id,state) DO NOTHING",
              [
                id(),
                actor.restroId,
                order.outlet_id,
                order.customer_id,
                orderId,
                round.id,
                -num(reservation.points),
                documentId,
              ],
            );
            await tx.query(
              "UPDATE loyalty_reservations SET state='REDEEMED' WHERE id=$1",
              [reservation.id],
            );
          }
          await tx.query(
            "UPDATE coupons SET state='REDEEMED' WHERE round_id=$1 AND state='LOCKED'",
            [round.id],
          );
          await audit(tx, actor, {
            action: "LOYALTY_EARNED",
            entityType: "ORDER_ROUND",
            entityId: round.id,
            outletId: order.outlet_id,
            newState: { points, invoiceId: documentId },
          });
        }
        await tx.query(
          "INSERT INTO notifications(id,restro_id,outlet_id,event,order_id,customer_id,state,payload) VALUES($1,$2,$3,'INVOICE_AND_LOYALTY',$4,$5,'NOT_CONFIGURED',$6::jsonb)",
          [
            id(),
            actor.restroId,
            order.outlet_id,
            orderId,
            order.customer_id,
            json({ invoiceId: documentId, number }),
          ],
        );
      }
      await audit(tx, actor, {
        action: data.final
          ? "FINAL_INVOICE_ISSUED"
          : count === 1
            ? "PROVISIONAL_BILL_GENERATED"
            : "BILL_REPRINTED",
        entityType: "INVOICE",
        entityId: documentId,
        outletId: order.outlet_id,
        newState: {
          number,
          documentType: snapshot.documentType,
          printCount: count,
          total: detail.totals.payable,
        },
        risk: !data.final && count > 2 ? "CRITICAL" : "INFO",
      });
      return document;
    },
  );
}
export async function recordPrint(
  db: Database,
  actor: Actor,
  key: string,
  orderId: string,
  input?: unknown,
) {
  ensure(
    can(actor, "bill") || can(actor, "finance"),
    "FORBIDDEN",
    "Your role cannot print invoices.",
    403,
  );
  const data = z
    .object({ invoiceId: z.uuid().optional() })
    .strict()
    .parse(input ?? {});
  return command(
    db,
    actor,
    key,
    "FINAL_INVOICE_REPRINT_REQUESTED",
    { orderId, ...data },
    async (tx) => {
      const order = await scopedOrder(tx, actor, orderId, true);
      const invoice = await one(
        tx,
        "SELECT * FROM invoices WHERE order_id=$1 AND (($2::uuid IS NULL AND document_type='FINAL_TAX_INVOICE') OR id=$2)",
        [orderId, data.invoiceId ?? null],
      );
      const final = invoice.document_type === "FINAL_TAX_INVOICE";
      let count = num(order.bill_print_count);
      if (!final) {
        count++;
        await tx.query("UPDATE orders SET bill_print_count=$2 WHERE id=$1", [
          orderId,
          count,
        ]);
      }
      await audit(tx, actor, {
        action: final ? "FINAL_INVOICE_REPRINT_REQUESTED" : "BILL_REPRINTED",
        risk: !final && count > 2 ? "CRITICAL" : "INFO",
        newState: { printCount: count, documentType: invoice.document_type },
        entityType: "INVOICE",
        entityId: invoice.id,
        outletId: order.outlet_id,
        reason: "Staff requested invoice print",
      });
      return { ok: true };
    },
  );
}
