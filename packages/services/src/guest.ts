import {snapshotWebBillDefaults} from './web-bill-policy';
import { randomBytes } from "node:crypto";
import { z } from "zod";
import {snapshotWebKitchenPolicy} from "./kitchen-policy";
import { publicMenu } from "./public-menu";
import type { Database, Sql } from "@dinerdost/database";
import { customerName, ensure, normalizePhone, quote } from "@dinerdost/core";
import {
  audit,
  command,
  expectedVersion,
  hash,
  id,
  json,
  num,
  one,
  rateLimit,
  type AuditActor,
  type Row,
} from "./shared";
import { buildItems, insertItems, roundInput } from "./orders";
import { bindCustomer } from "./customer-identity";
import {
  assertCustomerDeviceAllowed,
  lockCustomerDevice,
} from "./customer-devices";
import { expireIdleTables } from "./table-activity";
import { ownDeviceIdentities } from "./public-identities";

export async function limitGuestRequest(
  db: Database,
  key: string,
  device: string,
) {
  await rateLimit(db, "guest-write:" + key + ":" + device, 20, 300);
}

async function tableLink(db: Database, key: string) {
  ensure(
    /^[a-f0-9]{40}$/.test(key),
    "NOT_FOUND",
    "This table link is unavailable.",
    404,
  );
  return one(
    db,
    "SELECT t.id,t.restro_id,t.outlet_id,t.label,t.public_key,o.name AS outlet_name,o.qr_enabled,o.qr_auto_activate,r.name AS restaurant_name FROM dining_tables t JOIN outlets o ON o.id=t.outlet_id AND o.restro_id=t.restro_id JOIN restaurants r ON r.id=t.restro_id WHERE t.public_key=$1 AND t.retired_at IS NULL",
    [key],
    "This table link is unavailable.",
  );
}
async function grantContext(
  db: Database,
  key: string,
  token: string | undefined,
  device: string | undefined,
) {
  ensure(
    token && device,
    "TABLE_ACCESS_REQUIRED",
    "Refresh the menu to reconnect to your table.",
    401,
  );
  const grant = await one(
    db,
    "SELECT g.*,s.owner_employee_id,s.status,t.public_key,o.qr_enabled FROM public_grants g JOIN dining_tables t ON t.id=g.table_id AND t.restro_id=g.restro_id JOIN outlets o ON o.id=g.outlet_id AND o.restro_id=g.restro_id LEFT JOIN table_sessions s ON s.id=g.session_id AND s.restro_id=g.restro_id WHERE g.token_hash=$1 AND g.device_hash=$2 AND g.revoked_at IS NULL AND g.expires_at>now() AND (g.session_id IS NULL OR s.status='OPEN') AND t.public_key=$3 AND t.retired_at IS NULL",
    [hash(token), hash(device), key],
    "Your table visit has ended. Refresh the menu to start a new visit.",
  );
  ensure(
    grant.qr_enabled,
    "QR_DISABLED",
    "QR ordering is paused. Please order with a staff member.",
    403,
  );
  await assertCustomerDeviceAllowed(
    db,
    grant.restro_id,
    grant.outlet_id,
    grant.device_hash,
  );
  return grant;
}
async function guestOrder(
  tx: Sql,
  orderId: string,
): Promise<Row & { rounds: Row[] }> {
  const order = await one(
    tx,
    "SELECT id,number,status,version,tax_bps_override,tax_components,customer_snapshot,created_at FROM orders WHERE id=$1",
    [orderId],
  );
  const rounds = (
    await tx.query<Row>(
      "SELECT id,round_number,status,kot_status,payment_status,subtotal,discount,tax,charges,charges_total,payable,paid,rejection_reason FROM order_rounds WHERE order_id=$1 ORDER BY round_number",
      [orderId],
    )
  ).rows;
  for (const round of rounds)
    round.items = (
      await tx.query(
        "SELECT name,quantity_milli,variant,note FROM order_items WHERE round_id=$1",
        [round.id],
      )
    ).rows;
  return {
    ...order,
    customer_snapshot: order.customer_snapshot
      ? { name: order.customer_snapshot.name }
      : null,
    rounds,
  };
}
function guestActor(grant: Row): AuditActor {
  return {
    restroId: grant.restro_id,
    userId: "guest",
    employeeId: "guest:" + grant.token_hash.slice(0, 16),
    name: "Table guest",
    role: "CUSTOMER",
    outletIds: [grant.outlet_id],
    authMethod: "TABLE_QR",
    deviceId: grant.device_hash.slice(0, 16),
  };
}
export async function guestCatalog(
  db: Database,
  key: string,
  token?: string,
  device?: string,
  webFlow = false,
) {
  const table = await tableLink(db, key);
  if (device)
    await assertCustomerDeviceAllowed(
      db,
      table.restro_id,
      table.outlet_id,
      hash(device),
    );
  ensure(
    table.qr_enabled,
    "QR_DISABLED",
    "QR ordering is paused. Please order with a staff member.",
    403,
  );
  await db.transaction(table.restro_id, (tx) =>
    expireIdleTables(tx, table.restro_id, table.outlet_id, table.id),
  );
  let grant: Row | null = null;
  if (token && device) {
    try {
      grant = await grantContext(db, key, token, device);
    } catch {
      /* An expired visit returns the menu without disclosing an order. */
    }
  }
  return db.transaction(table.restro_id, async (tx) => {
    const active =
      grant?.session_id ||
      (grant &&
        (
          await tx.query<Row>(
            "SELECT id FROM table_sessions WHERE table_id=$1 AND status='OPEN' AND (label='MAIN' OR (SELECT count(*) FROM table_sessions WHERE table_id=$1 AND status<>'CLOSED')=1) LIMIT 1",
            [table.id],
          )
        ).rows[0]?.id);
    const menu = active
      ? await publicMenu(tx, table.outlet_id, grant?.order_id, webFlow)
      : { items: [], taxComponents: null };
    return {
      taxComponents: menu.taxComponents,
      restaurant: table.restaurant_name,
      outlet: table.outlet_name,
      table: table.label,
      menu: menu.items,
      paired: !!grant,
      connected: !!grant,
      activationRequired: !active,
      activationRequested:
        !active &&
        !!(
          await tx.query(
            "SELECT id FROM service_requests WHERE table_id=$1 AND kind='ACTIVATE_TABLE' AND state IN ('OPEN','ACCEPTED','ESCALATED') LIMIT 1",
            [table.id],
          )
        ).rows.length,
      order: grant?.order_id ? await guestOrder(tx, grant.order_id) : null,
      currentIdentity: grant?.order_id
        ? ((
            await tx.query(
              "SELECT jsonb_build_object('name',customer_snapshot->>'name','phone',customer_snapshot->>'phone') AS identity FROM orders WHERE id=$1",
              [grant.order_id],
            )
          ).rows[0]?.identity ?? null)
        : null,
      identities: grant
        ? await ownDeviceIdentities(tx, table.outlet_id, grant.device_hash)
        : [],
    };
  });
}
export async function connectGuest(
  db: Database,
  key: string,
  device: string,
  ip: string,
  previousToken?: string,
) {
  await expireGuestTable(db, key);
  let existing: Row | null = null;
  if (previousToken) {
    try {
      existing = await grantContext(db, key, previousToken, device);
    } catch {
      /* A fresh visit never inherits another visit's order. */
    }
  }
  await rateLimit(db, "visit:" + ip + ":" + key, 40, 300);
  const table = await tableLink(db, key);
  const token = existing
    ? previousToken!
    : randomBytes(32).toString("base64url");
  await db.transaction(table.restro_id, async (tx) => {
    const outlet = await one(
      tx,
      "SELECT qr_enabled FROM outlets WHERE id=$1 FOR SHARE",
      [table.outlet_id],
    );
    ensure(
      outlet.qr_enabled,
      "QR_DISABLED",
      "QR ordering is paused. Please order with a staff member.",
      403,
    );
    await lockCustomerDevice(
      tx,
      table.restro_id,
      table.outlet_id,
      hash(device),
    );
    await assertCustomerDeviceAllowed(
      tx,
      table.restro_id,
      table.outlet_id,
      hash(device),
    );
    const grant =
      existing ??
      (await one(
        tx,
        "INSERT INTO public_grants(token_hash,restro_id,outlet_id,table_id,device_hash,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '2 hours') RETURNING *",
        [hash(token), table.restro_id, table.outlet_id, table.id, hash(device)],
      ));
    // A scan/reconnect is an explicit visit action; catalog polling never opens tables.
    await lockGuestVisit(tx, grant, "help");
  });
  return { token };
}

