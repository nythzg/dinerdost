import { createHash, randomUUID } from "node:crypto";
import type { Database, Sql } from "@dinerdost/database";
import {
  DomainError,
  ensure,
  requireOutlet,
  type Actor,
} from "@dinerdost/core";

export type Row = Record<string, any>;
export const id = () => randomUUID();
export const hash = (text: string) =>
  createHash("sha256").update(text).digest("hex");
export const num = (value: unknown) => Number(value ?? 0);
export const json = (value: unknown) => JSON.stringify(value ?? null);
export function canonical(value: any): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return (
    "{" +
    Object.keys(value)
      .sort()
      .filter((k) => value[k] !== undefined)
      .map((k) => JSON.stringify(k) + ":" + canonical(value[k]))
      .join(",") +
    "}"
  );
}
export async function one<T extends Row = Row>(
  tx: Sql,
  sql: string,
  params: unknown[] = [],
  message = "Record not found.",
): Promise<T> {
  const result = await tx.query<T>(sql, params);
  ensure(result.rows[0], "NOT_FOUND", message, 404);
  return result.rows[0];
}
function safeAudit(value: any): any {
  if (Array.isArray(value)) return value.map(safeAudit);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [
        key,
        /password|secret|token|code_hash/i.test(key)
          ? "[redacted]"
          : safeAudit(v),
      ]),
    );
  return value;
}
export interface AuditInput {
  action: string;
  entityType: string;
  entityId: string;
  outletId?: string;
  oldState?: unknown;
  newState?: unknown;
  reason?: string;
  impact?: number;
  risk?: "INFO" | "WARNING" | "CRITICAL";
  tableId?: string;
}
export type AuditActor = Omit<Actor, "role"> & {
  role: Actor["role"] | "CUSTOMER" | "SYSTEM";
};
export async function audit(tx: Sql, actor: AuditActor, input: AuditInput) {
  await tx.query(
    "INSERT INTO audit_heads(restro_id) VALUES($1) ON CONFLICT DO NOTHING",
    [actor.restroId],
  );
  const head = await one(
    tx,
    "SELECT * FROM audit_heads WHERE restro_id=$1 FOR UPDATE",
    [actor.restroId],
  );
  const event = {
    id: id(),
    restroId: actor.restroId,
    outletId: input.outletId ?? null,
    sequence: num(head.sequence) + 1,
    actorId: actor.employeeId,
    actorName: actor.name,
    actorRole: actor.role,
    authMethod: actor.authMethod ?? "PASSWORD",
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    oldState: safeAudit(input.oldState ?? null),
    newState: safeAudit(input.newState ?? null),
    reason: input.reason ?? input.action,
    impact: input.impact ?? 0,
    risk: input.risk ?? "INFO",
    tableId: input.tableId ?? null,
    deviceId: actor.deviceId ?? null,
    ip: actor.ip ?? null,
    occurredAt: new Date().toISOString(),
    previousHash: head.hash,
  };
  const recordHash = hash(canonical(event));
  await tx.query(
    "INSERT INTO audit_events(id,restro_id,outlet_id,sequence,actor_id,actor_name,actor_role,auth_method,action,entity_type,entity_id,old_state,new_state,reason,financial_impact,risk,table_id,device_id,ip,occurred_at,previous_hash,record_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,$15,$16,$17,$18,$19,$20,$21,$22)",
    [
      event.id,
      event.restroId,
      event.outletId,
      event.sequence,
      event.actorId,
      event.actorName,
      event.actorRole,
      event.authMethod,
      event.action,
      event.entityType,
      event.entityId,
      json(event.oldState),
      json(event.newState),
      event.reason,
      event.impact,
      event.risk,
      event.tableId,
      event.deviceId,
      event.ip,
      event.occurredAt,
      event.previousHash,
      recordHash,
    ],
  );
  await tx.query(
    "UPDATE audit_heads SET sequence=$2,hash=$3 WHERE restro_id=$1",
    [actor.restroId, event.sequence, recordHash],
  );
  await tx.query(
    "INSERT INTO outbox(id,restro_id,topic,payload) VALUES($1,$2,$3,$4::jsonb)",
    [
      id(),
      actor.restroId,
      "audit.recorded",
      json({ eventId: event.id, action: input.action, risk: event.risk }),
    ],
  );
  if (event.risk === "CRITICAL")
    await tx.query(
      "INSERT INTO notifications(id,restro_id,outlet_id,event,state,payload) VALUES($1,$2,$3,$4,'NOT_CONFIGURED',$5::jsonb)",
      [
        id(),
        actor.restroId,
        input.outletId ?? null,
        "OWNER_RED_FLAG",
        json({ eventId: event.id, action: input.action, reason: event.reason }),
      ],
    );
  return event.id;
}
export async function command<T>(
  db: Database,
  actor: Pick<AuditActor, "restroId" | "employeeId" | "role" | "outletIds">,
  key: string,
  action: string,
  input: unknown,
  callback: (tx: Sql) => Promise<T>,
): Promise<T> {
  ensure(
    typeof key === "string" && /^[\w-]{16,128}$/.test(key),
    "IDEMPOTENCY_REQUIRED",
    "An idempotency key is required.",
  );
  const fingerprint = hash(
    canonical({
      action,
      input,
      authorization: {
        role: actor.role,
        outletIds: [...actor.outletIds].sort(),
        ...("application" in actor && actor.application && actor.application !== "MASTER" ? { application: actor.application } : {}),
      },
    }),
  );
  return db.transaction(actor.restroId, async (tx) => {
    await tx.query(
      "INSERT INTO idempotency_keys(restro_id,key,actor_id,fingerprint) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
      [actor.restroId, key, actor.employeeId, fingerprint],
    );
    const existing = await one(
      tx,
      "SELECT * FROM idempotency_keys WHERE restro_id=$1 AND key=$2 FOR UPDATE",
      [actor.restroId, key],
    );
    ensure(
      existing.actor_id === actor.employeeId &&
        existing.fingerprint === fingerprint,
      "IDEMPOTENCY_CONFLICT",
      "This request key was already used for a different action.",
      409,
    );
    if (existing.response !== null) return existing.response as T;
    const result = await callback(tx);
    await tx.query(
      "UPDATE idempotency_keys SET response=$3::jsonb WHERE restro_id=$1 AND key=$2",
      [actor.restroId, key, json(result)],
    );
    return result;
  });
}
export async function scopedOrder(
  tx: Sql,
  actor: Actor,
  orderId: string,
  lock = false,
) {
  if (lock) {
    const context = await one(
      tx,
      "SELECT outlet_id,session_id FROM orders WHERE id=$1",
      [orderId],
    );
    requireOutlet(actor, context.outlet_id);
    // Business-activity triggers update the session; lock it before its order,
    // matching customer submissions and avoiding inverse session/order locks.
    await one(tx, "SELECT id FROM outlets WHERE id=$1 FOR SHARE", [
      context.outlet_id,
    ]);
    if (context.session_id)
      await one(tx, "SELECT id FROM table_sessions WHERE id=$1 FOR UPDATE", [
        context.session_id,
      ]);
  }
  const order = await one(
    tx,
    `SELECT * FROM orders WHERE id=$1${lock ? " FOR UPDATE" : ""}`,
    [orderId],
  );
  requireOutlet(actor, order.outlet_id);
  if (actor.role === "WAITER") {
    ensure(
      order.session_id,
      "SESSION_REQUIRED",
      "Waiter orders require an assigned table.",
      403,
    );
    const session = await one(tx, "SELECT * FROM table_sessions WHERE id=$1", [
      order.session_id,
    ]);
    ensure(
      session.owner_employee_id === actor.employeeId,
      "TABLE_NOT_ASSIGNED",
      "This table is not assigned to you.",
      403,
    );
  }
  return order;
}
export function expectedVersion(actual: unknown, expected: number) {
  ensure(
    num(actual) === expected,
    "VERSION_CONFLICT",
    "This record changed. Refresh before trying again.",
    409,
  );
}
export async function rateLimit(
  db: Database,
  key: string,
  limit = 10,
  seconds = 60,
) {
  const result = await db.query(
    "INSERT INTO rate_limits(key,attempts,reset_at) VALUES($1,1,now()+$2::integer*interval '1 second') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN rate_limits.reset_at<now() THEN 1 ELSE rate_limits.attempts+1 END,reset_at=CASE WHEN rate_limits.reset_at<now() THEN now()+$2::integer*interval '1 second' ELSE rate_limits.reset_at END RETURNING attempts",
    [hash(key), seconds],
  );
  ensure(
    num(result.rows[0].attempts) <= limit,
    "RATE_LIMITED",
    "Too many attempts. Please try again shortly.",
    429,
  );
}
export function translateError(error: unknown): DomainError {
  if (error instanceof DomainError) return error;
  const issue = error as { code?: string; message?: string };
  if (issue.code === "23505")
    return new DomainError(
      "DUPLICATE_RECORD",
      "This record or reference already exists.",
      409,
    );
  if (issue.code === "42501")
    return new DomainError("FORBIDDEN", "This action is not allowed.", 403);
  if (issue.code === "23503")
    return new DomainError(
      "INVALID_REFERENCE",
      "A related record is unavailable.",
      422,
    );
  if (issue.message?.startsWith("DATABASE_NOT_CONFIGURED"))
    return new DomainError(
      "DATABASE_NOT_CONFIGURED",
      "The production database is not configured.",
      503,
    );
  return new DomainError(
    "SERVER_ERROR",
    "The request could not be completed. Refresh and check its status before retrying.",
    500,
  );
}
