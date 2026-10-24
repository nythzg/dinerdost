import { z } from "zod";
import type { Database } from "@dinerdost/database";
import {
  can,
  ensure,
  requireOutlet,
  requirePermission,
  type Actor,
} from "@dinerdost/core";
import { actorStream } from "./operational-access";
import type { Row } from "./shared";
const paymentSorts={
 DATE_DESC:'activity_date DESC,created_at DESC,id DESC',DATE_ASC:'activity_date ASC,created_at ASC,id ASC',
 AMOUNT_DESC:'filter_amount DESC,created_at DESC,id DESC',AMOUNT_ASC:'filter_amount ASC,created_at DESC,id DESC',
 ORDER_DESC:'number DESC,created_at DESC,id DESC',ORDER_ASC:'number ASC,created_at DESC,id DESC',
 METHOD_ASC:'method ASC,created_at DESC,id DESC',METHOD_DESC:'method DESC,created_at DESC,id DESC',
 STATE_ASC:"CASE WHEN state='VERIFIED' THEN 'RECEIVED' ELSE state END ASC,created_at DESC,id DESC",STATE_DESC:"CASE WHEN state='VERIFIED' THEN 'RECEIVED' ELSE state END DESC,created_at DESC,id DESC",
 REFERENCE_ASC:"NULLIF(reference,'') ASC NULLS LAST,created_at DESC,id DESC",REFERENCE_DESC:"NULLIF(reference,'') DESC NULLS LAST,created_at DESC,id DESC",
} as const;
const historySortColumns:Record<string,Record<string,string>>={
 kot:{QUANTITY:'filter_quantity',STATUS:'filter_status',NUMBER:'number',TITLE:'lower(station)'},
 invoices:{AMOUNT:'filter_amount',QUANTITY:'filter_quantity',STATUS:'filter_status',NUMBER:'number',CUSTOMER:"NULLIF(lower(snapshot->'customer'->>'name'),'')"},
 movements:{AMOUNT:'filter_amount',QUANTITY:'filter_quantity',STATUS:'filter_status',ITEM:'lower(name)'},
 purchases:{AMOUNT:'filter_amount',QUANTITY:'filter_quantity',STATUS:'filter_status',TITLE:'lower(title)',REFERENCE:"NULLIF(lower(data->>'reference'),'')"},
 expenses:{AMOUNT:'filter_amount',STATUS:'filter_status',TITLE:'lower(title)',REFERENCE:"NULLIF(lower(data->>'reference'),'')"},
 checklists:{STATUS:'filter_status',TITLE:'lower(title)'},
};
const filterSchema = z
  .object({
    outletId: z.uuid(),
    kind: z.enum([
      "invoices",
      "kot",
      "payments",
      "movements",
      "purchases",
      "expenses",
      "checklists",
    ]),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    minAmount: z.coerce.number().int().min(0).max(1e12).optional(),
    maxAmount: z.coerce.number().int().min(0).max(1e12).optional(),
    minQuantity: z.coerce.number().int().min(0).max(1e12).optional(),
    maxQuantity: z.coerce.number().int().min(0).max(1e12).optional(),
    search: z.string().trim().max(120).default(""),
    status: z.string().trim().max(80).default(""),
    paymentState:z.enum(['AWAITING_VERIFICATION','UNKNOWN','INITIATED','VERIFIED','REJECTED','FAILED']).optional(),
    sort:z.enum(['DATE_DESC','DATE_ASC','AMOUNT_DESC','AMOUNT_ASC','ORDER_DESC','ORDER_ASC','METHOD_ASC','METHOD_DESC','STATE_ASC','STATE_DESC','REFERENCE_ASC','REFERENCE_DESC','QUANTITY_ASC','QUANTITY_DESC','STATUS_ASC','STATUS_DESC','TITLE_ASC','TITLE_DESC','NUMBER_ASC','NUMBER_DESC','CUSTOMER_ASC','CUSTOMER_DESC','ITEM_ASC','ITEM_DESC']).optional(),
    offset: z.coerce.number().int().min(0).max(1000000).default(0),
  })
  .strict();
