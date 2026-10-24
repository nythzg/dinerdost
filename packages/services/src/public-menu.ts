import type { Sql } from "@dinerdost/database";
import { expireInventory } from "./stock-expiry";
import { num, one, type Row } from "./shared";

/** Public catalog fields only; use inside the outlet's tenant-scoped transaction. */
export async function publicMenu(tx: Sql, outletId: string, orderId?: string, hidePrepared = false) {
  const outlet = await one(
    tx,
    "SELECT tax_bps,tax_components FROM outlets WHERE id=$1",
    [outletId],
  );
  await expireInventory(tx, String((await one(tx,"SELECT restro_id FROM outlets WHERE id=$1",[outletId])).restro_id), outletId);
  const order = orderId
    ? (
        await tx.query<Row>(
          "SELECT status,tax_bps_override,tax_components FROM orders WHERE id=$1 AND outlet_id=$2",
          [orderId, outletId],
        )
      ).rows[0]
    : null;
  const open =
    order && !["SETTLED", "VOIDED", "REJECTED"].includes(order.status);
  const components = open ? order.tax_components : outlet.tax_components;
  const override = open
    ? order.tax_bps_override
    : components !== null
      ? num(outlet.tax_bps)
      : null;
  const rows = (
    await tx.query<Row>(
      "SELECT m.id,m.name,m.category,c.menu_course,m.description,m.price,m.tax_bps,m.unit,m.variants,m.modifiers,m.image_url,m.image_is_sample,m.guest_best_choice,m.compare_at_price,(m.ready_food_batch_id IS NOT NULL) AS ready_to_serve,b.on_hand-b.reserved AS ready_quantity,b.expires_at AS ready_use_by FROM menu_items m LEFT JOIN menu_categories c ON c.restro_id=m.restro_id AND c.outlet_id=m.outlet_id AND lower(c.name)=lower(m.category) LEFT JOIN prepared_food_batches b ON b.id=m.ready_food_batch_id AND b.restro_id=m.restro_id WHERE m.outlet_id=$1 AND m.active=true AND (m.ready_food_batch_id IS NULL OR (b.on_hand>b.reserved AND b.expires_at>now())) ORDER BY (m.ready_food_batch_id IS NOT NULL) DESC,m.category,m.name",
      [outletId],
    )
  ).rows;
  return {
    items: rows.filter(item => !hidePrepared || !item.ready_to_serve).map((item): Row => ({
      ...item,
      tax_bps: override ?? item.tax_bps,
    })),
    taxComponents: components,
  };
}
