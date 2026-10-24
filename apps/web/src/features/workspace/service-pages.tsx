"use client";
import { T, useStaffTranslation } from "@/lib/staff-language";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {useSearchParams} from "next/navigation";
import {
  can,
  isManager,
  quote,
  roundAdjustment,
  quantityMilli,
  taxBreakdown,
  wholeUnit,
  diningTableGroups,
  nextTableName,
} from "@dinerdost/core";
import { Badge, DataTable, Empty, Icon, type Field } from "@/components/ui";
import { date, label, money, type Row } from "@/lib/client";
import { showStaffOrderPlaced } from "@/lib/order-placed";
import { useDesk } from "./context";
import { TableQr } from "@/components/table-qr";
import { DishPicker } from "./dish-picker";
import { useTableActivity } from "../tables/use-table-activity";
import { CustomerFields } from "../customers/customer-fields";
import { MenuPicture } from "@/components/menu-picture";
import {AdjustmentsEditor} from "../orders/adjustments-editor";
import { TaxSettings } from "../orders/tax-settings";
import { TableActions } from "../tables/table-actions";
import { StockSummary } from "./stock-summary";

import { StockAlerts } from "./stock-alerts";
import { ActivationSwitch } from "../tables/activation-switch";
import { GroupQr, GroupCapacity } from "../tables/group-controls";
import {useServiceBoard,ServiceRounds} from "./service-board";
import {confirmAction,rejectionReason} from '@/lib/confirm-action';
import {PageHeadingTools} from './page-heading-tools';
import {guestCourses,guestMenuCourse} from '../guest/guest-journey';
import {KitchenStageSwitch} from "./kitchen-stage-switch";
export function Overview() {
  const { data, go, run } = useDesk();
  const t = useStaffTranslation();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const alertKey = (kind: string, id: string) =>
    data.actor.employeeId + ":" + data.outletId + ":" + kind + ":" + id;
  const payments: Row[] = (data.payments ?? []).filter(
    (p: Row) =>
      ["AWAITING_VERIFICATION", "UNKNOWN"].includes(p.state) &&
      !dismissed.includes(alertKey(p.state, p.id)) && !data.uiDismissals?.includes("OVERVIEW:"+alertKey(p.state,p.id)),
  );
  const alerts: Row[] = (data.alerts ?? []).filter(
    (a: Row) => !dismissed.includes(alertKey("alert", a.id)) && !data.uiDismissals?.includes("OVERVIEW:"+alertKey("alert",a.id)),
  );
  const dismiss = (key: string) => {
    setDismissed(previous=>[...previous,key]);
    void run("dismissAlert",{outletId:data.outletId,kind:"OVERVIEW",stateKey:key}).catch(()=>setDismissed(previous=>previous.filter(item=>item!==key)));
  };
  const orders: Row[] = data.orders ?? [],
    open = orders.filter(
      (o) => !["SETTLED", "VOIDED", "REJECTED"].includes(o.status),
    );
  const today = new Date().toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
  });
  const recent = orders.filter(
    (o) =>
      new Date(o.created_at).toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
      }) === today,
  );
  const metrics = data.metrics ?? {
    settled: recent
      .filter((o) => o.status === "SETTLED")
      .reduce((n, o) => n + Number(o.paid), 0),
    orders: recent.length,
    dineIn: recent.filter((o) => o.type === "DINE_IN").length,
    takeaway: recent.filter((o) => o.type === "TAKEAWAY").length,
    active: data.sessions?.length ?? 0,
    pending: open.length,
  };
  return (
    <>
      <StockAlerts />
      <div className="metric-grid">
        {[
          ["Settled sales", money(metrics.settled)],
          ["Orders today", metrics.orders],
          ["Dine-in orders today", metrics.dineIn],
          ["Takeaway orders today", metrics.takeaway],
          ["Active tables", metrics.active],
          ["Open orders", metrics.pending],
        ].map(([name, value]) => (
          <article className="metric" key={name}>
            <div>
              <span>
                <T>{name}</T>
              </span>
            </div>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <div className="overview-grid">
        <section className="panel">
          <div className="service-pipeline" aria-label="Order stages">
            {["PENDING", "ACCEPTED", "PREPARING", "READY", "SERVED"].map(
              (state) => (
                <div key={state}>
                  <span className="pipeline-number">
                    {open.filter((o) => o.status === state).length}
                  </span>
                  <span>
                    <T>{label(state)}</T>
                  </span>
                </div>
              ),
            )}
          </div>
          <div className="panel-heading">
            <h2>
              <T>{"Orders"}</T>
            </h2>
            <Link className="subtle-link" href="/app/orders">
              <T>{"View all"}</T>
            </Link>
          </div>
          <DataTable
            headers={["Order", "Table / channel", "Amount", "Status"]}
            rows={orders.slice(0, 7).map((o) => [
              <button
                className="text-button"
                onClick={() => go("/app/orders/" + o.id)}
              >
                {o.pinned&&<span className="vip-order-marker">VIP · </span>}#{o.number}
              </button>,
              o.table_label ?? label(o.type),
              money(o.payable),
              <Badge value={o.status} />,
            ])}
            empty="Your first order will appear here."
          />
        </section>
        <section className="panel attention-panel">
          <div className="panel-heading">
            <h2>
              <T>{"Alerts"}</T>
            </h2>
          </div>
          {!payments.length && !alerts.length ? (
            <Empty>You're all caught up.</Empty>
          ) : (
            <div className="attention-list">
              {payments.slice(0, 3).map((p: Row) => (
                <div className="attention-item" key={p.id}>
                  <button
                    className="attention-open"
                    onClick={() => go("/app/orders/" + p.order_id)}
                  >
                    <span className="attention-icon">
                      <Icon name="payments" />
                    </span>
                    <span>
                      <strong>Verify {money(p.amount)}</strong>
                      <small>
                        Order #{p.number} · {label(p.method)}
                      </small>
                    </span>
                  </button>
                  <button
                    className="attention-dismiss"
                    aria-label={t("Dismiss alert") + " · Order #" + p.number}
                    onClick={() => dismiss(alertKey(p.state, p.id))}
                  >
                    <Icon name="close" />
                  </button>
                </div>
              ))}
              {alerts.slice(0, 3).map((a: Row) => (
                <div className="attention-item" key={a.id}>
                  <button
                    className="attention-open"
                    onClick={() => go("/app/audit")}
                  >
                    <span className="attention-icon danger">
                      <Icon name="audit" />
                    </span>
                    <span>
                      <strong>{label(a.payload.action)}</strong>
                      <small>{date(a.created_at)}</small>
                    </span>
                  </button>
                  <button
                    className="attention-dismiss"
                    aria-label={
                      t("Dismiss alert") + " · " + label(a.payload.action)
                    }
                    onClick={() => dismiss(alertKey("alert", a.id))}
                  >
                    <Icon name="close" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      {can(data.actor, "inventory") && <StockSummary />}
    </>
  );
}
export function Floor() {
  const desk = useDesk(),
    { data, form, run, go } = desk;
  const [floor, setFloor] = useState("All floors");
  const floors = [
    "All floors",
    ...new Set<string>([
      ...(data.tables ?? []).map((t: Row) => t.floor),
      ...(data.floorPlans ?? []).map((p: Row) => p.floor),
    ]),
  ];
  const groups = diningTableGroups<Row & { id: string; label: string }>(
    data.tables ?? [],
    data.sessions ?? [],
  ).filter(
    (group) =>
      floor === "All floors" || group.members.some((t) => t.floor === floor),
  );
  groups.sort((a,b)=>{const serial=(name:string)=>/^\d+$/.test(name);return Number(serial(b.table.label))-Number(serial(a.table.label))||a.table.label.localeCompare(b.table.label,undefined,{numeric:true,sensitivity:'base'})});
  const suggestedTableName=nextTableName((data.tables??[]).map((table:Row)=>table.label));
  const addTable = () =>
    form(
      "Add table",
      [
        { name: "label", label: "Table name", value:suggestedTableName,required:false,preserveBlank:true,help:"Suggested serial name. Change it to use your own name." },
        {
          name: "seats",
          label: "Seats",
          type: "number",
          min: 1,
          max: 100,
          value: 4,
        },
        {
          name: "floor",
          label: "Floor",
          type: "select",
          value: floor !== "All floors" ? floor : (floors[1] ?? "Main floor"),
          options: floors
            .slice(1)
            .map((name) => ({ value: name, label: name })),
        },
      ],
      (v) => run("table", { ...v,label:v.label===suggestedTableName?"":v.label, outletId: data.outletId }),
    );
  return (
    <>
      <div className="toolbar tables-toolbar">
        <div className="tabs table-floor-tabs">
          {floors.map((f) => (
            <button
              className={f === floor ? "selected" : ""}
              key={f}
              onClick={() => setFloor(f)}
            >
              {f}
            </button>
          ))}
        </div>
        {data.outlets.find((o: Row) => o.id === data.outletId)?.qr_enabled && (
          <PageHeadingTools><Link className="button" href="/app/qr">
            <Icon name="qr" />
            <T>{"Table QR"}</T>
          </Link></PageHeadingTools>
        )}
        <ActivationSwitch />
        {can(data.actor.role, "settings") && (
          <button className="button" onClick={addTable}>
            <Icon name="plus" />
            <T>{"Add table"}</T>
          </button>
        )}
      </div>
      <div className="table-grid">
        {groups.map(({ table, members, label: groupLabel }) => {
          const merged = members.length > 1;
          const sessions = (data.sessions ?? []).filter((s: Row) =>
            members.some((t) => t.id === s.table_id),
          );
          const occupied = table.is_occupied || sessions.length > 0;
          const activationRequest = (data.tasks ?? []).find(
            (task: Row) =>
              task.table_id === table.id &&
              task.kind === "ACTIVATE_TABLE" &&
              ["OPEN", "ACCEPTED", "ESCALATED"].includes(task.state),
          );
          const booking = (data.reservations ?? []).find(
            (entry: Row) =>
              entry.table_id === table.id && entry.state === "HELD",
          );
          const seatBooking =
            booking &&
            new Date(booking.starts_at).getTime() <= Date.now() + 15 * 60000;
          const reservedNow =
            booking && new Date(booking.starts_at).getTime() <= Date.now();
          const openSeating = () =>
          form(
            sessions.length
              ? "Split table session"
              : (activationRequest ? "Activate " : "Open ") +
                  table.label,
            [
              ...(merged
                ? [
                    {
                      name: "tableId",
                      label: "Table",
                      type: "select",
                      value: table.id,
                      options: members.map((t) => ({
                        value: t.id,
                        label: t.label,
                      })),
                    } as Field,
                  ]
                : []),
              {
                name: "guests",
                label: "Guests",
                type: "number",
                min: 1,
                max: 100,
                value:
                  !sessions.length && seatBooking
                    ? booking.guests
                    : 2,
              },
              ...(sessions.length
                ? [
                    {
                      name: "label",
                      label: "Separate bill label",
                      placeholder: "A or B",
                    } as Field,
                  ]
                : []),
            ],
            async (v) => {
              const session = await run("openSession", {
                tableId: v.tableId ?? table.id,
                guests: v.guests,
                ...(!sessions.length && activationRequest
                  ? { activationRequestId: activationRequest.id }
                  : {}),
                ...(!sessions.length && seatBooking
                  ? { reservationId: booking.id }
                  : {}),
                ...(v.label ? { label: v.label.toUpperCase() } : {}),
              });
              go("/app/pos?session=" + session.id);
            },
            !sessions.length && activationRequest
              ? "Activate table"
              : "Open table",
          );
          return (
            <article
              className={
                "table-card " +
                (occupied ? "occupied" : "") +
                (merged ? " merged-group" : "")
              }
              key={table.id}
            >
              <div>
                <div className="table-card-title">
                  <h2>
                    {groupLabel}
                    {merged && (
                      <>
                        {" "}
                        (<T>Merged</T>)
                      </>
                    )}
                  </h2>
                  {!merged && (
                    <Badge
                      value={
                        occupied
                          ? "OCCUPIED"
                          : reservedNow
                            ? "RESERVED"
                            : "AVAILABLE"
                      }
                    />
                  )}
                </div>
                <TableActions table={{ ...table, members }} />

              </div>
              {booking && (
                <div className="table-reservation">
                  <strong>{booking.guest}</strong>
                  <small>Reserved · {date(booking.starts_at)}</small>
                </div>
              )}
              {!merged &&
                sessions.some(
                  (s: Row) =>
                    s.parent_id ||
                    data.sessions.some(
                      (child: Row) => child.parent_id === s.id,
                    ),
                ) && (
                  <div className="table-merge-label">
                    <T>Merged with</T>{" "}
                    {[
                      ...new Set<string>(
                        data.sessions
                          .filter(
                            (other: Row) =>
                              other.table_id !== table.id &&
                              sessions.some(
                                (s: Row) =>
                                  other.id === s.parent_id ||
                                  other.parent_id === s.id,
                              ),
                          )
                          .map((s: Row) => s.table_label),
                      ),
                    ].join(", ") || "another table"}
                  </div>
                )}
              <div className="table-seats">
                <Icon name="customers" />
                <span>
                  {members.reduce((n, t) => n + Number(t.seats), 0)} seats
                  {merged &&
                    " · " +
                      sessions.reduce(
                        (n: number, s: Row) => n + Number(s.guests),
                        0,
                      ) +
                      " guests"}
                </span>
                <small>
                  {[...new Set(members.map((t) => t.floor))].join(" · ")}
                </small>
                {can(data.actor, "settings") && (
                  <button
                    className="icon-button"
                    aria-label={"Edit " + table.label + " capacity"}
                    title="Edit seats"
                    onClick={() =>
                      merged
                        ? desk.modal(
                            "Edit merged tables",
                            <GroupCapacity
                              tables={members}
                              floors={floors.slice(1)}
                            />,
                          )
                        : form(
                            "Edit " + table.label,
                            [
                              {
                                name: "seats",
                                label: "Seats",
                                type: "number",
                                min: 1,
                                max: 100,
                                value: table.seats,
                              },
                              {
                                name: "floor",
                                label: "Floor",
                                type: "select",
                                value: table.floor,
                                options: floors.slice(1).map((name) => ({
                                  value: name,
                                  label: name,
                                })),
                              },
                            ],
                            (values) =>
                              run("tableCapacity", {
                                tableId: table.id,
                                version: table.version,
                                seats: values.seats,
                                floor: values.floor,
                              }),
                          )
                    }
                  >
                    <Icon name="edit" />
                  </button>
                )}
              </div>
              <div
                className={merged ? "merged-session-grid" : "table-sessions"}
              >
                {sessions.map((s: Row) => (
                  <div className="session-info" key={s.id}>
                    <strong>
                      {merged && s.table_label + " · "}
                      {s.label === "MAIN"
                        ? s.owner_name
                        : s.label + " · " + s.owner_name}
                    </strong>
                    <small>
                      {s.guests} guests · {date(s.opened_at)}
                    </small>
                    <div className="inline-actions">
                      <button
                        className="text-button"
                        onClick={() => go("/app/pos?session=" + s.id)}
                      >
                        Order +
                      </button>
                      <button
                        className="text-button"
                        onClick={() =>
                          form(
                            "Close " + table.label,
                            [
                              {
                                name: "reason",
                                label: "Reason",
                                value: "Service complete",
                              },
                            ],
                            (v) => run("closeSession", v, { id: s.id }),
                          )
                        }
                      >
                        <T>{"Close"}</T>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {!occupied && activationRequest && <button type="button" className="table-activation-request" disabled={desk.busy} onClick={openSeating}><Icon name="bell"/><T>Activation requested</T><Icon name="chevron"/></button>}
              <div className="table-card-actions">
                {occupied && sessions.length > 0 && (
                  <button
                    className="button table-details-button"
                    aria-label="Details" title="Details"
                    onClick={() => go("/app/table-billing/" + table.id)}
                  >
                    <Icon name="details" />
                  </button>
                )}

                <button
                  className={"button " + (!sessions.length ? "primary" : "table-split-button")}
                  aria-label={sessions.length ? "Separate bill" : undefined}
                  title={sessions.length ? "Separate bill" : undefined}
                  disabled={occupied && !sessions.length}
                  onClick={openSeating}
                >
                  {occupied && !sessions.length
                    ? "Occupied"
                    : sessions.length
                      ? <Icon name="split" />
                      : seatBooking
                        ? "Seat reservation"
                        : activationRequest
                          ? "Activate table"
                          : "Seat guests"}
                </button>
                {data.outlets.find((o: Row) => o.id === data.outletId)
                  ?.qr_enabled && (
                  <button
                    className="button table-qr-button"
                    aria-label="Table QR" title="Table QR"
                    onClick={() =>
                      desk.modal(
                        table.label + " Table QR",
                        merged ? (
                          <GroupQr tables={members} />
                        ) : (
                          <TableQr
                            url={
                              window.location.origin + "/q/" + table.public_key
                            }
                            label={table.label}
                            restaurant={data.restaurant.name}
                            outlet={
                              data.outlets.find(
                                (o: Row) => o.id === data.outletId,
                              )?.name
                            }
                          />
                        ),
                      )
                    }
                  >
                    <Icon name="qr" />
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {!groups.length && (
        <Empty
          action={
            can(data.actor.role, "settings") ? (
              <button className="button primary" onClick={addTable}>
                Add your first table
              </button>
            ) : undefined
          }
        >
          No tables on this floor.
        </Empty>
      )}
    </>
  );
}
export function Pos() {
  const { data, run, go, busy, notify, modal, close } = useDesk();
  const params=useSearchParams(),requestedSession=params.get("session")??(data.orders??[]).find((order:Row)=>order.id===params.get("order"))?.session_id??"";
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState("All"),
    [lead,setLead]=useState(""),
    [searchOpen,setSearchOpen]=useState(false),
    [cart, setCart] = useState<Row[]>([]),
    [type, setType] = useState("TAKEAWAY"),
    [sessionId, setSessionId] = useState(requestedSession),
    [course, setCourse] = useState("IMMEDIATE"),
    [customerName, setCustomerName] = useState(""),
    [customerPhone, setCustomerPhone] = useState("");
  useEffect(()=>setSessionId(requestedSession),[requestedSession]);
  const selectedSession=(data.sessions??[]).find((session:Row)=>session.id===sessionId);
  const searchTrigger=useRef<HTMLButtonElement>(null);
  useTableActivity(
    (data.sessions ?? []).find((session: Row) => session.id === sessionId)
      ?.table_id,
  );
  const menu = (data.menu ?? []).filter((m: Row) => m.active),
    categories = [
      "All",
      ...new Set<string>([
        ...(data.categories ?? []).map((entry: Row) => entry.name),
        ...menu.map((m: Row) => m.category),
      ]),
    ].filter(category=>category==='All'||!lead||guestMenuCourse(category,data.categories?.find((entry:Row)=>entry.name.toLowerCase()===category.toLowerCase())?.menu_course)===lead),
    shown = menu.filter(
      (m: Row) =>
        (!lead||guestMenuCourse(m.category,m.menu_course)===lead) &&
        (category === "All" || m.category === category) &&
        m.name.toLowerCase().includes(search.toLowerCase()),
    );
  const amount = cart.reduce(
    (n, item) => n + Math.round(Number(item.price) * Number(item.quantity)),
    0,
  );
  const outlet = data.outlets.find((row: Row) => row.id === data.outletId);
  const editingOrder =
    typeof window !== "undefined"
      ? (data.orders ?? []).find(
          (row: Row) =>
            row.id === new URLSearchParams(window.location.search).get("order"),
        )
      : null;
  const taxes = editingOrder
    ? editingOrder.tax_components
    : outlet.tax_components;
  const override = editingOrder
    ? editingOrder.tax_bps_override
    : taxes !== null
      ? Number(outlet.tax_bps)
      : null;
  const estimatedTax = cart.reduce((sum, line) => {
    try {
      return (
        sum +
        quote([
          {
            unit_price: Number(line.price),
            quantity_milli: quantityMilli(String(line.quantity)),
            tax_bps: Number(override ?? line.tax_bps),
          },
        ]).tax
      );
    } catch {
      return sum;
    }
  }, 0);
  const defaultCharges:Row[]=editingOrder?[]:(outlet.web_default_charges??[]),chargesTotal=cart.length?defaultCharges.reduce((sum,charge)=>sum+Number(charge.amount),0):0;
  const roundingMode=outlet.web_rounding_mode_default??(outlet.web_round_down_default?'DOWN':'NONE'),estimatedBase=amount+estimatedTax+chargesTotal,estimatedRoundOff=cart.length?roundAdjustment(estimatedBase,roundingMode!=='NONE',roundingMode):0;
  const add = (item: Row) =>
    setCart((previous) => {
      const lineKey =
        item.id +
        JSON.stringify({
          variant: item.variant,
          modifiers: item.modifiers ?? [],
          note: item.note ?? "",
        });
      const current = previous.find((c) => c.lineKey === lineKey);
      return current
        ? previous.map((c) =>
            c.lineKey === lineKey
              ? {
                  ...c,
                  quantity: Number(c.quantity) + Number(item.quantity ?? 1),
                }
              : c,
          )
        : [...previous, { ...item, lineKey, quantity: item.quantity ?? 1 }];
    });
  const choose = (item: Row) =>
    item.variants.length || item.modifiers.length
      ? modal(item.name, <DishPicker item={item} onAdd={add} />)
      : add({ ...item, modifiers: [] });
  const decrease = (itemId: string) =>
    setCart((previous) => {
      const index = previous.reduce(
        (found, line, index) => (line.id === itemId ? index : found),
        -1,
      );
      if (index < 0) return previous;
      const quantity =
        Math.round((Number(previous[index].quantity) - 1) * 1000) / 1000;
      return previous.flatMap((line, i) =>
        i !== index ? [line] : quantity > 0 ? [{ ...line, quantity }] : [],
      );
    });
  const submit = async (draft = false) => {
    if (!cart.length) return;
    if (!!customerName.trim() !== !!customerPhone.trim()) {
      notify("Enter both customer name and phone, or leave both blank.");
      return;
    }
    try {
      const order = await run("createRound", {
        outletId: data.outletId,
        ...(new URLSearchParams(window.location.search).get("order")
          ? {
              orderId: new URLSearchParams(window.location.search).get("order"),
              version: Number(
                new URLSearchParams(window.location.search).get("version"),
              ),
            }
          : {}),
        ...(sessionId ? { sessionId, type: "DINE_IN" } : { type }),
        course,
        draft,
        ...(customerName.trim() && customerPhone.trim()
          ? { customer: { name: customerName, phone: customerPhone } }
          : {}),
        items: cart.map((c) => ({
          itemId: c.id,
          quantity: String(c.quantity),
          variant: typeof c.variant === "string" ? c.variant : undefined,
          modifiers: Array.isArray(c.modifiers)
            ? c.modifiers.filter((m: unknown) => typeof m === "string")
            : [],
          note: c.note ?? "",
        })),
      });
      setCart([]);
      go("/app/orders/" + order.id);
      if (!draft) showStaffOrderPlaced(order, data);
    } catch {}
  };
  return (
    <div className="pos-layout">
      <section className="catalog">

        <PageHeadingTools slot="subtitle">{selectedSession&&<small className="pos-table-context" aria-label="Selected table"><span>Table no.</span><strong>{selectedSession.table_label}</strong></small>}</PageHeadingTools>
        <PageHeadingTools><div className="pos-heading-search" data-open={searchOpen}>{searchOpen&&<input autoFocus type="search" aria-label="Search menu" placeholder="Search the menu" value={search} onChange={e=>{setSearch(e.target.value);setLead('');setCategory('All')}} onKeyDown={e=>{if(e.key==='Escape'){setSearchOpen(false);setSearch('');searchTrigger.current?.focus()}}}/>}<button ref={searchTrigger} type="button" className="icon-button pos-search-trigger" aria-label="Search menu" aria-expanded={searchOpen} title={searchOpen?'Close search':'Search menu'} onClick={()=>{setSearchOpen(!searchOpen);if(searchOpen)setSearch('')}}><Icon name={searchOpen?'close':'search'}/></button></div></PageHeadingTools>
        <nav className="guest-journey pos-course-tabs" aria-label="POS menu courses"><ol>{guestCourses.map((entry,index)=><li key={entry.id}><button type="button" aria-current={lead===entry.id?'step':undefined} onClick={()=>{setLead(entry.id);setCategory('All');setSearch('')}}><Icon name={entry.icon}/><span>Step {index+1}</span><strong>{entry.label}</strong></button></li>)}</ol></nav>
        <div
          className="tabs category-tabs"
          role="group"
          aria-label="Menu categories"
        >
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c&&(c!=='All'||!lead)}
              className={category === c&&(c!=='All'||!lead) ? "selected" : ""}
              onClick={() => {setCategory(c);if(c==='All')setLead('')}}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="menu-grid">
          {shown.map((item: Row) => (
            <div
              className={
                "menu-card" +
                (cart.some((line) => line.id === item.id) ? " is-added" : "")
              }
              key={item.id}
            >
              <button
                className="dish-select"
                aria-pressed={cart.some((line) => line.id === item.id)}
                onClick={() => choose(item)}
              >
                <span className={"dish-art dish-" + (menu.indexOf(item) % 6)}>
                  <MenuPicture item={item} />
                </span>
                <span className="dish-details">
                  <small>{item.category}</small>
                  <strong>{item.name}</strong>{item.ready_food_batch_id && <span className="ready-food-tag"><T>{"Ready to serve"}</T></span>}
                  
                  {item.description && !item.ready_food_batch_id && (
                    <small className="dish-description">
                      {item.description}
                    </small>
                  )}
                </span>
              </button>
              <div className="pos-card-footer">
                <span className="pos-card-price">
                  {money(item.price)}
                  {item.unit !== "portion" && <small> / {item.unit}</small>}
                </span>
                <span
                  className="pos-card-stepper"
                  role="group"
                  aria-label={item.name + " quantity controls"}
                >
                  {cart.some((line) => line.id === item.id) && (
                    <>
                      <button
                        aria-label="Decrease quantity"
                        onClick={() => decrease(item.id)}
                      >
                        <Icon name="minus" />
                      </button>
                      <span
                        aria-live="polite"
                        aria-label={item.name + " quantity in cart"}
                      >
                        {Number(
                          cart
                            .filter((line) => line.id === item.id)
                            .reduce((n, line) => n + Number(line.quantity), 0)
                            .toFixed(3),
                        )}
                      </span>
                    </>
                  )}
                  <button
                    aria-label="Increase quantity"
                    onClick={() => choose(item)}
                  >
                    <Icon name="plus" />
                  </button>
                </span>
              </div>
            </div>
          ))}
        </div>
        {!shown.length && <Empty>No available menu items.</Empty>}
      </section>
      <aside className="cart panel">
        <div className="panel-heading">
          <h2>
            <T>{"New order"}</T>
          </h2>
          <span className="badge">{cart.length} items</span>
        </div>
        <div className="cart-options">
          <label>
            Table session
            <select
              aria-label="Table session"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
            >
              <option value="">No table</option>
              {(data.sessions ?? []).map((s: Row) => (
                <option value={s.id} key={s.id}>
                  {s.table_label} · {s.label} · {s.guests} guests
                </option>
              ))}
            </select>
          </label>
          {!sessionId && (
            <label>
              <T>{"Order type"}</T>
              <select
                aria-label="Order type"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="TAKEAWAY">
                  <T>{"Takeaway"}</T>
                </option>
                <option value="DELIVERY">Delivery · staff managed</option>
              </select>
            </label>
          )}
          <label>
            <T>{"Course"}</T>
            <select
              aria-label="Course"
              value={course}
              onChange={(e) => setCourse(e.target.value)}
            >
              {["IMMEDIATE", "STARTER", "MAIN", "DESSERT", "BEVERAGE"].map(
                (c) => (
                  <option key={c}>{c}</option>
                ),
              )}
            </select>
          </label>
        </div>
        {!(
          typeof window !== "undefined" &&
          new URLSearchParams(window.location.search).has("order")
        ) && (
          <CustomerFields
            outletId={data.outletId}
            name={customerName}
            phone={customerPhone}
            onChange={(name, phone) => {
              setCustomerName(name);
              setCustomerPhone(phone);
            }}
          />
        )}
        <div className="cart-items">
          {cart.length ? (
            cart.map((item) => (
              <div className="cart-item" key={item.lineKey}>
                <div>
                  <strong>{item.name}</strong>
                  <small>
                    {money(item.price)} / {item.unit}
                  </small>
                </div>
                <div className="quantity">
                  <input
                    type="number"
                    aria-label={item.name + " quantity"}
                    min={wholeUnit(item.unit) ? 1 : 0.001}
                    step={wholeUnit(item.unit) ? 1 : 0.001}
                    value={item.quantity}
                    onChange={(e) =>
                      setCart(
                        cart.map((c) =>
                          c.lineKey === item.lineKey
                            ? { ...c, quantity: e.target.value }
                            : c,
                        ),
                      )
                    }
                  />
                  <button
                    aria-label={"Remove " + item.name}
                    className="icon-button"
                    onClick={() =>
                      setCart(cart.filter((c) => c.lineKey !== item.lineKey))
                    }
                  >
                    <Icon name="close" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <Empty>Add a dish to get started.</Empty>
          )}
        </div>
        <div className="cart-bottom">
          <div className="total-row">
            <span>
              <T>{"Subtotal"}</T>
            </span>
            <strong>{money(amount)}</strong>
          </div>
          {(taxes?.length?taxBreakdown(estimatedTax,taxes):[{name:'Tax',amount:estimatedTax,rateBps:override??null}]).map((tax,index)=><div className="total-row" key={index}><span className="tax-row-label">{tax.name}{tax.rateBps!==null&&<small>{Number(tax.rateBps)/100}%</small>}{index===0&&!editingOrder&&can(data.actor,'settings')&&<button className="icon-button" aria-label="Edit tax settings" onClick={()=>modal('Tax settings',<TaxSettings/>)}><Icon name="edit"/></button>}</span><strong>{money(tax.amount)}</strong></div>)}
          {cart.length>0&&defaultCharges.map((charge,index)=><div className="total-row" key={'charge-'+index}><span>{charge.name}</span><strong>{money(charge.amount)}</strong></div>)}
          {!!estimatedRoundOff&&<div className="total-row"><span>Round off</span><strong>{money(estimatedRoundOff)}</strong></div>}
          {isManager(data.actor)&&can(data.actor,'bill')&&<button className="text-button pos-bill-settings" onClick={()=>modal('Future bill settings',<AdjustmentsEditor outletId={data.outletId} save={input=>run('billSettings',input).then(result=>{close();return result})}/>)}><Icon name="settings"/>Future bill settings</button>}
          <div className="total-row grand-total">
            <span>
              <T>{"Total"}</T>
            </span>
            <strong>{money(estimatedBase + estimatedRoundOff)}</strong>
          </div>

          <button
            className="button primary full-width"
            disabled={busy || !cart.length}
            onClick={() => void submit()}
          >
            <T>{"Create order"}</T>
          </button>
          <button
            className="text-button full-width"
            disabled={busy || !cart.length}
            onClick={() => void submit(true)}
          >
            <T>{"Save as draft"}</T>
          </button>
        </div>
      </aside>
    </div>
  );
}
export function Kitchen() {
  const { data, run, busy } = useDesk();
  const preferenceKey = `dd-kitchen-${data.actor.employeeId}-${data.outletId}`;
  const [choice, setChoice] = useState({ key: "", value: "FOOD" });
  useEffect(() => {
    const stored = localStorage.getItem(preferenceKey);
    setChoice({ key: preferenceKey, value: stored === "BAR" || stored === "ALL" ? stored : "FOOD" });
  }, [preferenceKey]);
  const stream =
    data.actor.role === "BARTENDER"
      ? "BAR"
      : data.actor.role === "KITCHEN"
        ? "FOOD"
        : choice.key === preferenceKey
          ? choice.value
          : "FOOD";
  const tickets: Row[] = (data.tickets ?? []).filter(
    (ticket: Row) => stream === "ALL" || ticket.production_stream === stream,
  );
  const [selected,setSelected]=useState<string[]>([]),[selecting,setSelecting]=useState<string|null>(null),[forwarding,setForwarding]=useState(false),[bulkMessage,setBulkMessage]=useState('');
  useEffect(()=>{setSelected([]);setSelecting(null);setBulkMessage('')},[data.outletId,stream]);
  useEffect(()=>{setSelected(old=>old.filter(id=>tickets.some(t=>t.id===id&&t.status===selecting)))},[data.tickets,selecting]);
  const act=async(from:string,reject=false)=>{
    const candidates=tickets.filter(ticket=>ticket.status===from&&selected.includes(ticket.id));
    if(!candidates.length||forwarding)return;
    const rounds=Array.from(new Map(candidates.map(t=>[t.round_id,{orderId:t.order_id,roundId:t.round_id,version:Number(t.round_version)}])).values());
    setForwarding(true);setBulkMessage('');let completed=0;
    try{
      let reason:string|null=null;
      if(reject){reason=await rejectionReason('Reject '+rounds.length+' entire round(s), including every station. Paid or issued bills require their correction workflow. Consumed food is not returned to stock.');if(!reason)return;}
      else if(from==='READY'&&!await confirmAction('Confirm every selected round has actually been served. All stations must be ready.','Forward · Mark served'))return;
      const entries:Row[]=reject||from==='READY'?rounds:candidates;
      for(let index=0;index<entries.length;index+=20){const batch=entries.slice(index,index+20);
        if(reject)await run('rejectKitchenRounds',{outletId:data.outletId,from,reason,rounds:batch});
        else if(from==='READY')await run('serveSelected',{outletId:data.outletId,confirmedServed:true,rounds:batch});
        else await run('kitchenBulk',{outletId:data.outletId,from,ticketIds:batch.map(ticket=>ticket.id)});
        completed+=batch.length;
      }
      setSelected([]);setSelecting(null);setBulkMessage((reject?'Rejected ':'Forwarded ')+completed+'.');
    }catch(e){setBulkMessage('Completed '+completed+'. '+(e as Error).message)}finally{setForwarding(false)}
  };
  return (
    <>
      <div className="toolbar">
        {!["KITCHEN", "BARTENDER"].includes(data.actor.role) && (
          <div className="tabs" aria-label="Production display">
            {[
              ["ALL", "All"],
              ["FOOD", "Food"],
              ["BAR", "Bar"],
            ].map(([value, name]) => (
              <button
                key={value}
                className={stream === value ? "selected" : ""}
                onClick={() => {
                  localStorage.setItem(preferenceKey, value);
                  setChoice({ key: preferenceKey, value });
                }}
              >
                {name}
              </button>
            ))}
          </div>
        )}
        <span className="muted">{tickets.length} active tickets</span>
      </div>
      <PageHeadingTools><KitchenStageSwitch/></PageHeadingTools>
      {bulkMessage && <p role="status">{bulkMessage}</p>}
      <div className="kitchen-board">
        {["RELEASED", "PREPARING", "READY"].map((state) => (
          <section className="kitchen-column" key={state}>
            <div className="column-heading">
              <span className={"status-dot " + state.toLowerCase()} />
              <h2>
                <T>{label(state)}</T>
              </h2>
              <button type="button" className="button small kitchen-stage-select" disabled={busy||forwarding} aria-expanded={selecting===state} onClick={()=>{setSelected([]);setSelecting(selecting===state?null:state)}}>{selecting===state?'Cancel selection':'Select'}</button>
              <span className="kitchen-stage-count">{tickets.filter((t) => t.status === state).length}</span>
            </div>
            {selecting===state&&<div className="kitchen-bulk-actions" role="group" aria-label={label(state)+' selection'}>
              <button className="button small" disabled={busy||forwarding||!tickets.some(t=>t.status===state)} onClick={()=>setSelected(tickets.filter(t=>t.status===state).map(t=>t.id))}>Select all</button>
              <button className="button small primary" disabled={busy||forwarding||!selected.length||(state==='READY'&&(!can(data.actor,'orders')||!can(data.actor,'sessions')))} onClick={()=>void act(state)}>Forward ({selected.length})</button>
              <button className="button small danger" title={isManager(data.actor)?'Reject entire selected rounds':'Manager authorization required'} disabled={busy||forwarding||!selected.length||!isManager(data.actor)} onClick={()=>void act(state,true)}>Reject</button>
            </div>}
            {tickets
              .filter((t) => t.status === state)
              .map((ticket) => (
                <article className={'ticket'+(ticket.pinned?' vip-ticket':'')} key={ticket.id}>
                  {selecting===state && <label className="kitchen-ticket-select"><input type="checkbox" aria-label={"Select order #"+ticket.number+" round "+ticket.round_number+" · "+ticket.station} checked={selected.includes(ticket.id)} disabled={busy || forwarding} onChange={event=>setSelected(previous=>event.target.checked?[...previous,ticket.id]:previous.filter(id=>id!==ticket.id))}/>Select</label>}
                  <div className="ticket-heading">
                    <strong>{ticket.pinned&&<span className="vip-order-marker">VIP · </span>}#{ticket.number}</strong>
                    <Badge value={ticket.table_label ?? "TAKEAWAY"} />
                  </div>
                  <small>
                    {stream === "ALL" && <>{label(ticket.production_stream)} · </>}
                    {ticket.station} · {label(ticket.course)} ·{" "}
                    {date(ticket.created_at)}
                  </small>
                  <ul>
                    {ticket.items.map((i: Row, index: number) => (
                      <li key={index}>
                        <span>{Number(i.quantity_milli) / 1000}×</span>
                        <div>
                          <strong>{i.name}</strong>
                          {i.note && <small>{i.note}</small>}
                          {i.variant && <small>{i.variant}</small>}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {state !== "READY" && (
                    <button
                      className={
                        "button full-width " +
                        (state === "PREPARING" ? "primary" : "")
                      }
                      disabled={busy || forwarding}
                      onClick={() =>
                        void run(
                          "kitchen",
                          {
                            state: state === "RELEASED" ? "PREPARING" : "READY",
                          },
                          { id: ticket.id },
                        ).catch(() => {})
                      }
                    >
                      {state === "RELEASED" ? "Start preparing" : "Mark ready"}
                      <Icon name="check" />
                    </button>
                  )}
                </article>
              ))}
            {!tickets.some((t) => t.status === state) && (
              <div className="column-empty">
                <T>{"No tickets"}</T>
              </div>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
export function Tasks() {
  const service=useServiceBoard();
  const { data, run, form, busy } = useDesk();
  const activate = (task: Row) => {
    const booking = (data.reservations ?? []).find(
      (entry: Row) =>
        entry.table_id === task.table_id &&
        entry.state === "HELD" &&
        new Date(entry.starts_at).getTime() <= Date.now() + 15 * 60000,
    );
    form(
      "Activate " + task.table_label,
      [
        {
          name: "guests",
          label: "Guests",
          type: "number",
          min: 1,
          max: 100,
          value: booking?.guests ?? 2,
        },
      ],
      (values) =>
        run("openSession", {
          tableId: task.table_id,
          guests: values.guests,
          activationRequestId: task.id,
          ...(booking ? { reservationId: booking.id } : {}),
        }),
      "Activate table",
    );
  };
  return (
    <>
      <ServiceRounds board={service}/>
      <section className="panel">
        <div className="panel-heading">
          <h2>
            <T>{"Table requests"}</T>
          </h2>
          <button
            className="button"
            onClick={() =>
              form(
                "New service request",
                [
                  {
                    name: "sessionId",
                    label: "Table session",
                    type: "select",
                    options: (data.sessions ?? []).map((s: Row) => ({
                      value: s.id,
                      label: s.table_label + " · " + s.label,
                    })),
                  },
                  {
                    name: "kind",
                    label: "Request",
                    type: "select",
                    options: [
                      "WATER",
                      "CUTLERY",
                      "CLEANUP",
                      "BILL",
                      "HELP",
                    ].map((v) => ({ value: v, label: label(v) })),
                  },
                ],
                (v) => run("service", { ...v, state: "OPEN" }),
              )
            }
          >
            <Icon name="plus" />
            Request
          </button>
        </div>
        <DataTable
          headers={["Table", "Request", "Requested", "State", ""]}
          rows={(service.report?.requests ?? []).map((t: Row) => [
            t.table_label,
            <div>
              {label(t.kind)}
              {t.rejection_reason && <small>{t.rejection_reason}</small>}
            </div>,
            date(t.created_at),
            <Badge value={t.state} />,
            ["OPEN", "ACCEPTED", "ESCALATED"].includes(t.state) ? (
              <div className="inline-actions">
                <button
                  className="button small"
                  onClick={() =>
                    t.kind === "ACTIVATE_TABLE"
                      ? activate(t)
                      : void run("service", {
                          sessionId: t.session_id,
                          id: t.id,
                          kind: t.kind,
                          state: t.state === "OPEN" ? "ACCEPTED" : "COMPLETED",
                        }).catch(() => {})
                  }
                >
                  {t.kind === "ACTIVATE_TABLE"
                    ? "Activate table"
                    : t.state === "OPEN"
                      ? "Accept"
                      : "Complete"}
                </button>
                <button
                  className="button small danger-text"
                  onClick={() =>
                    form(
                      "Reject service request",
                      [{ name: "reason", label: "Reason", type: "textarea" }],
                      (values) =>
                        run("service", {
                          ...values,
                          id: t.id,
                          sessionId: t.session_id,
                          kind: t.kind,
                          state: "REJECTED",
                        }),
                      "Reject request",
                    )
                  }
                >
                  <T>{"Reject"}</T>
                </button>
              </div>
            ) : null,
          ])}
        />
      </section>
    </>
  );
}
