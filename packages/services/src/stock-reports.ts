import { z } from "zod";
import type { Database, Sql } from "@dinerdost/database";
import {
  businessDate,
  businessLocalToISO,
  requireOutlet,
  requirePermission,
  type Actor,
} from "@dinerdost/core";
import { canonical,hash } from "./shared";
import { expireInventory } from "./stock-expiry";
import { actorStream } from "./operational-access";

export async function stockAlertsRead(tx: Sql, actor: Actor, outletId: string) {
  await expireInventory(tx, actor.restroId, outletId);
  const params = [outletId, actorStream(actor)];
  const availability = (
    await tx.query(
      `SELECT i.id,i.name,i.unit,i.production_stream,
    (SELECT m.id::text FROM stock_movements m WHERE m.ingredient_id=i.id AND m.outlet_id=$1 ORDER BY m.created_at DESC,m.id DESC LIMIT 1) AS activity_key,
    coalesce(sum(b.on_hand-b.reserved) FILTER(WHERE (b.expires_at IS NOT NULL AND b.expires_at>now()) OR (b.expires_at IS NULL AND (b.expires_on IS NULL OR b.expires_on>=current_date))),0) AS available
    FROM ingredients i LEFT JOIN stock_batches b ON b.ingredient_id=i.id AND b.restro_id=i.restro_id
    WHERE i.outlet_id=$1 AND i.retired_at IS NULL AND ($2::text IS NULL OR i.production_stream=$2)
    GROUP BY i.id HAVING coalesce(sum(b.on_hand-b.reserved) FILTER(WHERE (b.expires_at IS NOT NULL AND b.expires_at>now()) OR (b.expires_at IS NULL AND (b.expires_on IS NULL OR b.expires_on>=current_date))),0)<=0
    ORDER BY i.name LIMIT 101`,
      params,
    )
  ).rows;
  const batches = (
    await tx.query(
      `SELECT b.id,b.ingredient_id,i.name,i.unit,i.production_stream,b.batch_number,b.on_hand,b.reserved,b.expires_at,b.expires_on,
    CASE WHEN b.expires_at<=now() OR (b.expires_at IS NULL AND b.expires_on<current_date) THEN 'EXPIRED'
      WHEN b.expires_at IS NULL THEN 'UNKNOWN'
      WHEN b.expires_at<=now()+interval '6 hours' THEN '6H'
      WHEN b.expires_at<=now()+interval '12 hours' THEN '12H'
      WHEN b.expires_at<=now()+interval '24 hours' THEN '24H' ELSE '48H' END AS phase
    FROM stock_batches b JOIN ingredients i ON i.id=b.ingredient_id AND i.restro_id=b.restro_id
    WHERE b.outlet_id=$1 AND b.on_hand>0 AND ($2::text IS NULL OR i.production_stream=$2)
      AND (b.expires_at IS NULL OR b.expires_at<=now()+interval '48 hours')
    ORDER BY CASE WHEN b.expires_at<=now() OR b.expires_on<current_date THEN 0 WHEN b.expires_at IS NULL THEN 2 ELSE 1 END,b.expires_at NULLS LAST,i.name,b.id LIMIT 101`,
      params,
    )
  ).rows;
  return {
    signature: hash(canonical({availability,batches})),
    availability: availability.slice(0, 100),
    batches: batches.slice(0, 100),
    hasMore: availability.length > 100 || batches.length > 100,
    timeZone: "Asia/Kolkata",
    checkedAt: new Date().toISOString(),
  };
}
export async function stockAlerts(db: Database, actor: Actor, input: unknown) {
  requirePermission(actor, "inventory");
  const data = z.object({ outletId: z.uuid() }).strict().parse(input);
  requireOutlet(actor, data.outletId);
  return db.transaction(actor.restroId, (tx) =>
    stockAlertsRead(tx, actor, data.outletId),
  );
}
export async function wasteReport(db: Database, actor: Actor, input: unknown) {
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
  const start = businessLocalToISO(data.date + "T00:00"),
    end = new Date(new Date(start).getTime() + 86400000).toISOString();
  return db.transaction(actor.restroId, async (tx) => {
    const rows = (
      await tx.query(
        `SELECT m.id,m.ingredient_id,i.name,i.unit,i.production_stream,b.batch_number,-m.delta_milli AS quantity,m.cost,m.reason,m.created_at
      FROM stock_movements m JOIN ingredients i ON i.id=m.ingredient_id AND i.restro_id=m.restro_id
      LEFT JOIN stock_batches b ON b.id=m.batch_id AND b.restro_id=m.restro_id
      WHERE m.outlet_id=$1 AND m.kind='WASTAGE' AND m.created_at>=$2::timestamptz AND m.created_at<$3::timestamptz
      AND ($4::text IS NULL OR i.production_stream=$4) AND i.name ILIKE $5 ORDER BY m.created_at DESC,m.id LIMIT 101 OFFSET $6`,
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

export async function stockUsageReport(
  db: Database,
  actor: Actor,
  input: unknown,
) {
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
  const start = businessLocalToISO(data.date + "T00:00"),
    end = new Date(new Date(start).getTime() + 86400000).toISOString();
  return db.transaction(actor.restroId, async (tx) => {
    const rows = (
      await tx.query(
        `SELECT i.id,i.name,i.unit,i.production_stream,
      coalesce(b.balance,0)-coalesce(m.after_start,0) AS opening,
      -coalesce(m.used,0) AS quantity,coalesce(m.cost,0) AS cost,
      coalesce(b.balance,0)-coalesce(m.after_start,0)+coalesce(m.in_period,0) AS closing
      FROM ingredients i
      LEFT JOIN LATERAL(SELECT sum(on_hand) AS balance FROM stock_batches WHERE ingredient_id=i.id AND outlet_id=$1) b ON true
      LEFT JOIN LATERAL(SELECT sum(delta_milli) FILTER(WHERE created_at>=$2::timestamptz) AS after_start,
        sum(delta_milli) FILTER(WHERE created_at>=$2::timestamptz AND created_at<$3::timestamptz) AS in_period,
        sum(delta_milli) FILTER(WHERE kind='RECIPE_CONSUMPTION' AND created_at>=$2::timestamptz AND created_at<$3::timestamptz) AS used,
        sum(cost) FILTER(WHERE kind='RECIPE_CONSUMPTION' AND created_at>=$2::timestamptz AND created_at<$3::timestamptz) AS cost
        FROM stock_movements WHERE ingredient_id=i.id AND outlet_id=$1) m ON true
      WHERE i.outlet_id=$1 AND ($4::text IS NULL OR i.production_stream=$4) AND i.name ILIKE $5
      ORDER BY i.name,i.id LIMIT 101 OFFSET $6`,
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
