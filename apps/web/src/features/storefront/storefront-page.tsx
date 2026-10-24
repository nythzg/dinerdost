"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  businessDateTime,
  businessLocalToISO,
  quote,
  quantityMilli,
  roundAdjustment,
  taxBreakdown,
} from "@dinerdost/core";
import { Badge, Empty, Form, Icon, Logo, Modal } from "@/components/ui";
import {
  date,
  idempotentPost,
  label,
  money,
  request,
  type Row,
} from "@/lib/client";
import { DishPicker } from "../workspace/dish-picker";
import { MenuPicture } from "@/components/menu-picture";
import { CustomerFields } from "../customers/customer-fields";
import {GuestBillBreakdown} from '../guest/guest-bill-breakdown';
import { showOrderPlaced } from "@/lib/order-placed";

export function StorefrontPage({ slug }: { slug: string }) {
  const [data, setData] = useState<Row | null>(null),
    [error, setError] = useState("");
  const [tab, setTab] = useState("Menu"),
    [floor, setFloor] = useState("");
  const [search, setSearch] = useState(""),
    [cart, setCart] = useState<Row[]>([]);
  const [pick, setPick] = useState<Row | null>(null),
    [booking, setBooking] = useState<Row | null>(null);
  const [checkout, setCheckout] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [customerName, setCustomerName] = useState(""),
    [customerPhone, setCustomerPhone] = useState("");
  const sending = useRef(false);
  const load = useCallback(
    async () => setData(await request("/api/store/" + slug)),
    [slug],
  );
  useEffect(() => {
    let live = true;
    void request("/api/store/" + slug, {
      method: "POST",
      body: JSON.stringify({ action: "connect", input: {} }),
    })
      .then(async () => {
        const current = await request("/api/store/" + slug);
        if (live) {
          setData(current);
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    const timer = setInterval(() => {
      if (live && !document.hidden && !sending.current)
        void load().catch(() => {});
    }, 15000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [slug, load]);
  const send = async (action: string, input: Row) => {
    if (sending.current) return false;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await idempotentPost("/api/store/" + slug, { action, input });
      if (action === "order") {
        setCart([]);
        setCheckout(false);
        setTab("My visits");
        setNotice("Order sent. Waiting for staff acceptance.");
        showOrderPlaced(result, { type: 'TAKEAWAY', customer: input.name });
      }
      if (action === "reserve") {
        setBooking(null);
        setTab("My visits");
        setNotice("Table booked.");
      }
      if (action === "cancelReservation") setNotice("Booking cancelled.");
      await load().catch(() => {});
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  if (!data)
    return (
      <main className="storefront">
        <Logo />
        <Empty>{error || "Opening store…"}</Empty>
      </main>
    );
  const floors = [
    ...new Set<string>([
      ...data.tables.map((table: Row) => table.floor),
      ...data.plans.map((plan: Row) => plan.floor),
    ]),
  ];
  const currentFloor = floors.includes(floor) ? floor : floors[0];
  const tables: Row[] = data.tables.filter(
    (table: Row) => table.floor === currentFloor,
  );
  const plan = data.plans.find((plan: Row) => plan.floor === currentFloor);
  const objects: Row[] =
    plan?.objects ??
    tables.map((table: Row, index: number) => ({
      id: table.id,
      tableId: table.id,
      kind: "TABLE",
      label: table.label,
      x: 30 + (index % 5) * 230,
      y: 30 + Math.floor(index / 5) * 140,
      width: 180,
      height: 110,
    }));
  const total = quote(
    cart.map((line) => ({
      unit_price: line.price,
      quantity_milli: quantityMilli(line.quantity),
      tax_bps: line.tax_bps,
    })),
  );
  const charges:Row[]=data.billDefaults?.charges??[],chargesTotal=charges.reduce((sum,charge)=>sum+Number(charge.amount),0),roundingMode=data.billDefaults?.roundingMode??'NONE',roundOff=roundAdjustment(total.payable+chargesTotal,roundingMode!=='NONE',roundingMode),payable=total.payable+chargesTotal+roundOff;
  return (
    <main className="storefront">
      <header className="storefront-header">
        <Logo />
        <span>{data.outletName}</span>
      </header>
      <h1>{data.name}</h1>
      {data.orderingEnabled===false&&<p className="notice" role="status">This outlet is not accepting new orders right now. Your existing orders remain available in My visits.</p>}
      <nav className="storefront-tabs" aria-label="Customer store">
        {["Menu", "Floor plan", "My visits"].map((name) => (
          <button
            key={name}
            className={"button " + (tab === name ? "primary" : "")}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </nav>
      {notice && (
        <p role="status" className="storefront-notice">
          {notice}
        </p>
      )}
      {error && !booking && !checkout && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {tab === "Menu" && (
        <>
          <label className="storefront-search">
            <Icon name="search" />
            <input
              aria-label="Search menu"
              placeholder="Search menu"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="storefront-menu">
            {data.menu
              .filter((item: Row) =>
                item.name.toLowerCase().includes(search.toLowerCase()),
              )
              .map((item: Row) => (
                <article className="panel" key={item.id}>
                  <MenuPicture item={item} />
                  <div>
                    <h2>{item.name}</h2>
                    {item.ready_to_serve && <><span className="ready-food-tag">Ready to serve</span></>}
                    <span>{money(item.price)}</span>
                  </div>
                  <button className="button" onClick={() => setPick(item)}>
                    Add
                  </button>
                </article>
              ))}
          </div>
          {!data.menu.length && <Empty>Menu unavailable.</Empty>}
          {!!cart.length && (
            <section className="panel storefront-cart">
              <h2>Your order</h2>
              {cart.map((line, index) => (
                <div key={index}>
                  <span>
                    {line.name} × {line.quantity}
                  </span>
                  <button
                    className="text-button"
                    aria-label={"Remove " + line.name}
                    onClick={() =>
                      setCart((items) => items.filter((_, i) => i !== index))
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                className="button primary"
                disabled={busy || data.orderingEnabled===false}
                onClick={() => {
                  setError("");
                  setCheckout(true);
                }}
              >
                {data.orderingEnabled===false?'Ordering paused':<>Takeaway · {money(payable)}</>}
              </button>
            </section>
          )}
        </>
      )}
      {tab === "Floor plan" && (
        <>
          {!tables.length ? (
            <Empty>No tables available for reservations.</Empty>
          ) : (
            <>
              <select
                aria-label="Customer floor"
                value={currentFloor}
                onChange={(e) => setFloor(e.target.value)}
              >
                {floors.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
              <div className="panel storefront-plan">
                <svg
                  role="img"
                  aria-label={currentFloor + " floor plan"}
                  viewBox={`0 0 ${plan?.width ?? 1200} ${plan?.height ?? 800}`}
                >
                  {plan?.outline && (
                    <polygon
                      points={plan.outline
                        .map((p: Row) => p.x + "," + p.y)
                        .join(" ")}
                      fill="#f7f8f4"
                      stroke="#819574"
                      strokeWidth={4}
                    />
                  )}
                  {[...objects]
                    .sort(
                      (a, b) =>
                        Number(a.kind === "TABLE") - Number(b.kind === "TABLE"),
                    )
                    .map((object) => {
                      const table = tables.find(
                          (table) => table.id === object.tableId,
                        ),
                        wall = object.kind === "WALL",
                        occupied = Number(table?.occupied_seats) > 0;
                      return (
                        <g key={object.id}>
                          <rect
                            x={object.x}
                            y={object.y}
                            width={object.width}
                            height={object.height}
                            rx={wall ? 2 : 12}
                            fill={
                              wall || occupied
                                ? "#193f30"
                                : table
                                  ? "#fff"
                                  : "#eaf1e6"
                            }
                            stroke="#819574"
                            strokeWidth={2}
                          />
                          {!wall && (
                            <text
                              x={object.x + object.width / 2}
                              y={object.y + object.height / 2}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              fill={occupied ? "#fff" : "#285b45"}
                              fontSize={18}
                            >
                              {table?.label ?? object.label}
                            </text>
                          )}
                        </g>
                      );
                    })}
                </svg>
              </div>
              <div className="storefront-tables">
                {tables.map((table) => (
                  <article key={table.id} className="panel">
                    <div>
                      <h2>{table.label}</h2>
                      <span>
                        {table.seats} seats ·{" "}
                        {Math.max(
                          0,
                          table.seats - Number(table.occupied_seats),
                        )}{" "}
                        free now
                      </span>
                    </div>
                    <button
                      className="button primary"
                      onClick={() => {
                        setError("");
                        setBooking(table);
                      }}
                    >
                      Reserve
                    </button>
                  </article>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {tab === "My visits" && (
        <>
          {data.bookings.map((entry: Row) => (
            <article className="panel storefront-visit" key={entry.id}>
              <div>
                <h2>
                  {data.tables.find((table: Row) => table.id === entry.table_id)
                    ?.label ?? "Table booking"}
                </h2>
                <p>
                  {date(entry.starts_at)} · {entry.duration_minutes} min
                </p>
                <Badge
                  value={
                    entry.state === "DRAFT" || entry.state === "APPROVED"
                      ? "BOOKED"
                      : entry.state
                  }
                />
              </div>
              {["DRAFT", "APPROVED"].includes(entry.state) && (
                <button
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    void send("cancelReservation", { id: entry.id })
                  }
                >
                  Cancel booking
                </button>
              )}
            </article>
          ))}
          {data.orders.map((order: Row) => (
            <article className="panel storefront-visit" key={order.id}>
              <h2>Order #{order.number}</h2>
              <Badge value={order.status} />
              {order.rounds.map((round: Row) => (
                <div key={round.id}>
                  {round.items.map((line: Row, index: number) => (
                    <p key={index}>
                      {line.name} × {line.quantity_milli / 1000}
                    </p>
                  ))}
                  <strong>{money(round.payable)}</strong>
                </div>
              ))}
            </article>
          ))}
          {!data.orders.length && !data.bookings.length && (
            <Empty>No orders or bookings on this device.</Empty>
          )}
        </>
      )}
      {pick && (
        <Modal title={pick.name} onClose={() => setPick(null)}>
          <DishPicker
            item={pick}
            onAdd={(line) => setCart((items) => [...items, line])}
            onClose={() => setPick(null)}
          />
        </Modal>
      )}
      {booking && (
        <Modal
          title={"Reserve " + booking.label}
          onClose={() => !busy && setBooking(null)}
        >
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <Form
            busy={busy}
            submit="Book table"
            before={
              <CustomerFields
                known={data.identities}
                required
                labels={["Name", "Phone"]}
                name={customerName}
                phone={customerPhone}
                onChange={(n, p) => {
                  setCustomerName(n);
                  setCustomerPhone(p);
                }}
              />
            }
            fields={[
              {
                name: "guests",
                label: "Guests",
                type: "number",
                min: 1,
                max: booking.seats,
                value: Math.min(2, booking.seats),
              },
              {
                name: "at",
                label: "Arrival (India time)",
                type: "datetime-local",
                value: businessDateTime(new Date(Date.now() + 3600000)),
              },
              {
                name: "durationMinutes",
                label: "Duration",
                type: "select",
                value: "90",
                options: [30, 60, 90, 120, 180, 240].map((minutes) => ({
                  value: String(minutes),
                  label: minutes + " minutes",
                })),
              },
            ]}
            onSubmit={async (values) => {
              try {
                await send("reserve", {
                  ...values,
                  name: customerName,
                  phone: customerPhone,
                  tableId: booking.id,
                  at: businessLocalToISO(values.at),
                  durationMinutes: Number(values.durationMinutes),
                });
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          />
        </Modal>
      )}
      {checkout && (
        <Modal
          title="Takeaway order"
          onClose={() => !busy && setCheckout(false)}
        >
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <Form
            busy={busy || data.orderingEnabled===false}
            submit={data.orderingEnabled===false?'Ordering paused':"Send order · " + money(payable)}
            before={
              <><GuestBillBreakdown bill={{...total,payable,charges,roundOff,taxes:taxBreakdown(total.tax,data.taxComponents)}}/><CustomerFields
                known={data.identities}
                required
                labels={["Name", "Phone"]}
                name={customerName}
                phone={customerPhone}
                onChange={(n, p) => {
                  setCustomerName(n);
                  setCustomerPhone(p);
                }}
              /></>
            }
            fields={[]}
            onSubmit={async (values) => {
              await send("order", {
                ...values,
                name: customerName,
                phone: customerPhone,
                items: cart.map((line) => ({
                  itemId: line.id,
                  quantity: line.quantity,
                  variant: line.variant,
                  modifiers: line.modifiers,
                  note: line.note,
                })),
              });
            }}
          >
            <p className="muted">
              Pay at the counter. Online payments require restaurant setup.
            </p>
          </Form>
        </Modal>
      )}
    </main>
  );
}
