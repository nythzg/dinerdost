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
  num,
  json,
  one,
  scopedOrder,
  type Row,
} from "./shared";
import { orderDetail, resetRewards } from "./orders";

export async function changeOrderTax(
  db: Database,
  actor: Actor,
  key: string,
  orderId: string,
  input: unknown,
) {
  requirePermission(actor, "bill");
  ensure(
    actor.role === "OWNER",
    "FORBIDDEN",
    "Only the owner can change bill tax.",
    403,
  );
  const data = z
    .object({
      version: z.number().int(),
      taxBps: z.number().int().min(0).max(10000).nullable().optional(),
      taxes: z
        .array(
          z
            .object({
              name: z.string().trim().min(1).max(40),
              rateBps: z.number().int().min(0).max(10000),
            })
            .strict(),
        )
        .max(10)
        .optional(),
      reason: z.string().trim().min(3).max(500),
    })
    .strict()
    .parse(input);
  ensure(
    data.taxes !== undefined || data.taxBps !== undefined,
    "TAX_REQUIRED",
    "Choose taxes for this bill.",
  );
  ensure(
    !(data.taxes !== undefined && data.taxBps !== undefined),
    "TAX_REQUIRED",
    "Choose one tax mode.",
  );
  if (data.taxes)
    ensure(
      new Set(data.taxes.map((t) => t.name.toLowerCase())).size ===
        data.taxes.length,
      "DUPLICATE_TAX",
      "Give each tax a different name.",
    );
  const taxBps = data.taxes
    ? data.taxes.reduce((sum, t) => sum + t.rateBps, 0)
    : (data.taxBps ?? null);
  ensure(
    taxBps === null || taxBps <= 10000,
    "TAX_LIMIT",
    "Combined tax cannot exceed 100%.",
  );
  return command(
    db,
    actor,
    key,
    "ORDER_TAX_CHANGED",
    { orderId, ...data },
    async (tx) => {
      const order = await scopedOrder(tx, actor, orderId, true);
      expectedVersion(order.version, data.version);
      ensure(
        !["SETTLED", "VOIDED", "REJECTED"].includes(order.status),
        "ORDER_LOCKED",
        "This order is closed.",
        409,
      );
      const rounds = (
        await tx.query<Row>(
          "SELECT * FROM order_rounds WHERE order_id=$1 AND status NOT IN ('VOIDED','REJECTED') ORDER BY id FOR UPDATE",
          [orderId],
        )
      ).rows;
      ensure(
        rounds.length &&
          rounds.every(
            (round) =>
              num(round.paid) === 0 &&
              (round.kot_status === "HELD" ||
                (["STAFF", "QR_ORDER_ONLY"].includes(round.payment_gate) &&
                  round.payment_status !== "PAID")),
          ),
        "TAX_LOCKED",
        "Tax is locked after payment or kitchen release.",
        409,
      );
      ensure(
        !(
          await tx.query(
            "SELECT id FROM payment_attempts WHERE order_id=$1 AND state IN ('INITIATED','AWAITING_VERIFICATION','UNKNOWN','VERIFIED') LIMIT 1",
            [orderId],
          )
        ).rows.length,
        "PAYMENT_ACTIVE",
        "Resolve existing payments before changing tax.",
        409,
      );
      let impact = 0;
      for (const round of rounds) {
        await resetRewards(tx, round.id);
        await tx.query(
          "UPDATE order_items i SET tax_bps=coalesce($2::integer,m.tax_bps) FROM menu_items m WHERE i.round_id=$1 AND i.item_id=m.id AND i.restro_id=m.restro_id",
          [round.id, taxBps],
        );
        const items = (
          await tx.query<Row>(
            "SELECT unit_price,quantity_milli,tax_bps FROM order_items WHERE round_id=$1 ORDER BY id",
            [round.id],
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
        const payable = integer(
          total.payable + num(round.charges_total),
          "Payable amount",
        );
        const roundOff = roundAdjustment(
          payable,
          round.rounding_enabled,
          round.rounding_mode,
        );
        impact += payable + roundOff - num(round.payable);
        await tx.query(
          "UPDATE order_rounds SET discount=manual_discount,tax=$2,payable=$3,round_off=$4,quote_version=NULL,version=version+1 WHERE id=$1",
          [round.id, total.tax, payable + roundOff, roundOff],
        );
      }
      await tx.query(
        "UPDATE orders SET tax_bps_override=$2,tax_components=$3::jsonb,version=version+1 WHERE id=$1",
        [orderId, taxBps, data.taxes ? json(data.taxes) : null],
      );
      await audit(tx, actor, {
        action: "ORDER_TAX_CHANGED",
        entityType: "ORDER",
        entityId: orderId,
        outletId: order.outlet_id,
        oldState: {
          taxBps: order.tax_bps_override,
          taxes: order.tax_components,
        },
        newState: {
          taxBps,
          taxes: data.taxes ?? null,
          roundIds: rounds.map((round) => round.id),
        },
        reason: data.reason,
        impact,
        risk: order.bill_print_count > 0 ? "CRITICAL" : "INFO",
      });
      return orderDetail(tx, actor, orderId);
    },
  );
}
