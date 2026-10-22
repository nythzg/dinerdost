import { ensure } from "@dinerdost/core";
import type { Sql } from "@dinerdost/database";
import { id, num, type Row } from "./shared";

export async function reservePrepared(
  tx: Sql,
  restroId: string,
  outletId: string,
  roundId: string,
) {
  const lines = (
    await tx.query<Row>(
      `SELECT i.id,i.quantity_milli,m.ready_food_batch_id FROM order_items i JOIN menu_items m ON m.id=i.item_id AND m.restro_id=i.restro_id WHERE i.round_id=$1 AND m.ready_food_batch_id IS NOT NULL ORDER BY m.ready_food_batch_id,i.id`,
      [roundId],
    )
  ).rows;
  for (const line of lines) {
    const batch = (
      await tx.query<Row>(
        "SELECT *,expires_at>now() AS usable FROM prepared_food_batches WHERE id=$1 AND outlet_id=$2 FOR UPDATE",
        [line.ready_food_batch_id, outletId],
      )
    ).rows[0];
    ensure(
      batch?.usable &&
        num(batch.on_hand) - num(batch.reserved) >= num(line.quantity_milli),
      "READY_FOOD_UNAVAILABLE",
      "This ready-to-serve portion is no longer available. Refresh the menu.",
      409,
    );
    await tx.query(
      "UPDATE prepared_food_batches SET reserved=reserved+$2 WHERE id=$1",
      [batch.id, line.quantity_milli],
    );
    await tx.query(
      "INSERT INTO prepared_food_reservations(id,restro_id,batch_id,round_id,order_item_id,quantity_milli,state) VALUES($1,$2,$3,$4,$5,$6,'RESERVED')",
      [id(), restroId, batch.id, roundId, line.id, line.quantity_milli],
    );
  }
}
export async function releasePrepared(tx: Sql, roundId: string) {
  const rows = (
    await tx.query<Row>(
      "SELECT * FROM prepared_food_reservations WHERE round_id=$1 AND state='RESERVED' ORDER BY batch_id,id FOR UPDATE",
      [roundId],
    )
  ).rows;
  for (const row of rows)
    await tx.query(
      "UPDATE prepared_food_batches SET reserved=reserved-$2 WHERE id=$1",
      [row.batch_id, row.quantity_milli],
    );
  await tx.query(
    "DELETE FROM prepared_food_reservations WHERE round_id=$1 AND state<>'CONSUMED'",
    [roundId],
  );
}
export async function consumePrepared(
  tx: Sql,
  restroId: string,
  outletId: string,
  roundId: string,
  actorId: string,
) {
  const allocations = new Map<string, number | null>();
  const lines = (
    await tx.query<Row>(
      `SELECT i.id,i.quantity_milli,m.ready_food_batch_id FROM order_items i JOIN menu_items m ON m.id=i.item_id AND m.restro_id=i.restro_id WHERE i.round_id=$1 AND m.ready_food_batch_id IS NOT NULL ORDER BY m.ready_food_batch_id,i.id`,
      [roundId],
    )
  ).rows;
  for (const line of lines) {
    const reservation = (
      await tx.query<Row>(
        "SELECT * FROM prepared_food_reservations WHERE order_item_id=$1 AND state='RESERVED' FOR UPDATE",
        [line.id],
      )
    ).rows[0];
    const batch = (
      await tx.query<Row>(
        "SELECT *,expires_at>now() AS usable FROM prepared_food_batches WHERE id=$1 AND outlet_id=$2 FOR UPDATE",
        [line.ready_food_batch_id, outletId],
      )
    ).rows[0];
    ensure(
      reservation &&
        batch?.usable &&
        num(reservation.quantity_milli) === num(line.quantity_milli) &&
        num(batch.reserved) >= num(line.quantity_milli),
      "READY_FOOD_UNAVAILABLE",
      "Reserved prepared food expired or became unavailable. Edit and resubmit the held round.",
      409,
    );
    const quantity = num(line.quantity_milli);
    const cost =
      batch.remaining_value == null
        ? null
        : Number(
            (BigInt(String(batch.remaining_value)) * BigInt(quantity) +
              BigInt(String(batch.on_hand)) / 2n) /
              BigInt(String(batch.on_hand)),
          );
    await tx.query(
      "UPDATE prepared_food_batches SET on_hand=on_hand-$2,reserved=reserved-$2,remaining_value=CASE WHEN remaining_value IS NULL THEN NULL ELSE remaining_value-$3 END WHERE id=$1",
      [batch.id, quantity, cost],
    );
    await tx.query(
      "UPDATE prepared_food_reservations SET state='CONSUMED',consumed_value=$2 WHERE id=$1",
      [reservation.id, cost],
    );
    await tx.query(
      "INSERT INTO prepared_food_movements(id,restro_id,outlet_id,batch_id,round_id,kind,delta_milli,cost,reason,actor_id) VALUES($1,$2,$3,$4,$5,'CONSUMPTION',$6,$7,'Ready-to-serve food ordered',$8)",
      [id(), restroId, outletId, batch.id, roundId, -quantity, cost, actorId],
    );
    allocations.set(String(line.id), cost);
  }
  return allocations;
}
