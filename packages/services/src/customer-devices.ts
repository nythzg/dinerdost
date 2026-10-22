import { z } from "zod";
import type { Database, Sql } from "@dinerdost/database";
import { ensure, requirePermission, type Actor } from "@dinerdost/core";
import { audit, command, expectedVersion, one, scopedOrder } from "./shared";

export async function assertCustomerDeviceAllowed(
  tx: Sql,
  restroId: string,
  outletId: string,
  deviceHash: string,
) {
  const blocked = await tx.query(
    "SELECT banned_until FROM customer_devices WHERE restro_id=$1 AND outlet_id=$2 AND device_hash=$3 AND banned_until>now()",
    [restroId, outletId, deviceHash],
  );
  ensure(
    !blocked.rows.length,
    "DEVICE_TEMPORARILY_BANNED",
    "This browser is temporarily blocked at this outlet. Please speak to a staff member.",
    403,
  );
}

// All guest writes and staff bans lock this row before any table/session rows.
export async function lockCustomerDevice(
  tx: Sql,
  restroId: string,
  outletId: string,
  deviceHash: string,
) {
  await tx.query(
    "INSERT INTO customer_devices(restro_id,outlet_id,device_hash) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
    [restroId, outletId, deviceHash],
  );
  return one(
    tx,
    "SELECT * FROM customer_devices WHERE restro_id=$1 AND outlet_id=$2 AND device_hash=$3 FOR UPDATE",
    [restroId, outletId, deviceHash],
  );
}

export async function setCustomerDeviceBan(
  db: Database,
  actor: Actor,
  key: string,
  orderId: string,
  input: unknown,
) {
  requirePermission(actor, "security");
  const data = z
    .object({
      mode: z.enum(["BAN", "LIFT"]),
      minutes: z.coerce
        .number()
        .refine((n) => [15, 60, 240, 1440].includes(n))
        .optional(),
      reason: z.string().trim().min(3).max(250),
      version: z.number().int(),
    })
    .strict()
    .parse(input);
  return command(
    db,
    actor,
    key,
    "CUSTOMER_DEVICE_ACCESS_CHANGED",
    { orderId, ...data },
    async (tx) => {
      const order = await scopedOrder(tx, actor, orderId);
      ensure(
        ["CUSTOMER_QR", "D2C"].includes(order.source),
        "NO_CUSTOMER_DEVICE",
        "This order was not placed by a customer browser.",
      );
      const link = await one(
        tx,
        "SELECT * FROM customer_order_devices WHERE order_id=$1 AND outlet_id=$2",
        [orderId, order.outlet_id],
        "No customer browser is linked to this order.",
      );
      await one(tx, "SELECT id FROM outlets WHERE id=$1 FOR SHARE", [
        order.outlet_id,
      ]);
      const before = await lockCustomerDevice(
        tx,
        actor.restroId,
        order.outlet_id,
        link.device_hash,
      );
      expectedVersion(before.version, data.version);
      const changed = await one(
        tx,
        "UPDATE customer_devices SET banned_until=CASE WHEN $4 THEN now()+($5*interval '1 minute') ELSE NULL END,ban_reason=$6,banned_by=$7,banned_from_order_id=$8,version=version+1 WHERE restro_id=$1 AND outlet_id=$2 AND device_hash=$3 RETURNING banned_until,ban_reason,version",
        [
          actor.restroId,
          order.outlet_id,
          link.device_hash,
          data.mode === "BAN",
          data.minutes ?? 60,
          data.reason,
          actor.employeeId,
          orderId,
        ],
      );
      await audit(tx, actor, {
        action:
          data.mode === "BAN"
            ? "CUSTOMER_DEVICE_BANNED"
            : "CUSTOMER_DEVICE_BAN_LIFTED",
        entityType: "ORDER",
        entityId: orderId,
        outletId: order.outlet_id,
        oldState: { bannedUntil: before.banned_until, version: before.version },
        newState: {
          bannedUntil: changed.banned_until,
          version: changed.version,
        },
        reason: data.reason,
      });
      return { ok: true };
    },
  );
}
