import type { Sql } from "@dinerdost/database";
/** Call only after validating the current device-bound table/store visit. No public directory search. */
export async function ownDeviceIdentities(
  tx: Sql,
  outletId: string,
  deviceHash: string,
) {
  return (
    await tx.query(
      `SELECT c.id,c.name,c.phone FROM customers c WHERE
    EXISTS(SELECT 1 FROM customer_order_devices d JOIN orders o ON o.id=d.order_id AND o.restro_id=d.restro_id
      WHERE d.outlet_id=$1 AND d.device_hash=$2 AND o.customer_id=c.id)
    OR EXISTS(SELECT 1 FROM records r JOIN storefront_visits v ON v.id=r.created_by AND v.restro_id=r.restro_id
      WHERE r.outlet_id=$1 AND r.kind='reservations' AND v.device_hash=$2 AND r.data->>'customerId'=c.id::text)
    ORDER BY c.name,c.id LIMIT 20`,
      [outletId, deviceHash],
    )
  ).rows;
}
