import { z } from "zod";
import type { Database, Sql } from "@dinerdost/database";
import {
  businessDate,
  businessLocalToISO,
  ensure,
  requireOutlet,
  requirePermission,
  type Actor,
} from "@dinerdost/core";
import {
  audit,
  command,
  expectedVersion,
  id,
  num,
  one,
  type Row,
} from "./shared";
import { actorStream, requireInventoryStream } from "./operational-access";

export async function stockCountStatusRead(
  tx: Sql,
  actor: Actor,
  outletId: string,
  day = businessDate(),
) {
  const status = await one(
    tx,
    `SELECT count(*)::int AS total,
    count(*) FILTER(WHERE EXISTS(SELECT 1 FROM daily_stock_counts c WHERE c.ingredient_id=i.id AND c.business_date=$2::date AND c.phase='OPENING'))::int AS opened,
    count(*) FILTER(WHERE EXISTS(SELECT 1 FROM daily_stock_counts c WHERE c.ingredient_id=i.id AND c.business_date=$2::date AND c.phase='CLOSING'))::int AS closed
    FROM ingredients i WHERE i.outlet_id=$1 AND i.retired_at IS NULL AND ($3::text IS NULL OR i.production_stream=$3)`,
    [outletId, day, actorStream(actor)],
  );
  return {
    date: day,
    total: num(status.total),
    opened: num(status.opened),
    closed: num(status.closed),
    missingOpening: num(status.total) - num(status.opened),
  };
}

