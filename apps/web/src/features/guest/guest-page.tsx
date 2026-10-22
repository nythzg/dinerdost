"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { quote, quantityMilli, taxBreakdown, wholeUnit } from "@dinerdost/core";
import { MenuPicture } from "@/components/menu-picture";
import { Badge, Empty, Icon, Logo, Modal } from "@/components/ui";
import {
  ApiError,
  date,
  label,
  money,
  request,
  idempotentPost,
  type Row,
} from "@/lib/client";
import { DishPicker } from "../workspace/dish-picker";
import { CustomerFields } from "../customers/customer-fields";
import { useActivityHeartbeat } from "@/lib/use-activity-heartbeat";

export function GuestPage({ tableKey }: { tableKey: string }) {
  const [data, setData] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cart, setCart] = useState<Row[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [view, setView] = useState("home");
  const [pick, setPick] = useState<Row | null>(null);
  const sending = useRef(false);
  const connection = useRef<Promise<unknown> | null>(null);
  const load = useCallback(async () => {
    const fresh = await request("/api/guest/" + tableKey);
    setData(fresh);
    setError("");
    return fresh;
  }, [tableKey]);
  const connect = useCallback(async () => {
    await request("/api/guest/" + tableKey, {
      method: "POST",
      body: JSON.stringify({ action: "connect", input: {} }),
    });
    return load();
  }, [tableKey, load]);
  useEffect(() => {
    connection.current ??= connect();
    void connection.current.catch((e) => setError(e.message));
    const timer = setInterval(() => {
      if (!document.hidden && !sending.current)
        void load().catch((e) => {
          if (e instanceof ApiError && e.status < 500) setError(e.message);
        });
    }, 15000);
    return () => clearInterval(timer);
  }, [connect, load]);
  useEffect(() => {
    if (!data?.activationRequired) return;
    setView("home");
    setPick(null);
    setCart([]);
  }, [data?.activationRequired]);
  useEffect(() => {
    const identity =
      data?.currentIdentity ??
      data?.identities?.find(
        (i: Row) => i.name === data.order?.customer_snapshot?.name,
      );
    if (identity && !phone) {
      setName(identity.name);
      setPhone(identity.phone);
    }
  }, [data?.order?.id, data?.identities, data?.currentIdentity, phone]);
  const touchGuest = useCallback(
    () =>
      idempotentPost("/api/guest/" + tableKey, {
        action: "activity",
        input: {},
      }),
    [tableKey],
  );
  const refreshAfterActivityFailure = useCallback(() => {
    void load().catch(() => {});
  }, [load]);
  useActivityHeartbeat(
    !!data?.connected && !data.activationRequired,
    touchGuest,
    refreshAfterActivityFailure,
  );
  const send = async (action: string, input: unknown) => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setNotice("");
    setNoticeError(false);
    try {
      if (!data?.connected)
        await request("/api/guest/" + tableKey, {
          method: "POST",
          body: JSON.stringify({ action: "connect", input: {} }),
        });
      const result = await idempotentPost("/api/guest/" + tableKey, {
        action,
        input,
      });
      // Preserve a successful submission even when the subsequent refresh fails.
      if (action === "order")
        setData((current) =>
          current ? { ...current, connected: true, order: result } : current,
        );
      await load().catch(() => {});
      return result;
    } catch (e) {
      setNotice((e as Error).message);
      setNoticeError(true);
      await load().catch(() => {});
      throw e;
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  if (error)
    return (
      <main className="guest-shell">
        <Logo />
        <Empty
          action={
            <button
              className="button"
              onClick={() => void connect().catch((e) => setError(e.message))}
            >
              Try again
            </button>
          }
        >
          {error}
        </Empty>
      </main>
    );
  if (!data)
    return (
      <div className="loading-page">
        <Logo />
        <div className="loader" />
      </div>
    );
  const menu: Row[] = data.menu;
  const categories = ["All", ...new Set<string>(menu.map((m) => m.category))];
  const shown = menu.filter(
    (m) =>
      (category === "All" || m.category === category) &&
      (m.name + " " + m.description)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const total = quote(
    cart.map((m) => ({
      unit_price: Number(m.price),
      quantity_milli: quantityMilli(m.quantity),
      tax_bps: Number(data.order?.tax_bps_override ?? m.tax_bps),
    })),
  );
  const count = cart.reduce((n, m) => n + Number(m.quantity), 0);
  const identityLocked =
    !!data.order &&
    !["SETTLED", "VOIDED", "REJECTED"].includes(data.order.status);
  const add = (line: Row) =>
    setCart((prev) => [...prev, { ...line, cartId: crypto.randomUUID() }]);
  const addItem = (m: Row) => {
    if (m.variants.length || m.modifiers.length || m.unit !== "portion")
      setPick(m);
    else
      setCart((prev) => {
        const existing = prev.find(
          (l) => l.id === m.id && !l.variant && !l.modifiers?.length && !l.note,
        );
        return existing
          ? prev.map((l) =>
              l === existing ? { ...l, quantity: l.quantity + 1 } : l,
            )
          : [
              ...prev,
              { ...m, quantity: 1, modifiers: [], cartId: crypto.randomUUID() },
            ];
      });
  };
  const service = (kind: string, message: string) =>
    void send("service", { kind })
      .then(() => setNotice(message))
      .catch(() => {});
  const decrease = (id: string) =>
    setCart((previous) => {
      const index = previous.map((line) => line.id).lastIndexOf(id);
      if (index < 0) return previous;
      return previous.flatMap((line, i) =>
        i !== index
          ? [line]
          : line.quantity <= 1
            ? []
            : [
                {
                  ...line,
                  quantity: Math.round((line.quantity - 1) * 1000) / 1000,
                },
              ],
      );
    });
  return (
    <main className="guest-shell">
      <header className="guest-header">
        <Logo />
        <span className="badge">Table {data.table}</span>
      </header>
      <section className="guest-welcome">
        <span className="eyebrow">
          {view === "home" ? "Welcome to" : data.outlet}
        </span>
        <h1>{data.restaurant}</h1>
      </section>
      {view === "home" ? (
        <section className="guest-home" aria-label="Table service">
          <div className="guest-home-actions">
            <button
              className="guest-action-tile"
              disabled={busy}
              onClick={() => service("HELP", "Your waiter has been called.")}
            >
              <Icon name="customers" />
              <span>Call waiter</span>
            </button>
            <button
              className="guest-action-tile guest-menu-tile"
              disabled={busy || data.activationRequired}
              onClick={() => setView("menu")}
            >
              <Icon name="dish" />
              <span>Menu</span>
            </button>
          </div>
          <div className="guest-quick-service">
            <button
              disabled={busy || data.activationRequired}
              onClick={() => service("WATER", "Water requested.")}
            >
              <Icon name="cup" /> Water
            </button>
            <button
              disabled={busy || data.activationRequired}
              onClick={() => service("BILL", "Your bill has been requested.")}
            >
              <Icon name="payments" /> Bill
            </button>
          </div>
          <div className="guest-quick-service">
            <button
              disabled={busy || data.activationRequired}
              onClick={() => service("CLEANUP", "Cleaning requested.")}
            >
              <Icon name="leaf" /> Cleaning
            </button>
            <button
              disabled={busy || data.activationRequired}
              onClick={() => service("ASSISTANCE", "Help requested.")}
            >
              <Icon name="customers" /> Help
            </button>
          </div>
          {data.activationRequired && (
            <button
              className="button primary guest-request-activation"
              disabled={busy || data.activationRequested}
              onClick={() =>
                service(
                  "ACTIVATE_TABLE",
                  "Waiting for staff to activate your table.",
                )
              }
            >
              {data.activationRequested
                ? "Activation requested"
                : "Request table activation"}
            </button>
          )}
          <button
            className="guest-home-order"
            disabled={busy || data.activationRequired}
            onClick={() => setView("order")}
          >
            <Icon name="orders" /> My order
            {data.order && <span className="guest-order-dot" />}
          </button>
        </section>
      ) : (
        <nav className="guest-view-tabs" aria-label="Customer navigation">
          {["home", "menu", "order"].map((tab) => (
            <button
              key={tab}
              className={view === tab ? "selected" : ""}
              onClick={() => setView(tab)}
            >
              {tab === "home" ? "Home" : tab === "menu" ? "Menu" : "My order"}
              {tab === "order" && data.order && (
                <span className="guest-order-dot" />
              )}
            </button>
          ))}
        </nav>
      )}
      {notice && (
        <div
          className={noticeError ? "error" : "success-note"}
          role={noticeError ? "alert" : "status"}
        >
          {notice}
        </div>
      )}
      {view === "order" && !data.activationRequired && (
        <>
          {data.order ? (
            <section className="panel guest-status">
              <div className="panel-heading">
                <h2>Order #{data.order.number}</h2>
                <Badge value={data.order.status} />
              </div>
              {data.order.rounds.map((r: Row) => (
                <div className="guest-round" key={r.id}>
                  <div>
                    <strong>Round {r.round_number}</strong>
                    <Badge value={r.status} />
                  </div>
                  {r.items.map((i: Row, index: number) => (
                    <p key={index}>
                      {Number(i.quantity_milli) / 1000} × {i.name}
                      {i.variant ? " · " + i.variant : ""}
                    </p>
                  ))}
                  {(r.charges ?? []).map((charge: Row, index: number) => (
                    <p key={"charge-" + index}>
                      {charge.name} · {money(charge.amount)}
                    </p>
                  ))}
                  <div>
                    <small>
                      {r.status === "PENDING"
                        ? "Waiting for your server"
                        : label(r.kot_status)}
                    </small>
                    <strong>{money(r.payable)}</strong>
                  </div>
                </div>
              ))}
              <small className="guest-counter-note">
                Pay your server or at the counter.
              </small>
            </section>
          ) : (
            <Empty>Choose something from the menu to start your order.</Empty>
          )}
          <div className="guest-service">
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                void send("service", { kind: "WATER" })
                  .then(() => setNotice("Water requested."))
                  .catch(() => {})
              }
            >
              Request water
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                void send("service", { kind: "BILL" })
                  .then(() => setNotice("Your bill has been requested."))
                  .catch(() => {})
              }
            >
              Request bill
            </button>
          </div>
        </>
      )}
      {view === "menu" && !data.activationRequired && (
        <>
          <label className="guest-search">
            <Icon name="search" />
            <input
              type="search"
              placeholder="Find a dish"
              aria-label="Search menu"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="guest-categories" aria-label="Menu categories">
            {categories.map((c) => (
              <button
                key={c}
                className={category === c ? "selected" : ""}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="guest-menu">
            {shown.map((m) => (
              <article
                key={m.id}
                className={
                  cart.some((line) => line.id === m.id) ? "is-added" : ""
                }
              >
                <MenuPicture item={m} />
                <div className="guest-dish-copy">
                  <small>{m.category}</small>
                  <h3>{m.name}</h3>{m.ready_to_serve && <><span className="ready-food-tag">Ready to serve</span></>}
                  {m.description && !m.ready_to_serve && <p>{m.description}</p>}
                </div>
                <div className="guest-add">
                  <strong className="guest-card-price">
                    {money(m.price)}
                    {m.unit !== "portion" && " / " + m.unit}
                  </strong>
                  <div
                    className="guest-card-stepper"
                    role="group"
                    aria-label={m.name + " quantity controls"}
                  >
                    {cart.some((line) => line.id === m.id) && (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          aria-label={"Decrease " + m.name}
                          onClick={() => decrease(m.id)}
                        >
                          <Icon name="minus" />
                        </button>
                        <span
                          aria-live="polite"
                          aria-label={m.name + " quantity in cart"}
                        >
                          {cart
                            .filter((line) => line.id === m.id)
                            .reduce((n, line) => n + line.quantity, 0)}
                        </span>
                      </>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={"Add " + m.name}
                      onClick={() => addItem(m)}
                    >
                      <Icon name="plus" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {!shown.length && (
            <Empty>
              {menu.length
                ? "No dishes match your search."
                : "The menu is being prepared."}
            </Empty>
          )}
        </>
      )}
      {cart.length > 0 && !data.activationRequired && (
        <section className="panel guest-cart" id="guest-cart">
          <div className="panel-heading">
            <h2>Your cart</h2>
            <strong>{money(total.payable)}</strong>
          </div>
          {cart.map((m) => (
            <div className="guest-cart-line" key={m.cartId}>
              <div>
                <strong>{m.name}</strong>
                {(m.variant || m.modifiers?.length > 0) && (
                  <small>
                    {[
                      m.variants.find((v: Row) => v.id === m.variant)?.name,
                      ...m.modifiers.map(
                        (id: string) =>
                          m.modifiers_options?.find((o: Row) => o.id === id)
                            ?.name ?? id,
                      ),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                )}
              </div>
              <input
                aria-label={m.name + " quantity"}
                type="number"
                min={wholeUnit(m.unit) ? 1 : 0.001}
                max="10000"
                step={wholeUnit(m.unit) ? 1 : 0.001}
                value={m.quantity}
                disabled={busy}
                onChange={(e) => {
                  const value = Number(e.target.value);
                  if (
                    Number.isFinite(value) &&
                    value > 0 &&
                    value <= 10000 &&
                    Math.abs(value * 1000 - Math.round(value * 1000)) <
                      0.000001 &&
                    (!wholeUnit(m.unit) || Number.isInteger(value))
                  )
                    setCart((prev) =>
                      prev.map((l) =>
                        l.cartId === m.cartId ? { ...l, quantity: value } : l,
                      ),
                    );
                }}
              />
              <span>{money(Math.round(m.price * m.quantity))}</span>
              <button
                className="icon-button"
                aria-label={"Remove " + m.name}
                disabled={busy}
                onClick={() =>
                  setCart((prev) => prev.filter((l) => l.cartId !== m.cartId))
                }
              >
                <Icon name="close" />
              </button>
            </div>
          ))}
          <div className="guest-cart-total">
            <span>
              Subtotal <strong>{money(total.subtotal)}</strong>
            </span>
            {(data.taxComponents?.length
              ? taxBreakdown(total.tax, data.taxComponents).map((tax) => [
                  tax.name,
                  tax.amount,
                ])
              : [["Tax", total.tax]]
            ).map(([name, amount]) => (
              <span key={String(name)}>
                {String(name)} <strong>{money(Number(amount))}</strong>
              </span>
            ))}
            <span>
              Total <strong>{money(total.payable)}</strong>
            </span>
          </div>
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              if (data.activationRequired) return;
              void send("order", {
                items: cart.map((m) => ({
                  itemId: m.id,
                  quantity: String(m.quantity),
                  ...(m.variant ? { variant: m.variant } : {}),
                  modifiers: m.modifiers ?? [],
                  note: m.note ?? "",
                })),
                name: identityLocked ? data.order.customer_snapshot.name : name,
                phone,
                ...(identityLocked ? { version: data.order.version } : {}),
              })
                .then((result) => {
                  if (result) {
                    setCart([]);
                    setView("order");
                    setNotice(
                      "Order sent. Your server will confirm it shortly.",
                    );
                  }
                })
                .catch(() => {});
            }}
          >
            <CustomerFields
              known={data.identities}
              required
              readOnlyName={identityLocked}
              name={identityLocked ? data.order.customer_snapshot.name : name}
              phone={phone}
              onChange={(nextName, nextPhone) => {
                setName(nextName);
                setPhone(nextPhone);
              }}
            />
            <button
              className="button primary"
              disabled={busy || data.activationRequired}
            >
              {busy ? "Sending…" : "Place order · " + money(total.payable)}
            </button>
          </form>
        </section>
      )}
      {cart.length > 0 && view === "menu" && (
        <a className="guest-cart-bar" href="#guest-cart">
          <span>
            {count} {count === 1 ? "item" : "items"} · {money(total.payable)}
          </span>
          <strong>View cart</strong>
        </a>
      )}
      <footer className="guest-footer">
        <Logo />
      </footer>
      {pick && (
        <Modal title={pick.name} onClose={() => setPick(null)}>
          <DishPicker
            item={pick}
            onAdd={(line) =>
              add({ ...line, modifiers_options: pick.modifiers })
            }
            onClose={() => setPick(null)}
          />
        </Modal>
      )}
    </main>
  );
}
