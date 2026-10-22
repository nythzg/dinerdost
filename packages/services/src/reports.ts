import {settledRefundsRead} from './web-refunds';
import {replacementAdjustmentsRead} from './web-replacements';
import { z } from "zod";
import type { Database } from "@dinerdost/database";
import {
  businessDate,
  ensure,
  isManager,
  requireOutlet,
  requirePermission,
  wholeUnit,
  type Actor,
} from "@dinerdost/core";
import { num } from "./shared";

const financialPeriod = `WITH issued AS (
 SELECT i.*,o.source,coalesce((SELECT sum(r.cogs) FROM order_rounds r WHERE r.order_id=o.id AND r.status='ACCEPTED'),0) AS cogs
 FROM invoices i JOIN orders o ON o.id=i.order_id AND o.restro_id=i.restro_id
 WHERE i.document_type='FINAL_TAX_INVOICE' AND i.outlet_id=ANY($1::uuid[])
 AND (i.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $2::date AND $3::date
)`;
export async function financialReport(
  db: Database,
  actor: Actor,
  input: unknown,
) {
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
        "SELECT id,name,code FROM outlets WHERE ($1 OR id=ANY($2::uuid[])) AND ($3::uuid IS NULL OR id=$3) ORDER BY code",
        [actor.role === "OWNER", actor.outletIds, data.outletId ?? null],
      )
    ).rows;
    const params = [outlets.map((outlet) => outlet.id), data.from, data.to];
    const summary = (
      await tx.query(
        financialPeriod +
          ` SELECT count(*) AS orders,
      coalesce(sum((snapshot->'totals'->>'payable')::bigint),0) AS receipts,
      coalesce(sum((snapshot->'totals'->>'subtotal')::bigint-(snapshot->'totals'->>'discount')::bigint),0) AS net_sales,
      coalesce(sum((snapshot->'totals'->>'tax')::bigint),0) AS tax,
      coalesce(sum((snapshot->'totals'->>'charges')::bigint),0) AS charges,
      coalesce(sum(cogs),0) AS cogs FROM issued`,
        params,
      )
    ).rows[0];
    const expenses = (
      await tx.query(
        "SELECT coalesce(sum((data->>'amount')::bigint) FILTER(WHERE NOT data ? 'sourcePurchaseId'),0) AS total,coalesce(sum((data->>'amount')::bigint) FILTER(WHERE data ? 'sourcePurchaseId'),0) AS stock_purchases FROM records WHERE kind='expenses' AND state IN ('APPROVED','COMPLETED') AND outlet_id=ANY($1::uuid[]) AND (data->>'date')::date BETWEEN $2::date AND $3::date",
        params,
      )
    ).rows[0];
    const channels = (
      await tx.query(
        financialPeriod +
          " SELECT source,count(*) AS orders,sum((snapshot->'totals'->>'payable')::bigint) AS amount FROM issued GROUP BY source ORDER BY source",
        params,
      )
    ).rows;
    const methods = (
      await tx.query(
        financialPeriod +
          " SELECT p.method,sum(p.amount) AS amount,count(*) AS payments FROM payment_attempts p JOIN issued i ON i.order_id=p.order_id AND i.restro_id=p.restro_id WHERE p.state='VERIFIED' GROUP BY p.method ORDER BY p.method",
        params,
      )
    ).rows;
    const daily = (
      await tx.query(
        financialPeriod +
          " SELECT (created_at AT TIME ZONE 'Asia/Kolkata')::date AS date,count(*) AS orders,sum((snapshot->'totals'->>'payable')::bigint) AS amount FROM issued GROUP BY 1 ORDER BY 1",
        params,
      )
    ).rows;
    const distribution = (
      await tx.query(
        financialPeriod +
          ` , amounts AS (SELECT (snapshot->'totals'->>'payable')::bigint AS value FROM issued), bounds AS (SELECT greatest(10000,ceil(coalesce(max(value),0)::numeric/60000)*10000)::bigint AS width FROM amounts)
      SELECT bucket,bucket*width AS lower,(bucket+1)*width AS upper,count(a.value) AS orders FROM bounds CROSS JOIN generate_series(0,5) bucket LEFT JOIN amounts a ON least(5,floor(a.value::numeric/width))=bucket GROUP BY bucket,width ORDER BY bucket`,
        params,
      )
    ).rows;
    const refunds=await settledRefundsRead(tx,params[0] as string[],data.from,data.to);
    const replacements=await replacementAdjustmentsRead(tx,params[0] as string[],data.from,data.to);
    const replacementRows=(await tx.query(`SELECT r.id,r.amount,r.source_order_id,r.target_order_id,r.reason,r.snapshot->>'number' AS number,o.source,(r.created_at AT TIME ZONE 'Asia/Kolkata')::date::text AS day FROM web_replacements r JOIN orders o ON o.id=r.source_order_id AND o.restro_id=r.restro_id WHERE r.outlet_id=ANY($1::uuid[]) AND r.snapshot->>'recognized'='true' AND (r.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $2::date AND $3::date ORDER BY r.created_at,r.id`,params)).rows;
    const creditedMethods=(await tx.query(financialPeriod+` SELECT p.method,sum((a->>'amount')::bigint) AS amount,count(*) AS payments FROM issued i JOIN web_replacements r ON r.target_order_id=i.order_id AND r.restro_id=i.restro_id CROSS JOIN LATERAL jsonb_array_elements(r.allocations) a JOIN payment_attempts p ON p.id=(a->>'paymentId')::uuid AND p.restro_id=i.restro_id WHERE NOT EXISTS(SELECT 1 FROM invoices f WHERE f.order_id=p.order_id AND f.document_type='FINAL_TAX_INVOICE') GROUP BY p.method`,params)).rows;
    for(const credited of creditedMethods){const method=methods.find(m=>m.method===credited.method);if(method){method.amount=num(method.amount)+num(credited.amount);method.payments=num(method.payments)+num(credited.payments)}else methods.push(credited)}
    const refundRows=(await tx.query(`SELECT r.id,r.amount,r.mode,r.reason,r.invoice_id,r.order_id,r.created_at,r.snapshot->>'number' AS number,o.source,(greatest(r.created_at,f.created_at) AT TIME ZONE 'Asia/Kolkata')::date::text AS day
      FROM web_refunds r JOIN invoices f ON f.order_id=r.order_id AND f.restro_id=r.restro_id AND f.document_type='FINAL_TAX_INVOICE' JOIN orders o ON o.id=r.order_id AND o.restro_id=r.restro_id
      WHERE r.outlet_id=ANY($1::uuid[]) AND (greatest(r.created_at,f.created_at) AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $2::date AND $3::date ORDER BY r.created_at,r.id`,params)).rows;
    const dayKey=(value:unknown)=>value instanceof Date?[value.getFullYear(),String(value.getMonth()+1).padStart(2,'0'),String(value.getDate()).padStart(2,'0')].join('-'):String(value).slice(0,10);
    for(const refund of [...refundRows,...replacementRows]){const channel=channels.find(c=>c.source===refund.source);if(channel)channel.amount=num(channel.amount)-num(refund.amount);else channels.push({source:refund.source,orders:0,amount:-num(refund.amount)});const day=dayKey(refund.day),entry=daily.find(d=>dayKey(d.date)===day);if(entry)entry.amount=num(entry.amount)-num(refund.amount);else daily.push({date:day,orders:0,amount:-num(refund.amount)});}
    daily.sort((a,b)=>dayKey(a.date).localeCompare(dayKey(b.date)));
    const netSales = num(summary.net_sales)-num(refunds.net_sales)-num(replacements.net_sales),
      cogs = num(summary.cogs)+num(replacements.cogs),
      operatingExpenses = num(expenses.total);
    return {
      from: data.from,
      to: data.to,
      outlets,
      orders: num(summary.orders),
      grossReceipts:num(summary.receipts),refunds:num(refunds.amount),refundRows,
      replacementCredits:num(replacements.amount),replacementRows,
      receipts: num(summary.receipts)-num(refunds.amount)-num(replacements.amount),
      netSales,
      tax: num(summary.tax)-num(refunds.tax)-num(replacements.tax),
      charges: num(summary.charges)-num(refunds.charges)-num(replacements.charges),
      cogs,
      expenses: operatingExpenses,
      grossMargin: netSales - cogs,
      operatingResult: netSales - cogs - operatingExpenses,
      stockPurchases: num(expenses.stock_purchases),
      channels,
      methods,
      daily,
      distribution,
      basis:
        "Issued final invoices less immutable refund and paid-replacement credit adjustments, plus approved expenses and unbilled replaced-food costs. Receipt-method rows retain actual collections; payment credits are not new receipts.",
    };
  });
}

