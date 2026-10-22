import { z } from "zod";
import type { Database } from "@dinerdost/database";
import {
  businessDate,
  businessLocalToISO,
  ensure,
  requireOutlet,
  requirePermission,
  type Actor,
} from "@dinerdost/core";
import { actorStream } from "./operational-access";

export async function stockSummary(db: Database, actor: Actor, input: unknown) {
  requirePermission(actor, "inventory");
  const data = z
    .object({
      outletId: z.uuid(),
      date: z.string().default(businessDate()),
      offset: z.coerce.number().int().min(0).max(1000000).default(0),
      search: z.string().trim().max(120).default(""),
    })
    .strict()
    .parse(input);
  requireOutlet(actor, data.outletId);
  const start = businessLocalToISO(data.date + "T00:00");
  ensure(
    data.date <= businessDate(),
    "INVALID_DATE",
    "Choose today or an earlier business date.",
  );
  const end = new Date(new Date(start).getTime() + 86400000).toISOString();
  return db.transaction(actor.restroId, async (tx) => {
    const rows = (
      await tx.query(
        `SELECT i.id,i.name,i.unit,
      coalesce(b.balance,0)-coalesce(m.after_start,0) AS opening,
      coalesce(m.in_period,0) AS movement,
      coalesce(b.balance,0)-coalesce(m.after_start,0)+coalesce(m.in_period,0) AS closing
      FROM ingredients i
      LEFT JOIN LATERAL(SELECT sum(on_hand) AS balance FROM stock_batches WHERE ingredient_id=i.id AND outlet_id=$1) b ON true
      LEFT JOIN LATERAL(SELECT sum(delta_milli) FILTER(WHERE created_at>=$2::timestamptz) AS after_start,
        sum(delta_milli) FILTER(WHERE created_at>=$2::timestamptz AND created_at<$3::timestamptz) AS in_period
        FROM stock_movements WHERE ingredient_id=i.id AND outlet_id=$1) m ON true
      WHERE i.outlet_id=$1 AND ($4::text IS NULL OR i.production_stream=$4)
        AND i.name ILIKE $5 ORDER BY i.name,i.id LIMIT 101 OFFSET $6`,
        [
          data.outletId,
          start,
          end,
          actorStream(actor),
          "%" + data.search.replace(/[\\%_]/g, "\\$&") + "%",
          data.offset,
        ],
      )
    ).rows;
    return {
      date: data.date,
      timeZone: "Asia/Kolkata",
      items: rows.slice(0, 100),
      hasMore: rows.length > 100,
    };
  });
}
