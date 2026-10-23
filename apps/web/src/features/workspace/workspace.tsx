"use client";
import {confirmFormAction} from '@/lib/confirm-action';
import { T, StaffLanguage, LanguageSelect } from "@/lib/staff-language";
import {
  useCallback,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { can, type Permission } from "@dinerdost/core";
import {
  Badge,
  Empty,
  Form,
  Icon,
  Logo,
  Modal,
  type Field,
} from "@/components/ui";
import { command, request, type Row } from "@/lib/client";
import { DeskContext } from "./context";
import { KotPrintProvider } from "../orders/kot-printer";
import { Overview, Floor, Pos, Kitchen, Tasks } from "./service-pages";
import { Orders, OrderDetail, Payments, Invoices } from "../orders/order-pages";
import {
  Menu,
  Inventory,
  Recipes,
  Customers,
  Team,
  Outlets,
  Audits,
  Integrations,
  Reports,
} from "../management/management-pages";
import { Records } from "../management/record-pages";
import { QrPage } from "../qr/qr-page";
import { PageSearch } from "@/components/page-search";
import { ReservationReminders } from "./reservation-reminders";
import { Attendance } from "../management/attendance-page";
import { FloorPlan } from "../tables/floor-plan";
import { TableBilling } from "../tables/table-billing";
import { NotificationBell } from "./notification-bell";
import { WorkspaceTools } from "./workspace-tools";
import { PackageButton } from "./package-panel";
import { LoyaltyLeaderboard } from "../customers/loyalty-leaderboard";
const primaryNavigation = new Set([
  "overview",
  "floor",
  "floor-plan",
  "qr",
  "orders",
  "pos",
  "kitchen",
  "tasks",
  "payments",
]);
const nav: {
  id: string;
  name: string;
  icon: string;
  permission: Permission;
  sidebar?: boolean;
}[] = [
  { id: "overview", name: "Overview", icon: "overview", permission: "reports" },
  {
    id: "floor-plan",
    name: "Explore",
    icon: "floor",
    permission: "sessions",
  },
  { id: "floor", name: "Tables", icon: "floor", permission: "sessions" },
  {
    id: "table-billing",
    name: "Table billing",
    icon: "payments",
    permission: "bill",
    sidebar: false,
  },
  {
    id: "qr",
    name: "Table QR",
    icon: "qr",
    permission: "sessions",
    sidebar: false,
  },
  { id: "orders", name: "Orders", icon: "orders", permission: "orders" },
  { id: "pos", name: "Cashier POS", icon: "pos", permission: "orders" },
  { id: "kitchen", name: "Kitchen", icon: "kitchen", permission: "kitchen" },
  { id: "tasks", name: "Service", icon: "clock", permission: "sessions" },
  {
    id: "payments",
    name: "Payments",
    icon: "payments",
    permission: "payments",
  },
  {
    id: "invoices",
    name: "Bills & invoices",
    icon: "payments",
    permission: "bill",
  },
  { id: "menu", name: "Menu", icon: "menu", permission: "menu" },
  {
    id: "recipes",
    name: "Recipes",
    icon: "menu",
    permission: "settings",
    sidebar: false,
  },
  {
    id: "inventory",
    name: "Inventory",
    icon: "inventory",
    permission: "inventory",
  },
  {
    id: "customers",
    name: "Customers",
    icon: "customers",
    permission: "customers",
  },
  {
    id: "loyalty",
    name: "Loyalty leaderboard",
    icon: "overview",
    permission: "customers",
  },
  {
    id: "reservations",
    name: "Reservations",
    icon: "clock",
    permission: "sessions",
  },
  {
    id: "vendors",
    name: "Vendors",
    icon: "outlets",
    permission: "procurement",
  },
  {
    id: "purchases",
    name: "Purchases",
    icon: "orders",
    permission: "procurement",
  },
  { id: "expenses", name: "Expenses", icon: "payments", permission: "finance" },
  {
    id: "checklists",
    name: "Checklists",
    icon: "audit",
    permission: "sessions",
  },
  {
    id: "campaigns",
    name: "Campaign drafts",
    icon: "customers",
    permission: "customers",
  },
  { id: "team", name: "Team", icon: "customers", permission: "team" },
  {
    id: "attendance",
    name: "Attendance",
    icon: "clock",
    permission: "attendance",
  },
  { id: "outlets", name: "Outlets", icon: "outlets", permission: "settings" },
  {
    id: "brands",
    name: "Virtual brands",
    icon: "outlets",
    permission: "settings",
  },
  { id: "reports", name: "Reports", icon: "overview", permission: "reports" },
  { id: "audit", name: "Activity log", icon: "audit", permission: "audit" },
  {
    id: "integrations",
    name: "Connections",
    icon: "settings",
    permission: "settings",
  },
];
export function Workspace() {
  const router = useRouter(),
    pathname = usePathname();
  const [data, setData] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [mobile, setMobile] = useState(false),
    [manageOpen, setManageOpen] = useState(false),
    [searchOpen, setSearchOpen] = useState(false),
    [modal, setModal] = useState<{
      title: string;
      render: (busy: boolean) => ReactNode;
    } | null>(null);
  const section = pathname.split("/")[2] || "overview",
    detailId = pathname.split("/")[3];
  const requestRevision = useRef(0);
  const refresh = useCallback(async (outletId?: string) => {
    const revision = ++requestRevision.current;
    let result = await request(
      "/api/workspace" + (outletId ? "?outlet=" + outletId : ""),
    );
    const preferred =
      outletId ?? sessionStorage.getItem("dd-outlet-" + result.actor.restroId);
    if (
      preferred &&
      preferred !== result.outletId &&
      result.outlets.some((o: Row) => o.id === preferred)
    )
      result = await request("/api/workspace?outlet=" + preferred);
    if (revision !== requestRevision.current) return;
    sessionStorage.setItem(
      "dd-outlet-" + result.actor.restroId,
      result.outletId,
    );
    setData(result);
    setError("");
  }, []);
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, [refresh]);
  useEffect(() => {
    if (
      !data ||
      !["OWNER", "MANAGER", "WAITER", "CASHIER"].includes(data.actor.role)
    )
      return;
    const timer = setInterval(() => {
      if (!document.hidden && !busy && !modal)
        void refresh(data.outletId).catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [data?.outletId, data?.actor.role, busy, modal, refresh]);
  useEffect(() => {
    setMobile(false);
    if (!primaryNavigation.has(section)) setManageOpen(true);
  }, [pathname, section]);
  useEffect(() => {
    if (data && section === "overview" && !can(data.actor.role, "reports")) {
      const first = nav.find((item) => can(data.actor.role, item.permission));
      if (first) router.replace("/app/" + first.id);
    }
  }, [data?.actor.role, section, router]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k" &&
        !busy &&
        !modal
      ) {
        event.preventDefault();
        setSearchOpen((current) => !current);
      }
    };
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, [busy, modal]);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  const closeModal = useCallback(() => setModal(null), []);
  const run = async (action: string, input?: unknown, extra?: Row) => {
    if (busy) {
      setNotice("Please wait for the current action.");
      throw new Error("Please wait for the current action.");
    }
    setBusy(true);
    try {
      const result = await command(action, input, extra);
      try {
        await refresh(data?.outletId);
      } catch {
        setNotice("Saved. Refresh the page to load the latest data.");
      }
      return result;
    } catch (e) {
      setNotice((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const form = (
    title: string,
    fields: Field[],
    submit: (values: Row) => Promise<any>,
    button = "Save",
  ) => {
    if(!fields.length){void confirmFormAction(title,button,()=>submit({})).then(saved=>{if(saved)setNotice('Saved.')});return;}
    setModal({
      title,
      render: (working) => (
        <Form
          fields={fields}
          busy={working}
          submit={button}
          onSubmit={async (values) => {
            try {
              await submit(values);
              setModal(null);
              setNotice("Saved.");
            } catch (error) {
              setNotice((error as Error).message);
            }
          }}
        />
      ),
    });
  };
  if (!data)
    return (
      <div className="loading-page">
        <Logo />
        {error ? (
          <>
            <p className="error">{error}</p>
            <button
              className="button"
              onClick={() => void refresh().catch((e) => setError(e.message))}
            >
              Try again
            </button>
            <Link href="/signin">Back to sign in</Link>
          </>
        ) : (
          <div className="loader" aria-label="Loading workspace" />
        )}
      </div>
    );
  const sectionModules:Record<string,string>={pos:'pos',qr:'qr',inventory:'inventory',recipes:'inventory',vendors:'procurement',purchases:'procurement',customers:'crm',campaigns:'crm',loyalty:'loyalty',reports:'reports',reservations:'reservations',expenses:'finance'};
  const hasModule=(id:string)=>!Array.isArray(data.platformPolicy?.features)||!sectionModules[id]||data.platformPolicy.features.includes(sectionModules[id]);
  const allowed = nav.filter((n) => can(data.actor.role, n.permission)&&hasModule(n.id));
  const navigation = allowed.filter((n) => n.sidebar !== false);
  const current = nav.find((n) => n.id === section);
  const authorized = current && can(data.actor.role, current.permission);
  let content: ReactNode;
  if (!authorized)
    content = (
      <Empty
        action={
          <button
            className="button primary"
            onClick={() => router.push("/app/" + (allowed[0]?.id ?? "orders"))}
          >
            Open my workspace
          </button>
        }
      >
        This page is not available for your role.
      </Empty>
    );
  else if(!hasModule(section))content=<Empty>This module is not included in the assigned web plan. Existing bills and payment history remain available.</Empty>;
  else if (
    [
      "reservations",
      "vendors",
      "purchases",
      "expenses",
      "checklists",
      "brands",
      "campaigns",
    ].includes(section)
  )
    content = <Records kind={section} />;
  else
    content = (
      {
        overview: <Overview />,
        floor: <Floor />,
        "floor-plan": <FloorPlan key={data.outletId} />,
        "table-billing": detailId ? (
          <TableBilling key={detailId} tableId={detailId} />
        ) : (
          <Empty>Select a table to open its bills.</Empty>
        ),
        qr: <QrPage />,
        pos: <Pos />,
        orders: detailId ? <OrderDetail id={detailId} /> : <Orders />,
        kitchen: <Kitchen />,
        tasks: <Tasks />,
        payments: <Payments />,
        invoices: <Invoices />,
        menu: <Menu />,
        inventory: <Inventory />,
        recipes: <Recipes />,
        customers: <Customers />,
        loyalty: <LoyaltyLeaderboard key={data.outletId} />,
        team: <Team />,
        attendance: <Attendance />,
        outlets: <Outlets />,
        reports: <Reports />,
        audit: <Audits />,
        integrations: <Integrations />,
      } as Record<string, ReactNode>
    )[section];
  return (
    <StaffLanguage account={data.actor.employeeId}>
      <DeskContext.Provider
        value={{
          data,
          busy,
          run,
          form,
          modal: (title, content) => setModal({ title, render: () => content }),
          close: closeModal,
          notify: setNotice,
          go: (path) => router.push(path),
          refresh: () => refresh(data.outletId),
        }}
      >
        <KotPrintProvider>
          <div className="app-shell">
            <button
              className="mobile-menu icon-button"
              aria-label="Open navigation"
              onClick={() => setMobile(!mobile)}
            >
              <Icon name="navigation" />
            </button>
            {mobile && (
              <div className="sidebar-scrim" onClick={() => setMobile(false)} />
            )}
            <aside
              id="workspace-navigation"
              className={"sidebar " + (mobile ? "is-open" : "")}
            >
              <Link
                href={"/app/" + (allowed[0]?.id ?? "orders")}
                title="Diner Dost"
                aria-label="Diner Dost home"
              >
                <Logo />
              </Link>
              <div className="workspace-name">
                <span className="workspace-avatar">
                  {data.restaurant.name.slice(0, 1)}
                </span>
                <span>
                  <strong>{data.restaurant.name}</strong>
                </span>
              </div>
              <nav aria-label="Main navigation">
                {navigation
                  .filter((n) => primaryNavigation.has(n.id))
                  .map((n) => (
                    <Link
                      href={"/app/" + n.id}
                      scroll={false}
                      key={n.id}
                      onClick={() => setMobile(false)}
                      title={n.name}
                      aria-label={n.name}
                      className={section === n.id ? "active" : ""}
                      aria-current={section === n.id ? "page" : undefined}
                    >
                      <Icon name={n.icon} />
                      <span>
                        <T>{n.name}</T>
                      </span>
                      {n.id === "orders" &&
                        (data.orders ?? []).some(
                          (o: Row) => o.status === "PENDING",
                        ) && (
                          <span className="nav-count">
                            {
                              data.orders.filter(
                                (o: Row) => o.status === "PENDING",
                              ).length
                            }
                          </span>
                        )}
                    </Link>
                  ))}
                {navigation.some((n) => !primaryNavigation.has(n.id)) && (
                  <>
                    <button
                      className={
                        "nav-manage " +
                        (!primaryNavigation.has(section) ? "selected" : "")
                      }
                      aria-expanded={manageOpen}
                      aria-controls="management-navigation"
                      onClick={() => setManageOpen(!manageOpen)}
                      title="Manage"
                      aria-label="Manage"
                    >
                      <Icon name="settings" />
                      <span>
                        <T>{"Manage"}</T>
                      </span>
                      <span className="nav-toggle" aria-hidden="true">
                        {manageOpen ? "−" : "+"}
                      </span>
                    </button>
                    {manageOpen && (
                      <div
                        id="management-navigation"
                        className="management-navigation"
                      >
                        {navigation
                          .filter((n) => !primaryNavigation.has(n.id))
                          .map((n) => (
                            <Link
                              href={"/app/" + n.id}
                              scroll={false}
                              key={n.id}
                              onClick={() => setMobile(false)}
                              title={n.name}
                              aria-label={n.name}
                              className={section === n.id ? "active" : ""}
                              aria-current={
                                section === n.id ? "page" : undefined
                              }
                            >
                              <Icon name={n.icon} />
                              <span>
                                <T>{n.name}</T>
                              </span>
                            </Link>
                          ))}
                      </div>
                    )}
                  </>
                )}
                {data.platformConsole&&<Link href="/superadmin"><Icon name="settings"/><span>Superadmin</span></Link>}
              </nav>
              <div className="sidebar-footer">
                <div className="profile">
                  <span className="avatar" title={data.actor.name}>
                    {data.actor.name
                      .split(" ")
                      .map((n: string) => n[0])
                      .slice(0, 2)
                      .join("")}
                  </span>
                  <span>
                    <strong>{data.actor.name}</strong>
                    <small>{data.actor.role.toLowerCase()}</small>
                  </span>
                  <button
                    className="icon-button"
                    title="Sign out"
                    aria-label="Sign out"
                    onClick={async () => {
                      await request("/api/auth/logout", {
                        method: "POST",
                        body: "{}",
                      });
                      router.push("/signin");
                      router.refresh();
                    }}
                  >
                    <Icon name="logout" />
                  </button>
                </div>
              </div>
            </aside>
            <div className="main-shell">
              <header className="topbar">
                <div className="outlet-switch">
                  <span className="status-dot" />
                  <select
                    aria-label="Current outlet"
                    value={data.outletId}
                    onChange={(e) =>
                      void refresh(e.target.value).catch((e) =>
                        setNotice(e.message),
                      )
                    }
                  >
                    {data.outlets.map((o: Row) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
                <LanguageSelect />
                <button
                  className="page-search-trigger"
                  aria-label="Search pages"
                  aria-keyshortcuts="Control+k Meta+k"
                  onClick={() => setSearchOpen(true)}
                  disabled={busy || !!modal}
                >
                  <Icon name="search" />
                  <span>
                    <T>{"Search"}</T>
                  </span>
                  <kbd>Ctrl K</kbd>
                </button>
                <NotificationBell key={data.outletId + data.actor.role} />
                <PackageButton />
              </header>
              <main
                className={
                  "main-content" +
                  (section === "floor-plan" ? " explore-content" : "")
                }
              >
                <div className="page-heading">
                  <div>
                    <h1>
                      <T>
                        {detailId && section === "orders"
                          ? "Order details"
                          : (current?.name ?? "Workspace")}
                      </T>
                    </h1>
                  </div>
                  {can(data.actor.role, "orders") && section === "overview" && (
                    <Link className="button primary" href="/app/pos">
                      <Icon name="plus" />
                      <T>{"New order"}</T>
                    </Link>
                  )}
                </div>
                <fieldset
                  disabled={busy}
                  className="workspace-controls"
                  aria-busy={busy}
                >
                  {data.platformPolicy&&data.platformPolicy.status!=='ACTIVE'&&<div className="notice" role="status">Restaurant {data.platformPolicy.status.toLowerCase()}. Historical records remain available; new web operations are paused.</div>}
                  {data.platformBroadcasts?.map((item:Row)=><div className="notice" role="status" key={item.id}><strong>{item.name}</strong><p>{item.data.message}</p></div>)}
                  {content}
                </fieldset>
              </main>
            </div>
            {notice && (
              <div className="toast" role="status">
                <span>{notice}</span>
                <button
                  className="icon-button"
                  aria-label="Dismiss notification"
                  onClick={() => setNotice("")}
                >
                  <Icon name="close" />
                </button>
              </div>
            )}
            {searchOpen && (
              <PageSearch
                items={allowed}
                close={closeSearch}
                navigate={(path) => router.push(path)}
              />
            )}
            <ReservationReminders />
            <WorkspaceTools key={data.actor.employeeId} />
            {modal && (
              <Modal title={modal.title} onClose={closeModal}>
                {modal.render(busy)}
              </Modal>
            )}
            {busy && (
              <div className="saving-indicator" role="status">
                <T>{"Saving changes…"}</T>
              </div>
            )}
          </div>
        </KotPrintProvider>
      </DeskContext.Provider>
    </StaffLanguage>
  );
}
