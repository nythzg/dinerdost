import {settledRefundsRead} from './web-refunds';
import {replacementAdjustmentsRead} from './web-replacements';
import {isPlatformLoyaltyAdmin} from './web-loyalty';
import type { Database } from "@dinerdost/database";
import {
  can,
  businessDate,
  ensure,
  maskPhone,
  requireOutlet,
  requirePermission,
  type Actor,
} from "@dinerdost/core";
import { canonical, hash, num, one, type Row } from "./shared";
import { orderDetail } from "./orders";
import { reservationReadModel } from "./reservations";
import { expireIdleTables } from "./table-activity";
import { actorStream } from "./operational-access";
import { stockAlertsRead } from "./stock-reports";
import { stockCountStatusRead } from "./stock-counts";
import { expireInventory } from "./stock-expiry";
import { orderSummary } from "./order-summary";
export async function workspace(db: Database, actor: Actor, outletId?: string) {
  const stream = actorStream(actor);
  return db.transaction(actor.restroId, async (tx) => {
    const restaurant = await one(
      tx,
      "SELECT id,name,slug,is_demo FROM restaurants WHERE id=$1",
      [actor.restroId],
    );
    const outlets = (
      await tx.query<Row>(
        "SELECT * FROM outlets WHERE ($1 OR id=ANY($2::uuid[])) ORDER BY code",
        [actor.role === "OWNER", actor.outletIds],
      )
    ).rows;
    const selected = outletId ?? outlets[0]?.id;
    ensure(
      selected,
      "OUTLET_REQUIRED",
      "Ask the owner to assign an outlet.",
      403,
    );
    requireOutlet(actor, selected);
    ensure(
      outlets.some((o) => o.id === selected),
      "NOT_FOUND",
      "Outlet unavailable.",
      404,
    );
    const result: Row = {
      actor: { ...actor, ip: undefined, sessionHash: undefined },
      restaurant,
      outlets,
      outletId: selected,
      ...(!actor.application||actor.application==='MASTER'?{platformLoyaltyAdmin:isPlatformLoyaltyAdmin(actor)}:{}),
    };
    await expireIdleTables(tx, actor.restroId, selected);
    await expireInventory(tx, actor.restroId, selected);
    if (can(actor, "inventory") || can(actor, "orders"))
      result.stockCountStatus = await stockCountStatusRead(tx, actor, selected);
    if (can(actor, "reports"))
      result.metrics = await one(
        tx,
        `SELECT
      (SELECT coalesce(sum(r.paid),0) FROM orders o JOIN order_rounds r ON r.order_id=o.id AND r.restro_id=o.restro_id JOIN invoices v ON v.order_id=o.id AND v.restro_id=o.restro_id AND v.document_type='FINAL_TAX_INVOICE' WHERE o.outlet_id=$1 AND o.status='SETTLED' AND (v.created_at AT TIME ZONE 'Asia/Kolkata')::date=(now() AT TIME ZONE 'Asia/Kolkata')::date) AS settled,
      (SELECT count(*) FROM orders WHERE outlet_id=$1 AND (created_at AT TIME ZONE 'Asia/Kolkata')::date=(now() AT TIME ZONE 'Asia/Kolkata')::date) AS orders,
      (SELECT count(*) FROM orders WHERE outlet_id=$1 AND type='DINE_IN' AND (created_at AT TIME ZONE 'Asia/Kolkata')::date=(now() AT TIME ZONE 'Asia/Kolkata')::date) AS "dineIn",
      (SELECT count(*) FROM orders WHERE outlet_id=$1 AND type='TAKEAWAY' AND (created_at AT TIME ZONE 'Asia/Kolkata')::date=(now() AT TIME ZONE 'Asia/Kolkata')::date) AS takeaway,
      (SELECT count(*) FROM table_sessions WHERE outlet_id=$1 AND status<>'CLOSED') AS active,
      (SELECT count(*) FROM orders WHERE outlet_id=$1 AND status NOT IN ('SETTLED','VOIDED','REJECTED')) AS pending`,
        [selected],
      );
    if (can(actor, "orders") || can(actor, "menu") || can(actor, "catalog")) {
      result.menu = (
        await tx.query(
          "SELECT m.*,b.on_hand-b.reserved AS ready_quantity,b.expires_at AS ready_use_by FROM menu_items m LEFT JOIN prepared_food_batches b ON b.id=m.ready_food_batch_id AND b.restro_id=m.restro_id WHERE m.outlet_id=$1 AND (m.ready_food_batch_id IS NULL OR (b.on_hand>b.reserved AND b.expires_at>now() AND m.active)) ORDER BY (m.ready_food_batch_id IS NOT NULL) DESC,m.category,m.name",
          [selected],
        )
      ).rows;
      result.categories = (
        await tx.query(
          "SELECT * FROM menu_categories WHERE outlet_id=$1 ORDER BY name",
          [selected],
        )
      ).rows;
    }
    if (can(actor, "sessions")) {
      result.assignmentEmployees = (
        await tx.query(
          "SELECT id,name,role FROM employees WHERE active=true AND (role='OWNER' OR $1=ANY(outlet_ids)) ORDER BY name",
          [selected],
        )
      ).rows;
      result.readyTickets = (
        await tx.query(
          "SELECT k.id,k.order_id,k.round_id,k.station,k.production_stream,r.kot_status AS round_kot_status,o.number,t.label AS table_label,s.owner_employee_id,coalesce(p.pinned,false) AS pinned FROM kot_tickets k JOIN orders o ON o.id=k.order_id AND o.restro_id=k.restro_id LEFT JOIN order_pins p ON p.order_id=o.id AND p.restro_id=o.restro_id JOIN order_rounds r ON r.id=k.round_id AND r.restro_id=k.restro_id LEFT JOIN table_sessions s ON s.id=o.session_id AND s.restro_id=o.restro_id LEFT JOIN dining_tables t ON t.id=s.table_id AND t.restro_id=s.restro_id WHERE k.outlet_id=$1 AND k.status='READY' ORDER BY coalesce(p.pinned,false) DESC,k.created_at LIMIT 100",
          [selected],
        )
      ).rows;
      result.reservations = await reservationReadModel(tx, selected);
      if (["OWNER", "MANAGER", "WAITER"].includes(actor.role))
        result.reservationNotices = (
          await tx.query(
            "SELECT b.id,b.starts_at,b.ends_at,t.label AS table_label,r.data->>'guest' AS guest FROM table_reservations b JOIN records r ON r.id=b.id AND r.restro_id=b.restro_id JOIN dining_tables t ON t.id=b.table_id AND t.restro_id=b.restro_id WHERE b.outlet_id=$1 AND b.state='HELD' AND b.starts_at<=now()+interval '30 minutes' AND b.ends_at>now() AND EXISTS(SELECT 1 FROM table_sessions s WHERE s.table_id=b.table_id AND s.restro_id=b.restro_id AND s.status<>'CLOSED') ORDER BY b.starts_at",
            [selected],
          )
        ).rows;
      result.tables = (
        await tx.query(
          "SELECT t.*,EXISTS(SELECT 1 FROM table_sessions s WHERE s.table_id=t.id AND s.restro_id=t.restro_id AND s.status<>'CLOSED') AS is_occupied FROM dining_tables t WHERE t.outlet_id=$1 AND t.retired_at IS NULL ORDER BY t.floor,t.label",
          [selected],
        )
      ).rows;
      result.floorPlans = (
        await tx.query(
          "SELECT * FROM floor_plans WHERE outlet_id=$1 ORDER BY floor",
          [selected],
        )
      ).rows;
      result.sessions = (
        await tx.query(
          "SELECT s.*,t.label AS table_label,e.name AS owner_name FROM table_sessions s JOIN dining_tables t ON t.id=s.table_id AND t.restro_id=s.restro_id JOIN employees e ON e.id=s.owner_employee_id AND e.restro_id=s.restro_id WHERE s.outlet_id=$1 AND s.status<>'CLOSED' AND ($2 OR s.owner_employee_id=$3) ORDER BY s.opened_at",
          [selected, actor.role !== "WAITER", actor.employeeId],
        )
      ).rows;
      result.tasks = (
        await tx.query(
          "SELECT r.*,t.label AS table_label FROM service_requests r LEFT JOIN table_sessions s ON s.id=r.session_id AND s.restro_id=r.restro_id JOIN dining_tables t ON t.id=COALESCE(s.table_id,r.table_id) AND t.restro_id=r.restro_id WHERE r.outlet_id=$1 AND ($2 OR s.owner_employee_id=$3 OR (s.id IS NULL AND (r.owner_id IS NULL OR r.owner_id=$3))) ORDER BY r.created_at DESC LIMIT 100",
          [selected, actor.role !== "WAITER", actor.employeeId],
        )
      ).rows;
    }
    if (
      can(actor, "orders") ||
      can(actor, "payments") ||
      can(actor, "reports")
    ) {
      const summary = await orderSummary(tx, actor, selected);
      result.orderCounts = summary.counts;
      result.orders = (
        await tx.query<Row>(
          `SELECT o.*,t.label AS table_label,coalesce(p.pinned,false) AS pinned,coalesce(p.version,0) AS pin_version,coalesce(r.payable,0) AS payable,coalesce(r.paid,0) AS paid,coalesce(r.round_count,0) AS round_count FROM orders o LEFT JOIN order_pins p ON p.order_id=o.id AND p.restro_id=o.restro_id LEFT JOIN table_sessions s ON s.id=o.session_id AND s.restro_id=o.restro_id LEFT JOIN dining_tables t ON t.id=s.table_id AND t.restro_id=s.restro_id LEFT JOIN LATERAL(SELECT sum(payable) AS payable,sum(paid) AS paid,count(*) AS round_count FROM order_rounds WHERE order_id=o.id AND status NOT IN ('REJECTED','VOIDED')) r ON true WHERE o.outlet_id=$1 AND ($2 OR s.owner_employee_id=$3) ORDER BY coalesce(p.pinned,false) DESC,o.created_at DESC,o.id DESC LIMIT 200`,
          [selected, actor.role !== "WAITER", actor.employeeId],
        )
      ).rows.map((o) => ({
        ...o,
        reallocated: summary.reallocated.has(o.id),
        customer_snapshot: o.customer_snapshot
          ? {
              ...o.customer_snapshot,
              phone: maskPhone(o.customer_snapshot.phone),
            }
          : null,
      }));
    }
    if (can(actor, "payments"))
      result.payments = (
        await tx.query(
          "SELECT p.*,o.number FROM payment_attempts p JOIN orders o ON o.id=p.order_id AND o.restro_id=p.restro_id WHERE p.outlet_id=$1 ORDER BY p.created_at DESC LIMIT 200",
          [selected],
        )
      ).rows;
    if (can(actor, "bill") || can(actor, "finance"))
      result.invoices = (
        await tx.query(
          "SELECT id,number,order_id,document_type,created_at,snapshot FROM invoices WHERE outlet_id=$1 ORDER BY created_at DESC LIMIT 200",
          [selected],
        )
      ).rows;
    if (can(actor, "kitchen")) {
      result.tickets = (
        await tx.query<Row>(
          "SELECT k.*,o.number,t.label AS table_label,coalesce(p.pinned,false) AS pinned,r.course,r.round_number FROM kot_tickets k JOIN orders o ON o.id=k.order_id AND o.restro_id=k.restro_id LEFT JOIN order_pins p ON p.order_id=o.id AND p.restro_id=o.restro_id JOIN order_rounds r ON r.id=k.round_id AND r.restro_id=k.restro_id LEFT JOIN table_sessions s ON s.id=o.session_id AND s.restro_id=o.restro_id LEFT JOIN dining_tables t ON t.id=s.table_id AND t.restro_id=s.restro_id WHERE k.outlet_id=$1 AND k.status NOT IN ('SERVED','CANCELLED') AND ($2::text IS NULL OR k.production_stream=$2) AND ($3 OR r.web_kitchen_stages_enabled IS DISTINCT FROM false) ORDER BY coalesce(p.pinned,false) DESC,k.created_at",
          [selected, stream,!!actor.application&&actor.application!=="MASTER"],
        )
      ).rows;
      for (const ticket of result.tickets)
        ticket.items = (
          await tx.query(
            "SELECT name,quantity_milli,note,variant,modifiers FROM order_items WHERE round_id=$1 AND station=$2 AND ($3='LEGACY' OR production_stream=$3)",
            [ticket.round_id, ticket.station, ticket.production_stream],
          )
        ).rows;
    }
    if (
      can(actor, "payments") &&
      (!actor.application || actor.application === "MASTER")
    )
      result.kotPrintTickets = (
        await tx.query(
          "SELECT id,order_id,round_id,auto_print_requested_at FROM kot_tickets WHERE outlet_id=$1 AND status NOT IN ('SERVED','CANCELLED') AND ($2::text IS NULL OR production_stream=$2) ORDER BY created_at,id",
          [selected, stream],
        )
      ).rows;
    if(result.metrics){const refunds=await settledRefundsRead(tx,[selected],businessDate(),businessDate()),replacements=await replacementAdjustmentsRead(tx,[selected],businessDate(),businessDate());result.metrics.gross_settled=result.metrics.settled;result.metrics.refunds=num(refunds.amount);result.metrics.replacementCredits=num(replacements.amount);result.metrics.settled=num(result.metrics.settled)-num(refunds.amount)-num(replacements.amount);}
    if (can(actor, "inventory") || can(actor, "procurement")) {
      if (can(actor, "inventory"))
        result.stockAlerts = await stockAlertsRead(tx, actor, selected);
      result.ingredients = (
        await tx.query(
          "SELECT i.*,coalesce(b.on_hand,0) AS on_hand,coalesce(b.reserved,0) AS reserved,coalesce(b.value,0) AS value FROM ingredients i LEFT JOIN LATERAL(SELECT sum(on_hand) AS on_hand,sum(reserved) AS reserved,sum(coalesce(remaining_value,on_hand*unit_cost/1000)) AS value FROM stock_batches WHERE ingredient_id=i.id) b ON true WHERE i.outlet_id=$1 AND i.retired_at IS NULL ORDER BY i.name",
          [selected],
        )
      ).rows;
      result.batches = (
        await tx.query(
          "SELECT b.*,i.name,i.unit FROM stock_batches b JOIN ingredients i ON i.id=b.ingredient_id AND i.restro_id=b.restro_id WHERE b.outlet_id=$1 ORDER BY b.received_at,b.id",
          [selected],
        )
      ).rows;
      if(!actor.application||actor.application==='MASTER')result.purchasePacks=(await tx.query('SELECT p.* FROM ingredient_purchase_packs p JOIN ingredients i ON i.id=p.ingredient_id AND i.restro_id=p.restro_id WHERE p.outlet_id=$1 AND p.active AND i.retired_at IS NULL AND ($2::text IS NULL OR i.production_stream=$2) ORDER BY p.name,p.id',[selected,stream])).rows;
      result.recipes = (
        await tx.query(
          "SELECT r.*,i.name AS ingredient_name,m.name AS item_name FROM recipes r JOIN menu_items m ON m.id=r.item_id AND m.restro_id=r.restro_id JOIN ingredients i ON i.id=r.ingredient_id AND i.restro_id=r.restro_id WHERE m.outlet_id=$1 ORDER BY m.name,i.name",
          [selected],
        )
      ).rows;
      result.movements = (
        await tx.query(
          "SELECT s.*,i.name FROM stock_movements s JOIN ingredients i ON i.id=s.ingredient_id AND i.restro_id=s.restro_id WHERE s.outlet_id=$1 ORDER BY s.created_at DESC LIMIT 100",
          [selected],
        )
      ).rows;
    }
    if (can(actor, "customers"))
      result.customers = (
        await tx.query<Row>(
          "SELECT c.id,c.name,c.phone,c.otp_verified,c.marketing_consent,c.created_at,coalesce(l.points,0) AS points,coalesce(o.visits,0) AS visits,coalesce(o.spend,0) AS spend FROM customers c LEFT JOIN LATERAL(SELECT sum(points) AS points FROM loyalty_ledger WHERE customer_id=c.id AND state<>'PENDING_EARN') l ON true LEFT JOIN LATERAL(SELECT count(*) AS visits,sum((SELECT sum(paid) FROM order_rounds WHERE order_id=o.id)) AS spend FROM orders o WHERE o.customer_id=c.id AND o.status='SETTLED') o ON true WHERE EXISTS(SELECT 1 FROM orders WHERE customer_id=c.id AND outlet_id=$1) ORDER BY c.created_at DESC LIMIT 200",
          [selected],
        )
      ).rows.map((c) => ({ ...c, phone: maskPhone(c.phone) }));
    if (can(actor, "ownChecklists")) result.ownChecklists = true;
    if (can(actor, "attendance") || can(actor, "ownAttendance")) {
      result.ownAttendance = can(actor, "ownAttendance");
      result.shifts = (
        await tx.query(
          "SELECT * FROM employee_shifts WHERE outlet_id=$1 ORDER BY starts_local,name",
          [selected],
        )
      ).rows;
      result.attendance = (
        await tx.query(
          "SELECT a.*,e.name AS employee_name,s.name AS shift_name FROM employee_attendance a JOIN employees e ON e.id=a.employee_id AND e.restro_id=a.restro_id JOIN employee_shifts s ON s.id=a.shift_id AND s.restro_id=a.restro_id WHERE a.outlet_id=$1 AND (NOT $2 OR a.employee_id=$3) ORDER BY a.business_date DESC,e.name LIMIT 500",
          [selected, can(actor, "ownAttendance"), actor.employeeId],
        )
      ).rows;
      if (can(actor, "ownAttendance"))
        result.assignmentEmployees = [
          { id: actor.employeeId, name: actor.name, role: actor.role },
        ];
    }
    if (can(actor, "team")) {
      result.employees = (
        await tx.query(
          "SELECT e.id,e.name,e.role,e.outlet_ids,e.active,e.base_salary,e.version,e.created_at FROM employees e ORDER BY e.name",
        )
      ).rows;
      result.staffInvitations = (
        await tx.query(
          "SELECT id,name,email,role,outlet_ids,expires_at,state FROM staff_invitations WHERE state='PENDING' AND expires_at>now() ORDER BY created_at DESC",
        )
      ).rows;
    }
    if (can(actor, "settings"))
      result.storefronts = (
        await tx.query(
          "SELECT * FROM storefronts WHERE outlet_id=$1 ORDER BY slug",
          [selected],
        )
      ).rows;
    if (can(actor, "audit"))
      result.audit = (
        await tx.query(
          "SELECT * FROM audit_events WHERE ($1 OR (outlet_id=$2 AND actor_role<>'OWNER' AND entity_type NOT IN ('PAYROLL','TAX','EMPLOYEE'))) ORDER BY sequence DESC LIMIT 200",
          [actor.role === "OWNER", selected],
        )
      ).rows;
    if (actor.role === "OWNER" && can(actor, "audit"))
      result.alerts = (
        await tx.query(
          "SELECT id,outlet_id,event,state,payload,created_at FROM notifications WHERE event='OWNER_RED_FLAG' AND ($1 OR outlet_id=$2) ORDER BY created_at DESC LIMIT 100",
          [actor.role === "OWNER", selected],
        )
      ).rows;
    if (stream) {
      const barItem = (item: Row) => item.production_stream === "BAR";
      result.menu = result.menu?.filter(
        (item: Row) => barItem(item) === (stream === "BAR"),
      );
      result.categories = result.categories?.filter((category: Row) =>
        result.menu?.some((item: Row) => item.category === category.name),
      );
      result.ingredients = result.ingredients?.filter(
        (ingredient: Row) => ingredient.production_stream === stream,
      );
      const allowedIngredients = new Set(
        result.ingredients?.map((ingredient: Row) => ingredient.id),
      );
      const allowedMenu = new Set(result.menu?.map((item: Row) => item.id));
      result.batches = result.batches?.filter((batch: Row) =>
        allowedIngredients.has(batch.ingredient_id),
      );
      result.movements = result.movements?.filter((movement: Row) =>
        allowedIngredients.has(movement.ingredient_id),
      );
      result.recipes = result.recipes?.filter(
        (recipe: Row) =>
          allowedIngredients.has(recipe.ingredient_id) &&
          allowedMenu.has(recipe.item_id),
      );
    }
    result.uiDismissals=(await tx.query("SELECT kind,state_key FROM ui_alert_dismissals WHERE employee_id=$1 AND outlet_id=$2",[actor.employeeId,selected])).rows.map(row=>row.kind+":"+row.state_key);
    return result;
  });
}
export async function getOrder(db: Database, actor: Actor, orderId: string) {
  requirePermission(actor, "orders");
  return db.transaction(actor.restroId, (tx) =>
    orderDetail(tx, actor, orderId),
  );
}
export async function getInvoice(
  db: Database,
  actor: Actor,
  invoiceId: string,
) {
  ensure(
    can(actor, "bill") || can(actor, "finance"),
    "FORBIDDEN",
    "Your role cannot view invoices.",
    403,
  );
  return db.transaction(actor.restroId, async (tx) => {
    const invoice = await one(tx, "SELECT * FROM invoices WHERE id=$1", [
      invoiceId,
    ]);
    requireOutlet(actor, invoice.outlet_id);
    if (actor.role === "WAITER") await orderDetail(tx, actor, invoice.order_id);
    return invoice;
  });
}
export async function verifyAudit(db: Database, actor: Actor) {
  requirePermission(actor, "audit");
  ensure(
    actor.role === "OWNER",
    "FORBIDDEN",
    "Only the owner can verify the entire audit chain.",
    403,
  );
  return db.transaction(actor.restroId, async (tx) => {
    const events = (
      await tx.query<Row>("SELECT * FROM audit_events ORDER BY sequence")
    ).rows;
    let previous = "GENESIS",
      sequence = 0;
    for (const row of events) {
      sequence++;
      const event = {
        id: row.id,
        restroId: row.restro_id,
        outletId: row.outlet_id,
        sequence: num(row.sequence),
        actorId: row.actor_id,
        actorName: row.actor_name,
        actorRole: row.actor_role,
        authMethod: row.auth_method,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        oldState: row.old_state,
        newState: row.new_state,
        reason: row.reason,
        impact: num(row.financial_impact),
        risk: row.risk,
        tableId: row.table_id,
        deviceId: row.device_id,
        ip: row.ip,
        occurredAt: new Date(row.occurred_at).toISOString(),
        previousHash: row.previous_hash,
      };
      if (
        num(row.sequence) !== sequence ||
        row.previous_hash !== previous ||
        hash(canonical(event)) !== row.record_hash
      )
        return { valid: false, checked: sequence, failedAt: row.sequence };
      previous = row.record_hash;
    }
    const head = await one(tx, "SELECT * FROM audit_heads WHERE restro_id=$1", [
      actor.restroId,
    ]);
    return {
      valid: head.hash === previous && num(head.sequence) === sequence,
      checked: sequence,
      head: previous,
    };
  });
}
