import { z } from "zod";
import type { Database, Sql } from "@dinerdost/database";
import { can, requireOutlet, type Actor } from "@dinerdost/core";
import { num, type Row } from "./shared";
import { actorStream } from "./operational-access";

// Safe business summaries only. Audit payloads, customer identity and payment references
// never leave this query. Visibility is recalculated from current access on every request.
const feed = `WITH events AS (
 SELECT a.id,a.sequence,a.action,a.occurred_at,a.risk,a.entity_id,
   r.kind,coalesce(t.label,ot.label) AS table_label,o.id AS order_id,o.number,
   reads.read_at
 FROM audit_events a
 LEFT JOIN service_requests r ON a.entity_type='SERVICE_REQUEST' AND r.id::text=a.entity_id AND r.restro_id=a.restro_id
 LEFT JOIN order_rounds rounds ON a.entity_type='ORDER_ROUND' AND rounds.id::text=a.entity_id AND rounds.restro_id=a.restro_id
 LEFT JOIN kot_tickets k ON a.entity_type='KOT' AND k.id::text=a.entity_id AND k.restro_id=a.restro_id
 LEFT JOIN payment_attempts p ON a.entity_type='PAYMENT' AND p.id::text=a.entity_id AND p.restro_id=a.restro_id
 LEFT JOIN orders o ON o.restro_id=a.restro_id AND (o.id=rounds.order_id OR o.id=k.order_id OR o.id=p.order_id OR (a.entity_type='ORDER' AND o.id::text=a.entity_id))
 LEFT JOIN table_sessions os ON os.id=o.session_id AND os.restro_id=a.restro_id
 LEFT JOIN table_sessions rs ON rs.id=r.session_id AND rs.restro_id=a.restro_id
 LEFT JOIN dining_tables ot ON ot.id=os.table_id AND ot.restro_id=a.restro_id
 LEFT JOIN dining_tables t ON t.id=coalesce(rs.table_id,r.table_id,a.table_id) AND t.restro_id=a.restro_id
 LEFT JOIN notification_reads reads ON reads.event_id=a.id AND reads.employee_id=$2 AND reads.restro_id=a.restro_id
 WHERE a.restro_id=(SELECT restro_id FROM employees WHERE id=$2) AND (a.outlet_id=$1 OR ($8 AND a.outlet_id IS NULL)) AND (
   ($3 AND a.action IN ('ORDER_CREATED','CUSTOMER_ORDER_SUBMITTED','CUSTOMER_D2C_ORDER_SUBMITTED') AND o.id IS NOT NULL AND ($6 OR os.owner_employee_id=$2))
   OR ($4 AND a.action='CUSTOMER_SERVICE_REQUESTED' AND r.id IS NOT NULL AND ($6 OR rs.owner_employee_id=$2 OR (rs.id IS NULL AND (r.owner_id IS NULL OR r.owner_id=$2))))
   OR ($4 AND a.action='CUSTOMER_RESERVATION_REQUESTED')
   OR ($5 AND a.action IN ('KOT_RELEASED','KOT_READY') AND o.id IS NOT NULL)
   OR ($4 AND a.action='KOT_READY' AND o.id IS NOT NULL)
   OR ($7 AND a.action IN ('CASH_RECEIVED','PAYMENT_RECORDED','PAYMENT_VERIFIED') AND o.id IS NOT NULL)
   OR ($8 AND a.risk='CRITICAL')
 ) AND ($9::text IS NULL OR (k.id IS NOT NULL AND k.production_stream=$9) OR
   (a.entity_type='ORDER_ROUND' AND EXISTS(SELECT 1 FROM kot_tickets visible WHERE visible.round_id=rounds.id AND visible.restro_id=a.restro_id AND visible.production_stream=$9))) )`;
