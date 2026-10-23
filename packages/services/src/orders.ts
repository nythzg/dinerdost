import {assertPlatformNewOrder} from "./platform-policy";
import {reserveWebDiscountCoupon} from './web-discount-coupons';
import {webLoyaltyLimit} from './web-loyalty';
import { replacementEarnedPoints } from './web-replacements';
import { resolveRecipe } from './recipe-profiles';
import {snapshotWebBillDefaults} from './web-bill-policy';
import { z } from "zod";
import {snapshotWebKitchenPolicy} from "./kitchen-policy";
import type { Database, Sql } from "@dinerdost/database";
import {
  can,
  customerName,
  ensure,
  integer,
  normalizePhone,
  quantityMilli,
  quote,
  roundAdjustment,
  wholeUnit,
  requireOutlet,
  requirePermission,
  type Actor,
} from "@dinerdost/core";
import {
  audit,
  command,
  expectedVersion,
  id,
  json,
  num,
  one,
  scopedOrder,
  type Row,
} from "./shared";
import { consumeStock, reserveStock, releaseStock } from "./stock";
import { expireInventory } from "./stock-expiry";
import { refreshOrderStatus } from "./order-state";
import { bindCustomer } from "./customer-identity";

const lineSchema = z
  .object({
    itemId: z.uuid(),
    quantity: z.union([z.string(), z.number()]),
    variant: z.string().max(80).optional(),
    modifiers: z.array(z.string().max(80)).max(10).default([]),
    note: z.string().max(250).default(""),
  })
  .strict();
export const roundInput = z
  .object({
    outletId: z.uuid(),
    sessionId: z.uuid().optional(),
    orderId: z.uuid().optional(),
    version: z.number().int().optional(),
    type: z.enum(["DINE_IN", "TAKEAWAY", "DELIVERY"]).default("DINE_IN"),
    course: z
      .enum(["STARTER", "MAIN", "DESSERT", "BEVERAGE", "IMMEDIATE"])
      .default("IMMEDIATE"),
    draft: z.boolean().default(false),
    customer: z
      .object({ name: z.string(), phone: z.string() })
      .strict()
      .optional(),
    items: z.array(lineSchema).min(1).max(100),
  })
  .strict();

