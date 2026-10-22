import {requireWebBillEditable} from './web-bill-policy';
import { z } from "zod";
import type { Database } from "@dinerdost/database";
import {
  ensure,
  integer,
  quote,
  roundAdjustment,
  requirePermission,
  type Actor,
} from "@dinerdost/core";
import {
  audit,
  command,
  expectedVersion,
  json,
  num,
  one,
  scopedOrder,
  type Row,
} from "./shared";
import { orderDetail, resetRewards, evaluateEntitlements, releaseKot } from "./orders";

export async function changeRoundCharges(
  db: Database,
  actor: Actor,
  key: string,
  orderId: string,
  roundId: string,
  input: unknown,
  webFlow = false,
) {
  requirePermission(actor, "bill");
  ensure(
    actor.role === "OWNER",
    "FORBIDDEN",
    "Only the owner can edit other charges.",
    403,
  );
  const data = z
    .object({
      version: z.number().int(),
      charges: z
        .array(
          z
            .object({
              name: z.string().trim().min(1).max(60),
              amount: z.number().int().min(1).max(1000000000),
            })
            .strict(),
        )
        .max(20),
    })
    .strict()
    .parse(input);
  ensure(
    new Set(data.charges.map((charge) => charge.name.toLowerCase())).size ===
      data.charges.length,
    "DUPLICATE_CHARGE",
    "Use each charge name once.",
  );
  const chargesTotal = integer(
    data.charges.reduce((sum, charge) => sum + charge.amount, 0),
    "Other charges",
  );
  return command(
    db,
    actor,
    key,
    "ORDER_CHARGES_CHANGED",
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
              round.payment_status !== "PAID")),
        "CHARGES_LOCKED",
        "Charges are locked after payment or kitchen release.",
        409,
      );
      ensure(
        !(
          await tx.query(
            "SELECT id FROM payment_attempts WHERE round_id=$1 AND state IN ('INITIATED','AWAITING_VERIFICATION','UNKNOWN','VERIFIED') LIMIT 1",
            [roundId],
          )
        ).rows.length,
        "PAYMENT_ACTIVE",
        "Resolve the existing receipt before changing charges.",
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
        items.map((item) => ({
          unit_price: num(item.unit_price),
          quantity_milli: num(item.quantity_milli),
          tax_bps: num(item.tax_bps),
        })),
        num(round.manual_discount),
      );
      const payable = integer(total.payable + chargesTotal, "Payable amount");
      const roundOff = roundAdjustment(
        payable,
        round.rounding_enabled,
        round.rounding_mode,
      );
      ensure(payable + roundOff>=num(round.paid),'PAYABLE_BELOW_RECEIVED','The new payable cannot be below the amount already received.',409);
      await resetRewards(tx, roundId);
      await tx.query(
        "UPDATE order_rounds SET charges=$2::jsonb,charges_total=$3,discount=manual_discount,tax=$4,payable=$5,round_off=$6,quote_version=NULL,version=version+1 WHERE id=$1",
        [
          roundId,
          json(data.charges),
          chargesTotal,
          total.tax,
          payable + roundOff,
          roundOff,
        ],
      );
      if(webFlow){
        const nextPayable=payable + roundOff;
        await tx.query("UPDATE order_rounds SET payment_status=$2 WHERE id=$1",[roundId,num(round.paid)>0?(num(round.paid)===nextPayable?'PAID':'PARTIALLY_PAID'):'REQUIRED']);
        if(order.customer_id)await evaluateEntitlements(tx,actor,orderId,roundId);
        if(num(round.paid)>0&&num(round.paid)===nextPayable)await releaseKot(tx,actor,order,await one(tx,'SELECT * FROM order_rounds WHERE id=$1',[roundId]));
      }
      await tx.query("UPDATE orders SET version=version+1 WHERE id=$1", [
        orderId,
      ]);
      await audit(tx, actor, {
        action: "ORDER_CHARGES_CHANGED",
        entityType: "ORDER_ROUND",
        entityId: roundId,
        outletId: order.outlet_id,
        oldState: round.charges,
        newState: data.charges,
        reason: "Owner edited named bill charges",
        impact: payable + roundOff - num(round.payable),
        risk: order.bill_print_count > 0 ? "CRITICAL" : "INFO",
      });
      return orderDetail(tx, actor, orderId);
    },
  );
}