export async function recordStockCounts(
  db: Database,
  actor: Actor,
  key: string,
  input: unknown,
) {
  requirePermission(actor, "inventory");
  const data = z
    .object({
      outletId: z.uuid(),
      date: z.iso.date(),
      phase: z.enum(["OPENING", "CLOSING"]),
      counts: z
        .array(
          z
            .object({
              ingredientId: z.uuid(),
              quantityMilli: z.number().int().min(0).max(1000000000),
              version: z.number().int().min(0),
            })
            .strict(),
        )
        .min(1)
        .max(100),
      note: z.string().trim().max(500).default(""),
    })
    .strict()
    .parse(input);
  requireOutlet(actor, data.outletId);
  ensure(
    data.date === businessDate(),
    "COUNT_DATE_LOCKED",
    "Record counts for today's India business date. Previous days are read-only.",
    409,
  );
  ensure(
    new Set(data.counts.map((c) => c.ingredientId)).size === data.counts.length,
    "DUPLICATE_COUNT",
    "Enter each stock item once.",
  );
  return command(
    db,
    actor,
    key,
    "DAILY_STOCK_COUNT_RECORDED",
    data,
    async (tx) => {
      await one(tx, "SELECT id FROM outlets WHERE id=$1 FOR UPDATE", [
        data.outletId,
      ]);
      ensure(
        data.date === businessDate(),
        "COUNT_DATE_LOCKED",
        "The business date changed. Refresh before recording counts.",
        409,
      );
      const saved = [];
      for (const entry of [...data.counts].sort((a, b) =>
        a.ingredientId.localeCompare(b.ingredientId),
      )) {
        const item = await one(
          tx,
          "SELECT * FROM ingredients WHERE id=$1 AND outlet_id=$2 AND retired_at IS NULL FOR UPDATE",
          [entry.ingredientId, data.outletId],
        );
        requireInventoryStream(actor, item.category, item.production_stream);
        const previous = (
          await tx.query<Row>(
            "SELECT * FROM daily_stock_counts WHERE ingredient_id=$1 AND business_date=$2::date AND phase=$3 ORDER BY version DESC LIMIT 1",
            [item.id, data.date, data.phase],
          )
        ).rows[0];
        expectedVersion(num(previous?.version), entry.version);
        const opening =
          data.phase === "CLOSING"
            ? (
                await tx.query<Row>(
                  "SELECT * FROM daily_stock_counts WHERE ingredient_id=$1 AND business_date=$2::date AND phase='OPENING' ORDER BY version DESC LIMIT 1",
                  [item.id, data.date],
                )
              ).rows[0]
            : null;
        if (data.phase === "CLOSING")
          ensure(
            opening,
            "OPENING_COUNT_REQUIRED",
            "Record this item's opening count before its closing count.",
            409,
          );
        if (data.phase === "OPENING")
          ensure(
            !(
              await tx.query(
                "SELECT id FROM daily_stock_counts WHERE ingredient_id=$1 AND business_date=$2::date AND phase='CLOSING' LIMIT 1",
                [item.id, data.date],
              )
            ).rows.length,
            "OPENING_COUNT_LOCKED",
            "Opening counts are locked after closing. Review the recorded count history.",
            409,
          );
        ensure(
          !previous || data.note.length >= 5,
          "COUNT_CORRECTION_REASON",
          "Add a reason of at least five characters when correcting a count.",
        );
        // Locks match existing receipt/consumption paths; snapshots avoid timestamp/backdating ambiguity.
        await tx.query(
          "SELECT id FROM stock_batches WHERE ingredient_id=$1 ORDER BY id FOR UPDATE",
          [item.id],
        );
        const totals =
          previous ??
          (await one(
            tx,
            `SELECT coalesce(sum(delta_milli),0) AS ledger_total,
        coalesce(-sum(delta_milli) FILTER(WHERE kind='RECIPE_CONSUMPTION'),0) AS recipe_total,
        coalesce(sum(delta_milli) FILTER(WHERE kind='RECEIPT'),0) AS receipt_total,
        coalesce(-sum(delta_milli) FILTER(WHERE kind='WASTAGE'),0) AS waste_total,
        (SELECT coalesce(sum(on_hand),0) FROM stock_batches WHERE ingredient_id=$1) AS system_on_hand,
        clock_timestamp() AS effective_at FROM stock_movements WHERE ingredient_id=$1`,
            [item.id],
          ));
        const countId = id();
        await tx.query(
          `INSERT INTO daily_stock_counts(id,restro_id,outlet_id,ingredient_id,business_date,phase,quantity_milli,version,ledger_total,recipe_total,receipt_total,waste_total,system_on_hand,effective_at,actor_id,note)
        VALUES($1,$2,$3,$4,$5::date,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [
            countId,
            actor.restroId,
            data.outletId,
            item.id,
            data.date,
            data.phase,
            entry.quantityMilli,
            entry.version + 1,
            totals.ledger_total,
            totals.recipe_total,
            totals.receipt_total,
            totals.waste_total,
            totals.system_on_hand,
            totals.effective_at,
            actor.employeeId,
            data.note,
          ],
        );
        saved.push({
          id: countId,
          ingredientId: item.id,
          quantityMilli: entry.quantityMilli,
          version: entry.version + 1,
        });
        await audit(tx, actor, {
          action: previous ? "STOCK_COUNT_CORRECTED" : "STOCK_COUNT_RECORDED",
          entityType: "DAILY_STOCK_COUNT",
          entityId: countId,
          outletId: data.outletId,
          oldState: previous ?? null,
          newState: {
            date: data.date,
            phase: data.phase,
            ...entry,
            version: entry.version + 1,
            effectiveAt: totals.effective_at,
          },
          reason:
            data.note ||
            "Physical " + data.phase.toLowerCase() + " stock count",
        });
      }
      return { ok: true, counts: saved };
    },
  );
}

function countView(row: Row | null) {
  return row
    ? {
        quantityMilli: num(row.quantity_milli),
        systemQuantityMilli: num(row.system_on_hand),
        systemVariance: num(row.quantity_milli) - num(row.system_on_hand),
        version: num(row.version),
        recordedAt: row.recorded_at,
        effectiveAt: row.effective_at,
        recordedBy: row.actor_name,
        note: row.note,
      }
    : null;
}
export async function stockCountReport(
  db: Database,
  actor: Actor,
  input: unknown,
) {
  requirePermission(actor, "inventory");
  const data = z
    .object({
      outletId: z.uuid(),
      date: z.iso.date().default(businessDate()),
      search: z.string().trim().max(120).default(""),
      offset: z.coerce.number().int().min(0).max(1000000).default(0),
    })
    .strict()
    .parse(input);
  requireOutlet(actor, data.outletId);
  ensure(
    data.date <= businessDate(),
    "INVALID_DATE",
    "Choose today or an earlier India business date.",
  );
  const start = businessLocalToISO(data.date + "T00:00"),
    end = new Date(new Date(start).getTime() + 86400000).toISOString();
  return db.transaction(actor.restroId, async (tx) => {
    await one(tx, "SELECT id FROM outlets WHERE id=$1", [data.outletId]);
    const rows = (
      await tx.query<Row>(
        `SELECT i.id,i.name,i.unit,i.production_stream,i.retired_at,
      to_jsonb(o) AS opening,to_jsonb(c) AS closing,
      coalesce(m.ledger_total,0) AS ledger_total,coalesce(m.recipe_total,0) AS recipe_total,
      coalesce(m.receipt_total,0) AS receipt_total,coalesce(m.waste_total,0) AS waste_total
      FROM ingredients i
      LEFT JOIN LATERAL(SELECT d.*,e.name AS actor_name FROM daily_stock_counts d JOIN employees e ON e.id=d.actor_id AND e.restro_id=d.restro_id WHERE d.ingredient_id=i.id AND d.business_date=$2::date AND d.phase='OPENING' ORDER BY version DESC LIMIT 1) o ON true
      LEFT JOIN LATERAL(SELECT d.*,e.name AS actor_name FROM daily_stock_counts d JOIN employees e ON e.id=d.actor_id AND e.restro_id=d.restro_id WHERE d.ingredient_id=i.id AND d.business_date=$2::date AND d.phase='CLOSING' ORDER BY version DESC LIMIT 1) c ON true
      LEFT JOIN LATERAL(SELECT sum(delta_milli) AS ledger_total,-sum(delta_milli) FILTER(WHERE kind='RECIPE_CONSUMPTION') AS recipe_total,sum(delta_milli) FILTER(WHERE kind='RECEIPT') AS receipt_total,-sum(delta_milli) FILTER(WHERE kind='WASTAGE') AS waste_total FROM stock_movements WHERE ingredient_id=i.id) m ON true
      WHERE i.outlet_id=$1 AND ($3::text IS NULL OR i.production_stream=$3) AND (i.retired_at IS NULL OR o.id IS NOT NULL OR c.id IS NOT NULL)
      AND i.name ILIKE $4 ORDER BY i.name,i.id LIMIT 101 OFFSET $5`,
        [
          data.outletId,
          data.date,
          actorStream(actor),
          "%" + data.search.replace(/[\\%_]/g, "\\$&") + "%",
          data.offset,
        ],
      )
    ).rows;
    const coverage = await one(
      tx,
      `SELECT
      (SELECT count(*)::int FROM menu_items m WHERE m.outlet_id=$1 AND m.ready_food_batch_id IS NULL AND m.active AND ($2::text IS NULL OR m.production_stream=$2) AND NOT EXISTS(SELECT 1 FROM recipes r WHERE r.item_id=m.id)) AS missing_recipes,
      (SELECT count(*)::int FROM order_item_costs c JOIN order_items l ON l.id=c.order_item_id AND l.restro_id=c.restro_id WHERE c.outlet_id=$1 AND c.cost IS NULL AND c.recorded_at>=$3::timestamptz AND c.recorded_at<$4::timestamptz AND ($2::text IS NULL OR l.production_stream=$2)) AS untracked_items`,
      [data.outletId, actorStream(actor), start, end],
    );
    const items = rows.slice(0, 100).map((row) => {
      const opening = row.opening as Row | null,
        closing = row.closing as Row | null;
      const totals = closing ?? row;
      // A closed day's totals are frozen at the count. Unclosed past days are not reconstructed from today's balance.
      const comparable =
        !!opening && (!!closing || data.date === businessDate());
      const movement = comparable
        ? num(totals.ledger_total) - num(opening!.ledger_total)
        : null;
      const recipeUsage = comparable
        ? num(totals.recipe_total) - num(opening!.recipe_total)
        : null;
      const receipts = comparable
        ? num(totals.receipt_total) - num(opening!.receipt_total)
        : null;
      const waste = comparable
        ? num(totals.waste_total) - num(opening!.waste_total)
        : null;
      const other = comparable
        ? movement! - receipts! + recipeUsage! + waste!
        : null;
      const expectedClosing = comparable
        ? num(opening!.quantity_milli) + movement!
        : null;
      return {
        id: row.id,
        name: row.name,
        unit: row.unit,
        productionStream: row.production_stream,
        retired: !!row.retired_at,
        opening: countView(opening),
        closing: countView(closing),
        receipts,
        recipeUsage,
        waste,
        other,
        expectedClosing,
        variance:
          closing && expectedClosing !== null
            ? num(closing.quantity_milli) - expectedClosing
            : null,
      };
    });
    return {
      date: data.date,
      timeZone: "Asia/Kolkata",
      items,
      hasMore: rows.length > 100,
      status: await stockCountStatusRead(tx, actor, data.outletId, data.date),
      missingRecipes: num(coverage.missing_recipes),
      untrackedItems: num(coverage.untracked_items),
    };
  });
}
