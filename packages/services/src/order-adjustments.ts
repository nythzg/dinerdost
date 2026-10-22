import {requireWebBillEditable} from './web-bill-policy';
import { z } from "zod";
import type { Database } from "@dinerdost/database";
import {
  ensure,
  quote,
  roundAdjustment,
  requirePermission,
  type Actor,
} from "@dinerdost/core";
import {
  audit,
  command,
  expectedVersion,
  num,
  one,
  scopedOrder,
  type Row,
} from "./shared";
import { orderDetail, resetRewards, evaluateEntitlements, releaseKot } from "./orders";

export async function changeRoundAdjustments(
  db: Database,
  actor: Actor,
  key: string,
  orderId: string,
  roundId: string,
  input: unknown,
  webFlow = false,
) {
  requirePermission(actor, "bill");
  const data = z
    .object({
      version: z.number().int(),
      discount: z.number().int().min(0).max(1000000000),
      roundToRupee: z.boolean(),
      roundingMode: z.enum(["NEAREST", "DOWN"]).default("NEAREST"),
    })
    .strict()
    .parse(input);
  return command(
    db,
    actor,
    key,
    "BILL_ADJUSTMENTS_CHANGED",
    { orderId, roundId, ...data },
    async (tx) => {
      const order = await scopedOrder(tx, actor, orderId, true);
      ensure(
        !["SETTLED", "VOIDED", "REJECTED"].includes(order.status),
        "ORDER_LOCKED",
        "This order is closed.",
        409,
      );
      const round = await one(
        tx,
        "SELECT * FROM order_rounds WHERE id=$1 AND order_id=$2 FOR UPDATE",
        [roundId, orderId],
      );
      expectedVersion(round.version, data.version);
      if(webFlow)await requireWebBillEditable(tx,actor,order,round);
      else { ensure(
        ["DRAFT", "PENDING", "ACCEPTED"].includes(round.status) &&
          num(round.paid) === 0 &&
          (round.kot_status === "HELD" ||
            (["STAFF", "QR_ORDER_ONLY"].includes(round.payment_gate) &&
              round.payment_status !== "PAID")) &&
          !round.postpaid_authorized,
        "ADJUSTMENTS_LOCKED",
        "Adjustments are locked after payment or kitchen authorization.",
        409,
      );
      ensure(
        !(
          await tx.query(
            "SELECT id FROM payment_attempts WHERE round_id=$1 AND state NOT IN ('FAILED','REJECTED') LIMIT 1",
            [roundId],
          )
        ).rows.length,
        "PAYMENT_ACTIVE",
        "Reconcile existing payments before changing adjustments.",
        409,
      );
      }
      const items = (
        await tx.query<Row>(
          "SELECT unit_price,quantity_milli,tax_bps FROM order_items WHERE round_id=$1 ORDER BY id",
          [roundId],
        )
      ).rows;
      const total = quote(
        items.map((i) => ({
          unit_price: num(i.unit_price),
          quantity_milli: num(i.quantity_milli),
          tax_bps: num(i.tax_bps),
        })),
        data.discount,
      );
      const beforeRounding = total.payable + num(round.charges_total);
      const roundOff = roundAdjustment(
        beforeRounding,
        data.roundToRupee,
        data.roundingMode,
      );
      ensure(beforeRounding + roundOff>=num(round.paid),'PAYABLE_BELOW_RECEIVED','The new payable cannot be below the amount already received.',409);
      await resetRewards(tx, roundId);
      await tx.query(
        "UPDATE order_rounds SET manual_discount=$2,discount=$2,tax=$3,payable=$4,round_off=$5,rounding_enabled=$6,rounding_mode=$7,quote_version=NULL,version=version+1 WHERE id=$1",
        [
          roundId,
          data.discount,
          total.tax,
          beforeRounding + roundOff,
          roundOff,
          data.roundToRupee,
          data.roundingMode,
        ],
      );
      if(webFlow){
        const nextPayable=beforeRounding + roundOff;
        await tx.query("UPDATE order_rounds SET payment_status=$2 WHERE id=$1",[roundId,num(round.paid)>0?(num(round.paid)===nextPayable?'PAID':'PARTIALLY_PAID'):'REQUIRED']);
        if(order.customer_id)await evaluateEntitlements(tx,actor,orderId,roundId);
        if(num(round.paid)>0&&num(round.paid)===nextPayable)await releaseKot(tx,actor,order,await one(tx,'SELECT * FROM order_rounds WHERE id=$1',[roundId]));
      }
      await tx.query("UPDATE orders SET version=version+1 WHERE id=$1", [
        orderId,
      ]);
      await audit(tx, actor, {
        action: "BILL_ADJUSTMENTS_CHANGED",
        entityType: "ORDER_ROUND",
        entityId: roundId,
        outletId: order.outlet_id,
        oldState: {
          discount: num(round.discount),
          roundOff: num(round.round_off),
          payable: num(round.payable),
        },
        newState: {
          discount: data.discount,
          roundOff,
          payable: beforeRounding + roundOff,
          roundingMode: data.roundingMode,
        },
        impact: beforeRounding + roundOff - num(round.payable),
        risk: order.bill_print_count > 0 ? "CRITICAL" : "INFO",
        reason:
          "Staff edited bill discount and rounding; reward selection replaced",
      });
      return orderDetail(tx, actor, orderId);
    },
  );
}