export async function listActivity(db: Database, actor: Actor, input: unknown) {
  const f = filterSchema.parse(input);
  requireOutlet(actor, f.outletId);
  ensure(f.kind==='payments'||!f.paymentState,'PAYMENT_FILTER_ONLY','Payment state applies only to payment history.');
  const [property,direction]=(f.sort??'DATE_DESC').split('_');
  ensure(f.kind==='payments'?(!f.sort||f.sort in paymentSorts):property==='DATE'||property in historySortColumns[f.kind],'ACTIVITY_SORT_NOT_SUPPORTED','This sorting property is not available for this history.');
  ensure(
    !f.from || !f.to || f.from <= f.to,
    "DATE_RANGE",
    "End date must follow start date.",
  );
  ensure(
    f.minAmount === undefined ||
      f.maxAmount === undefined ||
      f.minAmount <= f.maxAmount,
    "AMOUNT_RANGE",
    "Maximum amount must be at least minimum amount.",
  );
  ensure(
    f.minQuantity === undefined ||
      f.maxQuantity === undefined ||
      f.minQuantity <= f.maxQuantity,
    "QUANTITY_RANGE",
    "Maximum quantity must be at least minimum quantity.",
  );
  const ownExpense = f.kind === "expenses" && !can(actor, "finance"),
    ownChecklist = f.kind === "checklists" && can(actor, "ownChecklists");
  if (f.kind === "invoices" || f.kind === "kot") {
    if (!can(actor, "finance")) requirePermission(actor, "bill");
  } else
    requirePermission(
      actor,
      f.kind === "payments"
        ? "payments"
        : f.kind === "movements"
          ? "inventory"
          : f.kind === "purchases"
            ? "procurement"
            : f.kind === "expenses"
              ? ownExpense
                ? "ownExpenses"
                : "finance"
              : ownChecklist
                ? "ownChecklists"
                : "sessions",
    );
  const args: unknown[] = [f.outletId, actorStream(actor), actor.employeeId];
  let base: string;
  if (f.kind === "invoices")
    base = `SELECT v.*, (v.created_at AT TIME ZONE 'Asia/Kolkata')::date AS activity_date,(v.snapshot->'totals'->>'payable')::bigint AS filter_amount,(SELECT coalesce(sum((i->>'quantity_milli')::bigint),0) FROM jsonb_array_elements(coalesce(v.snapshot->'items','[]'::jsonb)) i) AS filter_quantity,v.number||' '||coalesce(v.snapshot->'customer'->>'name','') AS filter_search,v.document_type AS filter_status FROM invoices v WHERE v.outlet_id=$1`;
  else if (f.kind === "kot")
    base = `SELECT k.*,o.number,o.type AS order_type,r.round_number,r.course,t.label AS table_label,(k.created_at AT TIME ZONE 'Asia/Kolkata')::date AS activity_date,NULL::bigint AS filter_amount,(SELECT coalesce(sum(i.quantity_milli),0) FROM order_items i WHERE i.round_id=k.round_id AND i.restro_id=k.restro_id AND i.station=k.station AND (k.production_stream='LEGACY' OR i.production_stream=k.production_stream)) AS filter_quantity,o.number::text||' '||r.round_number::text||' '||k.station||' '||k.production_stream||' '||coalesce(t.label,'') AS filter_search,k.status AS filter_status FROM kot_tickets k JOIN orders o ON o.id=k.order_id AND o.restro_id=k.restro_id JOIN order_rounds r ON r.id=k.round_id AND r.restro_id=k.restro_id LEFT JOIN table_sessions s ON s.id=o.session_id AND s.restro_id=o.restro_id LEFT JOIN dining_tables t ON t.id=s.table_id AND t.restro_id=s.restro_id WHERE k.outlet_id=$1 AND ($2::text IS NULL OR k.production_stream=$2)${actor.role==='WAITER'?' AND s.owner_employee_id=$3':''}`;
  else if (f.kind === "payments")
    base = `SELECT p.*,o.number,(p.created_at AT TIME ZONE 'Asia/Kolkata')::date AS activity_date,p.amount AS filter_amount,NULL::bigint AS filter_quantity,o.number::text||' '||coalesce(p.reference,'') AS filter_search,p.method AS filter_status FROM payment_attempts p JOIN orders o ON o.id=p.order_id AND o.restro_id=p.restro_id WHERE p.outlet_id=$1`;
  else if (f.kind === "movements")
    base = `SELECT s.*,i.name,i.unit,(s.created_at AT TIME ZONE 'Asia/Kolkata')::date AS activity_date,abs(s.cost) AS filter_amount,abs(s.delta_milli) AS filter_quantity,i.name||' '||s.reason AS filter_search,s.kind AS filter_status FROM stock_movements s JOIN ingredients i ON i.id=s.ingredient_id AND i.restro_id=s.restro_id WHERE s.outlet_id=$1 AND ($2::text IS NULL OR i.production_stream=$2)`;
  else {
    const kind = f.kind; // Only enum-validated constant values are interpolated.
    const date =
      kind === "expenses"
        ? "(r.data->>'date')::date"
        : kind === "checklists"
          ? "(r.data->>'due')::date"
          : "(r.created_at AT TIME ZONE 'Asia/Kolkata')::date";
    const qty =
      kind === "purchases"
        ? "(SELECT sum((line->>'quantityMilli')::bigint) FROM purchase_receipts pr CROSS JOIN LATERAL jsonb_array_elements(pr.lines) line WHERE pr.purchase_id=r.id AND pr.restro_id=r.restro_id)"
        : "NULL::bigint";
    base = `SELECT r.*,${date} AS activity_date,(r.data->>'amount')::bigint AS filter_amount,${qty} AS filter_quantity,r.title||' '||coalesce(r.data->>'reference','') AS filter_search,r.state AS filter_status FROM records r WHERE r.outlet_id=$1 AND r.kind='${kind}' AND ($2::text IS NULL OR r.production_stream=$2 OR r.kind='checklists')${ownExpense ? " AND r.created_by=$3" : ""}${ownChecklist ? " AND r.data->>'employeeId'=$3::text" : ""}`;
  }
  // Parameters 2/3 are typed even on branches without stream or employee predicates.
  base += " AND ($2::text IS NULL OR true) AND ($3::uuid IS NULL OR true)";
  const where: string[] = [];
  const add = (sql: string, value: unknown) => {
    args.push(value);
    where.push(sql.replace("?", `$${args.length}`));
  };
  if (f.from) add("activity_date>=?::date", f.from);
  if (f.to) add("activity_date<=?::date", f.to);
  if (f.minAmount !== undefined) add("filter_amount>=?", f.minAmount);
  if (f.maxAmount !== undefined) add("filter_amount<=?", f.maxAmount);
  if (f.minQuantity !== undefined) add("filter_quantity>=?", f.minQuantity);
  if (f.maxQuantity !== undefined) add("filter_quantity<=?", f.maxQuantity);
  if (f.search)
    add(
      "filter_search ILIKE ?",
      "%" + f.search.replace(/[\\%_]/g, "\\$&") + "%",
    );
  if (f.status) add("filter_status=?", f.status);
  if(f.paymentState)add('state=?',f.paymentState);
  args.push(f.offset);
  const order=f.kind==='payments'?paymentSorts[(f.sort??'DATE_DESC') as keyof typeof paymentSorts]:property==='DATE'?`activity_date ${direction},created_at ${direction},id ${direction}`:`${historySortColumns[f.kind][property]} ${direction} NULLS LAST,created_at DESC,id DESC`;
  return db.transaction(actor.restroId, async (tx) => {
    const rows = (
      await tx.query<Row>(
        `SELECT * FROM (${base}) activity ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY ${order} LIMIT 101 OFFSET $${args.length}`,
        args,
      )
    ).rows;
    return {
      items: rows.slice(0, 100),
      hasMore: rows.length > 100,
      offset: f.offset,
    };
  });
}