function parameters(actor: Actor, outletId: string) {
  requireOutlet(actor, outletId);
  return [
    outletId,
    actor.employeeId,
    can(actor, "orders"),
    can(actor, "sessions"),
    can(actor, "kitchen"),
    actor.role !== "WAITER",
    can(actor, "payments"),
    actor.role === "OWNER" && can(actor, "audit"),
    actorStream(actor),
  ];
}
/** Same current-access predicate as the inbox, used by the durable Android delivery worker. */
export async function notificationDelta(
  tx: Sql,
  actor: Actor,
  outletId: string,
  after: number,
  limit = 100,
) {
  return (
    await tx.query<Row>(
      feed +
        " SELECT * FROM events WHERE sequence>$10 AND read_at IS NULL ORDER BY sequence LIMIT $11",
      [...parameters(actor, outletId), after, limit],
    )
  ).rows.map((event) => summary(event, actor));
}
export async function visibleNotification(
  tx: Sql,
  actor: Actor,
  outletId: string,
  eventId: string,
) {
  return (
    await tx.query<Row>(
      feed + " SELECT * FROM events WHERE id=$10 AND read_at IS NULL",
      [...parameters(actor, outletId), eventId],
    )
  ).rows.map((event) => summary(event, actor))[0];
}
function summary(event: Row, actor: Actor) {
  const at = event.table_label ? ` · ${event.table_label}` : "";
  let title = "Restaurant alert",
    kind = "OWNER_ALERT",
    path = "/app/audit";
  if (
    [
      "ORDER_CREATED",
      "CUSTOMER_ORDER_SUBMITTED",
      "CUSTOMER_D2C_ORDER_SUBMITTED",
    ].includes(event.action)
  ) {
    title = `New order #${event.number}${at}`;
    kind = "NEW_ORDER";
    path = `/app/orders/${event.order_id}`;
  } else if (event.action === "CUSTOMER_SERVICE_REQUESTED") {
    title =
      (
        {
          ACTIVATE_TABLE: "Table activation requested",
          HELP: "Waiter requested",
          WATER: "Water requested",
          BILL: "Bill requested",
          CUTLERY: "Cutlery requested",
          CLEANUP: "Cleanup requested",
          ASSISTANCE: "Help requested",
        } as Record<string, string>
      )[event.kind] ?? "Table service requested";
    title += at;
    kind = "SERVICE_REQUEST";
    path = "/app/tasks";
  } else if (event.action === "CUSTOMER_RESERVATION_REQUESTED") {
    title = "New table reservation" + at;
    kind = "RESERVATION";
    path = "/app/floor";
  } else if (event.action.startsWith("KOT_")) {
    title = `${event.action === "KOT_READY" ? "Order ready" : "Kitchen ticket"} #${event.number}${at}`;
    kind = event.action === "KOT_READY" ? "ORDER_READY" : "KITCHEN_TICKET";
    path =
      event.action === "KOT_READY" &&
      (!actor.application || actor.application === "MASTER") &&
      can(actor, "sessions") && can(actor, "orders")
        ? "/app/tasks#ready-orders"
        : actor.role === "WAITER"
        ? "/app/tasks#ready-orders"
        : can(actor, "kitchen")
          ? "/app/kitchen"
          : `/app/orders/${event.order_id}`;
  } else if (
    ["CASH_RECEIVED", "PAYMENT_RECORDED", "PAYMENT_VERIFIED"].includes(
      event.action,
    )
  ) {
    title = `Payment received · #${event.number}${at}`;
    kind = "PAYMENT";
    path = "/app/payments";
  }
  return {
    id: event.id,
    sequence: num(event.sequence),
    title,
    kind,
    path,
    createdAt: event.occurred_at,
    read: !!event.read_at,
  };
}
async function counts(tx: Sql, params: unknown[]) {
  return (
    await tx.query<Row>(
      feed +
        " SELECT count(*) FILTER (WHERE read_at IS NULL) AS unread,coalesce(max(sequence),0) AS latest FROM events",
      params,
    )
  ).rows[0];
}
export async function notificationInbox(
  db: Database,
  actor: Actor,
  input: unknown,
) {
  const data = z
    .object({
      outletId: z.uuid(),
      before: z.number().int().positive().optional(),
    })
    .strict()
    .parse(input);
  const params = parameters(actor, data.outletId);
  return db.transaction(actor.restroId, async (tx) => {
    const total = await counts(tx, params);
    const rows = (
      await tx.query<Row>(
        feed +
          " SELECT * FROM events WHERE ($10::bigint IS NULL OR sequence<$10) ORDER BY sequence DESC LIMIT 51",
        [...params, data.before ?? null],
      )
    ).rows;
    return {
      items: rows.slice(0, 50).map((event) => summary(event, actor)),
      unread: num(total.unread),
      latest: num(total.latest),
      next: rows.length > 50 ? num(rows[49].sequence) : null,
    };
  });
}
export async function readNotifications(
  db: Database,
  actor: Actor,
  input: unknown,
) {
  const data = z
    .object({
      outletId: z.uuid(),
      ids: z.array(z.uuid()).min(1).max(50).optional(),
      through: z.number().int().min(0).optional(),
    })
    .strict()
    .refine(
      (v) => !!v.ids !== (v.through !== undefined),
      "Choose IDs or a cursor.",
    )
    .parse(input);
  const params = parameters(actor, data.outletId);
  return db.transaction(actor.restroId, async (tx) => {
    await tx.query(
      feed +
        ` INSERT INTO notification_reads(restro_id,employee_id,event_id)
      SELECT $10::uuid,$2,id FROM events WHERE ($11::uuid[] IS NOT NULL AND id=ANY($11::uuid[])) OR ($12::bigint IS NOT NULL AND sequence<=$12)
      ON CONFLICT DO NOTHING`,
      [...params, actor.restroId, data.ids ?? null, data.through ?? null],
    );
    return { ok: true, unread: num((await counts(tx, params)).unread) };
  });
}
