import { z } from "zod";
import type { Database } from "@dinerdost/database";
import { requirePermission, requireOutlet, type Actor } from "@dinerdost/core";
export async function loyaltyLeaderboard(
  db: Database,
  actor: Actor,
  input: unknown,
) {
  requirePermission(actor, "customers");
  const data = z
    .object({
      outletId: z.uuid(),
      offset: z.coerce.number().int().min(0).max(1000000).default(0),
      period: z.enum(["OVERALL", "YEAR", "MONTH", "WEEK"]).default("OVERALL"),
      search: z.string().trim().max(120).default(""),
    })
    .strict()
    .parse(input);
  requireOutlet(actor, data.outletId);
  return db.transaction(actor.restroId, async (tx) => {
    const rows = (
      await tx.query(
        `WITH balances AS (
          SELECT c.id,c.name,
            coalesce((SELECT sum(points) FROM loyalty_ledger WHERE customer_id=c.id AND state<>'PENDING_EARN'),0) AS points,
            coalesce((SELECT sum(points) FROM loyalty_ledger WHERE customer_id=c.id AND state='EARNED'),0) AS earned,
            coalesce((SELECT sum(points) FROM loyalty_ledger WHERE customer_id=c.id AND outlet_id=$1 AND state='EARNED'
              AND ($4::text='OVERALL' OR created_at>=date_trunc(CASE $4 WHEN 'YEAR' THEN 'year' WHEN 'MONTH' THEN 'month' ELSE 'week' END, now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata')
              AND created_at<=now()),0) AS period_earned
          FROM customers c WHERE EXISTS(SELECT 1 FROM orders o WHERE o.customer_id=c.id AND o.outlet_id=$1)
        ), ranked AS(SELECT *,dense_rank() OVER(ORDER BY CASE WHEN $4::text='OVERALL' THEN points ELSE period_earned END DESC) AS rank FROM balances)
        SELECT * FROM ranked WHERE name ILIKE $2 ORDER BY rank,name,id LIMIT 101 OFFSET $3`,
        [
          data.outletId,
          "%" + data.search.replace(/[\\%_]/g, "\\$&") + "%",
          data.offset,
          data.period,
        ],
      )
    ).rows;
    return { items: rows.slice(0, 100), hasMore: rows.length > 100 };
  });
}
