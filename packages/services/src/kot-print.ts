import { z } from "zod";
import type { Database, Sql } from "@dinerdost/database";
import { can, ensure, requirePermission, type Actor } from "@dinerdost/core";
import { audit, command, one, scopedOrder, type Row } from "./shared";
import { actorStream } from "./operational-access";
async function printable(
  tx: Sql,
  actor: Actor,
  orderId: string,
  roundId: string,
  lock = false,
) {
  ensure(
    can(actor, "orders") || can(actor, "kitchen"),
    "FORBIDDEN",
    "Kitchen ticket access is required.",
    403,
  );
  const order = await scopedOrder(tx, actor, orderId, lock),
    outlet = await one(
      tx,
      "SELECT name,kot_print_mode FROM outlets WHERE id=$1",
      [order.outlet_id],
    );
  ensure(
    outlet.kot_print_mode !== "OFF",
    "KOT_PRINT_DISABLED",
    "KOT printing is off for this outlet.",
    409,
  );
  const round = await one(
    tx,
    "SELECT round_number,course FROM order_rounds WHERE id=$1 AND order_id=$2",
    [roundId, orderId],
  );
  const tickets = (
    await tx.query<Row>(
      "SELECT id,station,production_stream,created_at,auto_print_requested_at FROM kot_tickets WHERE order_id=$1 AND round_id=$2 AND ($3::text IS NULL OR production_stream=$3) ORDER BY station,production_stream,id" +
        (lock ? " FOR UPDATE" : ""),
      [orderId, roundId, actorStream(actor)],
    )
  ).rows;
  ensure(
    tickets.length > 0,
    "KOT_NOT_RELEASED",
    "The round must be released to Kitchen before printing a KOT.",
    409,
  );
  for (const ticket of tickets)
    ticket.items = (
      await tx.query(
        "SELECT name,quantity_milli,variant,modifiers,note FROM order_items WHERE round_id=$1 AND station=$2 AND (production_stream=$3 OR $3='LEGACY') ORDER BY id",
        [roundId, ticket.station, ticket.production_stream],
      )
    ).rows;
  const table = order.session_id
    ? (
        await tx.query(
          "SELECT t.label FROM table_sessions s JOIN dining_tables t ON t.id=s.table_id AND t.restro_id=s.restro_id WHERE s.id=$1",
          [order.session_id],
        )
      ).rows[0]?.label
    : null;
  return {
    orderId,
    roundId,
    outletId: order.outlet_id,
    outlet: outlet.name,
    mode: outlet.kot_print_mode,
    number: order.number,
    type: order.type,
    table,
    round: round.round_number,
    course: round.course,
    tickets,
  };
}
export async function kotReceipt(
  db: Database,
  actor: Actor,
  orderId: string,
  roundId: string,
) {
  z.uuid().parse(orderId);
  z.uuid().parse(roundId);
  return db.transaction(actor.restroId, (tx) =>
    printable(tx, actor, orderId, roundId),
  );
}
export async function requestKotPrint(
  db: Database,
  actor: Actor,
  key: string,
  orderId: string,
  roundId: string,
  input: unknown,
) {
  const data = z
    .object({ automatic: z.boolean().default(false) })
    .strict()
    .parse(input);
  if (data.automatic) requirePermission(actor, "payments");
  return command(
    db,
    actor,
    key,
    "KOT_PRINT_REQUESTED",
    { orderId, roundId, ...data },
    async (tx) => {
      const receipt = await printable(tx, actor, orderId, roundId, true);
      ensure(
        !data.automatic || receipt.mode === "AUTO",
        "KOT_AUTO_DISABLED",
        "Automatic KOT printing is off.",
        409,
      );
      const tickets = data.automatic
        ? receipt.tickets.filter((t) => !t.auto_print_requested_at)
        : receipt.tickets;
      if (!tickets.length)
        return { url: null, alreadyRequested: true, ticketIds: [] };
      const ticketIds = tickets.map((t) => t.id);
      await tx.query(
        "UPDATE kot_tickets SET auto_print_requested_at=coalesce(auto_print_requested_at,now()) WHERE id=ANY($1::uuid[])",
        [ticketIds],
      );
      await audit(tx, actor, {
        action: "KOT_PRINT_REQUESTED",
        entityType: "ORDER_ROUND",
        entityId: roundId,
        outletId: receipt.outletId,
        newState: {
          automatic: data.automatic,
          ticketIds,
          physicalDeliveryConfirmed: false,
        },
        reason: data.automatic
          ? "Automatic browser print requested after authorized kitchen release"
          : "Staff requested KOT print / reprint",
      });
      return {
        url: `/kot/${orderId}/${roundId}`,
        alreadyRequested: false,
        ticketIds,
      };
    },
  );
}
