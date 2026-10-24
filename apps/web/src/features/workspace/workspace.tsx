"use client";
import {OutletOrderSwitch} from './outlet-order-switch';
import {confirmFormAction} from '@/lib/confirm-action';
import { T, StaffLanguage } from "@/lib/staff-language";
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
import {SidebarProfile} from '@/components/sidebar-profile';
import { PageSearch } from "@/components/page-search";
import { ReservationReminders } from "./reservation-reminders";
import { Attendance } from "../management/attendance-page";
import { FloorPlan } from "../tables/floor-plan";
import { TableBilling } from "../tables/table-billing";
import {StockCountReminder} from "./stock-count-reminder";
import { NotificationBell } from "./notification-bell";
import { WorkspaceTools } from "./workspace-tools";
import { PackageButton } from "./package-panel";
import {SupportButton} from '@/features/support/support-center';
import {restaurantFeatureEnabled} from '@dinerdost/core';
import {useDesignPreview} from '@/features/design-preview/preview-appearance';
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
  { id: "floor", name: "Tables", icon: "table-four", permission: "sessions" },
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
  { id: "reports", name: "Reports", icon: "report-activity", permission: "reports" },
  {
    id: "integrations",
    name: "Connections",
    icon: "settings",
    permission: "settings",
  },
  { id: "audit", name: "Activity log", icon: "audit", permission: "audit" },
];
export function Workspace() {
  const appearance=useDesignPreview();
  const router = useRouter(),
    pathname = usePathname();
  const [data, setData] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [mobile, setMobile] = useState(false),

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
  useEffect(()=>{if(searchOpen)requestAnimationFrame(()=>document.querySelector<HTMLInputElement>('.topbar .page-search input')?.focus())},[searchOpen]);
  const closeSearch = useCallback(() => {setSearchOpen(false);document.querySelector<HTMLButtonElement>('.topbar .header-search-trigger')?.focus()}, []);
  useEffect(()=>{if(!searchOpen)return;const outside=(event:PointerEvent)=>{if(!(event.target as Element).closest('.header-search'))setSearchOpen(false)};const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!modal){setSearchOpen(false);document.querySelector<HTMLButtonElement>('.topbar .header-search-trigger')?.focus()}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)}},[searchOpen,modal]);
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
          onCancel={closeModal}
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
  const hasModule=(id:string)=>restaurantFeatureEnabled(data.featureFlags,id==='table-billing'?'invoices':id)&&(!Array.isArray(data.platformPolicy?.features)||!sectionModules[id]||data.platformPolicy.features.includes(sectionModules[id]));
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
  else if(!hasModule(section))content=<Empty>This feature is unavailable under the current platform settings or web plan. Existing records remain intact.</Empty>;
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
          <div className="app-shell" data-preview-compact={appearance.compact}>
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
              className={"sidebar curved-sidebar " + (mobile ? "is-open" : "")}
            >
              <Link
                href={"/app/" + (allowed[0]?.id ?? "orders")}
                aria-label="Diner Dost home"
              >
                <Logo />
              </Link>
              <nav aria-label="Main navigation">
                {navigation
                  .filter(() => true)
                  .map((n) => (
                    <Link
                      href={"/app/" + n.id}
                      scroll={false}
                      key={n.id}
                      onClick={() => setMobile(false)}
                      title={appearance.compact?n.name:undefined}
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
                {data.enterpriseReports&&<Link href="/enterprise"><Icon name="reports"/><span>Brand reports</span></Link>}
                {data.platformConsole&&<Link href="/superadmin"><Icon name="settings"/><span>Superadmin</span></Link>}
              </nav>
              <div className="sidebar-footer"><SidebarProfile name={data.actor.name} role={data.actor.role.toLowerCase()} properties={[{label:'Name',value:data.actor.name},{label:'Role',value:data.actor.role.toLowerCase()},{label:'Restaurant',value:data.restaurant.name},{label:'Outlet',value:data.outlets.find((outlet:Row)=>outlet.id===data.outletId)?.name??''}]} onSignOut={async()=>{await request('/api/auth/logout',{method:'POST',body:'{}'});router.push('/signin');router.refresh()}}/></div>
            </aside>
            <div className="main-shell">
              <header className="topbar">
                {<button type="button" className="icon-button working-nav-toggle" aria-label={appearance.compact?'Expand navigation':'Collapse navigation'} aria-expanded={!appearance.compact} aria-controls="workspace-navigation" onClick={appearance.toggleCompact}><Icon name="navigation"/></button>}
<div className="workspace-name" title={data.restaurant.name}>
                <span className="workspace-avatar">
                  {data.restaurant.name.slice(0, 1)}
                </span>
                <span>
                  <strong>{data.restaurant.name}</strong>
                </span>
              </div>
                <div className="outlet-switch">
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
                  <OutletOrderSwitch/>
                </div>
                <div className="header-search" data-open={searchOpen}><button type="button" className="header-search-trigger" aria-label="Search pages" aria-keyshortcuts="Control+k Meta+k" aria-expanded={searchOpen} aria-controls="workspace-page-search" disabled={busy||!!modal} onClick={()=>searchOpen?closeSearch():setSearchOpen(true)}><Icon name="search"/><span><T>Search</T></span><kbd>Ctrl K</kbd></button>{searchOpen&&<div id="workspace-page-search"><PageSearch items={allowed} close={closeSearch} navigate={path=>router.push(path)}/></div>}</div>
                {restaurantFeatureEnabled(data.featureFlags,'notifications')&&<NotificationBell key={data.outletId + data.actor.role} />}
                <SupportButton outletId={data.outletId} restaurantName={data.restaurant.name} outletName={data.outlets.find((outlet:Row)=>outlet.id===data.outletId)?.name??''} disabled={!!data.supportView}/>
                <PackageButton />
              </header>
              <WorkspaceTools key={data.actor.employeeId} />
              <main
                className={
                  "main-content" +
                  (section === "floor-plan" ? " explore-content" : "")
                }
              >
                {data.supportView&&<div className="notice" role="status" style={{maxWidth:"min(100%, calc(100vw - 88px))",overflowWrap:"anywhere"}}><strong>{data.supportView.mode==='EDIT'?'Editable owner support':'Read-only owner view'} · {data.supportView.operatorName}</strong><p>Expires {new Date(data.supportView.expiresAt).toLocaleTimeString()}. {data.supportView.mode==='EDIT'?'Changes affect this restaurant’s real data and are audited under your administrator identity.':'Changes, payments and stock actions are blocked.'}</p><button type="button" className="button" onClick={async()=>{await request('/api/superadmin/support-view',{method:'POST',body:JSON.stringify({action:'end'})});location.assign('/superadmin')}}>Exit owner view</button></div>}
                <div className="page-heading">
                  <div className="page-title">
                    {section==='qr'&&<Link href="/app/floor" className="button page-back" aria-label="Back to Tables" title="Back to Tables"><Icon name="back"/></Link>}
                    <h1>
                      <T>
                        {detailId && section === "orders"
                          ? "Order details"
                          : (current?.name ?? "Workspace")}
                      </T>
                    </h1>
                    <span id="workspace-heading-subtitle"/>
                  </div>
                  {(['tasks','kitchen','floor','pos'].includes(section)||(!!detailId&&['orders','table-billing'].includes(section)))&&<fieldset id="workspace-heading-tools" className="page-heading-tools" disabled={busy||data.supportView?.mode==='READ_ONLY'}>{section==='pos'&&hasModule("pos")&&<StockCountReminder/>}</fieldset>}
                  {section==='orders'&&!detailId&&hasModule('orders')&&<small className="orders-list-note">Counts include all orders · Latest 200 listed</small>}
                  {can(data.actor.role, "orders") && hasModule("pos") && data.supportView?.mode!=='READ_ONLY' && section === "overview" && (
                    <Link className="button primary" href="/app/pos">
                      <Icon name="plus" />
                      <T>{"New order"}</T>
                    </Link>
                  )}
                </div>
                <fieldset
                  disabled={busy||data.supportView?.mode==='READ_ONLY'}
                  className={"workspace-controls workspace-page-"+section}
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

            <ReservationReminders />
            {modal && (
              <Modal title={modal.title} onClose={closeModal} className={section==='outlets'?'outlet-editor-dialog':undefined}>
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
