import { businessDate, ensure } from "@dinerdost/core";
import type { Sql } from "@dinerdost/database";
import { audit, id, num, type Row } from "./shared";
import { consumedStockValue } from "./stock-valuation";

// Event-driven sweep: staff workspace/stock polling and menu/order requests run
// this inside the tenant transaction. Exact timestamps; legacy dates end at IST midnight.
export async function expireInventory(
  tx: Sql,
  restroId: string,
  outletId: string,
) {
  if((await tx.query("SELECT current_setting('app.support_readonly',true) AS mode")).rows[0]?.mode==='true')return;
  const actor = {
    restroId,
    userId: "system",
    employeeId: "system:stock-expiry",
    name: "Stock expiry",
    role: "SYSTEM" as const,
    outletIds: [outletId],
    authMethod: "SYSTEM" as const,
  };
  const raw = (
    await tx.query<Row>(
      "SELECT * FROM stock_batches WHERE outlet_id=$1 AND on_hand>0 AND (expires_at<=now() OR (expires_at IS NULL AND expires_on<current_date)) ORDER BY id FOR UPDATE",
      [outletId],
    )
  ).rows;
  for (const batch of raw) {
    const cost = consumedStockValue(batch, num(batch.on_hand));
    await tx.query(
      "UPDATE stock_reservations SET state='EXPIRED' WHERE batch_id=$1 AND state='RESERVED'",
      [batch.id],
    );
    await tx.query(
      "UPDATE stock_batches SET on_hand=0,reserved=0,remaining_value=CASE WHEN remaining_value IS NULL THEN NULL ELSE 0 END WHERE id=$1",
      [batch.id],
    );
    await tx.query(
      "INSERT INTO stock_movements(id,restro_id,outlet_id,ingredient_id,batch_id,kind,delta_milli,cost,reason) VALUES($1,$2,$3,$4,$5,'WASTAGE',$6,$7,'Automatic expiry write-off')",
      [
        id(),
        restroId,
        outletId,
        batch.ingredient_id,
        batch.id,
        -num(batch.on_hand),
        cost,
      ],
    );
    await audit(tx, actor, {
      action: "EXPIRED_STOCK_WASTED",
      entityType: "STOCK_BATCH",
      entityId: String(batch.id),
      outletId,
      oldState: { onHand: batch.on_hand, reserved: batch.reserved },
      newState: { onHand: 0, reserved: 0 },
      impact: -cost,
      reason: "Ingredient expiry reached; remaining stock written off",
      risk: "WARNING",
    });
  }
  const cooked = (
    await tx.query<Row>(
      "SELECT * FROM prepared_food_batches WHERE outlet_id=$1 AND on_hand>0 AND expires_at<=now() ORDER BY id FOR UPDATE",
      [outletId],
    )
  ).rows;
  for (const batch of cooked) {
    await tx.query(
      "UPDATE prepared_food_reservations SET state='EXPIRED' WHERE batch_id=$1 AND state='RESERVED'",
      [batch.id],
    );
    await tx.query(
      "UPDATE prepared_food_batches SET on_hand=0,reserved=0,remaining_value=CASE WHEN remaining_value IS NULL THEN NULL ELSE 0 END WHERE id=$1",
      [batch.id],
    );
    await tx.query(
      "UPDATE menu_items SET active=false,version=version+1 WHERE ready_food_batch_id=$1",
      [batch.id],
    );
    await tx.query(
      "INSERT INTO prepared_food_movements(id,restro_id,outlet_id,batch_id,round_id,kind,delta_milli,cost,reason) VALUES($1,$2,$3,$4,$5,'WASTAGE',$6,$7,'Prepared-food use-by reached')",
      [
        id(),
        restroId,
        outletId,
        batch.id,
        batch.source_round_id,
        -num(batch.on_hand),
        batch.remaining_value,
      ],
    );
    await audit(tx, actor, {
      action: "EXPIRED_PREPARED_FOOD_WASTED",
      entityType: "PREPARED_FOOD",
      entityId: String(batch.id),
      outletId,
      impact: -num(batch.remaining_value),
      reason: "Staff-entered prepared-food use-by reached",
      newState: { quantity: batch.on_hand, cost: batch.remaining_value },
      risk: "WARNING",
    });
  }
  return { raw: raw.length, prepared: cooked.length };
}

/** Web receipts require an explicit batch time; legacy date-only stock is never backfilled. */
export function receiptExpiry(
  expiresAt: string | null | undefined,
  expiresOn: string | null,
  webFlow: boolean,
) {
  ensure(
    !webFlow || !!expiresAt,
    "EXPIRY_REQUIRED",
    "Enter the batch expiry date and time.",
  );
  if (expiresAt) {
    ensure(
      new Date(expiresAt).getTime() > Date.now(),
      "EXPIRED_BATCH",
      "Receive only stock with a future expiry date and time.",
    );
    const date = businessDate(expiresAt);
    ensure(
      !expiresOn || expiresOn === date,
      "EXPIRY_MISMATCH",
      "The expiry date must match the expiry time in India time.",
    );
    return { expiresOn: date, expiresAt };
  }
  ensure(
    !expiresOn || expiresOn >= businessDate(),
    "EXPIRED_BATCH",
    "An expired batch cannot be received as usable stock.",
  );
  return { expiresOn, expiresAt: null };
}