export async function prepPlan(db: Database, actor: Actor, input: unknown) {
  requirePermission(actor, "inventory");
  const data = z
    .object({ outletId: z.uuid(), date: z.iso.date().default(businessDate()) })
    .strict()
    .parse(input);
  requireOutlet(actor, data.outletId);
  const { actorStream } = await import("./operational-access");
  const stream = actorStream(actor);
  return db.transaction(actor.restroId, async (tx) => {
    const rows = (
      await tx.query(
        `SELECT i.item_id,min(i.name) AS name,min(m.unit) AS unit,
      (o.created_at AT TIME ZONE 'Asia/Kolkata')::date AS date,sum(i.quantity_milli) AS quantity
      FROM order_items i JOIN order_rounds r ON r.id=i.round_id AND r.restro_id=i.restro_id
      JOIN orders o ON o.id=r.order_id AND o.restro_id=i.restro_id
      JOIN menu_items m ON m.id=i.item_id AND m.restro_id=i.restro_id
      WHERE o.outlet_id=$1 AND o.status='SETTLED' AND r.status='ACCEPTED'
      AND (o.created_at AT TIME ZONE 'Asia/Kolkata')::date<$2::date
      AND (o.created_at AT TIME ZONE 'Asia/Kolkata')::date>=$2::date-interval '56 days'
      AND extract(dow FROM o.created_at AT TIME ZONE 'Asia/Kolkata')=extract(dow FROM $2::date)
      AND ($3::text IS NULL OR i.production_stream=$3) GROUP BY i.item_id,4 ORDER BY 2,4`,
        [data.outletId, data.date, stream],
      )
    ).rows;
    const grouped = new Map<string, typeof rows>();
    for (const row of rows)
      grouped.set(String(row.item_id), [
        ...(grouped.get(String(row.item_id)) ?? []),
        row,
      ]);
    const items = [...grouped.values()].map((history) => {
      const samples = history.length;
      if (samples < 4)
        return {
          itemId: history[0].item_id,
          name: history[0].name,
          samples,
          quantityMilli: null,
          reason:
            "At least four matching weekdays with settled sales are required.",
        };
      const points = history.map((row) => ({
        x:
          (new Date(String(row.date)).getTime() -
            new Date(data.date).getTime()) /
          (7 * 86400000),
        y: num(row.quantity),
      }));
      const meanX = points.reduce((n, p) => n + p.x, 0) / samples,
        meanY = points.reduce((n, p) => n + p.y, 0) / samples;
      const denominator = points.reduce((n, p) => n + (p.x - meanX) ** 2, 0);
      const slope = denominator
        ? points.reduce((n, p) => n + (p.x - meanX) * (p.y - meanY), 0) /
          denominator
        : 0;
      const forecast = Math.max(0, Math.min(meanY * 2, meanY - slope * meanX));
      return {
        itemId: history[0].item_id,
        name: history[0].name,
        unit: history[0].unit,
        samples,
        quantityMilli: wholeUnit(String(history[0].unit))
          ? Math.ceil(forecast / 1000) * 1000
          : Math.ceil(forecast),
        reason:
          "Same-weekday linear regression over up to eight weeks; staff review required.",
      };
    });
    return {
      date: data.date,
      method: "same_weekday_linear_regression",
      items,
      reviewed: false,
    };
  });
}