export async function buildItems(
  tx: Sql,
  outletId: string,
  items: z.infer<typeof lineSchema>[],
  taxBpsOverride?: number | null,
  customerWeb = false,
  recipeChannel?: string,
) {
  const outlet = await one(tx, "SELECT restro_id FROM outlets WHERE id=$1", [
    outletId,
  ]);
  await expireInventory(tx, String(outlet.restro_id), outletId);
  const rows: Row[] = [];
  for (const requested of items) {
    const item = await one(
      tx,
      "SELECT * FROM menu_items WHERE id=$1 AND outlet_id=$2 AND active=true FOR SHARE",
      [requested.itemId, outletId],
      "A menu item is unavailable.",
    );
    ensure(!customerWeb || !item.ready_food_batch_id, 'ITEM_UNAVAILABLE', 'This item is available through staff only. Refresh the menu or ask a staff member.', 409);
    const quantity = quantityMilli(requested.quantity);
    ensure(
      !wholeUnit(item.unit) || quantity % 1000 === 0,
      "WHOLE_QUANTITY_REQUIRED",
      "Portions, pieces and pegs require a whole-number quantity.",
    );
    ensure(
      new Set(requested.modifiers).size === requested.modifiers.length,
      "DUPLICATE_MODIFIER",
      "Choose a modifier only once.",
    );
    let price = num(item.price),
      variant: string | null = null;
    if (requested.variant) {
      const option = item.variants.find((v: Row) => v.id === requested.variant);
      ensure(option, "INVALID_VARIANT", "This variant is unavailable.");
      price += integer(num(option.price), "Variant price");
      variant = option.name;
    }
    const modifiers = requested.modifiers.map((modifierId) => {
      const option = item.modifiers.find((v: Row) => v.id === modifierId);
      ensure(option, "INVALID_MODIFIER", "This modifier is unavailable.");
      price += integer(num(option.price), "Modifier price");
      return { id: option.id, name: option.name, price: num(option.price) };
    });
    integer(price, "Item price");
    rows.push({
      item_id: item.id,
      name: item.name,
      unit_price: price,
      quantity_milli: quantity,
      tax_bps: taxBpsOverride ?? item.tax_bps,
      station: item.station,
      production_stream: item.production_stream,
      unit_snapshot: item.unit,
      variant,
      modifiers,
      note: requested.note,
      recipe_snapshot: recipeChannel && !item.ready_food_batch_id ? await resolveRecipe(tx,item,requested.variant,requested.modifiers,recipeChannel) : null,
    });
  }
  return rows;
}
function totals(items: Row[], discount = 0, charges = 0) {
  const total = quote(
    items.map((i) => ({
      unit_price: num(i.unit_price),
      quantity_milli: num(i.quantity_milli),
      tax_bps: num(i.tax_bps),
    })),
    discount,
  );
  integer(total.payable + charges, "Payable amount");
  return { ...total, payable: total.payable + charges };
}
export async function insertItems(
  tx: Sql,
  restroId: string,
  roundId: string,
  items: Row[],
) {
  for (const item of items)
    await tx.query(
      "INSERT INTO order_items(id,restro_id,round_id,item_id,name,unit_price,quantity_milli,tax_bps,station,variant,modifiers,note,production_stream,unit_snapshot,recipe_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15::jsonb)",
      [
        id(),
        restroId,
        roundId,
        item.item_id,
        item.name,
        item.unit_price,
        item.quantity_milli,
        item.tax_bps,
        item.station,
        item.variant,
        json(item.modifiers),
        item.note,
        item.production_stream,
        item.unit_snapshot ?? null,
        item.recipe_snapshot ? json(item.recipe_snapshot) : null,
      ],
    );
}
export async function resetRewards(tx: Sql, roundId: string) {
  await tx.query(
    "UPDATE coupons SET state='AVAILABLE',round_id=NULL,round_version=NULL,reserved_until=NULL WHERE round_id=$1 AND state IN ('RESERVED','LOCKED')",
    [roundId],
  );
  await tx.query(
    "UPDATE loyalty_reservations SET state='RELEASED' WHERE round_id=$1 AND state IN ('RESERVED','LOCKED')",
    [roundId],
  );
  await tx.query(
    "UPDATE loyalty_ledger SET points=0 WHERE round_id=$1 AND state='PENDING_EARN'",
    [roundId],
  );
}
export async function createRound(
  db: Database,
  actor: Actor,
  key: string,
  input: unknown,
  webFlow = false,
) {
  requirePermission(actor, "orders");
  const data = roundInput.parse(input);
  requireOutlet(actor, data.outletId);
  ensure(
    actor.role !== "WAITER" || data.sessionId,
    "SESSION_REQUIRED",
    "Waiter orders require an assigned table.",
    403,
  );
  return command(db, actor, key, "ORDER_ROUND_CREATED", data, async (tx) => {
    await one(tx, "SELECT id FROM outlets WHERE id=$1 FOR SHARE", [
      data.outletId,
    ]);
    if (data.sessionId) {
      const session = await one(
        tx,
        "SELECT * FROM table_sessions WHERE id=$1 AND outlet_id=$2 AND status='OPEN' FOR UPDATE",
        [data.sessionId, data.outletId],
        "The table session is closed or unavailable.",
      );
      ensure(
        actor.role !== "WAITER" ||
          session.owner_employee_id === actor.employeeId,
        "TABLE_NOT_ASSIGNED",
        "This table is not assigned to you.",
        403,
      );
    }
    ensure(
      data.type !== "DINE_IN" || data.sessionId,
      "SESSION_REQUIRED",
      "Open a table session before placing a dine-in order.",
    );
    let orderId = data.orderId;
    if (orderId) {
      const order = await scopedOrder(tx, actor, orderId, true);
      ensure(
        !["SETTLED", "VOIDED", "REJECTED"].includes(order.status),
        "ORDER_LOCKED",
        "This order is closed. Start a new order.",
        409,
      );
      ensure(
        order.outlet_id === data.outletId &&
          order.session_id === (data.sessionId ?? null),
        "SESSION_MISMATCH",
        "The order belongs to another session.",
        409,
      );
      ensure(
        data.version !== undefined,
        "VERSION_REQUIRED",
        "Refresh the order before adding another round.",
      );
      expectedVersion(order.version, data.version);
      await tx.query(
        "UPDATE orders SET version=version+1,status=$2 WHERE id=$1",
        [orderId, data.draft ? order.status : "PENDING"],
      );
    } else {
      orderId = id();
      await assertPlatformNewOrder(tx,!actor.application||actor.application==='MASTER');
      await tx.query(
        "INSERT INTO orders(id,restro_id,outlet_id,session_id,source,type,created_by,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          orderId,
          actor.restroId,
          data.outletId,
          data.sessionId ?? null,
          actor.role === "WAITER" ? "WAITER" : "CASHIER_POS",
          data.type,
          actor.employeeId,
          data.draft ? "DRAFT" : "PENDING",
        ],
      );
    }
    if (data.customer) {
      const bound = await bindCustomer(
        tx,
        actor.restroId,
        data.customer.name,
        data.customer.phone,
      );
      const current = await one(
        tx,
        "SELECT customer_snapshot FROM orders WHERE id=$1",
        [orderId],
      );
      ensure(
        !current.customer_snapshot ||
          (current.customer_snapshot.phone === bound.snapshot.phone &&
            current.customer_snapshot.name === bound.snapshot.name),
        "IDENTITY_LOCKED",
        "Keep the customer details already attached to this order.",
        409,
      );
      await tx.query(
        "UPDATE orders SET customer_id=$2,customer_snapshot=$3::jsonb WHERE id=$1",
        [orderId, bound.customer.id, json(bound.snapshot)],
      );
    }
    const taxPolicy = await one(
      tx,
      "SELECT tax_bps_override,type FROM orders WHERE id=$1",
      [orderId],
    );
    const items = await buildItems(
        tx,
        data.outletId,
        data.items,
        taxPolicy.tax_bps_override,
        false,
        webFlow ? taxPolicy.type : undefined,
      ),
      total = totals(items);
    const sequence = await one(
      tx,
      "SELECT coalesce(max(round_number),0)+1 AS number FROM order_rounds WHERE order_id=$1",
      [orderId],
    );
    const roundId = id();
    await tx.query(
      "INSERT INTO order_rounds(id,restro_id,order_id,round_number,status,course,subtotal,tax,payable,payment_gate) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [
        roundId,
        actor.restroId,
        orderId,
        sequence.number,
        data.draft ? "DRAFT" : "PENDING",
        data.course,
        total.subtotal,
        total.tax,
        total.payable,
        webFlow ? "STAFF" : "LEGACY",
      ],
    );
    await snapshotWebKitchenPolicy(tx,data.outletId,roundId,webFlow);
      const billDefaults=await snapshotWebBillDefaults(tx,data.outletId,roundId,webFlow);
      await insertItems(tx, actor.restroId, roundId, items);
    await audit(tx, actor, {
      action: "ORDER_CREATED",
      entityType: "ORDER_ROUND",
      entityId: roundId,
      outletId: data.outletId,
      newState: {
        orderId,
        round: num(sequence.number),
        status: data.draft ? "DRAFT" : "PENDING",
        ...total,...billDefaults,
      },
    });
    if (webFlow && !data.draft)
      await acceptStaffSubmission(tx, actor, orderId, roundId);
    return orderDetail(tx, actor, orderId);
  });
}
type OrderTotals = {
  subtotal: number;
  discount: number;
  tax: number;
  charges: number;
  roundOff: number;
  payable: number;
  paid: number;
  outstanding: number;
};
export async function orderDetail(
  tx: Sql,
  actor: Actor,
  orderId: string,
): Promise<Row & { rounds: Row[]; totals: OrderTotals; invoices: Row[] }> {
  const order = await scopedOrder(tx, actor, orderId);
  if(!actor.application||actor.application==='MASTER')Object.assign(order,(await tx.query('SELECT pinned,version AS pin_version FROM order_pins WHERE order_id=$1',[orderId])).rows[0]??{pinned:false,pin_version:0});
  const rounds = (
    await tx.query<Row>(
      "SELECT * FROM order_rounds WHERE order_id=$1 ORDER BY round_number",
      [orderId],
    )
  ).rows;
  const webLoyaltyClaims=new Map((!actor.application||actor.application==='MASTER'
    ?(await tx.query("SELECT l.round_id,l.web_reward_name FROM loyalty_reservations l JOIN order_rounds r ON r.id=l.round_id WHERE r.order_id=$1 AND l.state IN ('RESERVED','LOCKED','REDEEMED')",[orderId])).rows
    :[]).map(claim=>[claim.round_id,claim]));
  for (const round of rounds) {
    round.items = (
      await tx.query(
        "SELECT * FROM order_items WHERE round_id=$1 ORDER BY id",
        [round.id],
      )
    ).rows;
    if((actor.application&&actor.application!=='MASTER')||(!can(actor,'inventory')&&!['OWNER','MANAGER','ACCOUNTANT'].includes(actor.role)))for(const item of round.items)delete item.recipe_snapshot;
    if(!actor.application||actor.application==='MASTER')round.coupon_code=(await tx.query("SELECT coalesce(d.code,c.code) AS code FROM coupons c LEFT JOIN web_discount_coupons d ON d.id=c.web_discount_coupon_id AND d.restro_id=c.restro_id WHERE c.round_id=$1 AND c.state IN ('RESERVED','LOCKED','REDEEMED') LIMIT 1",[round.id])).rows[0]?.code??null;
    if(!actor.application||actor.application==='MASTER'){
      const loyalty=webLoyaltyClaims.get(round.id);
      round.loyalty_amount=loyalty?Math.max(0,num(round.discount)-num(round.manual_discount)):0;
      round.loyalty_name=round.loyalty_amount>0?(loyalty?.web_reward_name??'Loyalty'):null;
    }
    round.payments = (
      await tx.query(
        "SELECT id,method,amount,state,reference,created_at,verified_at FROM payment_attempts WHERE round_id=$1 ORDER BY created_at",
        [round.id],
      )
    ).rows;
  }
  const total = rounds
    .filter((r) => !["REJECTED", "VOIDED"].includes(r.status))
    .reduce<Omit<OrderTotals, "outstanding">>(
      (t, r) => ({
        subtotal: t.subtotal + num(r.subtotal),
        discount: t.discount + num(r.discount),
        tax: t.tax + num(r.tax),
        charges: t.charges + num(r.charges_total),
        roundOff: t.roundOff + num(r.round_off),
        payable: t.payable + num(r.payable),
        paid: t.paid + num(r.paid),
      }),
      {
        subtotal: 0,
        discount: 0,
        tax: 0,
        charges: 0,
        roundOff: 0,
        payable: 0,
        paid: 0,
      },
    );
  const invoices = (
    await tx.query<Row>(
      "SELECT * FROM invoices WHERE order_id=$1 ORDER BY created_at DESC",
      [orderId],
    )
  ).rows;
  const deviceAccess =
    can(actor, "security") && ["CUSTOMER_QR", "D2C"].includes(order.source)
      ? ((
          await tx.query(
            "SELECT d.version,d.banned_until,d.ban_reason,coalesce(d.banned_until>now(),false) AS blocked FROM customer_order_devices l JOIN customer_devices d ON d.restro_id=l.restro_id AND d.outlet_id=l.outlet_id AND d.device_hash=l.device_hash WHERE l.order_id=$1 AND l.outlet_id=$2",
            [orderId, order.outlet_id],
          )
        ).rows[0] ?? null)
      : null;
  return {
    ...order,
    table: order.session_id ? ((await tx.query<Row>(
      "SELECT t.id,t.label,t.floor FROM table_sessions s JOIN dining_tables t ON t.id=s.table_id AND t.restro_id=s.restro_id WHERE s.id=$1 AND s.outlet_id=$2",
      [order.session_id, order.outlet_id],
    )).rows[0] ?? null) : null,
    rounds,
    totals: { ...total, outstanding: total.payable - total.paid },
    invoices,
    ...(!actor.application||actor.application==='MASTER'?{replacements:(await tx.query('SELECT id,source_order_id,target_order_id,amount,original_payable,snapshot->>\'number\' AS number FROM web_replacements WHERE source_order_id=$1 OR target_order_id=$1',[orderId])).rows}:{}),
    ...(!actor.application||actor.application==='MASTER'?{refund_total:num((await one(tx,'SELECT coalesce(sum(amount),0) AS amount FROM web_refunds WHERE order_id=$1',[orderId])).amount)}:{}),
    deviceAccess,
    customerVisits: order.customer_id
      ? Number(
          (
            await one(
              tx,
              "SELECT count(*) AS visits FROM orders WHERE customer_id=$1 AND outlet_id=$2 AND status='SETTLED'",
              [order.customer_id, order.outlet_id],
            )
          ).visits,
        )
      : 0,
  };
}
export async function editRound(
  db: Database,
  actor: Actor,
  key: string,
  orderId: string,
  roundId: string,
  input: unknown,
  webFlow = false,
) {
  requirePermission(actor, "orders");
  const data = z
    .object({
      version: z.number().int(),
      items: z.array(lineSchema).min(1).max(100),
      submit: z.boolean().default(false),
    })
    .strict()
    .parse(input);
  return command(
    db,
    actor,
    key,
    "ORDER_EDITED",
    { orderId, roundId, ...data },
    async (tx) => {
      const order = await scopedOrder(tx, actor, orderId, true),
        round = await one(
          tx,
          "SELECT * FROM order_rounds WHERE id=$1 AND order_id=$2 FOR UPDATE",
          [roundId, orderId],
        );
      expectedVersion(round.version, data.version);
      ensure(
        !["SETTLED", "VOIDED", "REJECTED"].includes(order.status) &&
          (["DRAFT", "PENDING"].includes(round.status) ||
            (webFlow &&
              (round.staff_entered ||
                ["CASHIER_POS", "WAITER"].includes(order.source)) &&
              round.status === "ACCEPTED" &&
              round.kot_status === "HELD" &&
              !round.postpaid_authorized)),
        "ROUND_LOCKED",
        "Accepted rounds are locked. Use Add More for additional items.",
        409,
      );
      ensure(
        num(round.paid) === 0,
        "PAYMENT_ACTIVE",
        "A paid round cannot be edited.",
        409,
      );
      ensure(
        !(
          await tx.query(
            "SELECT id FROM payment_attempts WHERE round_id=$1 AND state NOT IN ('FAILED','REJECTED') LIMIT 1",
            [roundId],
          )
        ).rows.length,
        "PAYMENT_ACTIVE",
        "Reconcile existing payments before editing items.",
        409,
      );
      if (round.status === "ACCEPTED") await releaseStock(tx, roundId);
      const items = await buildItems(
          tx,
          order.outlet_id,
          data.items,
          order.tax_bps_override,
          false,
          webFlow ? order.type : undefined,
        ),
        total = totals(items, 0, num(round.charges_total));
      await resetRewards(tx, roundId);
      await tx.query("DELETE FROM order_items WHERE round_id=$1", [roundId]);
      await insertItems(tx, actor.restroId, roundId, items);
      await tx.query(
        "UPDATE order_rounds SET subtotal=$2,tax=$3,payable=$4,discount=0,manual_discount=0,round_off=0,rounding_enabled=false,version=version+1,quote_version=NULL,status=$5 WHERE id=$1",
        [
          roundId,
          total.subtotal,
          total.tax,
          total.payable,
          data.submit ? "PENDING" : round.status,
        ],
      );
      await tx.query(
        "UPDATE orders SET version=version+1,status=$2 WHERE id=$1",
        [orderId, data.submit ? "PENDING" : order.status],
      );
      const reduction = total.payable < num(round.payable);
      await audit(tx, actor, {
        action:
          order.bill_print_count > 0 && reduction
            ? "MODIFIED_AFTER_PROVISIONAL_BILL"
            : "ORDER_EDITED",
        entityType: "ORDER_ROUND",
        entityId: roundId,
        outletId: order.outlet_id,
        oldState: { payable: num(round.payable) },
        newState: total,
        impact: total.payable - num(round.payable),
        risk: order.bill_print_count > 0 && reduction ? "CRITICAL" : "INFO",
        reason: "Draft item changes",
      });
      if (
        webFlow &&
        (data.submit || round.status === "ACCEPTED") &&
        (round.staff_entered ||
          ["CASHIER_POS", "WAITER"].includes(order.source))
      )
        await acceptStaffSubmission(tx, actor, orderId, roundId);
      return orderDetail(tx, actor, orderId);
    },
  );
}
export async function decideRound(
  db: Database,
  actor: Actor,
  key: string,
  orderId: string,
  roundId: string,
  input: unknown,
  webFlow = false,
) {
  requirePermission(actor, "accept");
  const data = z
    .object({
      version: z.number().int(),
      decision: z.enum(["ACCEPT", "REJECT"]),
      reason: z.string().trim().max(500).default(""),
    })
    .strict()
    .parse(input);
  return command(
    db,
    actor,
    key,
    "ORDER_DECISION",
    { orderId, roundId, ...data },
    async (tx) => {
      const order = await scopedOrder(tx, actor, orderId, true),
        round = await one(
          tx,
          "SELECT * FROM order_rounds WHERE id=$1 AND order_id=$2 FOR UPDATE",
          [roundId, orderId],
        );
      expectedVersion(round.version, data.version);
      const legacyOrderOnly=webFlow&&(!actor.application||actor.application==='MASTER')&&order.source==='CUSTOMER_QR'&&!round.staff_entered&&round.payment_gate==='LEGACY'&&!!(await tx.query("SELECT id FROM outlets WHERE id=$1 AND qr_enabled AND qr_payment_mode='ORDER_ONLY'",[order.outlet_id])).rows.length;
      const releaseAcceptedLegacy=legacyOrderOnly&&round.status==='ACCEPTED'&&round.kot_status==='HELD'&&data.decision==='ACCEPT';
      ensure(
        round.status === "PENDING" || releaseAcceptedLegacy,
        "INVALID_STATE",
        "Only pending rounds can be accepted or rejected.",
        409,
      );
      if (data.decision === "REJECT") {
        ensure(
          data.reason.length >= 3,
          "REASON_REQUIRED",
          "Enter a reason for rejection.",
        );
        await resetRewards(tx, roundId);
      } else if(!releaseAcceptedLegacy) await reserveStock(tx, actor.restroId, roundId, order.outlet_id);
      if(legacyOrderOnly&&data.decision==='ACCEPT'){
        ensure(!(await tx.query("SELECT id FROM payment_attempts WHERE round_id=$1 AND state IN ('INITIATED','UNKNOWN','AWAITING_VERIFICATION')",[roundId])).rows.length,'PAYMENT_RECONCILIATION_REQUIRED','Reconcile the active payment before releasing this legacy round.',409);
        await tx.query("UPDATE order_rounds SET payment_gate='QR_ORDER_ONLY' WHERE id=$1",[roundId]);
      }
      await tx.query(
        "UPDATE order_rounds SET status=$2,version=version+1,rejection_reason=$3,quote_version=NULL WHERE id=$1",
        [
          roundId,
          data.decision === "ACCEPT" ? "ACCEPTED" : "REJECTED",
          data.reason || null,
        ],
      );
      await tx.query(
        "UPDATE orders SET version=version+1,status=CASE WHEN EXISTS(SELECT 1 FROM order_rounds WHERE order_id=$1 AND status='PENDING') THEN 'PENDING' WHEN EXISTS(SELECT 1 FROM order_rounds WHERE order_id=$1 AND status='ACCEPTED') THEN 'ACCEPTED' ELSE 'REJECTED' END WHERE id=$1",
        [orderId],
      );
      if (data.decision === "ACCEPT" && order.customer_id && !releaseAcceptedLegacy)
        await evaluateEntitlements(tx, actor, orderId, roundId);
      if (data.decision === "ACCEPT" && (round.payment_gate === "QR_ORDER_ONLY"||legacyOrderOnly))
        await releaseKot(tx, actor, order, { ...round, status: "ACCEPTED",payment_gate:'QR_ORDER_ONLY' });
      await audit(tx, actor, {
        action:
          data.decision === "ACCEPT" ? "ORDER_ACCEPTED" : "ORDER_REJECTED",
        entityType: "ORDER_ROUND",
        entityId: roundId,
        outletId: order.outlet_id,
        reason: data.reason || (legacyOrderOnly?"Staff accepted legacy QR round under the current order-only mode":"Staff accepted order"),
        newState: { status: data.decision },
      });
      return orderDetail(tx, actor, orderId);
    },
  );
}
export async function identityGate(
  db: Database,
  actor: Actor,
  key: string,
  orderId: string,
  roundId: string,
  input: unknown,
) {
  requirePermission(actor, "orders");
  const data = z
    .object({
      version: z.number().int(),
      name: z.string(),
      phone: z.string(),
      marketingConsent: z.boolean().default(false),
    })
    .strict()
    .parse(input);
  const name = customerName(data.name),
    phone = normalizePhone(data.phone);
  return command(
    db,
    actor,
    key,
    "CUSTOMER_IDENTITY_BOUND",
    { orderId, roundId, ...data },
    async (tx) => {
      const order = await scopedOrder(tx, actor, orderId, true);
      expectedVersion(order.version, data.version);
      ensure(
        !["SETTLED", "VOIDED", "REJECTED"].includes(order.status),
        "ORDER_LOCKED",
        "Identity on a closed order cannot be changed.",
        409,
      );
      await one(tx, "SELECT id FROM order_rounds WHERE id=$1 AND order_id=$2", [
        roundId,
        orderId,
      ]);
      const changed =
        order.customer_snapshot &&
        (order.customer_snapshot.phone !== phone ||
          order.customer_snapshot.name !== name);
      if (changed) {
        const attempts = await tx.query(
          "SELECT id FROM payment_attempts WHERE order_id=$1 AND state NOT IN ('REJECTED','FAILED') LIMIT 1",
          [orderId],
        );
        const released = await tx.query(
          "SELECT id FROM order_rounds WHERE order_id=$1 AND kot_status<>'HELD' LIMIT 1",
          [orderId],
        );
        ensure(
          !attempts.rows.length && !released.rows.length,
          "IDENTITY_LOCKED",
          "Identity cannot change while a payment or kitchen authorization exists.",
          409,
        );
        const rounds = (
          await tx.query<Row>(
            "SELECT * FROM order_rounds WHERE order_id=$1 AND paid=0 FOR UPDATE",
            [orderId],
          )
        ).rows;
        for (const round of rounds) {
          await resetRewards(tx, round.id);
          const items = (
            await tx.query<Row>("SELECT * FROM order_items WHERE round_id=$1", [
              round.id,
            ])
          ).rows;
          const total = totals(
            items,
            num(round.manual_discount),
            num(round.charges_total),
          );
          const roundOff = roundAdjustment(
            total.payable,
            round.rounding_enabled,
            round.rounding_mode,
          );
          await tx.query(
            "UPDATE order_rounds SET discount=manual_discount,tax=$2,payable=$3,round_off=$4,quote_version=NULL,version=version+1 WHERE id=$1",
            [round.id, total.tax, total.payable + roundOff, roundOff],
          );
        }
      }
      const { customer, inserted, snapshot } = await bindCustomer(
        tx,
        actor.restroId,
        name,
        phone,
        data.marketingConsent,
      );
      await tx.query(
        "UPDATE orders SET customer_id=$2,customer_snapshot=$3::jsonb,version=version+1 WHERE id=$1",
        [orderId, customer.id, json(snapshot)],
      );
      await audit(tx, actor, {
        action: inserted
          ? "CUSTOMER_PROFILE_CREATED"
          : "CUSTOMER_PROFILE_SELECTED",
        entityType: "CUSTOMER",
        entityId: customer.id,
        outletId: order.outlet_id,
        newState: {
          orderId,
          name,
          phone: phone.slice(0, 5) + "••••••" + phone.slice(-2),
          otpVerified: customer.otp_verified,
        },
      });
      const entitlements = await evaluateEntitlements(
        tx,
        actor,
        orderId,
        roundId,
      );
      return { order: await orderDetail(tx, actor, orderId), entitlements };
    },
  );
}
export async function evaluateEntitlements(
  tx: Sql,
  actor: Actor,
  orderId: string,
  roundId: string,
) {
  const order = await scopedOrder(tx, actor, orderId);
  ensure(
    order.customer_id,
    "IDENTITY_REQUIRED",
    "Customer name and phone are required before rewards and payment.",
  );
  const round = await one(
    tx,
    "SELECT * FROM order_rounds WHERE id=$1 AND order_id=$2",
    [roundId, orderId],
  );
  const outlet = await one(tx, "SELECT * FROM outlets WHERE id=$1", [
    order.outlet_id,
  ]);
  const balance = await one(
    tx,
    "SELECT coalesce(sum(points),0) AS points FROM loyalty_ledger WHERE customer_id=$1 AND state<>'PENDING_EARN'",
    [order.customer_id],
  );
  const reserved = await one(
    tx,
    "SELECT coalesce(sum(points),0) AS points FROM loyalty_reservations WHERE customer_id=$1 AND state IN ('RESERVED','LOCKED') AND (reserved_until IS NULL OR reserved_until>now())",
    [order.customer_id],
  );
  const coupons = (
    await tx.query<Row>(
      "SELECT id,code,discount_amount,minimum_amount,expires_at FROM coupons WHERE outlet_id=$1 AND web_discount_coupon_id IS NULL AND expires_at>now() AND minimum_amount<=$2 AND (customer_id IS NULL OR customer_id=$3) AND (state='AVAILABLE' OR (state='RESERVED' AND (reserved_until<now() OR round_id=$4)))",
      [order.outlet_id, round.subtotal, order.customer_id, roundId],
    )
  ).rows;
  await tx.query("UPDATE order_rounds SET quote_version=version WHERE id=$1", [
    roundId,
  ]);
  const points = Math.max(0, Math.floor(
    ((num(round.payable) - num(round.tax)) * num(outlet.earn_bps)) / 1_000_000,
  ) - (num(round.round_number)===1 ? await replacementEarnedPoints(tx,orderId):0));
  await tx.query(
    "INSERT INTO loyalty_ledger(id,restro_id,outlet_id,customer_id,order_id,round_id,state,points,reason) VALUES($1,$2,$3,$4,$5,$6,'PENDING_EARN',$7,'Estimated before settlement') ON CONFLICT(round_id,state) DO UPDATE SET customer_id=EXCLUDED.customer_id,points=EXCLUDED.points",
    [
      id(),
      actor.restroId,
      order.outlet_id,
      order.customer_id,
      orderId,
      roundId,
      points,
    ],
  );
  return {
    spendablePoints: Math.max(0, num(balance.points) - num(reserved.points)),
    ...(!actor.application||actor.application==='MASTER'?{webLoyalty:await webLoyaltyLimit(tx,order,round,outlet,Math.max(0,num(balance.points)-num(reserved.points)))}:{}),
    estimatedEarn: points,
    coupons,
    otpThreshold: num(outlet.otp_threshold),
    quoteVersion: num(round.version),
  };
}
export async function applyEntitlement(
  db: Database,
  actor: Actor,
  key: string,
  orderId: string,
  roundId: string,
  input: unknown,
  webFlow=false,
) {
  requirePermission(actor, "orders");
  const data = z
    .object({
      version: z.number().int(),
      couponId: z.uuid().nullable().optional(),
      couponCode:z.string().trim().min(1).max(80).optional(),
      amount:z.number().int().min(0).max(1000000000).optional(),
      points: z.number().int().min(0).max(100000).default(0),
    })
    .strict()
    .parse(input);
  ensure(webFlow||(!data.couponCode&&data.amount===undefined),'APPLICATION_FORBIDDEN','Use the web reward workflow for rupee claims or coupon codes.',403);
  ensure(!webFlow||!actor.application||actor.application==='MASTER','APPLICATION_FORBIDDEN','Use the application reward workflow.',403);
  return command(
    db,
    actor,
    key,
    "ENTITLEMENT_RESERVED",
    { orderId, roundId, ...data },
    async (tx) => {
      const order = await scopedOrder(tx, actor, orderId, true);
      ensure(
        order.customer_id,
        "IDENTITY_REQUIRED",
        "Add customer details before choosing rewards.",
      );
      const round = await one(
        tx,
        "SELECT * FROM order_rounds WHERE id=$1 AND order_id=$2 FOR UPDATE",
        [roundId, orderId],
      );
      expectedVersion(round.version, data.version);
      ensure(
        num(round.paid) === 0 &&
          (round.kot_status === "HELD" ||
            (["STAFF", "QR_ORDER_ONLY"].includes(round.payment_gate) &&
              round.payment_status !== "PAID")) &&
          ["PENDING", "ACCEPTED"].includes(round.status),
        "QUOTE_LOCKED",
        "Rewards cannot change after payment or kitchen authorization.",
        409,
      );
      const active = (
        await tx.query(
          "SELECT id FROM payment_attempts WHERE round_id=$1 AND state NOT IN ('FAILED','REJECTED')",
          [roundId],
        )
      ).rows;
      ensure(
        !active.length,
        "PAYMENT_ACTIVE",
        "Reconcile the active payment before changing rewards.",
        409,
      );
      ensure(!(data.couponId&&data.couponCode),'INVALID_COUPON','Use a coupon code or a selected coupon, not both.');
      let webCouponId:string|undefined;
      if(data.couponCode){
        const definitions=(await tx.query('SELECT id FROM web_discount_coupons WHERE outlet_id=$1 AND lower(code)=lower($2)',[order.outlet_id,data.couponCode])).rows;
        const matches=(await tx.query('SELECT id FROM coupons WHERE outlet_id=$1 AND web_discount_coupon_id IS NULL AND lower(code)=lower($2)',[order.outlet_id,data.couponCode])).rows;
        ensure(definitions.length+matches.length===1,'COUPON_NOT_FOUND','Enter one unambiguous eligible coupon code.',422);
        if(definitions.length)webCouponId=String(definitions[0].id);else data.couponId=String(matches[0].id);
      }
      if(data.couponId){const token=(await tx.query('SELECT web_discount_coupon_id FROM coupons WHERE id=$1 AND outlet_id=$2',[data.couponId,order.outlet_id])).rows[0];if(token?.web_discount_coupon_id)webCouponId=String(token.web_discount_coupon_id);}
      ensure(!webCouponId||webFlow,'APPLICATION_FORBIDDEN','Discount coupon codes are available in the web app only.',403);
      ensure(
        !((data.couponId||webCouponId) && (data.points||data.amount)),
        "STACKING_NOT_ALLOWED",
        "Choose either a coupon or points.",
      );
      const customer = await one(
          tx,
          "SELECT * FROM customers WHERE id=$1 FOR UPDATE",
          [order.customer_id],
        ),
        outlet = await one(tx, "SELECT * FROM outlets WHERE id=$1", [
          order.outlet_id,
        ]);
      if(data.amount!==undefined){const pointValue=num(outlet.point_value_paise);ensure(data.points===0&&pointValue>0&&data.amount%pointValue===0,'INVALID_REDEMPTION','Enter an amount in valid point-value increments.');data.points=data.amount/pointValue;}
      // Lock both definitions in stable order before resetting/reusing their tokens.
      // Concurrent coupon switches must use the same definition-before-token order as payment.
      await tx.query("SELECT id FROM web_discount_coupons WHERE id=$1 OR id IN (SELECT web_discount_coupon_id FROM coupons WHERE round_id=$2 AND state IN ('RESERVED','LOCKED')) ORDER BY id FOR UPDATE",[webCouponId??null,roundId]);
      const priorLoyalty=webFlow&&data.points?(await tx.query("SELECT points,web_reward_name FROM loyalty_reservations WHERE round_id=$1 AND state IN ('RESERVED','LOCKED')",[roundId])).rows[0]:undefined;
      await resetRewards(tx, roundId);
      let discount = 0;
      let loyaltyName:string|null=null;
      if(webCouponId)data.couponId=await reserveWebDiscountCoupon(tx,actor,order.outlet_id,webCouponId,customer.id);
      if (data.couponId) {
        const coupon = await one(
          tx,
          "SELECT * FROM coupons WHERE id=$1 AND outlet_id=$2 FOR UPDATE",
          [data.couponId, order.outlet_id],
        );
        ensure(
          new Date(coupon.expires_at).getTime() > Date.now() &&
            (!coupon.customer_id || coupon.customer_id === customer.id),
          "COUPON_INELIGIBLE",
          "This coupon is unavailable.",
        );
        ensure(
          coupon.state === "AVAILABLE" ||
            (coupon.state === "RESERVED" &&
              new Date(coupon.reserved_until).getTime() < Date.now()),
          "TOKEN_RESERVED",
          "This token is reserved by another order.",
          409,
        );
        ensure(
          num(round.subtotal) >= num(coupon.minimum_amount),
          "MINIMUM_SPEND",
          "This order does not meet the coupon minimum.",
        );
        discount = Math.min(num(coupon.discount_amount), num(round.subtotal));
        ensure(
          webFlow || discount <= num(outlet.otp_threshold) || customer.otp_verified,
          "OTP_REQUIRED",
          "Verify the customer’s phone before using this reward.",
        );
        await tx.query(
          "UPDATE coupons SET state='RESERVED',round_id=$2,round_version=$3,reserved_until=now()+interval '10 minutes' WHERE id=$1",
          [coupon.id, roundId, num(round.version) + 1],
        );
      }
      if (data.points) {
        ensure(
          webFlow || customer.otp_verified,
          "OTP_REQUIRED",
          "Phone verification is required to redeem loyalty points.",
        );
        const balance = await evaluateEntitlements(tx, actor, orderId, roundId);
        ensure(
          balance.spendablePoints >= data.points,
          "INSUFFICIENT_POINTS",
          "There are not enough spendable points.",
        );
        discount = data.points * num(outlet.point_value_paise);
        if(webFlow){const limit=await webLoyaltyLimit(tx,order,round,outlet,balance.spendablePoints);ensure(discount<=limit.maxRedemptionAmount,'REDEMPTION_CAP','The selected amount exceeds the remaining per-bill loyalty limit.',409);}
        ensure(
          discount <=
            Math.min(
              num(outlet.max_redemption_paise),
              Math.floor(
                (num(round.subtotal) * num(outlet.max_redemption_bps)) / 10000,
              ),
            ),
          "REDEMPTION_CAP",
          "The selected points exceed this order’s redemption limit.",
        );
        loyaltyName=webFlow?(priorLoyalty&&num(priorLoyalty.points)===data.points?priorLoyalty.web_reward_name??'Loyalty':outlet.web_loyalty_name):null;
        await tx.query(
          "INSERT INTO loyalty_reservations(id,restro_id,outlet_id,customer_id,round_id,points,reserved_until,web_reward_name) VALUES($1,$2,$3,$4,$5,$6,now()+interval '10 minutes',$7) ON CONFLICT(round_id) DO UPDATE SET customer_id=EXCLUDED.customer_id,points=EXCLUDED.points,state='RESERVED',reserved_until=EXCLUDED.reserved_until,web_reward_name=EXCLUDED.web_reward_name",
          [
            id(),
            actor.restroId,
            order.outlet_id,
            customer.id,
            roundId,
            data.points,
            loyaltyName,
          ],
        );
      }
      const items = (
          await tx.query<Row>("SELECT * FROM order_items WHERE round_id=$1", [
            roundId,
          ])
        ).rows,
        total = totals(items, discount, num(round.charges_total)),
        roundOff = roundAdjustment(
          total.payable,
          round.rounding_enabled,
          round.rounding_mode,
        ),
        payable = total.payable + roundOff;
      await tx.query(
        "UPDATE order_rounds SET subtotal=$2,discount=$3,manual_discount=0,tax=$4,payable=$5,round_off=$6,version=version+1,quote_version=version+1 WHERE id=$1",
        [roundId, total.subtotal, discount, total.tax, payable, roundOff],
      );
      await tx.query("UPDATE orders SET version=version+1 WHERE id=$1", [
        orderId,
      ]);
      await audit(tx, actor, {
        action:
          order.bill_print_count > 0 && discount
            ? "MODIFIED_AFTER_PROVISIONAL_BILL"
            : "TOKEN_RESERVED",
        entityType: "ORDER_ROUND",
        entityId: roundId,
        outletId: order.outlet_id,
        newState: {
          couponId: data.couponId,
          points: data.points,
          ...(webFlow?{loyaltyName}:{}),
          ...total,
          payable,
          roundOff,
        },
        risk: order.bill_print_count > 0 && discount ? "CRITICAL" : "INFO",
        impact: payable - num(round.payable),
      });
      const entitlements = await evaluateEntitlements(
        tx,
        actor,
        orderId,
        roundId,
      );
      return { order: await orderDetail(tx, actor, orderId), entitlements };
    },
  );
}
export async function releaseKot(
  tx: Sql,
  actor: Actor,
  order: Row,
  round: Row,
) {
  if (round.kot_status !== "HELD") return;
  ensure(
    round.status === "ACCEPTED",
    "ORDER_NOT_ACCEPTED",
    "Staff must accept this round before kitchen release.",
    409,
  );
  ensure(
    num(round.paid) === num(round.payable) ||
      round.postpaid_authorized ||
      ["STAFF", "QR_ORDER_ONLY"].includes(round.payment_gate),
    "PAYMENT_REQUIRED",
    "Required authorization is missing.",
    409,
  );
  const cost = await consumeStock(
    tx,
    actor.restroId,
    round.id,
    order.outlet_id,
    actor.employeeId,
  );
  const stations = (
    await tx.query<Row>(
      "SELECT i.station,i.production_stream,bool_and(m.ready_food_batch_id IS NOT NULL) AS prepared FROM order_items i JOIN menu_items m ON m.id=i.item_id AND m.restro_id=i.restro_id WHERE i.round_id=$1 GROUP BY i.station,i.production_stream",
      [round.id],
    )
  ).rows;
  const skipKitchenStages=round.web_kitchen_stages_enabled===false;
  for (const station of stations)
    await tx.query(
      "INSERT INTO kot_tickets(id,restro_id,outlet_id,order_id,round_id,station,production_stream,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(round_id,station,production_stream) DO NOTHING",
      [
        id(),
        actor.restroId,
        order.outlet_id,
        order.id,
        round.id,
        station.station,
        station.production_stream,
        (skipKitchenStages||station.prepared) ? "READY" : "RELEASED",
      ],
    );
  await tx.query("UPDATE order_rounds SET kot_status=$3,cogs=$2 WHERE id=$1", [
    round.id,
    cost,
    (skipKitchenStages||stations.every((station) => station.prepared)) ? "READY" : "RELEASED",
  ]);
  if (skipKitchenStages||stations.every((station) => station.prepared))
    await refreshOrderStatus(tx, order.id);
  await audit(tx, actor, {
    action: "KOT_RELEASED",
    entityType: "ORDER_ROUND",
    entityId: round.id,
    outletId: order.outlet_id,
    newState: {
      authorized: num(round.paid),
      payable: num(round.payable),
      postpaid: round.postpaid_authorized,
      paymentGate: round.payment_gate,
      kitchenStagesBypassed:skipKitchenStages,
      stations: stations.map((s) => s.station),
    },
  });
  if(skipKitchenStages)await audit(tx,actor,{action:"KOT_READY",entityType:"ORDER_ROUND",entityId:round.id,outletId:order.outlet_id,newState:{kitchenStagesBypassed:true,explicitServiceRequired:true},reason:"New round follows saved kitchen workflow; serving remains an explicit staff action"});
}

