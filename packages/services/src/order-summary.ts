import type { Sql } from "@dinerdost/database";
import type { Actor } from "@dinerdost/core";
import { one } from "./shared";

// Called inside the workspace's tenant transaction and existing order-view gate.
// Only audited cooked-food reallocation counts; moving a table does not.
export async function orderSummary(tx: Sql, actor: Actor, outletId: string) {
  const reallocated = (
    await tx.query<{ id: string }>(
      `SELECT DISTINCT r.order_id AS id FROM audit_events a
     JOIN order_rounds r ON r.id::text=a.entity_id AND r.restro_id=a.restro_id
     JOIN orders o ON o.id=r.order_id AND o.restro_id=r.restro_id
     WHERE a.outlet_id=$1 AND o.outlet_id=$1 AND a.action='PREPARED_FOOD_REALLOCATED' AND a.entity_type='ORDER_ROUND'`,
      [outletId],
    )
  ).rows.map((row) => row.id);
  const counts = await one(
    tx,
    `SELECT count(*) AS "All",
     count(*) FILTER(WHERE o.status NOT IN ('SETTLED','VOIDED','REJECTED','CANCELLED')) AS "Active",
     count(*) FILTER(WHERE o.status='ACCEPTED') AS "Accepted",
     count(*) FILTER(WHERE o.status='PENDING') AS "Pending",
     count(*) FILTER(WHERE o.status IN ('VOIDED','CANCELLED')) AS "Cancelled",
     count(*) FILTER(WHERE o.status='REJECTED') AS "Rejected",
     count(*) FILTER(WHERE o.status='SETTLED') AS "Settled",
     count(*) FILTER(WHERE o.id=ANY($4::uuid[])) AS "Reallocated"
     FROM orders o LEFT JOIN table_sessions s ON s.id=o.session_id AND s.restro_id=o.restro_id
     WHERE o.outlet_id=$1 AND ($2 OR s.owner_employee_id=$3)`,
    [outletId, actor.role !== "WAITER", actor.employeeId, reallocated],
  );
  return { counts, reallocated: new Set(reallocated) };
}
