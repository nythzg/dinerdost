import { randomBytes, randomInt } from "node:crypto";
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
import { audit, command, hash, id, num, one, type Row } from "./shared";
import { assertTableNotReserved } from "./reservations";

export async function openSession(
  db: Database,
  actor: Actor,
  key: string,
  input: unknown,
) {
  requirePermission(actor, "sessions");
  const data = z
    .object({
      tableId: z.uuid(),
      guests: z.number().int().min(1).max(100),
      ownerId: z.uuid().optional(),
      reservationId: z.uuid().optional(),
      activationRequestId: z.uuid().optional(),
      label: z
        .string()
        .regex(/^[A-Z0-9]{1,8}$/)
        .default("MAIN"),
    })
    .strict()
    .parse(input);
  return command(db, actor, key, "SESSION_OPENED", data, async (tx) => {
    const table = await one(
      tx,
      "SELECT * FROM dining_tables WHERE id=$1 AND retired_at IS NULL FOR UPDATE",
      [data.tableId],
    );
    requireOutlet(actor, table.outlet_id);
    if (data.activationRequestId) {
      const request = await one(
        tx,
        "SELECT * FROM service_requests WHERE id=$1 AND table_id=$2 AND kind='ACTIVATE_TABLE' AND state IN ('OPEN','ACCEPTED','ESCALATED') FOR UPDATE",
        [data.activationRequestId, table.id],
        "This activation request is no longer pending.",
      );
      ensure(
        data.label === "MAIN",
        "INVALID_ACTIVATION",
        "Activate the main table session.",
      );
      ensure(
        !(
          await tx.query(
            "SELECT id FROM table_sessions WHERE table_id=$1 AND status<>'CLOSED'",
            [table.id],
          )
        ).rows.length,
        "TABLE_OCCUPIED",
        "This table already has active sessions. Resolve its separate bills before activation.",
        409,
      );
      ensure(
        actor.role !== "WAITER" ||
          !request.owner_id ||
          request.owner_id === actor.employeeId,
        "TABLE_NOT_ASSIGNED",
        "This request is assigned to another employee.",
        403,
      );
    }
    await assertTableNotReserved(tx, table.id, data.reservationId);
    if (data.reservationId) {
      const booking = await one(
        tx,
        "SELECT * FROM table_reservations WHERE id=$1 AND table_id=$2 AND state='HELD' AND starts_at<=now()+interval '15 minutes' AND ends_at>now() FOR UPDATE",
        [data.reservationId, table.id],
        "This reservation is not ready for seating.",
      );
      ensure(
        data.guests === booking.guests,
        "RESERVATION_GUESTS",
        "Use the guest count on this reservation.",
      );
      ensure(
        !(
          await tx.query(
            "SELECT id FROM table_sessions WHERE table_id=$1 AND status<>'CLOSED'",
            [table.id],
          )
        ).rows.length,
        "TABLE_OCCUPIED",
        "Close or move the current table guests before seating this reservation.",
        409,
      );
    }
    const ownerId = data.ownerId ?? actor.employeeId;
    ensure(
      isManager(actor) || ownerId === actor.employeeId,
      "FORBIDDEN",
      "Only a manager can assign another session owner.",
      403,
    );
    const owner = await one(
      tx,
      "SELECT * FROM employees WHERE id=$1 AND active=true",
      [ownerId],
    );
    ensure(
      owner.role === "OWNER" || owner.outlet_ids.includes(table.outlet_id),
      "OUTLET_FORBIDDEN",
      "The session owner is not assigned to this outlet.",
      403,
    );
    const sessionId = id();
    await tx.query(
      "INSERT INTO table_sessions(id,restro_id,outlet_id,table_id,owner_employee_id,guests,label) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        sessionId,
        actor.restroId,
        table.outlet_id,
        table.id,
        ownerId,
        data.guests,
        data.label,
      ],
    );
    await audit(tx, actor, {
      action: "SESSION_OPENED",
      entityType: "SESSION",
      entityId: sessionId,
      outletId: table.outlet_id,
      tableId: table.id,
      newState: { guests: data.guests, ownerId, label: data.label },
    });
    if (data.reservationId)
      await tx.query(
        "UPDATE table_reservations SET state='SEATED',session_id=$2 WHERE id=$1",
        [data.reservationId, sessionId],
      );
    if (data.label === "MAIN") {
      const completed = (
        await tx.query<Row>(
          "UPDATE service_requests SET state='COMPLETED',session_id=$2,owner_id=$3,accepted_at=COALESCE(accepted_at,now()),completed_at=now() WHERE table_id=$1 AND kind='ACTIVATE_TABLE' AND state IN ('OPEN','ACCEPTED','ESCALATED') RETURNING id",
          [table.id, sessionId, ownerId],
        )
      ).rows;
      for (const request of completed)
        await audit(tx, actor, {
          action: "SERVICE_COMPLETED",
          entityType: "SERVICE_REQUEST",
          entityId: request.id,
          outletId: table.outlet_id,
          tableId: table.id,
          newState: { kind: "ACTIVATE_TABLE", sessionId },
          reason: "Staff activated the table",
        });
    }
    return { id: sessionId };
  });
}
export async function closeSession(
  db: Database,
  actor: Actor,
  key: string,
  sessionId: string,
  input: unknown,
) {
  requirePermission(actor, "sessions");
  const data = z
    .object({ reason: z.string().trim().min(3).max(500) })
    .strict()
    .parse(input);
  return command(
    db,
    actor,
    key,
    "SESSION_CLOSED",
    { sessionId, ...data },
    async (tx) => {
      const session = await one(
        tx,
        "SELECT * FROM table_sessions WHERE id=$1 FOR UPDATE",
        [sessionId],
      );
      requireOutlet(actor, session.outlet_id);
      ensure(
        isManager(actor) || session.owner_employee_id === actor.employeeId,
        "TABLE_NOT_ASSIGNED",
        "This table is assigned to another employee.",
        403,
      );
      ensure(
        session.status !== "CLOSED",
        "SESSION_CLOSED",
        "The session is already closed.",
        409,
      );
      const open = (
        await tx.query(
          "SELECT id FROM orders WHERE session_id=$1 AND status NOT IN ('SETTLED','REJECTED','VOIDED')",
          [sessionId],
        )
      ).rows;
      ensure(
        !open.length,
        "OUTSTANDING_ORDER",
        "Settle or reject every order before closing this table.",
        409,
      );
      await tx.query(
        "UPDATE table_sessions SET status='CLOSED',closed_at=now() WHERE id=$1",
        [sessionId],
      );
      await tx.query(
        "UPDATE public_grants SET revoked_at=now() WHERE session_id=$1",
        [sessionId],
      );
      await tx.query(
        "UPDATE service_requests SET state='CANCELLED' WHERE session_id=$1 AND state IN ('OPEN','ACCEPTED','ESCALATED')",
        [sessionId],
      );
      await tx.query(
        "UPDATE table_reservations SET state='COMPLETED' WHERE session_id=$1 AND state='SEATED'",
        [sessionId],
      );
      await audit(tx, actor, {
        action: "SESSION_CLOSED",
        entityType: "SESSION",
        entityId: sessionId,
        outletId: session.outlet_id,
        tableId: session.table_id,
        reason: data.reason,
      });
      return { ok: true };
    },
  );
}
export async function pairingCode(
  db: Database,
  actor: Actor,
  key: string,
  sessionId: string,
) {
  requirePermission(actor, "sessions");
  return command(
    db,
    actor,
    key,
    "DEVICE_PAIRING_CREATED",
    { sessionId },
    async (tx) => {
      const session = await one(
        tx,
        "SELECT * FROM table_sessions WHERE id=$1 AND status='OPEN' FOR UPDATE",
        [sessionId],
      );
      requireOutlet(actor, session.outlet_id);
      ensure(
        isManager(actor) || session.owner_employee_id === actor.employeeId,
        "TABLE_NOT_ASSIGNED",
        "This table is not assigned to you.",
        403,
      );
      const code = String(randomInt(100000, 1000000));
      await tx.query(
        "INSERT INTO pairing_codes(id,restro_id,session_id,code_hash,expires_at) VALUES($1,$2,$3,$4,now()+interval '5 minutes')",
        [id(), actor.restroId, sessionId, hash(code)],
      );
      await audit(tx, actor, {
        action: "DEVICE_PAIRING_CREATED",
        entityType: "SESSION",
        entityId: sessionId,
        outletId: session.outlet_id,
        reason: "Staff presence confirmation",
      });
      return { code, expiresIn: 300 };
    },
  );
}
export async function sessionMerge(
  db: Database,
  actor: Actor,
  key: string,
  input: unknown,
) {
  requirePermission(actor, "sessions");
  const data = z
    .object({
      parentId: z.uuid(),
      childId: z.uuid(),
      reason: z.string().trim().min(5).max(500),
    })
    .strict()
    .parse(input);
  return command(db, actor, key, "SESSION_MERGED", data, async (tx) => {
    ensure(
      data.parentId !== data.childId,
      "INVALID_MERGE",
      "Choose two different sessions.",
    );
    const sessions = (
      await tx.query<Row>(
        "SELECT * FROM table_sessions WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
        [[data.parentId, data.childId]],
      )
    ).rows;
    ensure(
      sessions.length === 2,
      "NOT_FOUND",
      "A selected session is unavailable.",
      404,
    );
    const parent = sessions.find((s) => s.id === data.parentId)!,
      child = sessions.find((s) => s.id === data.childId)!;
    requireOutlet(actor, parent.outlet_id);
    ensure(
      parent.outlet_id === child.outlet_id &&
        parent.table_id !== child.table_id &&
        parent.status === "OPEN" &&
        child.status === "OPEN",
      "INVALID_MERGE",
      "Merge only open sessions at the same outlet.",
    );
    ensure(
      !parent.parent_id && !child.parent_id,
      "MERGE_CHAIN_BLOCKED",
      "A session already belongs to a merged group.",
      409,
    );
    ensure(
      !(
        await tx.query(
          "SELECT id FROM table_sessions WHERE parent_id=$1 AND status<>'CLOSED'",
          [child.id],
        )
      ).rows.length,
      "MERGE_CHAIN_BLOCKED",
      "Demerge this table's existing group before merging it into another table.",
      409,
    );
    ensure(
      isManager(actor) ||
        (parent.owner_employee_id === actor.employeeId &&
          child.owner_employee_id === actor.employeeId),
      "FORBIDDEN",
      "Both tables must be assigned to you.",
      403,
    );
    await tx.query("UPDATE table_sessions SET parent_id=$2 WHERE id=$1", [
      child.id,
      parent.id,
    ]);
    await audit(tx, actor, {
      action: "SESSION_MERGED",
      entityType: "SESSION",
      entityId: child.id,
      outletId: parent.outlet_id,
      oldState: { parentId: null },
      newState: { parentId: parent.id },
      reason: data.reason,
    });
    return { ok: true };
  });
}