export async function acceptStaffSubmission(
  tx: Sql,
  actor: Actor,
  orderId: string,
  roundId: string,
) {
  requirePermission(actor, "accept");
  const order = await scopedOrder(tx, actor, orderId, true);
  const round = await one(
    tx,
    "SELECT * FROM order_rounds WHERE id=$1 AND order_id=$2 FOR UPDATE",
    [roundId, orderId],
  );
  ensure(
    ["DRAFT", "PENDING", "ACCEPTED"].includes(round.status),
    "INVALID_STATE",
    "This round cannot be submitted.",
    409,
  );
  await reserveStock(tx, actor.restroId, roundId, order.outlet_id);
  await tx.query(
    "UPDATE order_rounds SET status='ACCEPTED',staff_entered=true,version=version+1,quote_version=NULL WHERE id=$1",
    [roundId],
  );
  await refreshOrderStatus(tx, orderId);
  if (order.customer_id)
    await evaluateEntitlements(tx, actor, orderId, roundId);
  if (round.payment_gate === "STAFF") {
    const accepted = await one(tx, "SELECT * FROM order_rounds WHERE id=$1", [
      roundId,
    ]);
    await releaseKot(tx, actor, order, accepted);
  }
  await audit(tx, actor, {
    action: "ORDER_ACCEPTED",
    entityType: "ORDER_ROUND",
    entityId: roundId,
    outletId: order.outlet_id,
    newState: { status: "ACCEPTED" },
    reason: "Authenticated staff submitted the round in the web app",
  });
}