// Lock outlet -> table -> session -> grant so closing a table and disabling QR
// serialize with submissions and the outlet's activation policy.
async function lockGuestVisit(
  tx: Sql,
  grant: Row,
  mode?: "order",
): Promise<{ locked: Row; session: Row }>;
async function lockGuestVisit(
  tx: Sql,
  grant: Row,
  mode: "help",
): Promise<{ locked: Row; session: Row | null }>;
async function lockGuestVisit(
  tx: Sql,
  grant: Row,
  mode: "order" | "help",
): Promise<{ locked: Row; session: Row | null }>;
async function lockGuestVisit(
  tx: Sql,
  grant: Row,
  mode: "order" | "help" = "order",
) {
  const outlet = await one(
    tx,
    "SELECT qr_enabled,qr_auto_activate FROM outlets WHERE id=$1 FOR SHARE",
    [grant.outlet_id],
  );
  ensure(
    outlet.qr_enabled,
    "QR_DISABLED",
    "QR ordering is paused. Please order with a staff member.",
    403,
  );
  await lockCustomerDevice(
    tx,
    grant.restro_id,
    grant.outlet_id,
    grant.device_hash,
  );
  await assertCustomerDeviceAllowed(
    tx,
    grant.restro_id,
    grant.outlet_id,
    grant.device_hash,
  );
  await one(
    tx,
    "SELECT id FROM dining_tables WHERE id=$1 AND retired_at IS NULL FOR UPDATE",
    [grant.table_id],
  );
  let session: Row | null = null;
  if (grant.session_id) {
    session = await one(
      tx,
      "SELECT * FROM table_sessions WHERE id=$1 AND status='OPEN' FOR UPDATE",
      [grant.session_id],
      "This table visit has ended. Refresh the menu.",
    );
  } else {
    const sessions = (
      await tx.query<Row>(
        "SELECT * FROM table_sessions WHERE table_id=$1 AND status<>'CLOSED' ORDER BY opened_at FOR UPDATE",
        [grant.table_id],
      )
    ).rows;
    let current =
      sessions.find((s) => s.label === "MAIN") ??
      (sessions.length === 1 ? sessions[0] : undefined);
    if (!sessions.length && outlet.qr_auto_activate) {
      const reserved = (
        await tx.query(
          "SELECT id FROM table_reservations WHERE table_id=$1 AND state='HELD' AND starts_at<=now() AND ends_at>now()",
          [grant.table_id],
        )
      ).rows.length;
      const owner = (
        await tx.query<Row>(
          "SELECT id FROM employees WHERE active AND (role='OWNER' OR $1=ANY(outlet_ids)) AND role IN ('OWNER','MANAGER','WAITER') ORDER BY CASE role WHEN 'OWNER' THEN 0 WHEN 'MANAGER' THEN 1 ELSE 2 END,id LIMIT 1",
          [grant.outlet_id],
        )
      ).rows[0];
      if (!reserved && owner) {
        current = await one(
          tx,
          "INSERT INTO table_sessions(id,restro_id,outlet_id,table_id,owner_employee_id,guests,label) VALUES($1,$2,$3,$4,$5,1,'MAIN') RETURNING *",
          [id(), grant.restro_id, grant.outlet_id, grant.table_id, owner.id],
        );
        await audit(tx, guestActor(grant), {
          action: "SESSION_AUTO_OPENED",
          entityType: "SESSION",
          entityId: current.id,
          outletId: grant.outlet_id,
          tableId: grant.table_id,
          newState: { ownerId: owner.id, guests: 1, policy: "AUTO" },
        });
        await tx.query(
          "UPDATE service_requests SET state='COMPLETED',session_id=$2,owner_id=$3,accepted_at=COALESCE(accepted_at,now()),completed_at=now() WHERE table_id=$1 AND kind='ACTIVATE_TABLE' AND state IN ('OPEN','ACCEPTED','ESCALATED')",
          [grant.table_id, current.id, owner.id],
        );
      }
    }
    if (mode !== "help")
      ensure(
        !sessions.length || current?.status === "OPEN",
        "TABLE_UNAVAILABLE",
        "Please ask your server to prepare this table for QR ordering.",
        409,
      );
    if (mode !== "help")
      ensure(
        !!current,
        "TABLE_ACTIVATION_REQUIRED",
        "Request table activation and wait for staff to activate your table.",
        409,
      );
    if (current?.status === "OPEN") session = current;
  }
  const locked = await one(
    tx,
    "SELECT * FROM public_grants WHERE token_hash=$1 AND device_hash=$2 AND table_id=$3 AND revoked_at IS NULL AND expires_at>now() FOR UPDATE",
    [grant.token_hash, grant.device_hash, grant.table_id],
    "Your table visit has ended. Refresh the menu.",
  );
  ensure(
    !locked.session_id || locked.session_id === session?.id,
    "TABLE_VISIT_CHANGED",
    "Refresh the menu before ordering.",
    409,
  );
  if (!locked.session_id && session && mode !== "help")
    await tx.query(
      "UPDATE public_grants SET session_id=$2 WHERE token_hash=$1",
      [grant.token_hash, session.id],
    );
  return { locked, session };
}

