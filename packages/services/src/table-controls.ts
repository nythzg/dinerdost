import { z } from "zod";
import type { Database } from "@dinerdost/database";
import {
  diningTableGroups,
  ensure,
  isManager,
  requireOutlet,
  requirePermission,
  type Actor,
} from "@dinerdost/core";
import { audit, command, one, type Row } from "./shared";
import { assertTableNotReserved } from "./reservations";

export async function exchangeTables(
  db: Database,
  actor: Actor,
  key: string,
  input: unknown,
) {
  requirePermission(actor, "sessions");
  const data = z
    .object({
      sourceTableId: z.uuid(),
      targetTableId: z.uuid(),
      reason: z.string().trim().min(3).max(500),
    })
    .strict()
    .parse(input);
  ensure(
    data.sourceTableId !== data.targetTableId,
    "SAME_TABLE",
    "Choose a different table.",
  );
  return command(db, actor, key, "TABLES_EXCHANGED", data, async (tx) => {
    const tables = (
      await tx.query<Row>(
        "SELECT * FROM dining_tables WHERE id=ANY($1::uuid[]) AND retired_at IS NULL ORDER BY id FOR UPDATE",
        [[data.sourceTableId, data.targetTableId]],
      )
    ).rows;
    ensure(
      tables.length === 2,
      "NOT_FOUND",
      "A selected table is unavailable.",
      404,
    );
    requireOutlet(actor, tables[0].outlet_id);
    ensure(
      tables[0].outlet_id === tables[1].outlet_id,
      "OUTLET_MISMATCH",
      "Move guests only between tables at the same outlet.",
    );
    const sessions = (
      await tx.query<Row>(
        "SELECT * FROM table_sessions WHERE table_id=ANY($1::uuid[]) AND status<>'CLOSED' ORDER BY id FOR UPDATE",
        [[data.sourceTableId, data.targetTableId]],
      )
    ).rows;
    ensure(
      sessions.some((session) => session.table_id === data.sourceTableId),
      "TABLE_EMPTY",
      "There are no guests to move from this table.",
      409,
    );
    ensure(
      isManager(actor) ||
        sessions.every(
          (session) => session.owner_employee_id === actor.employeeId,
        ),
      "TABLE_NOT_ASSIGNED",
      "Only a manager can exchange tables assigned to another employee.",
      403,
    );
    await assertTableNotReserved(tx, data.targetTableId);
    if (sessions.some((session) => session.table_id === data.targetTableId))
      await assertTableNotReserved(tx, data.sourceTableId);
    const ids = sessions.map((session) => session.id);
    // Temporary unique labels avoid conflicts in the partial unique index while swapping.
    await tx.query(
      "UPDATE table_sessions SET label=id::text WHERE id=ANY($1::uuid[])",
      [ids],
    );
    for (const session of sessions) {
      const destination =
        session.table_id === data.sourceTableId
          ? data.targetTableId
          : data.sourceTableId;
      await tx.query(
        "UPDATE table_sessions SET table_id=$2,label=$3 WHERE id=$1",
        [session.id, destination, session.label],
      );
      await tx.query(
        "UPDATE table_reservations SET table_id=$2 WHERE session_id=$1 AND state='SEATED'",
        [session.id, destination],
      );
      await tx.query(
        "UPDATE records SET data=jsonb_set(data,'{tableId}',to_jsonb($2::text)),version=version+1 WHERE id IN (SELECT id FROM table_reservations WHERE session_id=$1 AND state='SEATED')",
        [session.id, destination],
      );
    }
    await tx.query(
      "UPDATE public_grants SET revoked_at=now() WHERE table_id=ANY($1::uuid[]) AND revoked_at IS NULL",
      [[data.sourceTableId, data.targetTableId]],
    );
    await tx.query(
      "UPDATE pairing_codes SET consumed_at=now() WHERE session_id=ANY($1::uuid[]) AND consumed_at IS NULL",
      [ids],
    );
    await audit(tx, actor, {
      action: "TABLES_EXCHANGED",
      entityType: "TABLE",
      entityId: data.sourceTableId,
      outletId: tables[0].outlet_id,
      tableId: data.sourceTableId,
      oldState: sessions.map(({ id, table_id, label }) => ({
        id,
        table_id,
        label,
      })),
      newState: {
        targetTableId: data.targetTableId,
        sessionIds: ids,
      },
      reason: data.reason,
    });
    return { ok: true };
  });
}

