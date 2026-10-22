import { z } from "zod";
import type { Database } from "@dinerdost/database";
import {
  ensure,
  isManager,
  requireOutlet,
  requirePermission,
  type Actor,
} from "@dinerdost/core";
export async function dishReport(db: Database, actor: Actor, input: unknown) {
  requirePermission(actor, "reports");
  ensure(
    isManager(actor) || actor.role === "ACCOUNTANT",
    "FORBIDDEN",
    "Financial reports require owner, manager or accountant access.",
    403,
  );
  const data = z
    .object({
      outletId: z.uuid().optional(),
      from: z.iso.date(),
      to: z.iso.date(),
      sort: z.enum(["DEMAND", "PROFIT", "SALES"]).default("DEMAND"),
      offset: z.coerce.number().int().min(0).max(1000000).default(0),
      search: z.string().trim().max(120).default(""),
    })
    .strict()
    .parse(input);
  ensure(
    data.from <= data.to &&
      new Date(data.to).getTime() - new Date(data.from).getTime() <=
        366 * 86400000,
    "INVALID_PERIOD",
    "Choose a report period of up to one year.",
  );
  if (data.outletId) requireOutlet(actor, data.outletId);
  return db.transaction(actor.restroId, async (tx) => {
    const outlets = (
      await tx.query(
        "SELECT id FROM outlets WHERE ($1 OR id=ANY($2::uuid[])) AND ($3::uuid IS NULL OR id=$3)",
        [actor.role === "OWNER", actor.outletIds, data.outletId ?? null],
      )
    ).rows.map((r) => r.id);
    const rows = (
      await tx.query(
        `WITH source AS(
      SELECT i.*,o.id AS order_id,r.discount,r.subtotal,c.cost,
        round(i.unit_price::numeric*i.quantity_milli/1000) AS base
      FROM invoices v JOIN orders o ON o.id=v.order_id AND o.restro_id=v.restro_id
      JOIN order_rounds r ON r.order_id=o.id AND r.restro_id=o.restro_id
      JOIN order_items i ON i.round_id=r.id AND i.restro_id=r.restro_id
      LEFT JOIN order_item_costs c ON c.order_item_id=i.id AND c.restro_id=i.restro_id
      WHERE v.document_type='FINAL_TAX_INVOICE' AND o.status='SETTLED' AND r.status='ACCEPTED' AND o.outlet_id=ANY($1::uuid[])
        AND (v.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $2::date AND $3::date
    ), shares AS(SELECT *,coalesce(floor(discount*base/nullif(subtotal,0)),0) AS share,
      coalesce(mod(discount*base,nullif(subtotal,0)),0) AS remainder FROM source),
    allocated AS(SELECT *,base-share-CASE WHEN row_number() OVER(PARTITION BY round_id ORDER BY remainder DESC,id)<=discount-sum(share) OVER(PARTITION BY round_id) THEN 1 ELSE 0 END AS net FROM shares),
    grouped AS(SELECT item_id,unit_snapshot AS unit,max(name) AS name,count(DISTINCT order_id) AS orders,sum(quantity_milli) AS quantity,
      sum(net) AS net_sales,CASE WHEN count(cost)=count(*) THEN sum(cost) END AS cogs,
      CASE WHEN count(cost)=count(*) THEN sum(net)-sum(cost) END AS profit,
      count(*) FILTER(WHERE cost IS NULL) AS unknown_cost_lines FROM allocated GROUP BY item_id,unit_snapshot)
    SELECT * FROM grouped WHERE name ILIKE $4 ORDER BY
      CASE WHEN $5='PROFIT' THEN profit END DESC NULLS LAST,
      CASE WHEN $5='SALES' THEN net_sales END DESC NULLS LAST,
      orders DESC,name,item_id,unit NULLS LAST LIMIT 101 OFFSET $6`,
        [
          outlets,
          data.from,
          data.to,
          "%" + data.search.replace(/[\\%_]/g, "\\$&") + "%",
          data.sort,
          data.offset,
        ],
      )
    ).rows;
    return {
      from: data.from,
      to: data.to,
      items: rows.slice(0, 100),
      hasMore: rows.length > 100,
      basis:
        "Gross settled final invoices; sales after discounts, before tax/charges/rounding. Refund and paid-replacement credit adjustments are shown in the financial report. Profit uses recorded ingredient costs; historical or unconfigured costs stay unknown.",
    };
  });
}
