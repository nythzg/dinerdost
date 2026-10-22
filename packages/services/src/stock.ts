import { ensure, splitExact } from "@dinerdost/core";
import type { Sql } from "@dinerdost/database";
import { id, num } from "./shared";
import {
  reservePrepared,
  releasePrepared,
  consumePrepared,
} from "./prepared-stock";
import { consumedStockValue } from "./stock-valuation";

export async function reserveStock(
  tx: Sql,
  restroId: string,
  roundId: string,
  outletId: string,
) {
  await reservePrepared(tx, restroId, outletId, roundId);
  const needs = await tx.query(
    "SELECT r.ingredient_id,ceil(sum(r.quantity_milli::numeric*i.quantity_milli)/1000)::bigint AS needed FROM order_items i JOIN recipes r ON r.item_id=i.item_id AND r.restro_id=i.restro_id JOIN menu_items m ON m.id=i.item_id AND m.restro_id=i.restro_id AND m.ready_food_batch_id IS NULL WHERE i.round_id=$1 GROUP BY r.ingredient_id ORDER BY r.ingredient_id",
    [roundId],
  );
  for (const need of needs.rows) {
    const lines = (
      await tx.query(
        "SELECT i.id,r.quantity_milli AS recipe_quantity,i.quantity_milli AS line_quantity FROM order_items i JOIN recipes r ON r.item_id=i.item_id AND r.restro_id=i.restro_id JOIN menu_items m ON m.id=i.item_id AND m.restro_id=i.restro_id AND m.ready_food_batch_id IS NULL WHERE i.round_id=$1 AND r.ingredient_id=$2 ORDER BY i.id",
        [roundId, need.ingredient_id],
      )
    ).rows;
    const shares = splitExact(
      num(need.needed),
      lines.map(
        (l) =>
          BigInt(String(l.recipe_quantity)) * BigInt(String(l.line_quantity)),
      ),
    );
    for (let index = 0; index < lines.length; index++)
      await tx.query(
        "INSERT INTO round_ingredient_needs(restro_id,outlet_id,round_id,order_item_id,ingredient_id,quantity_milli) VALUES($1,$2,$3,$4,$5,$6)",
        [
          restroId,
          outletId,
          roundId,
          lines[index].id,
          need.ingredient_id,
          shares[index],
        ],
      );
    let remaining = num(need.needed);
    const batches = await tx.query(
      "SELECT * FROM stock_batches WHERE ingredient_id=$1 AND outlet_id=$2 AND on_hand>reserved AND ((expires_at IS NOT NULL AND expires_at>now()) OR (expires_at IS NULL AND (expires_on IS NULL OR expires_on>=current_date))) ORDER BY received_at,id FOR UPDATE",
      [need.ingredient_id, outletId],
    );
    for (const batch of batches.rows) {
      const quantity = Math.min(
        remaining,
        num(batch.on_hand) - num(batch.reserved),
      );
      if (quantity <= 0) continue;
      await tx.query(
        "UPDATE stock_batches SET reserved=reserved+$2 WHERE id=$1",
        [batch.id, quantity],
      );
      const saved = await tx.query(
        "INSERT INTO stock_reservations(id,restro_id,round_id,batch_id,quantity_milli) VALUES($1,$2,$3,$4,$5) ON CONFLICT(round_id,batch_id) DO UPDATE SET quantity_milli=excluded.quantity_milli,state='RESERVED' WHERE stock_reservations.state IN ('RELEASED','EXPIRED') RETURNING id",
        [id(), restroId, roundId, batch.id, quantity],
      );
      ensure(
        saved.rows.length === 1,
        "STOCK_RESERVATION_CONFLICT",
        "Stock is already reserved for this round.",
        409,
      );
      remaining -= quantity;
      if (!remaining) break;
    }
    ensure(
      remaining === 0,
      "OUT_OF_STOCK",
      "An ingredient is unavailable. The order was not accepted.",
      409,
    );
  }
}
export async function releaseStock(tx: Sql, roundId: string) {
  await releasePrepared(tx, roundId);
  const reservations = await tx.query(
    "SELECT * FROM stock_reservations WHERE round_id=$1 AND state='RESERVED' ORDER BY batch_id FOR UPDATE",
    [roundId],
  );
  for (const row of reservations.rows) {
    await tx.query(
      "UPDATE stock_batches SET reserved=reserved-$2 WHERE id=$1",
      [row.batch_id, row.quantity_milli],
    );
    await tx.query(
      "UPDATE stock_reservations SET state='RELEASED' WHERE id=$1",
      [row.id],
    );
  }
  await tx.query(
    "DELETE FROM round_ingredient_needs WHERE round_id=$1 AND NOT EXISTS(SELECT 1 FROM order_item_costs WHERE round_id=$1)",
    [roundId],
  );
}
export async function consumeStock(
  tx: Sql,
  restroId: string,
  roundId: string,
  outletId: string,
  actorId: string,
) {
  const reservations = await tx.query(
    "SELECT r.*,b.unit_cost,b.remaining_value,b.on_hand,b.ingredient_id,((b.expires_at IS NOT NULL AND b.expires_at<=now()) OR (b.expires_at IS NULL AND b.expires_on<current_date)) AS expired FROM stock_reservations r JOIN stock_batches b ON b.id=r.batch_id AND b.restro_id=r.restro_id WHERE r.round_id=$1 AND r.state='RESERVED' ORDER BY r.batch_id FOR UPDATE OF r,b",
    [roundId],
  );
  let cost = 0;
  const consumed = new Map<string, { quantity: number; cost: number }>();
  for (const row of reservations.rows) {
    ensure(
      !row.expired,
      "STOCK_EXPIRED",
      "Reserved stock has expired. Recheck the held order before kitchen release.",
      409,
    );
    const amount = consumedStockValue(row, num(row.quantity_milli));
    cost += amount;
    const ingredientId = String(row.ingredient_id),
      previous = consumed.get(ingredientId) ?? { quantity: 0, cost: 0 };
    consumed.set(ingredientId, {
      quantity: previous.quantity + num(row.quantity_milli),
      cost: previous.cost + amount,
    });
    await tx.query(
      "UPDATE stock_batches SET reserved=reserved-$2,on_hand=on_hand-$2,remaining_value=CASE WHEN remaining_value IS NULL THEN NULL ELSE remaining_value-$3 END WHERE id=$1",
      [row.batch_id, row.quantity_milli, amount],
    );
    await tx.query(
      "UPDATE stock_reservations SET state='CONSUMED' WHERE id=$1",
      [row.id],
    );
    await tx.query(
      "INSERT INTO stock_movements(id,restro_id,outlet_id,ingredient_id,batch_id,round_id,kind,delta_milli,cost,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6,'RECIPE_CONSUMPTION',$7,$8,'Authorized KOT release',$9)",
      [
        id(),
        restroId,
        outletId,
        row.ingredient_id,
        row.batch_id,
        roundId,
        -num(row.quantity_milli),
        amount,
        actorId,
      ],
    );
  }
  const needs = (
    await tx.query(
      "SELECT order_item_id,ingredient_id,quantity_milli FROM round_ingredient_needs WHERE round_id=$1 ORDER BY ingredient_id,order_item_id",
      [roundId],
    )
  ).rows;
  for (const need of needs) {
    ensure(
      consumed.get(String(need.ingredient_id))?.quantity ===
        needs
          .filter((n) => n.ingredient_id === need.ingredient_id)
          .reduce((sum, n) => sum + num(n.quantity_milli), 0),
      "STOCK_EXPIRED",
      "Reserved stock expired or is unavailable. Edit and resubmit this held round.",
      409,
    );
  }
  const prepared = await consumePrepared(
    tx,
    restroId,
    outletId,
    roundId,
    actorId,
  );
  cost += [...prepared.values()].reduce<number>(
    (sum, value) => sum + (value ?? 0),
    0,
  );
  const allocations = new Map<string, number>();
  let covered = true;
  for (const [ingredientId, actual] of consumed) {
    const parts = needs.filter((n) => n.ingredient_id === ingredientId);
    if (
      parts.reduce((n, p) => n + num(p.quantity_milli), 0) !== actual.quantity
    ) {
      covered = false;
      break;
    }
    const shares = splitExact(
      actual.cost,
      parts.map((p) => num(p.quantity_milli)),
    );
    parts.forEach((p, index) =>
      allocations.set(
        String(p.order_item_id),
        (allocations.get(String(p.order_item_id)) ?? 0) + shares[index],
      ),
    );
  }
  for (const line of (
    await tx.query("SELECT id FROM order_items WHERE round_id=$1 ORDER BY id", [
      roundId,
    ])
  ).rows) {
    const known = covered && needs.some((n) => n.order_item_id === line.id);
    await tx.query(
      "INSERT INTO order_item_costs(restro_id,outlet_id,round_id,order_item_id,cost) VALUES($1,$2,$3,$4,$5)",
      [
        restroId,
        outletId,
        roundId,
        line.id,
        prepared.has(String(line.id))
          ? prepared.get(String(line.id))
          : known
            ? (allocations.get(String(line.id)) ?? 0)
            : null,
      ],
    );
  }
  return cost;
}
