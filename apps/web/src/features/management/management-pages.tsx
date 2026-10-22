"use client";
import { T } from "@/lib/staff-language";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { can } from "@dinerdost/core";
import { Badge, DataTable, Empty, Icon, type Field } from "@/components/ui";
import { date, label, money, request, type Row } from "@/lib/client";
import { useDesk } from "../workspace/context";
import { MenuEditor } from "./menu-editor";
import { MenuOptions } from "./menu-options";
import { CategoryManager } from "./category-manager";
import { IntegrationRequirementsButton } from "./integration-requirements";
import { CustomerProfile } from "../customers/customer-profile";
import { useActivity } from "@/components/activity-filter";
import { AuditChanges, auditAction } from "./audit-changes";
import { ReceiptSettings } from "./receipt-settings";
import { StockReceipt } from "./stock-receipt";
import { WasteReport } from "./waste-report";
import { InventoryValue, InventoryDelete } from "./inventory-actions";
import { IngredientExpiry } from "./ingredient-expiry";
import { DailyStockCounts } from "./daily-stock-counts";
import { InventoryTools } from "./inventory-tools";
import { MaterialSetup } from "./material-setup";
const number = (
  name: string,
  label: string,
  value = 0,
  step: number | string = 1,
): Field => ({ name, label, type: "number", min: 0, value, step });
export function Menu() {
  const { data, form, run, modal } = useDesk();
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState("All");
  const categories: Row[] = data.categories ?? [];
  const canEditDishes = can(data.actor.role, "settings");
  const edit = (item?: Row, liquor = item?.unit === "peg") =>
    modal(
      item ? "Edit menu item" : liquor ? "Add liquor item" : "Add menu item",
      <MenuEditor
        item={item}
        liquor={!!liquor}
        fields={[
          {
            name: "name",
            label: liquor ? "Liquor name" : "Dish name",
            value: item?.name,
          },
          {
            name: "category",
            label: "Category",
            type: "select",
            value: item?.category ?? categories[0]?.name,
            options: [
              ...new Set<string>([
                ...categories.map((entry) => entry.name),
                ...(item ? [item.category] : []),
              ]),
            ].map((name) => ({ value: name, label: name })),
          },
          {
            name: "description",
            label: "Description",
            type: "textarea",
            required: false,
            value: item?.description,
          },
          number("price", "Price (₹)", Number(item?.price ?? 0) / 100, 0.01),
          number(
            "tax",
            "Tax (%)",
            Number(
              item?.tax_bps ??
                data.outlets.find((o: Row) => o.id === data.outletId).tax_bps,
            ) / 100,
            0.01,
          ),
          {
            name: "unit",
            label: "Sell by",
            type: "select",
            value: liquor ? "peg" : (item?.unit ?? "portion"),
            options: (liquor ? ["peg"] : ["portion", "piece", "kg", "L"]).map((u) => ({
              value: u,
              label: u,
            })),
          },
          ...(liquor
            ? [
                {
                  ...number("pegMl", "Peg size (ml)", item?.peg_ml ?? 30),
                  min: 1,
                  max: 1000,
                },
                {
                  name: "liquorIngredientId",
                  label: "Liquor stock",
                  type: "select",
                  value: item?.liquor_ingredient_id,
                  options: (data.ingredients ?? [])
                    .filter(
                      (ingredient: Row) => ingredient.category === "LIQUOR",
                    )
                    .map((ingredient: Row) => ({
                      value: ingredient.id,
                      label: ingredient.name,
                    })),
                } as Field,
              ]
            : []),
          {
            name: "station",
            label: "Kitchen station",
            value: item?.station ?? "Main kitchen",
          },
          {
            name: "stream",
            label: "Display",
            type: "select",
            value: liquor ? "BAR" : (item?.production_stream ?? "FOOD"),
            options: [
              { value: "FOOD", label: "Food kitchen" },
              { value: "BAR", label: "Bar" },
            ],
          },
          {
            name: "active",
            label: "Available for ordering",
            type: "checkbox",
            value: item?.active ?? true,
          },
        ]}
        save={(v) =>
          run("menu", {
            ...(item ? { id: item.id, version: item.version } : {}),
            outletId: data.outletId,
            name: v.name,
            category: v.category,
            description: v.description,
            imageUrl: v.imageUrl,
            price: Math.round(v.price * 100),
            taxBps: Math.round(v.tax * 100),
            unit: v.unit,
            ...(liquor
              ? { pegMl: v.pegMl, liquorIngredientId: v.liquorIngredientId }
              : {}),
            station: v.station,
            stream: liquor ? "BAR" : v.stream,
            active: v.active,
            variants: v.variants,
            modifiers: item?.modifiers ?? [],
            ...(!liquor ? { recipe: v.recipe } : {}),
          })
        }
      />,
    );
  return (
    <section className="panel">
      <div className="panel-heading menu-toolbar">
        <button
          className="button"
          onClick={() => modal("Categories", <CategoryManager />)}
        >
          Categories
        </button>
        {canEditDishes && (
          <Link className="button" href="/app/recipes">
            <T>{"Recipes"}</T>
          </Link>
        )}
        <select
          aria-label="Filter menu category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="All">All categories</option>
          {categories.map((entry) => (
            <option key={entry.id} value={entry.name}>
              {entry.name}
            </option>
          ))}
        </select>
        <div className="search-box">
          <Icon name="search" />
          <input
            aria-label="Search dishes"
            placeholder="Search dishes"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {canEditDishes && (
          <button
            className="button primary"
            disabled={!categories.length}
            onClick={() => edit()}
          >
            <Icon name="plus" />
            Add dish
          </button>
        )}
        {canEditDishes && (
          <button className="button" onClick={() => edit(undefined, true)}>
            Add liquor
          </button>
        )}
      </div>
      <DataTable
        headers={[
          "Dish",
          "Category",
          "Price",
          "Tax",
          "Station",
          "Availability",
          "",
        ]}
        rows={(data.menu ?? [])
          .filter(
            (m: Row) =>
              !m.ready_food_batch_id &&
              (category === "All" ||
                m.category.toLowerCase() === category.toLowerCase()) &&
              m.name.toLowerCase().includes(search.toLowerCase()),
          )
          .map((m: Row) => [
            <strong>
              {m.name}
              <small>
                {m.unit === "portion"
                  ? "Per portion"
                  : m.unit === "peg"
                    ? m.peg_ml + " ml per peg"
                    : "Per " + m.unit}
                {canEditDishes &&
                  !m.ready_food_batch_id &&
                  !(data.recipes ?? []).some((r: Row) => r.item_id === m.id) &&
                  " · Recipe needed"}
              </small>
            </strong>,
            m.category,
            money(m.price),
            Number(m.tax_bps) / 100 + "%",
            m.station,
            <Badge value={m.active ? "ACTIVE" : "PAUSED"} />,
            canEditDishes && !m.ready_food_batch_id ? (
              <div className="inline-actions">
                <button className="button small" onClick={() => edit(m)}>
                  <T>{"Edit"}</T>
                </button>
                <button
                  className="button small"
                  onClick={() =>
                    modal(m.name + " options", <MenuOptions item={m} />)
                  }
                >
                  Options
                </button>
              </div>
            ) : null,
          ])}
        empty="Add your menu to start taking orders."
      />
    </section>
  );
}
export function Inventory() {
  const { data, form, run, modal } = useDesk();
  const requestedView = useSearchParams().get("view");
  const [tab, setTab] = useState("Ingredients");
  const [materialSearch,setMaterialSearch]=useState(''),[materialCategory,setMaterialCategory]=useState('ALL');
  useEffect(()=>{setMaterialSearch('');setMaterialCategory('ALL')},[data.outletId]);
  useEffect(() => {
    if (requestedView === "counts") setTab("Ingredients");
  }, [requestedView]);
  const activity = useActivity("movements");
  const editIngredient = (item: Row) =>
    form(
      "Edit inventory item",
      [
        { name: "name", label: "Ingredient name", value: item.name },
        {
          name: "unit",
          label: "Unit",
          type: "select",
          value: item.unit,
          options: (item.category === "LIQUOR"
            ? ["L"]
            : ["kg", "L", "unit"]
          ).map((value) => ({ value, label: value })),
        },
        {
          name: "purchaseRate",
          label: "Purchase rate per kg / L / unit (₹)",
          type: "number",
          step: "0.01",
          min: 0,
          max: 1000000,
          required: false,
          preserveBlank: true,
          value:
            item.purchase_rate == null ? "" : Number(item.purchase_rate) / 100,
        },
      ],
      (values) =>
        run("ingredientEdit", {
          id: item.id,
          version: item.version,
          name: values.name,
          unit: values.unit,
          reorderMilli: Number(item.reorder_milli),
          purchaseRate:
            values.purchaseRate === ""
              ? null
              : Math.round(Number(values.purchaseRate) * 100),
        }),
    );
  const ingredient = (liquor = false) =>
    form(
      liquor ? "Add liquor stock" : "Add ingredient",
      [
        { name: "name", label: "Ingredient name" },
        {
          name: "unit",
          label: "Unit",
          type: "select",
          value: liquor ? "L" : "kg",
          options: (liquor ? ["L"] : ["kg", "L", "unit"]).map((v) => ({
            value: v,
            label: v,
          })),
        },
        {
          name: "purchaseRate",
          label: "Purchase rate per kg / L / unit (₹)",
          type: "number",
          step: "0.01",
          min: 0,
          max: 1000000,
          required: false,
          preserveBlank: true,
        },
      ],
      (v) =>
        run("ingredient", {
          outletId: data.outletId,
          name: v.name,
          unit: v.unit,
          category: liquor ? "LIQUOR" : "GENERAL",
          reorderMilli: 0,
          purchaseRate:
            v.purchaseRate == null || v.purchaseRate === ""
              ? null
              : Math.round(Number(v.purchaseRate) * 100),
        }),
    );
  const receipt = (selected?: Row) =>
    modal("Receive stock", <StockReceipt selected={selected} />);
  return (
    <>
      <div className="metric-grid inventory-metrics">
        {[
          [
            "Stock value",
            money(
              (data.ingredients ?? []).reduce(
                (n: number, i: Row) => n + Number(i.value),
                0,
              ),
            ),
          ],
          ["Ingredients", data.ingredients?.length ?? 0],
        ].map(([name, value]) => (
          <article className="metric" key={name}>
            <span>{name}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <InventoryTools />
      <section className="panel inventory-daily-counts" id="daily-stock-counts">
        <div className="panel-heading">
          <h2>
            <T>{"Daily counts"}</T>
          </h2>
        </div>
        <DailyStockCounts outletId={data.outletId} />
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div className="tabs">
            {[
              "Ingredients",
              "Liquor",
              "FIFO batches",
              "Movements",
              "Daily waste",
            ].map((t) => (
              <button
                key={t}
                className={tab === t ? "selected" : ""}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="inline-actions">
            <button
              className="button"
              onClick={() => ingredient(tab === "Liquor")}
            >
              <Icon name="plus" />
              {tab === "Liquor" ? "Liquor stock" : "Ingredient"}
            </button>
            <button
              className="button primary"
              disabled={!data.ingredients?.length}
              onClick={() => receipt()}
            >
              Receive stock
            </button>
          </div>
        </div>
        {['Ingredients','Liquor'].includes(tab)&&<div className="panel-tools material-filters"><input aria-label="Search materials" placeholder="Search name, code or HSN" type="search" value={materialSearch} onChange={event=>setMaterialSearch(event.target.value)}/><select aria-label="Filter material category" value={materialCategory} onChange={event=>setMaterialCategory(event.target.value)}><option value="ALL">All categories</option>{[...new Set<string>((data.ingredients??[]).map((item:Row)=>item.material_category??''))].sort().map(category=><option key={category} value={'c:'+category}>{category||'Uncategorized'}</option>)}</select></div>}
        {tab === "Daily waste" ? (
          <WasteReport outletId={data.outletId} />
        ) : ["Ingredients", "Liquor"].includes(tab) ? (
          <DataTable
            headers={[
              "Ingredient",
              "On hand",
              "Reserved",
              "Available",
              "Expiry",
              "Value",
              "Purchase rate",
              "",
            ]}
            rows={(data.ingredients ?? [])
              .filter(
                (ingredient: Row) =>
                  (tab !== "Liquor" || ingredient.category === "LIQUOR")&&(materialCategory==='ALL'||'c:'+(ingredient.material_category??'')===materialCategory)&&`${ingredient.name} ${ingredient.material_code??''} ${ingredient.hsn_code??''} ${ingredient.material_category??''}`.toLowerCase().includes(materialSearch.toLowerCase()),
              )
              .map((i: Row) => [
                <div><strong>{i.name}</strong><small className="material-meta">{[i.material_code,i.material_category,i.hsn_code&&'HSN '+i.hsn_code].filter(Boolean).join(' · ')}</small></div>,
                Number(i.on_hand) / 1000 + " " + i.unit,
                Number(i.reserved) / 1000,
                (Number(i.on_hand) - Number(i.reserved)) / 1000,
                <IngredientExpiry
                  ingredientId={i.id}
                  batches={data.batches ?? []}
                />,
                <InventoryValue item={i} />,
                i.purchase_rate == null
                  ? "—"
                  : money(i.purchase_rate) + " / " + i.unit,
                <div className="inline-actions">
                  <button
                    className="button small"
                    onClick={() => editIngredient(i)}
                  >
                    <T>{"Edit"}</T>
                  </button>
                  <button className="button small" onClick={() => receipt(i)}>
                    Receive
                  </button>
                  <button className="button small" aria-label={'Material setup for '+i.name} onClick={()=>modal('Material details & buying packs',<MaterialSetup item={i}/>)}>Setup</button>
                  <InventoryDelete item={i} />
                </div>,
              ])}
          />
        ) : tab === "FIFO batches" ? (
          <DataTable
            headers={[
              "Ingredient",
              "Batch",
              "On hand",
              "Reserved",
              "Receipt rate",
              "Current value",
              "Expiry",
              "",
            ]}
            rows={(data.batches ?? []).map((b: Row) => [
              b.name,
              b.batch_number,
              Number(b.on_hand) / 1000 + " " + b.unit,
              Number(b.reserved) / 1000,
              money(b.unit_cost),
              money(
                b.remaining_value ??
                  Math.floor((Number(b.on_hand) * Number(b.unit_cost)) / 1000),
              ),
              b.expires_at
                ? date(b.expires_at)
                : b.expires_on
                  ? String(b.expires_on).slice(0, 10) + " · time unknown"
                  : "Not recorded",
              <button
                className="button small"
                disabled={Number(b.on_hand) <= Number(b.reserved)}
                onClick={() =>
                  form(
                    "Record wastage",
                    [
                      number("quantity", "Quantity", 0, 0.001),
                      { name: "reason", label: "Reason", type: "textarea" },
                    ],
                    (v) =>
                      run("wastage", {
                        batchId: b.id,
                        quantityMilli: Math.round(v.quantity * 1000),
                        reason: v.reason,
                      }),
                    "Record wastage",
                  )
                }
              >
                Wastage
              </button>,
            ])}
          />
        ) : (
          <>
            {activity.controls}
            <DataTable
              headers={[
                "Ingredient",
                "Movement",
                "Quantity",
                "Current on hand",
                "Cost",
                "Reference",
                "Created",
              ]}
              rows={activity.items.map((m: Row) => [
                m.name,
                label(m.kind),
                Number(m.delta_milli) / 1000,
                Number(
                  data.ingredients?.find((i: Row) => i.id === m.ingredient_id)
                    ?.on_hand ?? 0,
                ) /
                  1000 +
                  " " +
                  m.unit,
                money(m.cost),
                m.reason,
                date(m.created_at),
              ])}
            />
            {activity.pagination}
          </>
        )}
      </section>
    </>
  );
}
export function Recipes() {
  const { data, form, run } = useDesk();
  const edit = (itemId?: string) =>
    form(
      itemId
        ? "Edit recipe · " +
            data.menu.find((item: Row) => item.id === itemId)?.name
        : "Set recipe",
      [
        ...(!itemId
          ? [
              {
                name: "itemId",
                label: "Menu item",
                type: "select",
                options: (data.menu ?? []).filter((m:Row)=>!m.ready_food_batch_id).map((m: Row) => ({
                  value: m.id,
                  label: m.name,
                })),
              } as Field,
            ]
          : []),
        ...(data.ingredients ?? []).map((i: Row) => ({
          ...number(
            i.id,
            i.name + " (" + i.unit + " per sell unit)",
            Number(
              data.recipes?.find(
                (recipe: Row) =>
                  recipe.item_id === itemId && recipe.ingredient_id === i.id,
              )?.quantity_milli ?? 0,
            ) / 1000,
            0.001,
          ),
          help: "Leave at 0 to exclude.",
        })),
      ],
      (v) =>
        run("recipe", {
          itemId: itemId ?? v.itemId,
          ingredients: (data.ingredients ?? [])
            .filter((i: Row) => v[i.id] > 0)
            .map((i: Row) => ({
              id: i.id,
              quantityMilli: Math.round(v[i.id] * 1000),
            })),
        }),
    );
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Ingredients per dish</h2>
        <button
          className="button primary"
          disabled={!data.ingredients?.length || !data.menu?.length}
          onClick={() => edit()}
        >
          <Icon name="plus" />
          Set recipe
        </button>
      </div>
      <DataTable
        headers={["Dish", "Ingredient", "Quantity per sell unit", ""]}
        rows={(data.recipes ?? []).map((r: Row) => [
          r.item_name,
          r.ingredient_name,
          Number(r.quantity_milli) / 1000,
          <button
            className="button small"
            aria-label={"Edit recipe for " + r.item_name}
            onClick={() => edit(r.item_id)}
          >
            Edit recipe
          </button>,
        ])}
        empty="Add ingredients, then connect them to a dish. Accepting an order reserves stock; kitchen release consumes it."
      />
    </section>
  );
}
export function Customers() {
  const { data, modal } = useDesk();
  const [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [listing, setListing] = useState<Row | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setListing(null);
    setError("");
    const timer = setTimeout(() => {
      void request(
        "/api/customers?outlet=" +
          data.outletId +
          "&q=" +
          encodeURIComponent(query) +
          "&page=" +
          page,
      )
        .then((result) => {
          if (live) setListing(result);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [data.outletId, query, page]);
  return (
    <section className="panel">
      <div className="panel-heading">
        <label>
          Search customers
          <input
            aria-label="Search customers"
            type="search"
            placeholder="Name or phone"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
          />
        </label>
        <span className="muted">Most settled visits first</span>
      </div>
      {error && <p role="alert">{error}</p>}
      <DataTable
        headers={[
          "Customer",
          "Mobile",
          "Phone status",
          "Settled visits",
          "Settled spend",
          "Points",
          "",
        ]}
        rows={(listing?.items ?? []).map((c: Row) => [
          <strong>{c.name}</strong>,
          c.phone,
          <Badge value={c.otp_verified ? "VERIFIED" : "CAPTURED"} />,
          c.visits,
          money(c.spend),
          c.points,
          <button
            className="button small"
            onClick={() =>
              modal(
                c.name,
                <CustomerProfile customerId={c.id} outletId={data.outletId} />,
              )
            }
          >
            View
          </button>,
        ])}
        empty="Customers are created when you add order identity details."
      />
      <div className="panel-heading">
        <button
          className="button small"
          disabled={page === 0 || !listing}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </button>
        <span>
          {listing
            ? listing.total + " customers · Page " + (page + 1)
            : "Loading customers…"}
        </span>
        <button
          className="button small"
          disabled={!listing?.hasMore}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>
    </section>
  );
}
export { Team } from "../team/team-page";
export function Outlets() {
  const { data, form, run, modal } = useDesk();
  const edit = (outlet?: Row) =>
    form(
      outlet ? "Edit " + outlet.name : "Add outlet",
      [
        { name: "name", label: "Outlet name", value: outlet?.name },
        {
          name: "code",
          label: "Outlet code",
          value: outlet?.code,
          help: "2–12 uppercase letters or numbers.",
        },
        {
          name: "address",
          label: "Address",
          type: "textarea",
          required: false,
          value: outlet?.address,
        },
        {
          name: "gstin",
          label: "GSTIN",
          required: false,
          value: outlet?.gstin,
        },
        ...(outlet?.tax_components != null
          ? []
          : [
              number(
                "tax",
                "Default tax (%)",
                Number(outlet?.tax_bps ?? 0) / 100,
                0.01,
              ),
            ]),
        number(
          "earn",
          "Loyalty earn rate (%)",
          Number(outlet?.earn_bps ?? 200) / 100,
          0.01,
        ),
        {
          name: "qrEnabled",
          label: "Enable customer QR",
          type: "checkbox",
          value: outlet?.qr_enabled ?? false,
        },
        {
          name: "qrPaymentMode",
          label: "QR menu",
          type: "select",
          value: outlet?.qr_payment_mode ?? "ORDER_ONLY",
          options: [
            { value: "ORDER_ONLY", label: "Order only" },
            { value: "PAYMENT", label: "Order & payment" },
          ],
          help: "Online payments require payment gateway setup.",
        },
        {
          name: "kotPrintMode",
          label: "KOT printing",
          type: "select",
          value: outlet?.kot_print_mode ?? "OFF",
          options: [
            { value: "OFF", label: "Off" },
            { value: "MANUAL", label: "Manual" },
            { value: "AUTO", label: "Automatic" },
          ],
        },
      ],
      (v) =>
        run("outlet", {
          ...(outlet ? { id: outlet.id, version: outlet.version } : {}),
          name: v.name,
          code: v.code.toUpperCase(),
          address: v.address,
          gstin: v.gstin.toUpperCase(),
          taxBps:
            outlet?.tax_components != null
              ? Number(outlet.tax_bps)
              : Math.round(v.tax * 100),
          earnBps: Math.round(v.earn * 100),
          qrEnabled: v.qrEnabled,
          qrPaymentMode: v.qrPaymentMode,
          paymentPolicy: outlet?.payment_policy ?? "PREPAID",
          kotPrintMode: v.kotPrintMode,
        }),
    );
  return (
    <>
      <div className="toolbar">
        <span className="muted">{data.outlets.length} outlets</span>
        <button className="button primary" onClick={() => edit()}>
          <Icon name="plus" />
          Add outlet
        </button>
      </div>
      <div className="outlet-grid">
        {data.outlets.map((o: Row) => (
          <article className="panel outlet-card" key={o.id}>
            <span className="outlet-symbol">
              <Icon name="outlets" />
            </span>
            <h2>{o.name}</h2>
            <small>{o.code}</small>
            <p>{o.address || "Address not added"}</p>
            <div className="detail-list">
              <div>
                <span>Customer QR</span>
                <Badge value={o.qr_enabled ? "ENABLED" : "OFF"} />
              </div>
              <div>
                <span>Payment policy</span>
                <Badge value={o.payment_policy} />
              </div>
              <div>
                <span>Default tax</span>
                <strong>{Number(o.tax_bps) / 100}%</strong>
              </div>
            </div>
            <button className="button full-width" onClick={() => edit(o)}>
              Manage outlet
            </button>
            <button
              className="button full-width"
              onClick={() =>
                modal(
                  "Bill details · " + o.name,
                  <ReceiptSettings outlet={o} />,
                )
              }
            >
              Bill details
            </button>
          </article>
        ))}
      </div>
    </>
  );
}
export function Audits() {
  const { data, modal, run, notify, busy } = useDesk();
  const [filter, setFilter] = useState("All");
  const rows = (data.audit ?? []).filter(
    (a: Row) => filter === "All" || a.risk === filter.toUpperCase(),
  );
  return (
    <section className="panel">
      <div className="panel-heading">
        <div className="tabs">
          {["All", "Critical", "Warning"].map((f) => (
            <button
              key={f}
              className={f === filter ? "selected" : ""}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
        {data.actor.role === "OWNER" && (
          <button
            className="button"
            disabled={busy}
            onClick={() =>
              void run("verifyAudit")
                .then((result) =>
                  notify(
                    result.valid
                      ? `Audit chain verified · ${result.checked} events`
                      : `Audit check failed at event ${result.failedAt ?? "head"}`,
                  ),
                )
                .catch(() => {})
            }
          >
            <Icon name="audit" />
            Verify chain
          </button>
        )}
      </div>
      <DataTable
        headers={["Event", "Actor", "Action", "Risk", "Impact", "Time", ""]}
        rows={rows.map((a: Row) => [
          "#" + a.sequence,
          <div>
            <strong>{a.actor_name}</strong>
            <small>{label(a.actor_role)}</small>
          </div>,
          auditAction(a.action),
          <Badge value={a.risk} />,
          money(a.financial_impact),
          date(a.recorded_at),
          <button
            className="button small"
            onClick={() =>
              modal(
                "Event #" + a.sequence,
                <div className="audit-detail">
                  <div className="detail-list">
                    {[
                      ["Actor", a.actor_name + " · " + a.actor_role],
                      ["Authentication", a.auth_method],
                      ["Action", auditAction(a.action)],
                      [
                        "Entity",
                        label(a.entity_type) +
                          (data.orders?.find((o: Row) => o.id === a.entity_id)
                            ? " #" +
                              data.orders.find((o: Row) => o.id === a.entity_id)
                                .number
                            : ""),
                      ],
                      ["Reason", a.reason],
                      [
                        "Outlet",
                        data.outlets.find((o: Row) => o.id === a.outlet_id)
                          ?.name ?? "Workspace",
                      ],
                      ["Device", a.device_id ?? "Browser"],
                      ["IP", a.ip ?? "Local"],
                      ["Occurred", date(a.occurred_at)],
                      ["Recorded", date(a.recorded_at)],
                    ].map(([n, v]) => (
                      <div key={n}>
                        <span>{n}</span>
                        <strong>{v}</strong>
                      </div>
                    ))}
                  </div>
                  <AuditChanges event={a} />
                  <details>
                    <summary>Technical record</summary>
                    <pre>
                      {JSON.stringify(
                        {
                          entityType: a.entity_type,
                          entityId: a.entity_id,
                          before: a.old_state,
                          after: a.new_state,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                  <small className="hash">{a.record_hash}</small>
                </div>,
              )
            }
          >
            <T>{"Details"}</T>
          </button>,
        ])}
      />
    </section>
  );
}
export function Integrations() {
  return (
    <div className="integration-grid">
      {(
        [
          ["payments", "Payment gateway", "Razorpay / UPI"],
          ["messaging", "Messaging", "WhatsApp & SMS"],
          ["delivery", "Delivery channels", "Swiggy / Zomato"],
          ["hardware", "Restaurant hardware", "POS, printer & EDC"],
          ["invoice", "Invoice scan", "OCR review"],
          ["offline", "Offline service", "LAN mesh"],
        ] as const
      ).map(([kind, title, provider]) => (
        <article className="panel integration-card" key={title}>
          <span className="integration-icon">
            <Icon
              name={
                {
                  payments: "payments",
                  messaging: "customers",
                  delivery: "orders",
                  hardware: "pos",
                  invoice: "inventory",
                  offline: "audit",
                }[kind]
              }
            />
          </span>
          <h2>{title}</h2>
          <span>{provider}</span>
          <Badge value="SETUP_REQUIRED" />
          <IntegrationRequirementsButton kind={kind} />
        </article>
      ))}
    </div>
  );
}
export { Reports } from "./reports-page";
