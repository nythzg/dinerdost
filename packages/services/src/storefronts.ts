import {snapshotWebBillDefaults} from './web-bill-policy';
import { randomBytes } from "node:crypto";
import { z } from "zod";
import {snapshotWebKitchenPolicy} from "./kitchen-policy";
import { ownDeviceIdentities } from "./public-identities";
import { publicMenu } from "./public-menu";
import type { Database, Sql } from "@dinerdost/database";
import {
  ensure,
  requireOutlet,
  requirePermission,
  customerName,
  normalizePhone,
  quote,
  type Actor,
} from "@dinerdost/core";
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
  type Row,
  type AuditActor,
} from "./shared";
import { buildItems, insertItems, roundInput } from "./orders";
import { bindCustomer } from "./customer-identity";
import { holdReservation } from "./reservations";
import {
  assertCustomerDeviceAllowed,
  lockCustomerDevice,
} from "./customer-devices";
import { expireIdleTables } from "./table-activity";

const slugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{2,79}$/);
export async function saveStorefront(
  db: Database,
  actor: Actor,
  key: string,
  input: unknown,
) {
  requirePermission(actor, "settings");
  const data = z
    .object({
      id: z.uuid().optional(),
      version: z.number().int().min(0).optional(),
      outletId: z.uuid(),
      brandId: z.uuid(),
      slug: slugSchema,
      published: z.boolean(),
    })
    .strict()
    .parse(input);
  requireOutlet(actor, data.outletId);
  return command(db, actor, key, "STOREFRONT_SAVED", data, async (tx) => {
    await one(tx, "SELECT id FROM outlets WHERE id=$1 FOR UPDATE", [
      data.outletId,
    ]);
    const brand = await one(
      tx,
      "SELECT * FROM records WHERE id=$1 AND kind='brands' AND outlet_id=$2 AND state<>'CANCELLED'",
      [data.brandId, data.outletId],
    );
    ensure(
      !data.published || brand.data.active,
      "BRAND_INACTIVE",
      "Activate the brand before publishing its store.",
      409,
    );
    const before = (
      await tx.query<Row>(
        "SELECT * FROM storefronts WHERE outlet_id=$1 AND brand_id=$2 FOR UPDATE",
        [data.outletId, data.brandId],
      )
    ).rows[0];
    expectedVersion(before?.version ?? 0, data.version ?? 0);
    ensure(
      !data.id || before?.id === data.id,
      "STOREFRONT_MISMATCH",
      "Refresh this brand's store settings.",
      409,
    );
    const storeId = before?.id ?? id();
    if (before)
      await tx.query(
        "UPDATE storefronts SET slug=$2,published=$3,version=version+1 WHERE id=$1",
        [storeId, data.slug, data.published],
      );
    else
      await tx.query(
        "INSERT INTO storefronts(id,restro_id,outlet_id,brand_id,slug,published) VALUES($1,$2,$3,$4,$5,$6)",
        [
          storeId,
          actor.restroId,
          data.outletId,
          data.brandId,
          data.slug,
          data.published,
        ],
      );
    await audit(tx, actor, {
      action: "STOREFRONT_SAVED",
      entityType: "STOREFRONT",
      entityId: storeId,
      outletId: data.outletId,
      oldState: before,
      newState: data,
    });
    return { id: storeId, path: "/store/" + data.slug };
  });
}
async function storefront(db: Database, slug: string) {
  slugSchema.parse(slug);
  return one(
    db,
    "SELECT s.*,b.title AS name,b.data->>'description' AS description,o.name AS outlet_name FROM storefronts s JOIN records b ON b.id=s.brand_id AND b.restro_id=s.restro_id JOIN outlets o ON o.id=s.outlet_id AND o.restro_id=s.restro_id WHERE s.slug=$1 AND s.published AND b.state<>'CANCELLED' AND b.data->>'active'='true'",
    [slug],
    "This store is unavailable.",
  );
}
async function visit(
  db: Database,
  slug: string,
  token?: string,
  device?: string,
) {
  const store = await storefront(db, slug);
  ensure(
    token && device,
    "STORE_VISIT_REQUIRED",
    "Refresh the store to reconnect.",
    401,
  );
  const grant = await one(
    db,
    "SELECT * FROM storefront_visits WHERE storefront_id=$1 AND token_hash=$2 AND device_hash=$3 AND expires_at>now()",
    [store.id, hash(token), hash(device)],
    "Your store visit expired. Refresh to reconnect.",
  );
  return { store, grant };
}
function visitor(grant: Row, store: Row): AuditActor {
  return {
    restroId: grant.restro_id,
    employeeId: grant.id,
    userId: "store-guest",
    name: "Store guest",
    role: "CUSTOMER",
    outletIds: [store.outlet_id],
    deviceId: grant.device_hash.slice(0, 16),
    authMethod: "D2C_VISIT",
  };
}
export async function connectStorefront(
  db: Database,
  slug: string,
  device: string,
  ip: string,
  currentToken?: string,
) {
  await rateLimit(db, "store-connect:" + slug + ":" + ip, 30, 300);
  const store = await storefront(db, slug);
  await assertCustomerDeviceAllowed(
    db,
    store.restro_id,
    store.outlet_id,
    hash(device),
  );
  if (currentToken) {
    const previous = (
      await db.query(
        "SELECT id FROM storefront_visits WHERE storefront_id=$1 AND token_hash=$2 AND device_hash=$3 AND expires_at>now()",
        [store.id, hash(currentToken), hash(device)],
      )
    ).rows[0];
    if (previous) return { token: currentToken };
  }
  const token = randomBytes(32).toString("base64url");
  await db.transaction(store.restro_id, async (tx) => {
    await tx.query(
      "INSERT INTO storefront_visits(id,restro_id,storefront_id,token_hash,device_hash) VALUES($1,$2,$3,$4,$5)",
      [id(), store.restro_id, store.id, hash(token), hash(device)],
    );
  });
  return { token };
}
async function ownOrders(tx: Sql, grantId: string) {
  const orders = (
    await tx.query<Row>(
      "SELECT o.id,o.number,o.status FROM orders o JOIN storefront_orders so ON so.order_id=o.id AND so.restro_id=o.restro_id WHERE so.visit_id=$1 ORDER BY o.created_at DESC LIMIT 30",
      [grantId],
    )
  ).rows;
  for (const order of orders) {
    order.rounds = (
      await tx.query<Row>(
        "SELECT id,status,kot_status,payable,paid FROM order_rounds WHERE order_id=$1 ORDER BY round_number",
        [order.id],
      )
    ).rows;
    for (const round of order.rounds)
      round.items = (
        await tx.query(
          "SELECT name,quantity_milli,variant,note FROM order_items WHERE round_id=$1",
          [round.id],
        )
      ).rows;
  }
  return orders;
}
export async function storefrontCatalog(
  db: Database,
  slug: string,
  token?: string,
  device?: string,
) {
  const store = await storefront(db, slug);
  if (device)
    await assertCustomerDeviceAllowed(
      db,
      store.restro_id,
      store.outlet_id,
      hash(device),
    );
  return db.transaction(store.restro_id, async (tx) => {
    await expireIdleTables(tx, store.restro_id, store.outlet_id);
    const menu = await publicMenu(tx, store.outlet_id, undefined, true);
    const tables = (
      await tx.query(
        "SELECT t.id,t.label,t.floor,t.seats,coalesce(s.guests,0) AS occupied_seats FROM dining_tables t LEFT JOIN LATERAL(SELECT sum(guests) AS guests FROM table_sessions WHERE table_id=t.id AND status<>'CLOSED') s ON true WHERE t.outlet_id=$1 AND t.retired_at IS NULL ORDER BY t.floor,t.label",
        [store.outlet_id],
      )
    ).rows;
    const plans = (
      await tx.query(
        "SELECT floor,width,height,objects,outline FROM floor_plans WHERE outlet_id=$1 ORDER BY floor",
        [store.outlet_id],
      )
    ).rows;
    // Only time windows are public. Never return guest names, phone numbers or pairing/QR keys.
    const reservations = (
      await tx.query(
        "SELECT table_id,starts_at,ends_at FROM table_reservations WHERE outlet_id=$1 AND state IN ('HELD','SEATED') AND ends_at>now() ORDER BY starts_at",
        [store.outlet_id],
      )
    ).rows;
    const grant =
      token && device
        ? (
            await tx.query<Row>(
              "SELECT * FROM storefront_visits WHERE storefront_id=$1 AND token_hash=$2 AND device_hash=$3 AND expires_at>now()",
              [store.id, hash(token), hash(device)],
            )
          ).rows[0]
        : null;
    const bookings = grant
      ? (
          await tx.query(
            "SELECT r.id,r.state,r.data->>'tableId' AS table_id,r.data->>'at' AS starts_at,r.data->>'durationMinutes' AS duration_minutes FROM records r WHERE r.kind='reservations' AND r.created_by=$1 ORDER BY r.created_at DESC LIMIT 30",
            [grant.id],
          )
        ).rows
      : [];
    return {
      name: store.name,
      description: store.description,
      outletName: store.outlet_name,
      menu: menu.items,
      taxComponents: menu.taxComponents,
      tables,
      plans,
      reservations,
      connected: !!grant,
      orders: grant ? await ownOrders(tx, grant.id) : [],
      bookings,
      identities: grant
        ? await ownDeviceIdentities(tx, store.outlet_id, grant.device_hash)
        : [],
      paymentSetupRequired: true,
    };
  });
}
export async function reserveStorefrontTable(
  db: Database,
  slug: string,
  token: string | undefined,
  device: string | undefined,
  key: string,
  input: unknown,
) {
  const data = z
    .object({
      name: z.string(),
      phone: z.string(),
      tableId: z.uuid(),
      guests: z.number().int().min(1).max(100),
      at: z.iso.datetime(),
      durationMinutes: z.number().int().min(15).max(720),
    })
    .strict()
    .parse(input);
  const { store, grant } = await visit(db, slug, token, device);
  await rateLimit(db, "store-book:" + grant.device_hash, 6, 3600);
  ensure(
    new Date(data.at).getTime() <= Date.now() + 90 * 86400000,
    "BOOKING_TOO_FAR",
    "Choose a date within the next 90 days.",
  );
  const actor = visitor(grant, store);
  return command(
    db,
    actor,
    key,
    "CUSTOMER_RESERVATION_REQUESTED",
    data,
    async (tx) => {
      await lockCustomerDevice(
        tx,
        actor.restroId,
        store.outlet_id,
        grant.device_hash,
      );
      await assertCustomerDeviceAllowed(
        tx,
        actor.restroId,
        store.outlet_id,
        grant.device_hash,
      );
      await one(
        tx,
        "SELECT id FROM storefronts WHERE id=$1 AND published FOR SHARE",
        [store.id],
      );
      const bound = await bindCustomer(
        tx,
        actor.restroId,
        data.name,
        data.phone,
      );
      const recordId = id();
      const values = {
        guest: customerName(data.name),
        phone: normalizePhone(data.phone).slice(3),
        tableId: data.tableId,
        guests: data.guests,
        at: data.at,
        durationMinutes: data.durationMinutes,
        note: "Customer storefront reservation",
        source: "D2C",
        customerId: bound.customer.id,
      };
      await tx.query(
        "INSERT INTO records(id,restro_id,outlet_id,kind,title,state,data,created_by) VALUES($1,$2,$3,'reservations',$4,'DRAFT',$5::jsonb,$6)",
        [
          recordId,
          actor.restroId,
          store.outlet_id,
          values.guest,
          json(values),
          grant.id,
        ],
      );
      await holdReservation(
        tx,
        recordId,
        actor.restroId,
        store.outlet_id,
        values,
      );
      await audit(tx, actor, {
        action: "CUSTOMER_RESERVATION_REQUESTED",
        entityType: "RESERVATIONS",
        entityId: recordId,
        outletId: store.outlet_id,
        newState: {
          tableId: data.tableId,
          startsAt: data.at,
          durationMinutes: data.durationMinutes,
          guests: data.guests,
        },
        tableId: data.tableId,
      });
      return { id: recordId };
    },
  );
}
export async function cancelStorefrontReservation(
  db: Database,
  slug: string,
  token: string | undefined,
  device: string | undefined,
  key: string,
  input: unknown,
) {
  const data = z.object({ id: z.uuid() }).strict().parse(input);
  const { store, grant } = await visit(db, slug, token, device);
  const actor = visitor(grant, store);
  return command(
    db,
    actor,
    key,
    "CUSTOMER_RESERVATION_CANCELLED",
    data,
    async (tx) => {
      const booking = await one(
        tx,
        "SELECT b.* FROM table_reservations b JOIN records r ON r.id=b.id AND r.restro_id=b.restro_id WHERE b.id=$1 AND r.created_by=$2 AND b.state='HELD' FOR UPDATE OF b",
        [data.id, grant.id],
        "This booking is unavailable or already seated.",
      );
      await tx.query(
        "UPDATE table_reservations SET state='CANCELLED' WHERE id=$1",
        [booking.id],
      );
      await tx.query(
        "UPDATE records SET state='CANCELLED',version=version+1 WHERE id=$1",
        [booking.id],
      );
      await audit(tx, actor, {
        action: "CUSTOMER_RESERVATION_CANCELLED",
        entityType: "RESERVATIONS",
        entityId: booking.id,
        outletId: store.outlet_id,
        tableId: booking.table_id,
      });
      return { ok: true };
    },
  );
}
export async function submitStorefrontOrder(
  db: Database,
  slug: string,
  token: string | undefined,
  device: string | undefined,
  key: string,
  input: unknown,
) {
  const data = z
    .object({
      name: z.string(),
      phone: z.string(),
      items: roundInput.shape.items,
    })
    .strict()
    .parse(input);
  const { store, grant } = await visit(db, slug, token, device);
  await rateLimit(db, "store-order:" + grant.device_hash, 10, 300);
  const actor = visitor(grant, store);
  return command(
    db,
    actor,
    key,
    "CUSTOMER_D2C_ORDER_SUBMITTED",
    data,
    async (tx) => {
      await lockCustomerDevice(
        tx,
        actor.restroId,
        store.outlet_id,
        grant.device_hash,
      );
      await assertCustomerDeviceAllowed(
        tx,
        actor.restroId,
        store.outlet_id,
        grant.device_hash,
      );
      await one(
        tx,
        "SELECT id FROM storefronts WHERE id=$1 AND published FOR SHARE",
        [store.id],
      );
      const { customer, snapshot } = await bindCustomer(
        tx,
        actor.restroId,
        data.name,
        data.phone,
      );
      const taxPolicy = await one(
        tx,
        "SELECT tax_bps,tax_components FROM outlets WHERE id=$1 FOR SHARE",
        [store.outlet_id],
      );
      const items = await buildItems(
        tx,
        store.outlet_id,
        data.items,
        taxPolicy.tax_components !== null ? num(taxPolicy.tax_bps) : undefined,
        true,
        'TAKEAWAY',
      );
      const total = quote(
        items.map((item) => ({
          unit_price: num(item.unit_price),
          quantity_milli: num(item.quantity_milli),
          tax_bps: num(item.tax_bps),
        })),
      );
      const orderId = id(),
        roundId = id();
      await tx.query(
        "INSERT INTO orders(id,restro_id,outlet_id,source,type,customer_id,customer_snapshot) VALUES($1,$2,$3,'D2C','TAKEAWAY',$4,$5::jsonb)",
        [orderId, actor.restroId, store.outlet_id, customer.id, json(snapshot)],
      );
      await tx.query(
        "INSERT INTO order_rounds(id,restro_id,order_id,round_number,subtotal,tax,payable) VALUES($1,$2,$3,1,$4,$5,$6)",
        [
          roundId,
          actor.restroId,
          orderId,
          total.subtotal,
          total.tax,
          total.payable,
        ],
      );
      await snapshotWebKitchenPolicy(tx,store.outlet_id,roundId,true);
      const billDefaults=await snapshotWebBillDefaults(tx,store.outlet_id,roundId,true);
      await insertItems(tx, actor.restroId, roundId, items);
      await tx.query(
        "INSERT INTO storefront_orders(restro_id,visit_id,order_id) VALUES($1,$2,$3)",
        [actor.restroId, grant.id, orderId],
      );
      await tx.query(
        "INSERT INTO customer_order_devices(order_id,restro_id,outlet_id,device_hash) VALUES($1,$2,$3,$4)",
        [orderId, actor.restroId, store.outlet_id, grant.device_hash],
      );
      await audit(tx, actor, {
        action: "CUSTOMER_D2C_ORDER_SUBMITTED",
        entityType: "ORDER_ROUND",
        entityId: roundId,
        outletId: store.outlet_id,
        newState: { orderId, brandId: store.brand_id, ...total,...billDefaults },
        reason: "Customer takeaway awaiting staff acceptance",
      });
      return (await ownOrders(tx, grant.id)).find(
        (order) => order.id === orderId,
      )!;
    },
  );
}
