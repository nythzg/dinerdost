"use client";
import { T } from "@/lib/staff-language";
import { useCallback, useEffect, useState } from "react";
import { Badge, DataTable, Icon, type Field } from "@/components/ui";
import { date, label, money, request, type Row } from "@/lib/client";
import { useDesk } from "../workspace/context";
import { ReservationEditor } from "./reservation-editor";
import { businessDate, can } from "@dinerdost/core";
import { IntegrationRequirementsButton } from "./integration-requirements";
import { PurchaseReceipt } from "./purchase-receipt";
import { PrepPlan } from "./prep-plan";
import { useActivity } from "@/components/activity-filter";
export function Records({ kind }: { kind: string }) {
  const { data, form, run, modal } = useDesk();
  const filtered = ["purchases", "expenses", "checklists"].includes(kind),
    activity = useActivity(kind, filtered);
  const [records, setRecords] = useState<Row[]>([]),
    [vendors, setVendors] = useState<Row[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRecords(
        await request("/api/records/" + kind + "?outlet=" + data.outletId),
      );
      if (kind === "purchases")
        setVendors(
          await request("/api/records/vendors?outlet=" + data.outletId),
        );
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [kind, data.outletId]);
  useEffect(() => {
    setRecords([]);
    void load();
  }, [load]);
  const edit = (record?: Row) => {
    if (kind === "reservations") {
      modal(
        record ? "Edit reservation" : "New reservation",
        <ReservationEditor
          record={record}
          save={async (values) => {
            const table = data.tables.find(
              (entry: Row) => entry.id === values.tableId,
            );
            await run(
              "record",
              {
                ...(record ? { id: record.id, version: record.version } : {}),
                outletId: data.outletId,
                title: values.guest + " · " + table.label,
                data: values,
              },
              { kind },
            );
            await load();
          }}
        />,
      );
      return;
    }
    const d = record?.data ?? {};
    const fields: Field[] = [
      {
        name: "title",
        label:
          kind === "reservations"
            ? "Reservation label"
            : kind === "vendors"
              ? "Vendor name"
              : kind === "brands"
                ? "Brand name"
                : "Title",
        value: record?.title,
      },
    ];
    const f = (
      name: string,
      title: string,
      type = "text",
      required = true,
      value?: any,
    ): Field => ({
      name,
      label: title,
      type,
      required,
      value: value ?? d[name],
    });
    if (kind === "vendors")
      fields.push(
        {
          name: "stream",
          label: "Stock type",
          type: "select",
          value: record?.production_stream ?? "FOOD",
          options: [
            { value: "FOOD", label: "Food" },
            { value: "BAR", label: "Liquor & bar" },
          ],
        },
        f("category", "Supplies", "text", true, d.category ?? ""),
        f("description", "Description", "textarea", false),
        f("contact", "Contact person"),
        f("phone", "Phone", "tel", false),
        f("email", "Email", "email", false),
        f("address", "Address", "textarea", false),
        f("gstin", "GSTIN", "text", false),
        f("permitReference", "Excise permit reference", "text", false),
      );
    if (kind === "purchases")
      fields.push(
        {
          ...f("vendorId", "Vendor", "select"),
          options: vendors.map((v) => ({ value: v.id, label: v.title })),
        },
        f("reference", "Purchase order reference"),
        {
          ...f(
            "amount",
            "Order amount (₹)",
            "number",
            true,
            Number(d.amount ?? 0) / 100,
          ),
          min: 0,
          step: 0.01,
        },
        f("note", "Note", "textarea", false),
      );
    if (kind === "expenses")
      fields.push(
        {
          ...f("category", "Category", "select", true, d.category ?? "Other"),
          options: [
            "Rent",
            "Utilities",
            "Maintenance",
            "Supplies",
            "Other",
          ].map((v) => ({ value: v, label: v })),
        },
        {
          ...f(
            "amount",
            "Amount (₹)",
            "number",
            true,
            Number(d.amount ?? 0) / 100,
          ),
          min: 0,
          step: 0.01,
        },
        f("date", "Date", "date", true, d.date ?? businessDate()),
        f("reference", "Receipt reference"),
        f("note", "Note", "textarea", false),
      );
    if (kind === "checklists")
      fields.push(
        {
          ...f("employeeId", "Assigned to", "select"),
          options: (data.assignmentEmployees ?? []).map((employee: Row) => ({
            value: employee.id,
            label: employee.name,
          })),
        },
        f("due", "Due date", "date"),
        f("instructions", "Instructions", "textarea"),
      );
    if (kind === "brands")
      fields.push(
        f("description", "Description", "textarea", false),
        f("active", "Active", "checkbox", false, d.active ?? true),
      );
    if (kind === "campaigns")
      fields.push(
        {
          ...f(
            "audience",
            "Audience",
            "select",
            true,
            d.audience ?? "All opted-in",
          ),
          options: ["All opted-in", "New", "Returning", "At risk"].map((v) => ({
            value: v,
            label: v,
          })),
        },
        f("message", "Message draft", "textarea"),
      );
    form(
      record ? "Edit " + label(kind) : "Add " + label(kind),
      fields,
      async (v) => {
        const { title, stream, ...values } = v;
        if (["purchases", "expenses"].includes(kind))
          values.amount = Math.round(values.amount * 100);
        await run(
          "record",
          {
            ...(record ? { id: record.id, version: record.version } : {}),
            outletId: data.outletId,
            title,
            ...(stream
              ? { stream }
              : record?.production_stream
                ? { stream: record.production_stream }
                : {}),
            data: values,
          },
          { kind },
        );
        await load();
      },
    );
  };
  const decide = (record: Row, state: string) =>
    form(
      label(state) + " " + record.title,
      [
        {
          name: "reason",
          label: "Reason",
          value: state === "COMPLETED" ? "Work completed" : "",
        },
      ],
      async (v) => {
        await run(
          "recordDecision",
          { ...v, version: record.version, state },
          { id: record.id },
        );
        await load();
      },
      label(state),
    );
  return (
    <section className="panel">
      {kind === "campaigns" && (
        <div className="panel-heading campaign-setup">
          <IntegrationRequirementsButton kind="messaging" />
          <IntegrationRequirementsButton kind="orderTokens" />
        </div>
      )}
      <div className="panel-heading">
        {kind === "checklists" && can(data.actor, "inventory") && (
          <button
            className="button"
            onClick={() => modal("Prep plan", <PrepPlan />)}
          >
            Prep plan
          </button>
        )}
        <span className="muted">
          {kind === "campaigns"
            ? "Drafts · sending requires a messaging provider"
            : kind === "purchases"
              ? "Purchase records · receive stock separately after delivery"
              : records.length + " records"}
        </span>
        <button
          className="button primary"
          disabled={kind === "purchases" && loading}
          onClick={() => edit()}
        >
          <Icon name="plus" />
          <T>{"Add"}</T>{" "}
          {kind === "brands"
            ? "brand"
            : kind === "expenses"
              ? "expense"
              : kind === "vendors"
                ? "vendor"
                : kind === "purchases"
                  ? "purchase"
                  : kind === "campaigns"
                    ? "draft"
                    : kind === "checklists"
                      ? "checklist"
                      : "reservation"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {filtered && activity.controls}
      <DataTable
        headers={
          kind === "vendors"
            ? ["Vendor", "Supplies", "Details", "State", "Created", ""]
            : [
                kind === "reservations" ? "Guest" : "Title",
                "Details",
                "State",
                "Created",
                "",
              ]
        }
        rows={(filtered ? activity.items : records).map((r) => [
          <strong>
            {kind === "reservations" ? r.data.guest : r.title}
            {kind === "reservations" && <small>{r.data.phone}</small>}
            {kind === "expenses" && r.data.sourcePurchaseId && (
              <small>Purchase · {r.data.reference}</small>
            )}
          </strong>,
          ...(kind === "vendors"
            ? [
                <div>
                  <strong>{r.data.category || "—"}</strong>
                  {r.data.description && <small>{r.data.description}</small>}
                </div>,
              ]
            : []),
          <div className="record-summary">
            {Object.entries(
              kind === "reservations"
                ? {
                    table:
                      data.tables?.find(
                        (table: Row) => table.id === r.data.tableId,
                      )?.label ?? "Assign a table",
                    at: r.data.at,
                    guests: r.data.guests,
                  }
                : r.data,
            )
              .filter(
                ([k]) =>
                  ![
                    "note",
                    "instructions",
                    "description",
                    "vendorId",
                    "active",
                    ...(kind === "vendors" ? ["category"] : []),
                  ].includes(k),
              )
              .slice(0, 3)
              .map(([k, v]) => (
                <span key={k}>
                  <small>{label(k)}</small>
                  {k === "amount"
                    ? money(v)
                    : k === "at"
                      ? date(v)
                      : k === "employeeId"
                        ? (data.assignmentEmployees?.find(
                            (employee: Row) => employee.id === v,
                          )?.name ?? "Employee unavailable")
                        : String(v)}
                </span>
              ))}
          </div>,
          <Badge value={r.state} />,
          date(r.created_at),
          <div className="inline-actions">
            {kind === "expenses" && r.data.sourcePurchaseId && (
              <button
                className="button small"
                onClick={() =>
                  modal(
                    "Source purchase",
                    <div className="form">
                      <strong>{r.title}</strong>
                      <span>Reference: {r.data.reference}</span>
                      <span>Approved purchase · included once in expenses</span>
                      <strong>{money(r.data.amount)}</strong>
                    </div>,
                  )
                }
              >
                View purchase
              </button>
            )}
            {kind === "purchases" &&
              r.state === "APPROVED" &&
              can(data.actor, "inventory") && (
                <button
                  className="button small"
                  onClick={() =>
                    modal(
                      "Receive delivery",
                      <PurchaseReceipt purchase={r} after={load} />,
                    )
                  }
                >
                  Receive delivery
                </button>
              )}
            {kind === "brands" && can(data.actor, "settings") && (
              <>
                <button
                  className="button small"
                  onClick={() => {
                    const store = data.storefronts?.find(
                      (store: Row) => store.brand_id === r.id,
                    );
                    form(
                      "Customer store",
                      [
                        {
                          name: "slug",
                          label: "Store URL name",
                          value:
                            store?.slug ??
                            r.title
                              .toLowerCase()
                              .replace(/[^a-z0-9]+/g, "-")
                              .replace(/^-|-$/g, "") +
                              "-" +
                              r.id.slice(0, 6),
                          maxLength: 80,
                        } as Field,
                        {
                          name: "published",
                          label: "Visibility",
                          type: "select",
                          value: String(store?.published ?? false),
                          options: [
                            { value: "false", label: "Private" },
                            { value: "true", label: "Public customer store" },
                          ],
                        },
                      ],
                      async (values) => {
                        await run("storefront", {
                          ...(store
                            ? { id: store.id, version: store.version }
                            : {}),
                          outletId: data.outletId,
                          brandId: r.id,
                          slug: values.slug,
                          published: values.published === "true",
                        });
                        await load();
                      },
                    );
                  }}
                >
                  Customer store
                </button>
                {data.storefronts
                  ?.filter(
                    (store: Row) => store.brand_id === r.id && store.published,
                  )
                  .map((store: Row) => (
                    <a
                      key={store.id}
                      className="button small"
                      target="_blank"
                      rel="noreferrer"
                      href={"/store/" + store.slug}
                    >
                      View store
                    </a>
                  ))}
              </>
            )}
            {((kind === "vendors" && r.state !== "CANCELLED") ||
              (kind === "checklists" &&
                ["APPROVED", "COMPLETED"].includes(r.state))) && (
              <button className="button small" onClick={() => edit(r)}>
                <T>{"Edit"}</T>
              </button>
            )}
            {r.state === "DRAFT" && (
              <>
                {kind !== "vendors" &&
                  (kind !== "reservations" ||
                    !data.reservations?.some(
                      (booking: Row) =>
                        booking.id === r.id && booking.state === "SEATED",
                    )) && (
                    <button className="button small" onClick={() => edit(r)}>
                      <T>{"Edit"}</T>
                    </button>
                  )}
                <button
                  className="button small"
                  onClick={() =>
                    kind === "purchases"
                      ? void run(
                          "recordDecision",
                          {
                            version: r.version,
                            state: "APPROVED",
                            reason: "Purchase approved",
                          },
                          { id: r.id },
                        )
                          .then(load)
                          .catch(() => {})
                      : decide(r, "APPROVED")
                  }
                >
                  <T>{"Approve"}</T>
                </button>
                <button
                  className="text-button"
                  onClick={() => decide(r, "CANCELLED")}
                >
                  <T>{"Cancel"}</T>
                </button>
              </>
            )}
            {r.state === "APPROVED" && kind !== "campaigns" && (
              <>
                {kind === "reservations" &&
                  !data.reservations?.some(
                    (booking: Row) =>
                      booking.id === r.id && booking.state === "SEATED",
                  ) && (
                    <button className="button small" onClick={() => edit(r)}>
                      <T>{"Edit"}</T>
                    </button>
                  )}
                <button
                  className="button small"
                  onClick={() => decide(r, "COMPLETED")}
                >
                  <T>{"Complete"}</T>
                </button>
                {kind === "reservations" && (
                  <button
                    className="button small"
                    onClick={() => decide(r, "CANCELLED")}
                  >
                    <T>{"Cancel"}</T>
                  </button>
                )}
              </>
            )}
          </div>,
        ])}
      />
      {filtered && activity.pagination}
    </section>
  );
}