export async function sessionDemerge(
  db: Database,
  actor: Actor,
  key: string,
  input: unknown,
) {
  requirePermission(actor, "sessions");
  const data = z
    .object({
      parentId: z.uuid(),
      childId: z.uuid(),
      reason: z.string().trim().min(5).max(500),
      all: z.boolean().optional(),
      sessionIds: z.array(z.uuid()).min(2).max(1000).optional(),
    })
    .strict()
    .parse(input);
  return command(db, actor, key, "SESSION_DEMERGED", data, async (tx) => {
    let sessions = (
      await tx.query<Row>(
        data.all
          ? "SELECT * FROM table_sessions WHERE outlet_id=(SELECT outlet_id FROM table_sessions WHERE id=$1) AND status<>'CLOSED' ORDER BY id FOR UPDATE"
          : "SELECT * FROM table_sessions WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
        data.all ? [data.parentId] : [[data.parentId, data.childId]],
      )
    ).rows;
    if (data.all) {
      const parent = sessions.find((s) => s.id === data.parentId);
      ensure(
        parent,
        "NOT_FOUND",
        "This merged table is no longer available.",
        404,
      );
      requireOutlet(actor, parent.outlet_id);
      const tables = [
        ...new Set(sessions.map((s) => s.table_id as string)),
      ].map((id) => ({ id, label: id }));
      const group = diningTableGroups(
        tables,
        sessions as (Row & { id: string; table_id: string })[],
      ).find((g) => g.members.some((t) => t.id === parent.table_id))!;
      sessions = sessions.filter((s) =>
        group.members.some((t) => t.id === s.table_id),
      );
      ensure(
        data.sessionIds &&
          new Set(data.sessionIds).size === sessions.length &&
          data.sessionIds.length === sessions.length &&
          sessions.every((s) => data.sessionIds!.includes(s.id)),
        "MERGE_CHANGED",
        "This table group has changed. Refresh and select the merged table again.",
        409,
      );
    }
    ensure(
      sessions.some((s) => s.id === data.parentId) &&
        sessions.some((s) => s.id === data.childId),
      "NOT_FOUND",
      "A selected table session is unavailable.",
      404,
    );
    const parent = sessions.find((s) => s.id === data.parentId)!,
      child = sessions.find((s) => s.id === data.childId)!;
    requireOutlet(actor, parent.outlet_id);
    requireOutlet(actor, child.outlet_id);
    ensure(
      parent.outlet_id === child.outlet_id &&
        child.status === "OPEN" &&
        child.parent_id === parent.id,
      "MERGE_CHANGED",
      "This table group has changed. Refresh and select the merged table again.",
      409,
    );
    ensure(
      isManager(actor) ||
        sessions.every((s) => s.owner_employee_id === actor.employeeId),
      "TABLE_NOT_ASSIGNED",
      "Both tables must be assigned to you.",
      403,
    );
    if (data.all) {
      await tx.query(
        "UPDATE table_sessions SET parent_id=NULL,last_activity_at=now() WHERE id=ANY($1::uuid[])",
        [sessions.map((s) => s.id)],
      );
      for (const linked of sessions.filter((s) => s.parent_id))
        await audit(tx, actor, {
          action: "SESSION_DEMERGED",
          entityType: "SESSION",
          entityId: linked.id,
          outletId: linked.outlet_id,
          tableId: linked.table_id,
          oldState: { parentId: linked.parent_id },
          newState: { parentId: null },
          reason: data.reason,
        });
      return { ok: true };
    }
    // Only unlink the group. Each visit keeps its table, QR, orders and money.
    await tx.query(
      "UPDATE table_sessions SET parent_id=NULL,last_activity_at=now() WHERE id=$1",
      [child.id],
    );
    await tx.query(
      "UPDATE table_sessions SET last_activity_at=now() WHERE id=$1 AND status='OPEN'",
      [parent.id],
    );
    await audit(tx, actor, {
      action: "SESSION_DEMERGED",
      entityType: "SESSION",
      entityId: child.id,
      outletId: child.outlet_id,
      tableId: child.table_id,
      oldState: { parentId: parent.id },
      newState: { parentId: null },
      reason: data.reason,
    });
    return { ok: true };
  });
}