async function expireGuestTable(db: Database, key: string) {
  const table = await tableLink(db, key);
  await db.transaction(table.restro_id, (tx) =>
    expireIdleTables(tx, table.restro_id, table.outlet_id, table.id),
  );
}

export async function guestActivity(
  db: Database,
  key: string,
  token: string | undefined,
  device: string | undefined,
) {
  await expireGuestTable(db, key);
  const grant = await grantContext(db, key, token, device);
  await db.transaction(grant.restro_id, async (tx) => {
    const { session } = await lockGuestVisit(tx, grant);
    await tx.query(
      "UPDATE table_sessions SET last_activity_at=now() WHERE id=$1 AND status='OPEN'",
      [session.id],
    );
  });
  return { ok: true };
}
export async function pairGuest(
  db: Database,
  key: string,
  input: unknown,
  device: string,
  ip: string,
) {
  const data = z
    .object({ code: z.string().regex(/^\d{6}$/) })
    .strict()
    .parse(input);
  await rateLimit(db, "pair:" + ip + ":" + key, 8, 300);
  const table = await tableLink(db, key);
  ensure(
    table.qr_enabled,
    "QR_DISABLED",
    "QR ordering is paused. Please order with a staff member.",
    403,
  );
  const token = randomBytes(32).toString("base64url");
  await db.transaction(table.restro_id, async (tx) => {
    const outlet = await one(
      tx,
      "SELECT qr_enabled FROM outlets WHERE id=$1 FOR SHARE",
      [table.outlet_id],
    );
    ensure(
      outlet.qr_enabled,
      "QR_DISABLED",
      "QR ordering is paused. Please order with a staff member.",
      403,
    );
    await lockCustomerDevice(
      tx,
      table.restro_id,
      table.outlet_id,
      hash(device),
    );
    await assertCustomerDeviceAllowed(
      tx,
      table.restro_id,
      table.outlet_id,
      hash(device),
    );
    await one(
      tx,
      "SELECT id FROM dining_tables WHERE id=$1 AND retired_at IS NULL FOR UPDATE",
      [table.id],
    );
    const code = await one(
      tx,
      "SELECT p.*,s.outlet_id FROM pairing_codes p JOIN table_sessions s ON s.id=p.session_id AND s.restro_id=p.restro_id WHERE s.table_id=$1 AND s.status='OPEN' AND p.code_hash=$2 AND p.expires_at>now() AND p.consumed_at IS NULL FOR UPDATE OF p",
      [table.id, hash(data.code)],
      "The code is invalid or expired. Ask your server for a new code.",
    );
    await tx.query("UPDATE pairing_codes SET consumed_at=now() WHERE id=$1", [
      code.id,
    ]);
    await tx.query(
      "INSERT INTO public_grants(token_hash,restro_id,outlet_id,session_id,device_hash,table_id,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '2 hours')",
      [
        hash(token),
        table.restro_id,
        table.outlet_id,
        code.session_id,
        hash(device),
        table.id,
      ],
    );
    await audit(
      tx,
      guestActor({
        token_hash: hash(token),
        restro_id: table.restro_id,
        outlet_id: table.outlet_id,
        device_hash: hash(device),
      }),
      {
        action: "CUSTOMER_DEVICE_PAIRED",
        entityType: "SESSION",
        entityId: code.session_id,
        outletId: table.outlet_id,
        reason: "Single-use staff-issued code",
      },
    );
  });
  return { token };
}
export async function guestSubmit(
  db: Database,
  key: string,
  token: string | undefined,
  device: string | undefined,
  requestKey: string,
  input: unknown,
  webFlow = false,
) {
  const data = z
    .object({
      items: roundInput.shape.items,
      version: z.number().int().optional(),
      name: z.string(),
      phone: z.string(),
    })
    .strict()
    .parse(input);
  const name = customerName(data.name),
    phone = normalizePhone(data.phone);
  await expireGuestTable(db, key);
  const grant = await grantContext(db, key, token, device),
    actor = guestActor(grant);
  return command(
    db,
    actor,
    requestKey,
    "CUSTOMER_ORDER_SUBMITTED",
    data,
    async (tx) => {
      const { locked, session } = await lockGuestVisit(tx, grant);
      let orderId = locked.order_id;
      let order: Row | null = null;
      if (orderId)
        order = await one(tx, "SELECT * FROM orders WHERE id=$1 FOR UPDATE", [
          orderId,
        ]);
      if (order && !["SETTLED", "VOIDED", "REJECTED"].includes(order.status)) {
        expectedVersion(order.version, data.version ?? 0);
        ensure(
          order.customer_snapshot.phone === phone &&
            order.customer_snapshot.name === name,
          "IDENTITY_LOCKED",
          "Use the customer details already attached to this table order.",
        );
        await tx.query(
          "UPDATE orders SET version=version+1,status='PENDING' WHERE id=$1",
          [orderId],
        );
      } else {
        order = null;
        orderId = id();
        const { customer, snapshot } = await bindCustomer(
          tx,
          actor.restroId,
          name,
          phone,
        );
        await tx.query(
          "INSERT INTO orders(id,restro_id,outlet_id,session_id,source,type,customer_id,customer_snapshot) VALUES($1,$2,$3,$4,'CUSTOMER_QR','DINE_IN',$5,$6::jsonb)",
          [
            orderId,
            actor.restroId,
            grant.outlet_id,
            session.id,
            customer.id,
            json(snapshot),
          ],
        );
        await tx.query(
          "UPDATE public_grants SET order_id=$2 WHERE token_hash=$1",
          [grant.token_hash, orderId],
        );
      }
      const items = await buildItems(
          tx,
          grant.outlet_id,
          data.items,
          (
            await one(tx, "SELECT tax_bps_override FROM orders WHERE id=$1", [
              orderId,
            ])
          ).tax_bps_override,
          webFlow,
        ),
        total = quote(
          items.map((i) => ({
            unit_price: num(i.unit_price),
            quantity_milli: num(i.quantity_milli),
            tax_bps: num(i.tax_bps),
          })),
        );
      const sequence = await one(
        tx,
        "SELECT coalesce(max(round_number),0)+1 AS number FROM order_rounds WHERE order_id=$1",
        [orderId],
      );
      const roundId = id();
      await tx.query(
        "INSERT INTO order_rounds(id,restro_id,order_id,round_number,subtotal,tax,payable,payment_gate) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          roundId,
          actor.restroId,
          orderId,
          sequence.number,
          total.subtotal,
          total.tax,
          total.payable,
          webFlow
            ? (
                await one(
                  tx,
                  "SELECT qr_payment_mode FROM outlets WHERE id=$1",
                  [grant.outlet_id],
                )
              ).qr_payment_mode === "ORDER_ONLY"
              ? "QR_ORDER_ONLY"
              : "QR_PAYMENT"
            : "LEGACY",
        ],
      );
      await snapshotWebKitchenPolicy(tx,grant.outlet_id,roundId,webFlow);
      const billDefaults=await snapshotWebBillDefaults(tx,grant.outlet_id,roundId,webFlow);
      await insertItems(tx, actor.restroId, roundId, items);
      await audit(tx, actor, {
        action: "CUSTOMER_ORDER_SUBMITTED",
        entityType: "ORDER_ROUND",
        entityId: roundId,
        outletId: grant.outlet_id,
        newState: { orderId, round: num(sequence.number), ...total,...billDefaults },
        reason: "Customer QR order awaiting staff acceptance",
      });
      return guestOrder(tx, orderId);
    },
  );
}
export async function guestService(
  db: Database,
  key: string,
  token: string | undefined,
  device: string | undefined,
  requestKey: string,
  input: unknown,
) {
  const data = z
    .object({
      kind: z.enum([
        "WATER",
        "CUTLERY",
        "CLEANUP",
        "BILL",
        "HELP",
        "ACTIVATE_TABLE",
        "ASSISTANCE",
      ]),
    })
    .strict()
    .parse(input);
  await expireGuestTable(db, key);
  const grant = await grantContext(db, key, token, device),
    actor = guestActor(grant);
  return command(
    db,
    actor,
    requestKey,
    "CUSTOMER_SERVICE_REQUESTED",
    data,
    async (tx) => {
      const { session } = await lockGuestVisit(
        tx,
        grant,
        ["HELP", "ACTIVATE_TABLE"].includes(data.kind) ? "help" : "order",
      );
      if (data.kind === "ACTIVATE_TABLE" && session) return { ok: true };
      const existing = (
        await tx.query<Row>(
          "SELECT id FROM service_requests WHERE kind=$1 AND state IN ('OPEN','ACCEPTED','ESCALATED') AND (session_id=$2 OR (session_id IS NULL AND table_id=$3))",
          [data.kind, session?.id ?? null, grant.table_id],
        )
      ).rows[0];
      if (existing) return { ok: true };
      const requestId = id();
      await tx.query(
        "INSERT INTO service_requests(id,restro_id,outlet_id,session_id,kind,owner_id,table_id) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          requestId,
          actor.restroId,
          grant.outlet_id,
          session?.id ?? null,
          data.kind,
          session?.owner_employee_id ?? null,
          grant.table_id,
        ],
      );
      await audit(tx, actor, {
        action: "CUSTOMER_SERVICE_REQUESTED",
        entityType: "SERVICE_REQUEST",
        entityId: requestId,
        outletId: grant.outlet_id,
        tableId: grant.table_id,
        newState: { kind: data.kind },
      });
      return { ok: true };
    },
  );
}
