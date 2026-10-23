import {lockWebCouponDefinition} from './web-discount-coupons';
import { z } from "zod";
import type { Database, Sql } from "@dinerdost/database";
import { ensure, requirePermission, type Actor } from "@dinerdost/core";
import {
  audit,
  command,
  expectedVersion,
  one,
  scopedOrder,
  num,
  type Row,
} from "./shared";
import { evaluateEntitlements, orderDetail, releaseKot } from "./orders";
export async function lockRewardReservations(tx: Sql, round: Row) {
  const webDefinition=await lockWebCouponDefinition(tx,round.id);
  const coupon = (
    await tx.query<Row>(
      "SELECT *,reserved_until>clock_timestamp() AS reservation_current FROM coupons WHERE round_id=$1 AND state IN ('RESERVED','LOCKED') FOR UPDATE",
      [round.id],
    )
  ).rows[0];
  const loyalty = (
    await tx.query<Row>(
      "SELECT *,reserved_until>clock_timestamp() AS reservation_current FROM loyalty_reservations WHERE round_id=$1 AND state IN ('RESERVED','LOCKED') FOR UPDATE",
      [round.id],
    )
  ).rows[0];
  ensure(
    num(round.discount) === num(round.manual_discount) || coupon || loyalty,
    "REWARD_EXPIRED",
    "The reward reservation expired. Recalculate rewards before authorization.",
    409,
  );
  if (coupon) {
    ensure(!webDefinition||coupon.state==='LOCKED'||(webDefinition.active&&webDefinition.unexpired),'REWARD_EXPIRED','This coupon expired or was removed. Choose an eligible reward before authorization.',409);
    ensure(
      num(coupon.round_version) === num(round.version) &&
        (coupon.state === "LOCKED" || coupon.reservation_current),
      "REWARD_EXPIRED",
      "The coupon reservation expired or belongs to an earlier version.",
      409,
    );
    await tx.query(
      "UPDATE coupons SET state='LOCKED',reserved_until=NULL WHERE id=$1",
      [coupon.id],
    );
  }
  if (loyalty) {
    ensure(
      loyalty.state === "LOCKED" || loyalty.reservation_current,
      "REWARD_EXPIRED",
      "The points reservation expired. Recalculate rewards.",
      409,
    );
    await tx.query(
      "UPDATE loyalty_reservations SET state='LOCKED',reserved_until=NULL WHERE id=$1",
      [loyalty.id],
    );
  }
}
export async function reviewRewards(
  db: Database,
  actor: Actor,
  key: string,
  orderId: string,
  roundId: string,
) {
  requirePermission(actor, "orders");
  return command(
    db,
    actor,
    key,
    "REWARDS_EVALUATED",
    { orderId, roundId },
    async (tx) => {
      const order = await scopedOrder(tx, actor, orderId, true);
      ensure(
        !["SETTLED", "VOIDED", "REJECTED"].includes(order.status),
        "ORDER_LOCKED",
        "This order is closed.",
        409,
      );
      const entitlements = await evaluateEntitlements(
        tx,
        actor,
        orderId,
        roundId,
      );
      await audit(tx, actor, {
        action: "REWARDS_EVALUATED",
        entityType: "ORDER_ROUND",
        entityId: roundId,
        outletId: order.outlet_id,
        newState: {
          estimatedEarn: entitlements.estimatedEarn,
          availableCoupons: entitlements.coupons.length,
        },
      });
      return { order: await orderDetail(tx, actor, orderId), entitlements };
    },
  );
}
export async function releaseZeroTotal(
  db: Database,
  actor: Actor,
  key: string,
  orderId: string,
  roundId: string,
  input: unknown,
) {
  requirePermission(actor, "payments");
  const data = z.object({ version: z.number().int() }).strict().parse(input);
  return command(
    db,
    actor,
    key,
    "ZERO_TOTAL_AUTHORIZED",
    { orderId, roundId, ...data },
    async (tx) => {
      const order = await scopedOrder(tx, actor, orderId, true);
      ensure(
        order.customer_id,
        "IDENTITY_REQUIRED",
        "Customer details are required.",
      );
      const round = await one(
        tx,
        "SELECT * FROM order_rounds WHERE id=$1 AND order_id=$2 FOR UPDATE",
        [roundId, orderId],
      );
      expectedVersion(round.version, data.version);
      ensure(
        Number(round.payable) === 0 && round.quote_version === round.version,
        "INVALID_QUOTE",
        "A current zero-value quote is required.",
      );
      await lockRewardReservations(tx, round);
      await tx.query(
        "UPDATE order_rounds SET payment_status='PAID' WHERE id=$1",
        [roundId],
      );
      await releaseKot(tx, actor, order, round);
      await audit(tx, actor, {
        action: "ZERO_TOTAL_AUTHORIZED",
        entityType: "ORDER_ROUND",
        entityId: roundId,
        outletId: order.outlet_id,
      });
      return orderDetail(tx, actor, orderId);
    },
  );
}
