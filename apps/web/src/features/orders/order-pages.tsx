"use client";
import {Refunds,RefundApprovals} from "./refunds";
import {RewardEntry} from "./reward-entry";
import { T } from "@/lib/staff-language";
import { AdjustmentsEditor } from "./adjustments-editor";
import { TaxSettings } from "./tax-settings";
import { useActivity } from "@/components/activity-filter";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  can,
  isManager,
  taxBreakdown,
  paymentMethods,
  paymentMethodNames,
  type PaymentMethod,
} from "@dinerdost/core";
import { Badge, DataTable, Empty, Icon } from "@/components/ui";
import { date, label, money, request, type Row } from "@/lib/client";
import { useDesk } from "../workspace/context";
import { DeviceBanControl } from "./device-ban-control";
import { RoundEditor } from "./round-editor";
import { PaymentMethodSettings } from "./payment-method-settings";
import { PaymentRecorder } from "./payment-recorder";
import { IdentityForm } from "../customers/identity-form";
import { ChargesEditor } from "./charges-editor";
import { KotPrintControl } from "./kot-printer";
import { ClearTableButton } from "../tables/clear-table-button";
import { OrderIngredientUsage } from "../management/inventory-tools";
import { OrderActionsMenu } from "./order-actions-menu";
import {
  PreparedCancellation,
  SelectedRoundActions,
} from "./selected-round-actions";
export function Orders() {
  const { data, go } = useDesk();
  const [status, setStatus] = useState("Active"),
    [search, setSearch] = useState("");
  const orders = (data.orders ?? []).filter(
    (o: Row) =>
      (status === "All" ||
        (status === "Settled" && o.status === "SETTLED") ||
        (status === "Cancelled" &&
          ["VOIDED", "CANCELLED"].includes(o.status)) ||
        (status === "Reallocated" && o.reallocated) ||
        (status === "Active" &&
          !["SETTLED", "VOIDED", "REJECTED", "CANCELLED"].includes(o.status)) ||
        o.status === status.toUpperCase()) &&
      `${o.number} ${o.table_label ?? ""} ${o.customer_snapshot?.name ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div className="orders-view">
      <div className="order-summary-row" role="group" aria-label="Order counts">
        {["Active","Accepted","Pending","Cancelled","Rejected","Settled","Reallocated","All"].map(s=><button key={s} aria-pressed={s===status} data-view={s} onClick={()=>setStatus(s)}><span><T>{s==='All'?'All orders':s}</T></span><strong>{data.orderCounts?.[s]??0}</strong></button>)}
      </div>
    <section className="panel orders-panel">
      <div className="panel-heading">
        <div
          className="tabs order-filter-tabs"
          role="group"
          aria-label="Filter orders"
        >
          {[
            "Active",
            "Accepted",
            "Pending",
            "Cancelled",
            "Rejected",
            "Settled",
            "Reallocated",
            "All",
          ].map((s) => (
            <button
              key={s}
              className={s === status ? "selected" : ""}
              aria-pressed={s === status}
              data-view={s}
              onClick={() => setStatus(s)}
            >
              <span>
                <T>{s === "All" ? "All orders" : s}</T>
              </span>
            </button>
          ))}
        </div>
        <Link href="/app/pos" className="button primary">
          <Icon name="plus" />
          <T>{"New order"}</T>
        </Link>
      </div>
      <div className="panel-tools">
        <div className="search-box">
          <Icon name="search" />
          <input
            placeholder="Search order, table or guest"
            aria-label="Search orders"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <small>Counts include all orders · Latest 200 listed</small>
      </div>
      <DataTable
        headers={[
          "Order",
          "Table / type",
          "Customer",
          "Amount",
          "Outstanding",
          "Status",
          "Created",
          "",
        ]}
        rows={orders.map((o: Row) => [
          <button
            className="text-button"
            onClick={() => go("/app/orders/" + o.id)}
          >
            {o.pinned&&<span className="vip-order-marker">VIP · </span>}#{o.number}
          </button>,
          o.table_label ?? label(o.type),
          o.customer_snapshot?.name ?? <span className="muted">Not added</span>,
          money(o.payable),
          money(Number(o.payable) - Number(o.paid)),
          <Badge value={o.status} />,
          date(o.created_at),
          <div className="inline-actions"><button
            className="button small"
            aria-label={"Open order " + o.number}
            onClick={() => go("/app/orders/" + o.id)}
          >
            View
          </button><OrderActionsMenu order={o}/></div>,
        ])}
        empty="No orders in this view."
      />
    </section>
    </div>
  );
}
export function OrderDetail({ id, tableBills }: { id: string; tableBills?: Row }) {
  const desk = useDesk(),
    { data, run, form, go, notify, busy, modal } = desk;
  const [order, setOrder] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [rewards, setRewards] = useState<Record<string, Row>>({});
  const load = useCallback(async () => {
    try {
      setOrder(await request("/api/orders/" + id));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    setOrder(null);
    void load();
  }, [load]);
  const action = async (name: string, input?: unknown, extra: Row = {}) => {
    const result = await run(name, input, { orderId: id, ...extra });
    if (result?.rounds) setOrder(result);
    else if (result?.order?.rounds) setOrder(result.order);
    else await load();
    if (result?.entitlements)
      setRewards((previous) => ({
        ...previous,
        [extra.roundId]: result.entitlements,
      }));
    return result;
  };
  if (error) return <Empty>{error}</Empty>;
  if (!order) return <div className="skeleton" aria-label="Loading order" />;
  const unpaidOrder=order.rounds.every((round:Row)=>Number(round.paid)===0&&!round.payments.some((payment:Row)=>!['FAILED','REJECTED'].includes(payment.state)))&&!order.invoices.some((invoice:Row)=>invoice.document_type==='FINAL_TAX_INVOICE');
  const namedCharges = new Map<string, number>();
  for (const round of order.rounds.filter((round: Row) => !["REJECTED", "VOIDED"].includes(round.status)))
    for (const charge of round.charges ?? [])
      namedCharges.set(charge.name, (namedCharges.get(charge.name) ?? 0) + Number(charge.amount));
  const chargeRows: [string, number][] = [...namedCharges];
  const unnamedCharges = Number(order.totals.charges) - chargeRows.reduce((sum, [, amount]) => sum + amount, 0);
  if (unnamedCharges) chargeRows.push(["Other charges", unnamedCharges]);
  const outlet = data.outlets.find(
    (entry: Row) => entry.id === order.outlet_id,
  );
  const enabledMethods: PaymentMethod[] = outlet?.payment_methods ?? [
    "CASH",
    "MANUAL_UPI",
  ];
  const currentOrder = order,
    locked = ["SETTLED", "VOIDED", "REJECTED"].includes(order.status);
  const liveRounds = order.rounds.filter(
    (round: Row) => !["VOIDED", "REJECTED"].includes(round.status),
  );
  const editableRound=(r:Row)=>['DRAFT','PENDING','ACCEPTED'].includes(r.status)&&r.payment_status!=='PAID'&&Number(r.paid)<Math.max(1,Number(r.payable))&&!order.invoices.some((invoice:Row)=>invoice.document_type==='FINAL_TAX_INVOICE')&&!r.payments.some((p:Row)=>['INITIATED','AWAITING_VERIFICATION','UNKNOWN'].includes(p.state));
  const chargeRounds =
    !locked && data.actor.role === "OWNER"
      ? liveRounds.filter(editableRound)
      : [];
  const customer = () => {
    const round =
      order.rounds.find((r: Row) => r.status === "ACCEPTED") ?? order.rounds[0];
    desk.modal(
      "Customer details",
      <IdentityForm
        order={currentOrder}
        roundId={round.id}
        save={(input, roundId) => action("identity", input, { roundId })}
      />,
    );
  };
  const settle = () => {
    const steps: {
      key: string;
      text: string;
      button?: string;
      perform?: () => void;
    }[] = [];
    const review = (round: Row) => {
      desk.close();
      document
        .getElementById("round-" + round.id)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    if (!order.customer_id)
      steps.push({
        key: "customer",
        text: "Add the customer name and phone.",
        button: "Add details",
        perform: customer,
      });
    for (const round of order.rounds) {
      if (["VOIDED", "REJECTED"].includes(round.status)) continue;
      const prefix = "Round " + round.round_number + ": ";
      if (round.status !== "ACCEPTED") {
        steps.push({
          key: round.id,
          text: prefix + "submit and accept, or reject this round.",
          button: "Review round",
          perform: () => review(round),
        });
        continue;
      }
      const attempt = round.payments.find((payment: Row) =>
        ["AWAITING_VERIFICATION", "UNKNOWN", "INITIATED"].includes(
          payment.state,
        ),
      );
      if (attempt)
        steps.push({
          key: round.id + "-payment",
          text: prefix + "resolve the existing payment receipt.",
          button: "Resolve receipt",
          perform: () =>
            resolvePaymentForm(desk, attempt, (values) =>
              action("verifyPayment", values, { id: attempt.id }),
            ),
        });
      else if (
        Number(round.payable) === 0 &&
        ["STAFF", "QR_ORDER_ONLY"].includes(round.payment_gate) &&
        round.payment_status !== "PAID"
      )
        steps.push({
          key: round.id + "-payment",
          text: prefix + "review the zero-total bill before settlement.",
          button: "Review payment",
          perform: () => review(round),
        });
      else if (Number(round.paid) !== Number(round.payable))
        steps.push({
          key: round.id + "-payment",
          text:
            prefix +
            money(Number(round.payable) - Number(round.paid)) +
            " is outstanding.",
          button: "Review payment",
          perform: () => review(round),
        });
      if (round.kot_status === "READY")
        steps.push({
          key: round.id + "-serve",
          text: prefix + "ready to serve.",
          button: "Mark served",
          perform: () =>
            void action("serve", undefined, { roundId: round.id })
              .then(() => desk.close())
              .catch(() => {}),
        });
      else if (round.kot_status !== "SERVED")
        steps.push({
          key: round.id + "-serve",
          text:
            prefix +
            (round.kot_status === "HELD"
              ? "kitchen authorization is still held."
              : "waiting for kitchen preparation."),
          ...(can(data.actor.role, "kitchen") && round.kot_status !== "HELD"
            ? {
                button: "Open kitchen",
                perform: () => {
                  desk.close();
                  go("/app/kitchen");
                },
              }
            : {}),
        });
    }
    if (steps.length) {
      desk.modal(
        "Before settlement",
        <div className="settlement-checklist">
          {steps.map((step) => (
            <div key={step.key}>
              <span>{step.text}</span>
              {step.perform && (
                <button className="button small" onClick={step.perform}>
                  {step.button}
                </button>
              )}
            </div>
          ))}
        </div>,
      );
      return;
    }
    void action("bill", { final: true })
      .then(() => notify("Order settled. Invoice is ready."))
      .catch(() => {});
  };
  return (
    <>
      {order.table && <p className="order-table-heading"><T>Table</T> {order.table.label}</p>}
      {(order.replacements??[]).map((r:Row)=><p className="panel" key={r.id}>Paid replacement · <a className="text-button" href={'/replacement/'+r.id} target="_blank" rel="noreferrer">{r.number}</a> · <Link className="text-button" href={'/app/orders/'+(r.source_order_id===order.id?r.target_order_id:r.source_order_id)}>{r.source_order_id===order.id?'Open replacement order':'Original order'}</Link> · Payment credit {money(r.amount)}</p>)}
      <div className="detail-toolbar">
        <Link className="subtle-link" href="/app/orders">
          <T>{"All orders"}</T>
        </Link>
        <div className="inline-actions">
          {order.pinned&&<span className="vip-order-marker vip-order">VIP · Pinned</span>}
          <OrderActionsMenu order={order} changed={()=>void load()}/>
          <Badge value={order.status} />
          {can(data.actor,'reports')&&(isManager(data.actor)||data.actor.role==='ACCOUNTANT')&&<button className="button" onClick={()=>modal('Recorded ingredient usage',<OrderIngredientUsage orderId={order.id}/>)}>Ingredient usage</button>}
          {!!chargeRounds.length && (
            <button
              className="button"
              aria-label="Edit other charges"
              onClick={() =>
                desk.modal(
                  "Other charges",
                  <ChargesEditor
                    rounds={chargeRounds}
                    save={async ({ roundId, ...input }) => {
                      await action("orderCharges", input, { roundId });
                      desk.close();
                    }}
                  />,
                )
              }
            >
              <T>{"Other charges"}</T>
            </button>
          )}
          {!locked && (
            <button
              className="button"
              onClick={() =>
                go(
                  "/app/pos?order=" +
                    order.id +
                    "&version=" +
                    order.version +
                    (order.session_id ? "&session=" + order.session_id : ""),
                )
              }
            >
              <Icon name="plus" />
              <T>{"Add more"}</T>
            </button>
          )}
          {order.invoices.some(
            (document: Row) => document.document_type === "FINAL_TAX_INVOICE",
          ) &&
            can(data.actor, "bill") && (
              <button
                className="button"
                onClick={() =>
                  go(
                    "/invoice/" +
                      order.invoices.find(
                        (document: Row) =>
                          document.document_type === "FINAL_TAX_INVOICE",
                      ).id,
                  )
                }
              >
                <Icon name="print" />
                <T>{"Invoice"}</T>
              </button>
            )}
          {order.table && order.session_id && <ClearTableButton tableId={order.table.id} sessionId={order.session_id} bills={tableBills}/>}
          {!locked && can(data.actor.role, "payments") && (
            <button className="button primary" disabled={busy} onClick={settle}>
              <T>{"Settle"}</T>
            </button>
          )}
        </div>
      </div>
      <div className="order-layout">
        <div className="rounds">
          <div className="order-summary-strip">
            <div>
              <small>
                <T>{"Order"}</T>
              </small>
              <strong>#{order.number}</strong>
            </div>
            <div>
              <small>
                <T>{"Channel"}</T>
              </small>
              <strong>{label(order.source)}</strong>
            </div>
            <div>
              <small>
                <T>{"Type"}</T>
              </small>
              <strong>{label(order.type)}</strong>
            </div>
            <div>
              <small>
                <T>{"Opened"}</T>
              </small>
              <strong>{date(order.created_at)}</strong>
            </div>
          </div>
          {order.rounds.map((round: Row) => {
            const reward = rewards[round.id];
            const extra = { roundId: round.id };
            const remaining = Number(round.payable) - Number(round.paid);
            const activePayment = round.payments.find((p: Row) =>
              ["AWAITING_VERIFICATION", "UNKNOWN"].includes(p.state),
            );
            return (
              <section
                className="panel round-panel"
                id={"round-" + round.id}
                key={round.id}
              >
                <div className="panel-heading">
                  <h2>
                    <T>{"Round "}</T>
                    {round.round_number} <small>· {label(round.course)}</small>
                  </h2>
                  <Badge value={round.status} />
                </div>
                <DataTable
                  headers={["Item", "Quantity", "Amount"]}
                  rows={round.items.map((item: Row) => [
                    <div>
                      <strong>{item.name}</strong>
                      {item.variant && <small>{item.variant}</small>}
                      {item.note && <small>{item.note}</small>}
                    </div>,
                    Number(item.quantity_milli) / 1000,
                    money(
                      Math.round(
                        (Number(item.unit_price) *
                          Number(item.quantity_milli)) /
                          1000,
                      ),
                    ),
                  ])}
                />
                <div className="round-status">
                  <div>
                    <small>
                      <T>{"Payment"}</T>
                    </small>
                    <Badge value={round.payment_status} />
                  </div>
                  <div>
                    <small>
                      <T>{"Kitchen"}</T>
                    </small>
                    <Badge value={round.kot_status} />
                  </div>
                  <div className="round-total">
                    <small>Round total</small>
                    <strong>{money(round.payable)}</strong>
                  </div>
                </div>
                {reward && (
                  <div className="reward-strip">
                    <Icon name="leaf" />
                    <span>
                      {reward.spendablePoints} spendable points ·{" "}
                      {reward.estimatedEarn} points after settlement
                    </span>
                    <button
                      className="text-button claim-loyalty-button"
                      disabled={round.payment_status === "PAID"}
                      onClick={()=>{void action('reviewRewards',{},extra).then(result=>{const limit=result.entitlements.webLoyalty;modal('Claim loyalty points',<RewardEntry fields={[{name:'amount',label:'Loyalty amount (₹)',type:'number',min:0,max:limit.maxRedemptionAmount/100,step:limit.pointValue/100,value:0,help:'Maximum '+money(limit.maxRedemptionAmount)+' for this round; '+money(limit.remainingOrderCap)+' remains on this bill. Verified phone required. Replaces any coupon.'}]} save={values=>action('reward',{version:result.order.rounds.find((r:Row)=>r.id===round.id).version,amount:Math.round(Number(values.amount)*100)},extra)} submit="Claim loyalty"/>) }).catch(()=>{})}}
                    >
                      <T>{"Claim loyalty points"}</T>
                    </button>
                  </div>
                )}
                <div className="round-actions">
                  {(["DRAFT", "PENDING"].includes(round.status) ||
                    (round.status === "ACCEPTED" &&
                      (round.staff_entered ||
                        ["CASHIER_POS", "WAITER"].includes(order.source)) &&
                      round.kot_status === "HELD" &&
                      Number(round.paid) === 0 &&
                      !round.postpaid_authorized)) &&
                    !locked && (
                      <button
                        className="button"
                        onClick={() =>
                          desk.modal(
                            "Edit round " + round.round_number,
                            <RoundEditor
                              round={round}
                              save={(input) =>
                                action("editRound", input, extra)
                              }
                            />,
                          )
                        }
                      >
                        {round.status === "DRAFT"
                          ? "Edit & submit draft"
                          : "Edit items"}
                      </button>
                    )}
                  {round.status === "PENDING" &&
                    can(data.actor.role, "accept") && (
                      <>
                        <button
                          className="button primary"
                          disabled={busy}
                          onClick={() =>
                            void action(
                              "decideRound",
                              { version: round.version, decision: "ACCEPT" },
                              extra,
                            ).catch(() => {})
                          }
                        >
                          <T>{"Accept round"}</T>
                          <Icon name="check" />
                        </button>
                        <button
                          className="button"
                          onClick={() =>
                            form(
                              "Reject round",
                              [
                                {
                                  name: "reason",
                                  label: "Reason",
                                  type: "textarea",
                                },
                              ],
                              (v) =>
                                action(
                                  "decideRound",
                                  {
                                    ...v,
                                    version: round.version,
                                    decision: "REJECT",
                                  },
                                  extra,
                                ),
                              "Reject round",
                            )
                          }
                        >
                          <T>{"Reject"}</T>
                        </button>
                      </>
                    )}
                  {round.status === "ACCEPTED" && !locked && (
                    <>
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() =>
                          order.customer_id
                            ? void action(
                                "reviewRewards",
                                undefined,
                                extra,
                              ).catch(() => {})
                            : customer()
                        }
                      >
                        <T>Review loyalty</T>
                      </button>
                      {isManager(data.actor) && (
                          <>
                            <button
                              className="button"
                              disabled={busy || round.kot_status !== "READY" || !unpaidOrder}
                              aria-describedby={!unpaidOrder ? 'cancel-reason-'+round.id : undefined}
                              title={!unpaidOrder?'Available only for wholly unpaid orders without unresolved payments.':round.kot_status!=='READY'?'Prepared food must be ready before reallocation.':undefined}
                              onClick={() =>
                                modal(
                                  "Reallocate prepared food",
                                  <PreparedCancellation
                                    round={round}
                                    reallocate
                                    save={async (input) => {
                                      await action(
                                        "cancelPrepared",
                                        input,
                                        extra,
                                      );
                                      desk.close();
                                      notify(
                                        "Prepared food is ready to serve.",
                                      );
                                    }}
                                  />,
                                )
                              }
                            >
                              <T>{"Reallocate"}</T>
                            </button>
                            <button
                              className="button"
                              disabled={busy || round.kot_status === "SERVED" || !unpaidOrder}
                              aria-describedby={!unpaidOrder ? 'cancel-reason-'+round.id : undefined}
                              title={!unpaidOrder?'Available only for wholly unpaid orders without unresolved payments.':round.kot_status==='SERVED'?'Served food cannot be cancelled here.':undefined}
                              onClick={() =>
                                round.kot_status === "HELD"
                                  ? form(
                                      "Cancel round",
                                      [
                                        {
                                          name: "reason",
                                          label: "Reason",
                                          type: "textarea",
                                        },
                                      ],
                                      (values) =>
                                        action(
                                          "void",
                                          { version: round.version, ...values },
                                          extra,
                                        ),
                                      "Cancel round",
                                    )
                                  : modal(
                                      "Cancel round",
                                      <PreparedCancellation
                                        round={round}
                                        reallocate={false}
                                        save={async (input) => {
                                          await action(
                                            "cancelPrepared",
                                            input,
                                            extra,
                                          );
                                          desk.close();
                                          notify("Round cancelled.");
                                        }}
                                      />,
                                    )
                              }
                            >
                              <T>{"Cancel"}</T>
                            </button>
                            {!unpaidOrder&&<small className="round-action-reason" id={'cancel-reason-'+round.id}>Cancel and Reallocate require a wholly unpaid order without unresolved payments.</small>}
                          </>
                        )}
                      {can(data.actor.role, "payments") &&
                        remaining > 0 &&
                        !activePayment && (
                          <button
                            className="button primary"
                            onClick={() =>
                              desk.modal(
                                "Receive payment",
                                <PaymentRecorder
                                  methods={enabledMethods}
                                  remaining={remaining}
                                  save={async (values) => {
                                    await action(
                                      "recordPayment",
                                      { ...values, version: round.version },
                                      extra,
                                    );
                                    desk.close();
                                    notify("Payment recorded.");
                                  }}
                                />,
                              )
                            }
                          >
                            Receive {money(remaining)}
                          </button>
                        )}
                      {can(data.actor.role, "payments") &&
                        Number(round.payable) === 0 &&
                        (round.kot_status === "HELD" ||
                          (["STAFF", "QR_ORDER_ONLY"].includes(
                            round.payment_gate,
                          ) &&
                            round.payment_status !== "PAID")) && (
                          <button
                            className="button primary"
                            onClick={() =>
                              void action(
                                "zeroTotal",
                                { version: round.version },
                                extra,
                              ).catch(() => {})
                            }
                          >
                            Authorize zero total
                          </button>
                        )}
                      {isManager(data.actor) &&
                        order.source === "CUSTOMER_QR" &&
                        !round.staff_entered &&
                        outlet?.qr_enabled &&
                        outlet?.qr_payment_mode === "PAYMENT" &&
                        ["QR_PAYMENT","LEGACY"].includes(round.payment_gate) &&
                        round.kot_status === "HELD" && (
                          <button
                            className="button"
                            disabled={busy}
                            onClick={() =>
                              void action(
                                "postpaid",
                                { version: round.version },
                                extra,
                              ).catch(() => {})
                            }
                          >
                            <T>{"Authorize postpaid"}</T>
                          </button>
                        )}
                      {order.source === "CUSTOMER_QR" && !round.staff_entered && round.payment_gate === "LEGACY" && round.kot_status === "HELD" && outlet?.qr_enabled && outlet?.qr_payment_mode === "ORDER_ONLY" && can(data.actor,"accept") && <button className="button primary" disabled={busy} onClick={()=>void action('decideRound',{version:round.version,decision:'ACCEPT'},extra).catch(()=>{})}>Release KOT</button>}
                      {round.kot_status === "READY" && (
                        <button
                          className="button primary"
                          disabled={busy}
                          onClick={() =>
                            void action("serve", undefined, extra).catch(
                              () => {},
                            )
                          }
                        >
                          <T>{"Mark served"}</T>
                          <Icon name="check" />
                        </button>
                      )}
                    </>
                  )}
                  {round.status === "ACCEPTED" && !locked && (
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() =>
                        modal(
                          "Clear all actions",
                          <SelectedRoundActions
                            order={order}
                            round={round}
                            methods={enabledMethods}
                            perform={action}
                          />,
                        )
                      }
                    >
                      <T>{"Clear all actions"}</T>
                    </button>
                  )}
                  {outlet?.kot_print_mode &&
                    outlet.kot_print_mode !== "OFF" &&
                    !["HELD","CANCELLED"].includes(round.kot_status) && (
                      <KotPrintControl orderId={order.id} roundId={round.id} />
                    )}
                </div>
                {round.payments.length > 0 && (
                  <div className="payment-list">
                    {round.payments.map((p: Row) => (
                      <div key={p.id}>
                        <Icon name="payments" />
                        <span>
                          <strong>
                            {money(p.amount)} ·{" "}
                            {paymentMethodNames[p.method as PaymentMethod] ??
                              label(p.method)}
                          </strong>
                          <small>{p.reference ?? date(p.created_at)}</small>
                        </span>
                        <Badge
                          value={p.state === "VERIFIED" ? "RECEIVED" : p.state}
                        />
                        {can(data.actor.role, "payments") &&
                          ["AWAITING_VERIFICATION", "UNKNOWN"].includes(
                            p.state,
                          ) && (
                            <button
                              className="button small"
                              onClick={() =>
                                resolvePaymentForm(desk, p, async (values) =>
                                  action("verifyPayment", values, { id: p.id }),
                                )
                              }
                            >
                              Resolve
                            </button>
                          )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
        <aside className="order-aside">
          <section className="panel">
            <div className="panel-heading">
              <h2>
                <T>{"Customer"}</T>
              </h2>
              {!locked && (
                <button className="text-button" onClick={customer}>
                  {order.customer_id ? "Edit" : "Add details"}
                </button>
              )}
            </div>
            {order.customer_snapshot ? (
              <div className="customer-card">
                <div className="customer-visit-row">
                  <span className="avatar">
                    {order.customer_snapshot.name.slice(0, 1)}
                  </span>
                  <span className="customer-visits">
                    <strong>{order.customerVisits ?? 0}</strong>
                    <T>{"Settled visits"}</T>
                  </span>
                </div>
                <strong>{order.customer_snapshot.name}</strong>
                <span>{order.customer_snapshot.phone}</span>
                <Badge
                  value={
                    order.customer_snapshot.otpVerified
                      ? "PHONE_VERIFIED"
                      : "PHONE_CAPTURED"
                  }
                />
              </div>
            ) : (
              <Empty
                action={
                  <button className="button" onClick={customer}>
                    <T>{"Add customer"}</T>
                  </button>
                }
              >
                Required before payment.
              </Empty>
            )}
            <DeviceBanControl
              access={order.deviceAccess}
              change={(input) => action("deviceBan", input)}
              refresh={load}
            />
          </section>
          <section className="panel total-panel">
            <div className="panel-heading">
              <h2>
                <T>{"Bill summary"}</T>
              </h2>
              {isManager(data.actor)&&<button className="text-button" onClick={()=>form('Future bill rounding',[{name:'roundDown',label:'Round down to ₹1 for new transactions',type:'select',value:outlet?.web_round_down_default?'on':'off',options:[{value:'off',label:'Off'},{value:'on',label:'On'}],help:'Outlet-wide. Applies to future web rounds only. Existing bills and discounts remain unchanged.'}],values=>run('billDefaults',{outletId:order.outlet_id,version:outlet.version,roundDown:values.roundDown==='on'}),'Save rounding default')}>Future rounding: {outlet?.web_round_down_default?'On':'Off'}</button>}
              {!locked &&
                can(data.actor, "bill") &&
                order.rounds.some(editableRound) && (
                  <button
                    className="text-button"
                    onClick={() =>
                      modal(
                        "Bill adjustments",
                        <AdjustmentsEditor
                          rounds={order.rounds.filter(editableRound)}
                          save={(roundId, input) =>
                            action("orderAdjustments", input, { roundId }).then(
                              (result) => {
                                desk.close();
                                return result;
                              },
                            )
                          }
                        />,
                      )
                    }
                  >
                    <T>{"Adjustments"}</T>
                  </button>
                )}
              {data.actor.role === "OWNER" &&
                !["SETTLED", "VOIDED", "REJECTED"].includes(order.status) &&
                order.rounds.every(
                  (round: Row) =>
                    Number(round.paid) === 0 &&
                    (round.kot_status === "HELD" ||
                      (["STAFF", "QR_ORDER_ONLY"].includes(
                        round.payment_gate,
                      ) &&
                        round.payment_status !== "PAID")),
                ) && (
                  <button
                    className="icon-button"
                    aria-label="Edit bill tax"
                    onClick={() =>
                      modal(
                        "Bill tax",
                        <TaxSettings
                          order={order}
                          save={(input) => action("orderTax", input)}
                        />,
                      )
                    }
                  >
                    <Icon name="edit" />
                  </button>
                )}
            </div>
            {[
              ["Subtotal", order.totals.subtotal],
              ["Discount", -order.totals.discount],
              ...(order.tax_components?.length
                ? taxBreakdown(order.totals.tax, order.tax_components).map(
                    (tax) => [tax.name, tax.amount],
                  )
                : [["Tax", order.totals.tax]]),
              ...chargeRows,
              ...(Number(order.totals.roundOff)
                ? [["Round off", order.totals.roundOff]]
                : []),
              ["Total", order.totals.payable],
              [
                "Saved amount",
                Number(order.totals.discount) +
                  Math.max(0, -Number(order.totals.roundOff ?? 0)),
              ],
              ["Received", order.totals.paid],
            ].map(([name, value]) => (
              <div className="total-row" key={name}>
                <span className="tax-row-label">{name}</span>
                <strong>{money(value)}</strong>
              </div>
            ))}
            {order.rounds.some((r:Row)=>r.coupon_code)&&<div className="total-row"><span>Coupon</span><strong>{order.rounds.filter((r:Row)=>r.coupon_code).map((r:Row)=>r.coupon_code).join(', ')}</strong></div>}
            {!locked&&order.customer_id&&can(data.actor,'orders')&&order.rounds.some((r:Row)=>Number(r.paid)===0&&['PENDING','ACCEPTED'].includes(r.status)&&(r.kot_status==='HELD'||['STAFF','QR_ORDER_ONLY'].includes(r.payment_gate)))&&<button className="button full-width" onClick={()=>{const eligible=order.rounds.filter((r:Row)=>Number(r.paid)===0&&r.payment_status!=='PAID'&&['PENDING','ACCEPTED'].includes(r.status)&&(r.kot_status==='HELD'||['STAFF','QR_ORDER_ONLY'].includes(r.payment_gate)));if(!eligible.length)return;modal('Apply coupon',<RewardEntry fields={[...(eligible.length>1?[{name:'roundId',label:'Round',type:'select' as const,value:eligible[0].id,options:eligible.map((r:Row)=>({value:r.id,label:'Round '+r.round_number}))}]:[]),{name:'code',label:'Coupon code',help:'Replaces any loyalty claim on this round.'}]} save={values=>{const r=eligible.find((r:Row)=>r.id===(values.roundId??eligible[0].id));return action('reward',{version:r.version,couponCode:String(values.code).trim(),points:0},{roundId:r.id})}} submit="Apply coupon"/>)}}>Coupon</button>}
            <p className="muted">Loyalty cap: {money(outlet?.web_loyalty_cap_paise??5000)} per bill · managed by Diner Dost.</p>
            {data.platformLoyaltyAdmin&&<button className="text-button" onClick={()=>form('Platform loyalty limit',[{name:'limit',label:'Maximum per bill (₹)',type:'number',min:0,max:10000000,step:.01,value:Number(outlet.web_loyalty_cap_paise)/100,help:'Does not rewrite earlier claims.'}],v=>run('loyaltyCap',{outletId:outlet.id,version:outlet.version,limit:Math.round(v.limit*100)}),'Save loyalty limit')}>Configure loyalty cap</button>}
            {(order.replacements??[]).map((r:Row)=><div className="total-row" key={r.id}><span>{r.source_order_id===order.id?'Credited to replacement':'Included original credit'}</span><strong>{money(r.amount)}</strong></div>)}
            {Number(order.refund_total)>0&&<><div className="total-row"><span>Refunded</span><strong>{money(order.refund_total)}</strong></div><div className="total-row"><span>Net received</span><strong>{money(Number(order.totals.paid)-Number(order.refund_total)-(order.replacements??[]).filter((r:Row)=>r.source_order_id===order.id).reduce((n:number,r:Row)=>n+Number(r.amount),0))}</strong></div></>}
            <div className="total-row grand-total">
              <strong>
                <T>{"Outstanding"}</T>
              </strong>
              <strong>{money(order.totals.outstanding)}</strong>
            </div>
          </section>
          {order.invoices.length > 0 && (
            <section className="panel">
              <div className="panel-heading">
                <h2>
                  <T>{"Documents"}</T>
                </h2>
              </div>
              {order.invoices.map((invoice: Row) => (
                <Link
                  className="document-link"
                  key={invoice.id}
                  href={"/invoice/" + invoice.id}
                >
                  <Icon name="payments" />
                  <span>
                    {invoice.number}
                    <small>{label(invoice.document_type)}</small>
                  </span>
                </Link>
              ))}
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
function resolvePaymentForm(
  desk: ReturnType<typeof useDesk>,
  payment: Row,
  submit: (values: Row) => Promise<any>,
) {
  desk.form(
    "Resolve receipt · " + money(payment.amount),
    [
      {
        name: "decision",
        label: "Receipt decision",
        type: "select",
        value: "VERIFY",
        options: [
          {
            value: "VERIFY",
            label:
              payment.method === "CASH"
                ? "Cash counted and received"
                : "Verified in merchant account",
          },
          { value: "UNKNOWN", label: "Uncertain · keep blocked" },
          { value: "REJECT", label: "No payment received" },
        ],
      },
      {
        name: "reference",
        label: "Merchant / bank reference",
        required: payment.method !== "CASH",
        help:
          payment.method === "MANUAL_UPI"
            ? "Check the merchant account. Customer screenshots are not verification."
            : undefined,
      },
      {
        name: "reason",
        label: "Receipt note",
        value: payment.method === "CASH" ? "Cash counted and received" : "",
      },
    ],
    submit,
    "Record decision",
  );
}
export function Payments() {
  const desk = useDesk(),
    { data, go, run } = desk;
  const [method, setMethod] = useState("All");
  const activity = useActivity(
    "payments",
    true,
    method === "All" ? undefined : method,
  );
  const outlet = data.outlets.find((entry: Row) => entry.id === data.outletId);
  return (
    <section className="panel">
      <div className="panel-heading payment-page-toolbar">
        {isManager(data.actor)&&<button className="button" onClick={()=>desk.modal('Refund requests',<RefundApprovals/>)}>Refund requests</button>}
        <div className="tabs" aria-label="Payment methods">
          {["All", ...paymentMethods].map((entry) => (
            <button
              key={entry}
              className={method === entry ? "selected" : ""}
              onClick={() => setMethod(entry)}
            >
              {entry === "All"
                ? "All"
                : paymentMethodNames[entry as PaymentMethod]}
            </button>
          ))}
        </div>
        {isManager(data.actor) && (
          <button
            className="button"
            onClick={() =>
              desk.modal(
                "Payment methods",
                <PaymentMethodSettings outlet={outlet} />,
              )
            }
          >
            Payment methods
          </button>
        )}
      </div>
      {activity.controls}
      <DataTable
        headers={[
          "Order",
          "Method",
          "Amount",
          "Reference",
          "State",
          "Created",
          "",
        ]}
        rows={activity.items
          .filter((entry: Row) => method === "All" || entry.method === method)
          .map((p: Row) => [
            <button
              className="text-button"
              onClick={() => go("/app/orders/" + p.order_id)}
            >
              #{p.number}
            </button>,
            paymentMethodNames[p.method as PaymentMethod] ?? label(p.method),
            money(p.amount),
            p.reference ?? "—",
            <Badge value={p.state === "VERIFIED" ? "RECEIVED" : p.state} />,
            date(p.created_at),
            ["AWAITING_VERIFICATION", "UNKNOWN"].includes(p.state) ? (
              <button
                className="button small"
                onClick={() =>
                  resolvePaymentForm(desk, p, (v) =>
                    run("verifyPayment", v, { id: p.id }),
                  )
                }
              >
                Resolve
              </button>
            ) : null,
          ])}
        empty="Payment attempts will appear here."
      />
      {activity.pagination}
    </section>
  );
}
export function Invoices() {
  const { data } = useDesk();
  const [type, setType] = useState("All");
  const activity = useActivity(
    "invoices",
    true,
    type === "All"
      ? undefined
      : type === "Final invoices"
        ? "FINAL_TAX_INVOICE"
        : "PROVISIONAL_BILL",
  );
  return (
    <section className="panel">
      <div className="panel-heading">
        <div className="tabs">
          {["All", "Final invoices", "Provisional"].map((t) => (
            <button
              key={t}
              className={type === t ? "selected" : ""}
              onClick={() => setType(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      {activity.controls}
      <DataTable
        headers={["Number", "Document", "Customer", "Amount", "Created", ""]}
        rows={activity.items
          .filter(
            (i: Row) =>
              type === "All" ||
              (type === "Final invoices"
                ? i.document_type === "FINAL_TAX_INVOICE"
                : i.document_type === "PROVISIONAL_BILL"),
          )
          .map((i: Row) => [
            <Link className="text-button" href={"/invoice/" + i.id}>
              {i.number}
            </Link>,
            <Badge value={i.document_type} />,
            i.snapshot.customer?.name ?? "—",
            money(i.snapshot.totals.payable),
            date(i.created_at),
            <Link href={"/invoice/" + i.id} className="button small">
              Open
            </Link>,
          ])}
      />
      {activity.pagination}
    </section>
  );
}
