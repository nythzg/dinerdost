import { z } from "zod";
import type { Database } from "@dinerdost/database";
import {
  ensure,
  requireOutlet,
  requirePermission,
  roundRatio,
  splitExact,
  type Actor,
} from "@dinerdost/core";
import {
  audit,
  command,
  expectedVersion,
  id,
  json,
  num,
  one,
  type Row,
} from "./shared";
import { requireInventoryStream } from "./operational-access";

export function remainingStockValue(batch: Row): number {
  return batch.remaining_value == null
    ? Number(
        (BigInt(String(batch.on_hand)) * BigInt(String(batch.unit_cost))) /
          1000n,
      )
    : num(batch.remaining_value);
}
export function consumedStockValue(batch: Row, quantity: number): number {
  if (batch.remaining_value == null)
    return roundRatio(quantity * num(batch.unit_cost), 1000);
  const value = BigInt(String(batch.remaining_value)),
    balance = BigInt(String(batch.on_hand));
  ensure(
    balance > 0n && quantity <= Number(balance),
    "INSUFFICIENT_STOCK",
    "Not enough current stock for this movement.",
    409,
  );
  return Number((value * BigInt(quantity) + balance / 2n) / balance);
}

export async function changeStockValue(
  db: Database,
  actor: Actor,
  key: string,
  input: unknown,
) {
  requirePermission(actor, "inventory");
  const data = z
    .object({
      ingredientId: z.uuid(),
      version: z.number().int().positive(),
      expectedOnHand: z
        .number()
        .int()
        .nonnegative()
        .max(Number.MAX_SAFE_INTEGER),
      expectedValue: z
        .number()
        .int()
        .nonnegative()
        .max(Number.MAX_SAFE_INTEGER),
      value: z.number().int().min(0).max(1000000000000),
      reason: z.string().trim().min(5).max(500),
    })
    .strict()
    .parse(input);
  return command(db, actor, key, "STOCK_VALUE_ADJUSTED", data, async (tx) => {
    const item = await one(
      tx,
      "SELECT * FROM ingredients WHERE id=$1 AND retired_at IS NULL FOR UPDATE",
      [data.ingredientId],
    );
    requireOutlet(actor, item.outlet_id);
    requireInventoryStream(actor, item.category, item.production_stream);
    expectedVersion(item.version, data.version);
    const batches = (
      await tx.query<Row>(
        "SELECT * FROM stock_batches WHERE ingredient_id=$1 ORDER BY received_at,id FOR UPDATE",
        [item.id],
      )
    ).rows;
    const quantity = batches.reduce((n, b) => n + num(b.on_hand), 0),
      before = batches.reduce((n, b) => n + remainingStockValue(b), 0);
    ensure(
      quantity === data.expectedOnHand && before === data.expectedValue,
      "STOCK_CHANGED",
      "Stock changed. Refresh before editing its value.",
      409,
    );
    ensure(
      quantity > 0,
      "NO_STOCK",
      "Receive stock before editing its value.",
      409,
    );
    ensure(
      batches.every((b) => num(b.reserved) === 0),
      "STOCK_RESERVED",
      "Finish or release reserved orders before editing stock value.",
      409,
    );
    const available = batches.filter((b) => num(b.on_hand) > 0),
      current = available.map(remainingStockValue),
      shares = splitExact(
        data.value,
        before > 0 ? current : available.map((b) => num(b.on_hand)),
      );
    const details = available.map((b, index) => ({
      batchId: b.id,
      quantity: num(b.on_hand),
      before: current[index],
      after: shares[index],
    }));
    for (const row of details)
      await tx.query(
        "UPDATE stock_batches SET remaining_value=$2 WHERE id=$1",
        [row.batchId, row.after],
      );
    const adjustmentId = id();
    await tx.query(
      "INSERT INTO stock_value_adjustments(id,restro_id,outlet_id,ingredient_id,quantity_milli,value_before,value_after,batches,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)",
      [
        adjustmentId,
        actor.restroId,
        item.outlet_id,
        item.id,
        quantity,
        before,
        data.value,
        json(details),
        data.reason,
        actor.employeeId,
      ],
    );
    await tx.query("UPDATE ingredients SET version=version+1 WHERE id=$1", [
      item.id,
    ]);
    const readableQuantity = quantity / 1000 + " " + item.unit;
    await audit(tx, actor, {
      action: "STOCK_VALUE_ADJUSTED",
      entityType: "INGREDIENT",
      entityId: item.id,
      outletId: item.outlet_id,
      oldState: { stockValue: before, quantity: readableQuantity },
      newState: {
        stockValue: data.value,
        quantity: readableQuantity,
        adjustmentId,
        batches: details.map((b) => ({
          batchId: b.batchId,
          quantity: b.quantity / 1000 + " " + item.unit,
          oldStockValue: b.before,
          stockValue: b.after,
        })),
      },
      impact: data.value - before,
      reason: data.reason,
      risk: "WARNING",
    });
    return {
      id: item.id,
      value: data.value,
      version: num(item.version) + 1,
      adjustmentId,
    };
  });
}

export async function archiveIngredient(
  db: Database,
  actor: Actor,
  key: string,
  input: unknown,
) {
  requirePermission(actor, "inventory");
  const data = z
    .object({ ingredientId: z.uuid(), version: z.number().int().positive() })
    .strict()
    .parse(input);
  return command(db, actor, key, "INGREDIENT_ARCHIVED", data, async (tx) => {
    const item = await one(
      tx,
      "SELECT * FROM ingredients WHERE id=$1 AND retired_at IS NULL FOR UPDATE",
      [data.ingredientId],
    );
    requireOutlet(actor, item.outlet_id);
    requireInventoryStream(actor, item.category, item.production_stream);
    expectedVersion(item.version, data.version);
    const batches = (
      await tx.query(
        "SELECT on_hand,reserved FROM stock_batches WHERE ingredient_id=$1 ORDER BY id FOR UPDATE",
        [item.id],
      )
    ).rows;
    ensure(
      batches.every((b) => num(b.on_hand) === 0 && num(b.reserved) === 0),
      "STOCK_IN_USE",
      "Record remaining stock as wastage or finish its orders before deleting this item.",
      409,
    );
    ensure(
      !(
        await tx.query(
          "SELECT 1 FROM recipes WHERE ingredient_id=$1 UNION ALL SELECT 1 FROM menu_items WHERE liquor_ingredient_id=$1 LIMIT 1",
          [item.id],
        )
      ).rows.length,
      "RECIPE_IN_USE",
      "Remove this stock item from recipes and liquor items before deleting it.",
      409,
    );
    await tx.query(
      "UPDATE ingredients SET retired_at=now(),version=version+1 WHERE id=$1",
      [item.id],
    );
    await audit(tx, actor, {
      action: "INGREDIENT_ARCHIVED",
      entityType: "INGREDIENT",
      entityId: item.id,
      outletId: item.outlet_id,
      oldState: { name: item.name, unit: item.unit },
      newState: { archived: true },
      reason:
        "Inventory item deleted from active stock; recorded movements and costs retained",
    });
    return { ok: true };
  });
}
