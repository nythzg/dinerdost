import type { Sql, Database } from "@dinerdost/database";
import {
  can,
  ensure,
  requirePermission,
  requireOutlet,
  type Actor,
} from "@dinerdost/core";
import { z } from "zod";
import { audit, one, type Row } from "./shared";

export const tableIdleMinutes = 10;

export async function touchTableActivity(
  db: Database,
  actor: Actor,
  input: unknown,
) {
  requirePermission(actor, "sessions");
  const data = z.object({ tableId: z.uuid() }).strict().parse(input);
  return db.transaction(actor.restroId, async (tx) => {
    const table = await one(
      tx,
      "SELECT id,outlet_id FROM dining_tables WHERE id=$1",
      [data.tableId],
    );
    requireOutlet(actor, table.outlet_id);
    await expireIdleTables(tx, actor.restroId, table.outlet_id, table.id);
    await one(tx, "SELECT id FROM dining_tables WHERE id=$1 FOR UPDATE", [
      table.id,
    ]);
    const sessions = (
      await tx.query<Row>(
        "SELECT id FROM table_sessions WHERE table_id=$1 AND status='OPEN' AND ($2 OR owner_employee_id=$3) ORDER BY id FOR UPDATE",
        [table.id, actor.role !== "WAITER", actor.employeeId],
      )
    ).rows;
    ensure(
      sessions.length,
      "TABLE_NOT_ASSIGNED",
      "This table is closed or assigned to another employee.",
      403,
    );
    await tx.query(
      "UPDATE table_sessions SET last_activity_at=now() WHERE id=ANY($1::uuid[])",
      [sessions.map((session) => session.id)],
    );
    return { ok: true };
  });
}

// Check expiry on server reads/writes. Staff/guest polling does not touch activity.
// Lock physical tables before sessions, matching activation and table movement.
export async function expireIdleTables(
  tx: Sql,
  restroId: string,
  outletId: string,
  tableId?: string,
) {
  const candidates = (
    await tx.query<Row>(
      "SELECT t.id FROM dining_tables t WHERE t.outlet_id=$1 AND ($2::uuid IS NULL OR t.id=$2) AND EXISTS(SELECT 1 FROM table_sessions s WHERE s.table_id=t.id AND s.status<>'CLOSED' AND s.last_activity_at<=now()-interval '10 minutes') ORDER BY t.id FOR UPDATE SKIP LOCKED",
      [outletId, tableId ?? null],
    )
  ).rows;
  for (const table of candidates) {
    const sessions = (
      await tx.query<Row>(
        "SELECT *,last_activity_at<=now()-interval '10 minutes' AS idle FROM table_sessions WHERE table_id=$1 AND status<>'CLOSED' ORDER BY id FOR UPDATE",
        [table.id],
      )
    ).rows;
    if (!sessions.length || sessions.some((session) => !session.idle)) continue;
    const ids = sessions.map((session) => session.id);
    const outstanding = (
      await tx.query(
        "SELECT id FROM orders WHERE session_id=ANY($1::uuid[]) AND status NOT IN ('SETTLED','VOIDED','REJECTED') LIMIT 1",
        [ids],
      )
    ).rows;
    if (outstanding.length) continue;
    await tx.query(
      "UPDATE table_sessions SET status='CLOSED',closed_at=now() WHERE id=ANY($1::uuid[])",
      [ids],
    );
    await tx.query(
      "UPDATE public_grants SET revoked_at=now() WHERE table_id=$1 AND revoked_at IS NULL",
      [table.id],
    );
    await tx.query(
      "UPDATE service_requests SET state='CANCELLED' WHERE (session_id=ANY($1::uuid[]) OR (session_id IS NULL AND table_id=$2)) AND state IN ('OPEN','ACCEPTED','ESCALATED')",
      [ids, table.id],
    );
    await tx.query(
      "UPDATE table_reservations SET state='COMPLETED' WHERE session_id=ANY($1::uuid[]) AND state='SEATED'",
      [ids],
    );
    await audit(
      tx,
      {
        restroId,
        userId: "system",
        employeeId: "system:table-idle",
        name: "Table inactivity",
        role: "SYSTEM",
        outletIds: [outletId],
        authMethod: "SYSTEM",
      },
      {
        action: "TABLE_AUTO_CLOSED",
        entityType: "TABLE",
        entityId: table.id,
        outletId,
        tableId: table.id,
        reason: "No activity for 10 minutes; no unsettled orders",
        newState: { sessionIds: ids, idleMinutes: tableIdleMinutes },
      },
    );
  }
}

export async function expireActorTables(db: Database, actor: Actor) {
  if (!can(actor, "sessions")) return;
  await db.transaction(actor.restroId, async (tx) => {
    const outlets = (
      await tx.query<Row>(
        "SELECT id FROM outlets WHERE ($1 OR id=ANY($2::uuid[])) ORDER BY id",
        [actor.role === "OWNER", actor.outletIds],
      )
    ).rows;
    for (const outlet of outlets)
      await expireIdleTables(tx, actor.restroId, outlet.id);
  });
}