export async function closeTable(
  db: Database,
  actor: Actor,
  key: string,
  input: unknown,
) {
  requirePermission(actor, "sessions");
  const data = z
    .object({
      tableId: z.uuid(),
      reason: z.string().trim().min(3).max(500),
      includeMerged: z.boolean().optional(),
      sessionIds: z.array(z.uuid()).min(1).max(1000).optional(),
    })
    .strict()
    .parse(input);
  return command(db, actor, key, "TABLE_CLOSED", data, async (tx) => {
    const table = await one(
      tx,
      "SELECT * FROM dining_tables WHERE id=$1" +
        (data.includeMerged ? "" : " FOR UPDATE"),
      [data.tableId],
    );
    requireOutlet(actor, table.outlet_id);
    // Lock physical tables before visits, in a stable order. A merged clear is
    // one transaction: an outstanding bill on any member leaves all members open.
    const tables = data.includeMerged
      ? (
          await tx.query<Row & { id: string; label: string }>(
            "SELECT id,label FROM dining_tables WHERE outlet_id=$1 AND retired_at IS NULL ORDER BY id FOR UPDATE",
            [table.outlet_id],
          )
        ).rows
      : [table as Row & { id: string; label: string }];
    const active = (
      await tx.query<
        Row & { id: string; table_id: string; parent_id: string | null }
      >(
        "SELECT * FROM table_sessions WHERE " +
          (data.includeMerged ? "outlet_id" : "table_id") +
          "=$1 AND status<>'CLOSED' ORDER BY id FOR UPDATE",
        [data.includeMerged ? table.outlet_id : table.id],
      )
    ).rows;
    const members =
      diningTableGroups(tables, active).find((group) =>
        group.members.some((member) => member.id === table.id),
      )?.members ?? [];
    const tableIds = members.map((member) => member.id);
    const sessions = active.filter((session) =>
      tableIds.includes(session.table_id),
    );
    ensure(
      sessions.length,
      "TABLE_EMPTY",
      "This table is already closed.",
      409,
    );
    ensure(
      isManager(actor) ||
        sessions.every(
          (session) => session.owner_employee_id === actor.employeeId,
        ),
      "TABLE_NOT_ASSIGNED",
      "This table is assigned to another employee.",
      403,
    );
    const ids = sessions.map((session) => session.id);
    ensure(
      !data.sessionIds ||
        (data.sessionIds.length === ids.length &&
          new Set(data.sessionIds).size === ids.length &&
          data.sessionIds.every((sessionId) => ids.includes(sessionId))),
      "TABLE_VISIT_CHANGED",
      "This table visit or merged group has changed. Refresh before clearing it.",
      409,
    );
    const open = (
      await tx.query(
        "SELECT id FROM orders WHERE session_id=ANY($1::uuid[]) AND status NOT IN ('SETTLED','REJECTED','VOIDED')",
        [ids],
      )
    ).rows;
    ensure(
      !open.length,
      "OUTSTANDING_ORDER",
      "Settle or reject every order before closing this table.",
      409,
    );
    await tx.query(
      "UPDATE table_sessions SET status='CLOSED',closed_at=now() WHERE id=ANY($1::uuid[])",
      [ids],
    );
    await tx.query(
      "UPDATE public_grants SET revoked_at=now() WHERE table_id=ANY($1::uuid[]) AND revoked_at IS NULL",
      [tableIds],
    );
    await tx.query(
      "UPDATE service_requests SET state='CANCELLED' WHERE (session_id=ANY($1::uuid[]) OR (session_id IS NULL AND table_id=ANY($2::uuid[]))) AND state IN ('OPEN','ACCEPTED','ESCALATED')",
      [ids, tableIds],
    );
    await tx.query(
      "UPDATE table_reservations SET state='COMPLETED' WHERE session_id=ANY($1::uuid[]) AND state='SEATED'",
      [ids],
    );
    await audit(tx, actor, {
      action: "TABLE_CLOSED",
      entityType: "TABLE",
      entityId: table.id,
      outletId: table.outlet_id,
      tableId: table.id,
      newState: { sessionIds: ids, tableIds },
      reason: data.reason,
    });
    return { ok: true };
  });
}
