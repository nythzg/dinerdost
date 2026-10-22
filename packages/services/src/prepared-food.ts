import { z } from "zod";
import type { Database } from "@dinerdost/database";
import {
  ensure,
  isManager,
  requirePermission,
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
  type Row,
} from "./shared";
import { orderDetail, resetRewards } from "./orders";
import { refreshOrderStatus } from "./order-state";
import { ensureMenuCategory } from "./menu-categories";

export async function cancelPreparedRound(
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
    "An owner or manager must authorize prepared-food cancellation.",
    403,
  );
  ensure(
    !actor.application || actor.application === "MASTER",
    "APPLICATION_FORBIDDEN",
    "Prepared-food reallocation is available in the web workspace.",
    403,
  );
  const data = z
    .object({
      version: z.number().int().positive(),
      reason: z.string().trim().min(5).max(500),
      reallocate: z.boolean(),
      useBy: z.iso.datetime({ offset: true }).optional(),
      preparedConfirmed:z.boolean().optional(),
    })
    .strict()
    .parse(input);
  return command(
    db,
    actor,
    key,
    "PREPARED_ROUND_CANCELLED",
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
        order.status !== "SETTLED" &&
          round.status === "ACCEPTED" &&
          ["RELEASED", "PREPARING", "READY"].includes(round.kot_status),
        "CANCELLATION_BLOCKED",
        "Only unserved, accepted food can be cancelled here.",
        409,
      );
      const payments = await one(
        tx,
        "SELECT coalesce(sum(paid),0) AS paid FROM order_rounds WHERE order_id=$1",
        [orderId],
      );
      ensure(
        num(payments.paid) === 0 &&
          !(
            await tx.query(
              "SELECT id FROM payment_attempts WHERE order_id=$1 AND state NOT IN ('REJECTED','FAILED') UNION ALL SELECT id FROM invoices WHERE order_id=$1 AND document_type='FINAL_TAX_INVOICE'",
              [orderId],
            )
          ).rows.length,
        "UNPAID_ORDER_REQUIRED",
        "Only wholly unpaid orders without unresolved payments can be cancelled or reallocated here.",
        409,
      );
      if (data.reallocate) {
        ensure(round.web_kitchen_stages_enabled!==false||data.preparedConfirmed===true,'PREPARED_CONFIRMATION_REQUIRED','Confirm this food has actually been prepared before offering it for reallocation.',409);
        ensure(
          round.kot_status === "READY",
          "FOOD_NOT_READY",
          "Only food marked ready by every kitchen station can be reallocated.",
          409,
        );
        ensure(
          data.useBy && Date.parse(data.useBy) > Date.now(),
          "USE_BY_REQUIRED",
          "Enter the actual future use-by time for this prepared food.",
          409,
        );
        await ensureMenuCategory(
          tx,
          actor.restroId,
          order.outlet_id,
          "Ready to serve",
        );
      }
      const lines = (
        await tx.query<Row>(
          `SELECT i.*,c.cost,m.image_url,m.image_is_sample,m.unit,b.expires_at AS original_use_by
   FROM order_items i JOIN menu_items m ON m.id=i.item_id AND m.restro_id=i.restro_id
   LEFT JOIN order_item_costs c ON c.order_item_id=i.id AND c.restro_id=i.restro_id
   LEFT JOIN prepared_food_batches b ON b.id=m.ready_food_batch_id AND b.restro_id=m.restro_id
   WHERE i.round_id=$1 ORDER BY i.id`,
          [roundId],
        )
      ).rows;
      const batchIds: string[] = [];
      for (const line of lines) {
        const cost = line.cost == null ? null : num(line.cost);
        let batchId: string | null = null;
        if (data.reallocate) {
          ensure(line.unit_snapshot,"RECORDED_UNIT_REQUIRED","This historical line has no recorded serving unit and cannot be reallocated automatically.",409);
          ensure(
            !line.original_use_by ||
              Date.parse(data.useBy!) <=
                new Date(String(line.original_use_by)).getTime(),
            "USE_BY_EXTENSION_BLOCKED",
            "Reallocation cannot extend this food's original use-by time.",
            409,
          );
          batchId = id();
          batchIds.push(batchId);
          await tx.query(
            "INSERT INTO prepared_food_batches(id,restro_id,outlet_id,source_order_id,source_round_id,source_item_id,quantity_milli,on_hand,remaining_value,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8,$9)",
            [
              batchId,
              actor.restroId,
              order.outlet_id,
              orderId,
              roundId,
              line.id,
              line.quantity_milli,
              cost,
              data.useBy,
            ],
          );
          const optionNames = [
            line.variant,
            ...(line.modifiers ?? []).map((m: Row) => m.name),
          ]
            .filter(Boolean)
            .join(", ");
          await tx.query(
            "INSERT INTO menu_items(id,restro_id,outlet_id,name,category,description,price,tax_bps,unit,station,production_stream,image_url,image_is_sample,ready_food_batch_id) VALUES($1,$2,$3,$4,'Ready to serve',$5,$6,$7,$8,'Ready to serve',$9,$10,$11,$12)",
            [
              id(),
              actor.restroId,
              order.outlet_id,
              line.name + (optionNames ? " · " + optionNames : ""),
              "Prepared portions available now.",
              line.unit_price,
              line.tax_bps,
              line.unit_snapshot ?? line.unit,
              line.production_stream,
              line.image_url,
              line.image_is_sample,
              batchId,
            ],
          );
        }
        await tx.query(
          "INSERT INTO prepared_food_movements(id,restro_id,outlet_id,batch_id,round_id,kind,delta_milli,cost,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
          [
            id(),
            actor.restroId,
            order.outlet_id,
            batchId,
            roundId,
            data.reallocate ? "REALLOCATION" : "WASTAGE",
            data.reallocate ? line.quantity_milli : -num(line.quantity_milli),
            cost,
            data.reason,
            actor.employeeId,
          ],
        );
      }
      await resetRewards(tx, roundId);
      await tx.query(
        "UPDATE order_rounds SET status='VOIDED',kot_status='CANCELLED',version=version+1,rejection_reason=$2 WHERE id=$1",
        [roundId, data.reason],
      );
      await tx.query(
        "UPDATE kot_tickets SET status='CANCELLED',updated_at=now() WHERE round_id=$1",
        [roundId],
      );
      await refreshOrderStatus(tx, orderId);
      await audit(tx, actor, {
        action: data.reallocate
          ? "PREPARED_FOOD_REALLOCATED"
          : "PREPARED_FOOD_CANCELLED",
        entityType: "ORDER_ROUND",
        entityId: roundId,
        outletId: order.outlet_id,
        reason: data.reason,
        newState: {
          batchIds,
          useBy: data.useBy ?? null,
          items: lines.map((line) => ({
            id: line.id,
            quantity: line.quantity_milli,
            cost: line.cost ?? null,
          })),
        },
        risk: "WARNING",
        impact: -num(round.payable),
      });
      return orderDetail(tx, actor, orderId);
    },
  );
}
