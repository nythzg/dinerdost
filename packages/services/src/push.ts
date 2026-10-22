import { z } from "zod";
import type { Database, Sql } from "@dinerdost/database";
import { applicationRoles, ensure, requireOutlet, type Actor, type Application } from "@dinerdost/core";
import { hash, id, num, one, rateLimit, type Row } from "./shared";
import { notificationDelta, visibleNotification } from "./inbox";

const registration = z.object({ outletId: z.uuid(), fid: z.string().regex(/^[A-Za-z0-9_-]{22}$/), previousBindingId: z.uuid().optional() }).strict();
export async function registerPushDevice(db: Database, actor: Actor, input: unknown) {
  const data = registration.parse(input);
  requireOutlet(actor, data.outletId);
  ensure(actor.sessionHash, "UNAUTHENTICATED", "Sign in again to enable background alerts.", 401);
  await rateLimit(db, `push:${actor.employeeId}`, 30, 3600);
  // A FID is not an authentication credential. Only a generic sync hint is sent to it;
  // the receiver must authenticate again before obtaining any business information.
  return db.transaction(null, async tx => {
    const session = await one(tx, "SELECT * FROM auth_sessions WHERE token_hash=$1 AND employee_id=$2 AND expires_at>now()", [actor.sessionHash, actor.employeeId]);
    ensure(session.application === (actor.application ?? "MASTER"), "UNAUTHENTICATED", "Sign in again.", 401);
    const old = (await tx.query<Row>("SELECT * FROM push_devices WHERE fid_hash=$1 FOR UPDATE", [hash(data.fid)])).rows[0];
    if (old && old.employee_id !== actor.employeeId && old.enabled) {
      const active = (await tx.query("SELECT 1 FROM auth_sessions WHERE token_hash=$1 AND expires_at>now()", [old.session_hash])).rows.length;
      ensure(!active || old.binding_id === data.previousBindingId, "PUSH_DEVICE_BOUND", "Sign out the previous account on this device first.", 409);
    }
    const same = old?.session_hash === actor.sessionHash && old?.outlet_id === data.outletId && old?.enabled;
    const bindingId = same ? old.binding_id : id();
    const latest = await one(tx, "SELECT coalesce(max(sequence),0) AS latest FROM audit_events WHERE restro_id=$1", [actor.restroId]);
    await tx.query(`INSERT INTO push_devices(id,restro_id,employee_id,session_hash,application,outlet_id,fid,fid_hash,binding_id,cursor)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(fid_hash) DO UPDATE SET restro_id=excluded.restro_id,employee_id=excluded.employee_id,
      session_hash=excluded.session_hash,application=excluded.application,outlet_id=excluded.outlet_id,fid=excluded.fid,binding_id=excluded.binding_id,
      cursor=CASE WHEN push_devices.binding_id=excluded.binding_id THEN push_devices.cursor ELSE excluded.cursor END,enabled=true,updated_at=now()`,
      [old?.id ?? id(), actor.restroId, actor.employeeId, actor.sessionHash, actor.application ?? "MASTER", data.outletId, data.fid, hash(data.fid), bindingId, num(latest.latest)]);
    return { bindingId, status: "REGISTERED" };
  });
}
export async function unregisterPushDevice(db: Database, actor: Actor, input: unknown) {
  const data = z.object({ bindingId: z.uuid() }).strict().parse(input);
  await db.transaction(actor.restroId, async tx => {
    await tx.query("UPDATE push_devices SET enabled=false,updated_at=now() WHERE binding_id=$1 AND employee_id=$2 AND session_hash=$3", [data.bindingId, actor.employeeId, actor.sessionHash ?? ""]);
  });
  return { ok: true };
}
async function deviceActor(tx: Sql, device: Row): Promise<Actor | null> {
  const row = (await tx.query<Row>(`SELECT e.*,s.user_id FROM employees e JOIN auth_sessions s ON s.employee_id=e.id JOIN users u ON u.id=s.user_id
    WHERE e.id=$1 AND e.restro_id=$2 AND e.active AND NOT u.disabled AND s.token_hash=$3 AND s.application=$4 AND s.expires_at>now()`,
    [device.employee_id, device.restro_id, device.session_hash, device.application])).rows[0];
  if (!row || !applicationRoles[device.application as Application].includes(row.role) || (row.role !== "OWNER" && !row.outlet_ids.includes(device.outlet_id))) return null;
  return { employeeId: row.id, restroId: row.restro_id, userId: row.user_id, role: row.role, name: row.name, outletIds: row.outlet_ids, application: device.application };
}
export async function pushEvent(db: Database, actor: Actor, input: unknown) {
  const data = z.object({ bindingId: z.uuid(), eventId: z.uuid() }).strict().parse(input);
  return db.transaction(actor.restroId, async tx => {
    const device = (await tx.query<Row>("SELECT * FROM push_devices WHERE binding_id=$1 AND employee_id=$2 AND session_hash=$3 AND enabled", [data.bindingId, actor.employeeId, actor.sessionHash ?? ""])).rows[0];
    ensure(device, "PUSH_BINDING_CHANGED", "Background alert registration changed.", 403);
    return { event: await visibleNotification(tx, actor, device.outlet_id, data.eventId) ?? null };
  });
}
export type PushHint = { fid: string; application: Application; bindingId: string; eventId: string };
export type PushOutcome = { status: "SENT" | "RETRY" | "INVALID" | "FAILED"; code?: string; retrySeconds?: number };
export type PushSender = (hint: PushHint) => Promise<PushOutcome>;

