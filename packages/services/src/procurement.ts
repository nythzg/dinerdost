import { z } from "zod";
import type { Database } from "@dinerdost/database";
import {
  businessDate,
  ensure,
  requireOutlet,
  requirePermission,
  roundRatio,
  type Actor,
} from "@dinerdost/core";
import { audit, command, expectedVersion, id, json, num, one } from "./shared";
import { requireInventoryStream } from "./operational-access";
import { receiptExpiry } from "./stock-expiry";

export async function receivePurchase(
  db: Database,
  actor: Actor,
  key: string,
  input: unknown,
  webFlow = false,
) {
  requirePermission(actor, "procurement");
  requirePermission(actor, "inventory");
  const data = z
    .object({
      purchaseId: z.uuid(),
      version: z.number().int().positive(),
      reference: z.string().trim().min(3).max(120),
      lines: z
        .array(
          z
            .object({
              ingredientId: z.uuid(),
              batchNumber: z.string().trim().min(1).max(80),
              quantityMilli: z.number().int().positive().max(1000000000),
              unitCost: z.number().int().min(0).max(100000000),
              expiresOn: z.iso.date().nullable().default(null),
              expiresAt: z.iso.datetime().nullable().optional(),
            })
            .strict(),
        )
        .min(1)
        .max(100),
    })
    .strict()
    .parse(input);
  return command(db, actor, key, "PURCHASE_RECEIVED", data, async (tx) => {
    const purchase = await one(
      tx,
      "SELECT * FROM records WHERE id=$1 AND kind='purchases' FOR UPDATE",
      [data.purchaseId],
    );
    requireOutlet(actor, purchase.outlet_id);
    requireInventoryStream(
      actor,
      purchase.production_stream === "BAR" ? "LIQUOR" : "GENERAL",
    );
    expectedVersion(purchase.version, data.version);
    ensure(
      purchase.state === "APPROVED",
      "PURCHASE_NOT_APPROVED",
      "Receive an approved purchase only once.",
      409,
    );
    ensure(
      !(
        await tx.query(
          "SELECT id FROM purchase_receipts WHERE purchase_id=$1",
          [purchase.id],
        )
      ).rows.length,
      "PURCHASE_ALREADY_RECEIVED",
      "This purchase already has a delivery receipt.",
      409,
    );
    const goodsValue = data.lines.reduce(
      (total, line) =>
        total + roundRatio(line.quantityMilli * line.unitCost, 1000),
      0,
    );
    ensure(
      Number.isSafeInteger(goodsValue) &&
        goodsValue <= num(purchase.data.amount),
      "RECEIPT_VALUE_EXCEEDS_PURCHASE",
      "Received goods exceed the approved purchase amount.",
      409,
    );
    const batches = [];
    for (const line of [...data.lines].sort((a, b) =>
      a.ingredientId.localeCompare(b.ingredientId),
    )) {
      const ingredient = await one(
        tx,
        "SELECT * FROM ingredients WHERE id=$1 AND outlet_id=$2 AND retired_at IS NULL FOR SHARE",
        [line.ingredientId, purchase.outlet_id],
      );
      const stream = purchase.production_stream ?? "FOOD";
      ensure(
        ingredient.production_stream === stream,
        "STREAM_FORBIDDEN",
        "Every received ingredient must match the purchase's food/bar stream.",
        403,
      );
      requireInventoryStream(
        actor,
        ingredient.category,
        ingredient.production_stream,
      );
      const expiry = receiptExpiry(line.expiresAt, line.expiresOn, webFlow);
      const batchId = id(),
        cost = roundRatio(line.quantityMilli * line.unitCost, 1000);
      await tx.query(
        "INSERT INTO stock_batches(id,restro_id,outlet_id,ingredient_id,batch_number,on_hand,unit_cost,expires_on,receipt_reference,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        [
          batchId,
          actor.restroId,
          purchase.outlet_id,
          ingredient.id,
          line.batchNumber,
          line.quantityMilli,
          line.unitCost,
          expiry.expiresOn,
          data.reference,
          expiry.expiresAt,
        ],
      );
      await tx.query(
        "INSERT INTO stock_movements(id,restro_id,outlet_id,ingredient_id,batch_id,kind,delta_milli,cost,reason,actor_id) VALUES($1,$2,$3,$4,$5,'RECEIPT',$6,$7,$8,$9)",
        [
          id(),
          actor.restroId,
          purchase.outlet_id,
          ingredient.id,
          batchId,
          line.quantityMilli,
          cost,
          "Purchase delivery: " + data.reference,
          actor.employeeId,
        ],
      );
      batches.push({ batchId, ...line, ...expiry, cost });
    }
    const receiptId = id();
    await tx.query(
      "INSERT INTO purchase_receipts(id,restro_id,outlet_id,purchase_id,reference,lines,received_by) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)",
      [
        receiptId,
        actor.restroId,
        purchase.outlet_id,
        purchase.id,
        data.reference,
        json(batches),
        actor.employeeId,
      ],
    );
    await tx.query(
      "UPDATE records SET state='COMPLETED',version=version+1 WHERE id=$1",
      [purchase.id],
    );
    await audit(tx, actor, {
      action: "PURCHASE_RECEIVED",
      entityType: "PURCHASE_RECEIPT",
      entityId: receiptId,
      outletId: purchase.outlet_id,
      oldState: { purchaseId: purchase.id, state: purchase.state },
      newState: {
        purchaseId: purchase.id,
        reference: data.reference,
        batches,
        goodsValue,
      },
      impact: goodsValue,
      reason:
        "Approved delivery received into FIFO stock; existing purchase expense retained",
    });
    return { id: receiptId, batches };
  });
}
