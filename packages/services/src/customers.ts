import { z } from "zod";
import type { Database, Sql } from "@dinerdost/database";
import {
  customerName,
  maskPhone,
  ensure,
  isManager,
  normalizePhone,
  requireOutlet,
  requirePermission,
  can,
  type Actor,
} from "@dinerdost/core";
import { audit, command, expectedVersion, num, one, type Row } from "./shared";

async function scopedCustomer(
  tx: Sql,
  actor: Actor,
  customerId: string,
  outletId: string,
  lock = false,
) {
  requireOutlet(actor, outletId);
  return one(
    tx,
    `SELECT c.* FROM customers c WHERE c.id=$1 AND EXISTS(SELECT 1 FROM orders o WHERE o.customer_id=c.id AND o.outlet_id=$2)${lock ? " FOR UPDATE" : ""}`,
    [customerId, outletId],
    "Customer unavailable in this outlet.",
  );
}
export async function searchCustomers(
  db: Database,
  actor: Actor,
  input: unknown,
) {
  if (!can(actor, "sessions")) requirePermission(actor, "customers");
  const data = z
    .object({ outletId: z.uuid(), query: z.string().trim().min(2).max(120) })
    .strict()
    .parse(input);
  requireOutlet(actor, data.outletId);
  const digits = data.query.replace(/\D/g, "");
  const numeric = /^[+\d\s()-]+$/.test(data.query);
  const query = numeric
    ? (data.query.startsWith("+91") || digits.length > 10) &&
      digits.startsWith("91")
      ? digits.slice(2)
      : digits
    : data.query;
  if (query.length < (numeric ? 3 : 2)) return { items: [] };
  const prefix = query.replace(/[\\%_]/g, "\\$&") + "%";
  return db.transaction(actor.restroId, async (tx) => ({
    items: (
      await tx.query(
        `SELECT c.id,c.name,c.phone FROM customers c
    WHERE (EXISTS(SELECT 1 FROM orders o WHERE o.customer_id=c.id AND o.outlet_id=$1) OR EXISTS(SELECT 1 FROM records r WHERE r.kind='reservations' AND r.outlet_id=$1 AND (r.data->>'customerId'=c.id::text OR right(r.data->>'phone',10)=right(c.phone,10))))
    AND (${numeric ? "right(c.phone,10) LIKE $2" : "c.name ILIKE $2"}) ORDER BY c.name,c.id LIMIT 8`,
        [data.outletId, prefix],
      )
    ).rows,
  }));
}
export async function customerProfile(
  db: Database,
  actor: Actor,
  customerId: string,
  outletId: string,
) {
  requirePermission(actor, "customers");
  z.uuid().parse(customerId);
  z.uuid().parse(outletId);
  return db.transaction(actor.restroId, async (tx) => {
    const customer = await scopedCustomer(tx, actor, customerId, outletId);
    const points = await one(
      tx,
      `SELECT coalesce((SELECT sum(points) FROM loyalty_ledger WHERE customer_id=$1 AND state<>'PENDING_EARN'),0) AS balance,
      coalesce((SELECT sum(points) FROM loyalty_reservations WHERE customer_id=$1 AND state IN ('RESERVED','LOCKED') AND (reserved_until IS NULL OR reserved_until>now())),0) AS reserved`,
      [customerId],
    );
    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      version: customer.version,
      otp_verified: customer.otp_verified,
      marketing_consent: customer.marketing_consent,
      created_at: customer.created_at,
      points: num(points.balance),
      availablePoints: Math.max(0, num(points.balance) - num(points.reserved)),
      canEdit: isManager(actor),
    };
  });
}
export async function updateCustomerProfile(
  db: Database,
  actor: Actor,
  key: string,
  input: unknown,
) {
  requirePermission(actor, "customers");
  ensure(
    isManager(actor),
    "FORBIDDEN",
    "Only the owner or manager can edit customer contact details.",
    403,
  );
  const data = z
    .object({
      customerId: z.uuid(),
      outletId: z.uuid(),
      version: z.number().int().positive(),
      name: z.string().min(2).max(120),
      phone: z.string().max(25),
    })
    .strict()
    .parse(input);
  const name = customerName(data.name),
    phone = normalizePhone(data.phone);
  return command(
    db,
    actor,
    key,
    "CUSTOMER_PROFILE_UPDATED",
    { ...data, name, phone },
    async (tx) => {
      const before = await scopedCustomer(
        tx,
        actor,
        data.customerId,
        data.outletId,
        true,
      );
      expectedVersion(before.version, data.version);
      ensure(
        !(
          await tx.query("SELECT id FROM customers WHERE phone=$1 AND id<>$2", [
            phone,
            before.id,
          ])
        ).rows.length,
        "CUSTOMER_PHONE_IN_USE",
        "This phone number belongs to another customer account.",
        409,
      );
      await tx.query(
        "UPDATE customers SET name=$2,phone=$3,otp_verified=CASE WHEN phone=$3 THEN otp_verified ELSE false END,version=version+1 WHERE id=$1",
        [before.id, name, phone],
      );
      await audit(tx, actor, {
        action: "CUSTOMER_PROFILE_UPDATED",
        entityType: "CUSTOMER",
        entityId: before.id,
        outletId: data.outletId,
        oldState: { name: before.name, phone: before.phone },
        newState: { name, phone, pointsAccountId: before.id },
        reason: "Management corrected customer contact details",
        risk: "WARNING",
      });
      return { id: before.id, name, phone, version: num(before.version) + 1 };
    },
  );
}
export async function listCustomers(
  db: Database,
  actor: Actor,
  input: unknown,
) {
  requirePermission(actor, "customers");
  const data = z
    .object({
      outletId: z.uuid(),
      query: z.string().trim().max(120).default(""),
      page: z.coerce.number().int().min(0).max(100000).default(0),
    })
    .strict()
    .parse(input);
  requireOutlet(actor, data.outletId);
  const digits = data.query.replace(/\D/g, "");
  const phone = /^[+\d\s()-]+$/.test(data.query);
  const term = (phone ? digits : data.query).replace(/[\\%_]/g, "\\$&");
  return db.transaction(actor.restroId, async (tx) => {
    const where = `EXISTS(SELECT 1 FROM orders o WHERE o.customer_id=c.id AND o.outlet_id=$1) AND ($2='' OR ${phone ? "regexp_replace(c.phone,'[^0-9]','','g') LIKE $3" : "c.name ILIKE $3"})`;
    const params = [data.outletId, data.query, "%" + term + "%"];
    const total = num(
      (
        await one(
          tx,
          `SELECT count(*) AS total FROM customers c WHERE ${where}`,
          params,
        )
      ).total,
    );
    const items = (
      await tx.query<Row>(
        `SELECT c.id,c.name,c.phone,c.otp_verified,
      (SELECT count(*) FROM orders o WHERE o.customer_id=c.id AND o.outlet_id=$1 AND o.status='SETTLED') AS visits,
      (SELECT coalesce(sum(r.paid),0) FROM orders o JOIN order_rounds r ON r.order_id=o.id WHERE o.customer_id=c.id AND o.outlet_id=$1 AND o.status='SETTLED' AND r.status NOT IN ('VOIDED','REJECTED')) AS spend,
      (SELECT coalesce(sum(points),0) FROM loyalty_ledger WHERE customer_id=c.id AND state<>'PENDING_EARN') AS points
      FROM customers c WHERE ${where} ORDER BY visits DESC,lower(c.name),c.id LIMIT 50 OFFSET $4`,
        [...params, data.page * 50],
      )
    ).rows;
    return {
      items: items.map((c): Row => ({ ...c, phone: maskPhone(String(c.phone)) })),
      total,
      hasMore: (data.page + 1) * 50 < total,
    };
  });
}