/** Durable, lease-based worker. Network delivery never occurs inside a database transaction. */
export async function dispatchPush(db: Database, send: PushSender, limit = 50) {
  ensure(Number.isInteger(limit) && limit > 0 && limit <= 100, "INVALID_LIMIT", "Invalid dispatch limit.");
  const devices = (await db.query<Row>("SELECT * FROM push_devices WHERE enabled ORDER BY updated_at,id LIMIT $1", [limit])).rows;
  for (const device of devices) {
    await db.transaction(null, async tx => {
      const current = await one(tx, "SELECT * FROM push_devices WHERE id=$1 FOR UPDATE", [device.id]);
      const actor = current.enabled ? await deviceActor(tx, current) : null;
      if (!actor) { await tx.query("UPDATE push_devices SET enabled=false,updated_at=now() WHERE id=$1", [current.id]); return; }
      const events = await notificationDelta(tx, actor, current.outlet_id, num(current.cursor));
      for (const event of events) await tx.query(`INSERT INTO push_deliveries(id,restro_id,device_id,binding_id,event_id,outlet_id)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`, [id(), actor.restroId, current.id, current.binding_id, event.id, current.outlet_id]);
      // A full page retains its last visible cursor so a later run can continue without dropping events.
      const cursor = events.length === 100 ? events.at(-1)!.sequence : num((await one(tx, "SELECT coalesce(max(sequence),0) AS latest FROM audit_events WHERE restro_id=$1", [actor.restroId])).latest);
      await tx.query("UPDATE push_devices SET cursor=$2,updated_at=now() WHERE id=$1", [current.id, cursor]);
    });
  }
  const work = await db.transaction(null, async tx => {
    const lease = id();
    const rows = (await tx.query<Row>(`SELECT * FROM push_deliveries WHERE (state='PENDING' AND available_at<=now()) OR (state='SENDING' AND lease_until<now())
      ORDER BY available_at,id LIMIT $1 FOR UPDATE SKIP LOCKED`, [limit])).rows;
    for (const row of rows) await tx.query("UPDATE push_deliveries SET state='SENDING',lease_id=$2,lease_until=now()+interval '60 seconds',attempts=attempts+1 WHERE id=$1", [row.id, lease]);
    return rows.map<Row & { lease: string; attempts: number }>(row => ({ ...row, lease, attempts: num(row.attempts) + 1 }));
  });
  let sent = 0, cancelled = 0;
  for (const row of work) {
    const hint = await db.transaction(null, async tx => {
      const device = (await tx.query<Row>("SELECT * FROM push_devices WHERE id=$1 AND binding_id=$2 AND enabled", [row.device_id, row.binding_id])).rows[0];
      const actor = device ? await deviceActor(tx, device) : null;
      if (!actor || !await visibleNotification(tx, actor, device!.outlet_id, row.event_id)) return null;
      return { fid: device!.fid, application: device!.application, bindingId: device!.binding_id, eventId: row.event_id } as PushHint;
    });
    let result: PushOutcome = { status: "FAILED", code: "TRANSPORT_ERROR" };
    if (hint) { try { result = await send(hint); } catch { result = { status: "RETRY", code: "TRANSPORT_ERROR" }; } }
    const state = !hint ? "CANCELLED" : result.status === "SENT" ? "SENT" : result.status === "RETRY" && row.attempts < 8 ? "PENDING" : "FAILED";
    const delay = Math.min(3600, Math.max(5, result.retrySeconds ?? 5 * 2 ** Math.min(row.attempts, 10)));
    await db.query(`UPDATE push_deliveries SET state=$3,last_error=$4,available_at=now()+$5*interval '1 second',lease_until=null,
      sent_at=CASE WHEN $3='SENT' THEN now() ELSE sent_at END WHERE id=$1 AND lease_id=$2`, [row.id, row.lease, state, result.code?.slice(0, 80) ?? null, delay]);
    if (result.status === "INVALID" && hint) await db.query("UPDATE push_devices SET enabled=false,updated_at=now() WHERE id=$1 AND binding_id=$2", [row.device_id, row.binding_id]);
    if (state === "SENT") sent++;
    if (state === "CANCELLED") cancelled++;
  }
  return { processed: work.length, sent, cancelled };
}
