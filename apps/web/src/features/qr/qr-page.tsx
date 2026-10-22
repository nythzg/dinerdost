"use client";
import { useEffect, useRef, useState } from "react";
import { isManager } from "@dinerdost/core";
import { Badge, Empty, Icon } from "@/components/ui";
import {
  QrCard,
  TableQr,
  downloadQrCard,
  useQrImage,
} from "@/components/table-qr";
import type { Row } from "@/lib/client";
import { useDesk } from "../workspace/context";
import { ActivationSwitch } from "../tables/activation-switch";

function TableCard({
  table,
  selected,
  onSelect,
  origin,
}: {
  table: Row;
  selected: boolean;
  onSelect: () => void;
  origin: string;
}) {
  const { data, notify, modal, form, run } = useDesk();
  const outlet = data.outlets.find((o: Row) => o.id === data.outletId);
  const url = origin + "/q/" + table.public_key;
  const { image, error } = useQrImage(url);
  const cardProps = {
    url,
    label: table.label,
    restaurant: data.restaurant.name,
    outlet: outlet.name,
  };
  return (
    <article className={"qr-card " + (selected ? "is-selected" : "")}>
      <div className="qr-screen-card">
        <header>
          <h2>{table.label}</h2>
          <input
            type="checkbox"
            checked={selected}
            onChange={onSelect}
            aria-label={"Select " + table.label}
          />
        </header>
        <button
          className="qr-card-preview"
          disabled={!image}
          aria-label={"Preview card for " + table.label}
          onClick={() => modal(table.label, <TableQr {...cardProps} />)}
        >
          {image ? (
            <img
              src={image}
              alt={"Customer QR for " + table.label}
              width="180"
              height="180"
            />
          ) : (
            <span className="qr-placeholder">Preparing…</span>
          )}
        </button>
        <footer>
          <span title={table.floor}>{table.seats} seats</span>
          <div className="qr-icon-actions">
            <button
              className="icon-button"
              title="Download card"
              aria-label={"Download PNG for " + table.label}
              disabled={!image}
              onClick={() =>
                void downloadQrCard(cardProps, image).catch((e) =>
                  notify(e.message),
                )
              }
            >
              <Icon name="download" />
            </button>
            <a
              className="icon-button"
              href={url}
              target="_blank"
              rel="noreferrer"
              title="Open customer menu"
              aria-label={"Preview menu for " + table.label}
            >
              <Icon name="eye" />
            </a>
          </div>
        </footer>
        {data.sessions?.some(
          (session: Row) => session.table_id === table.id,
        ) && (
          <button
            className="button full-width"
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
                (values) => run("closeTable", { ...values, tableId: table.id }),
                "Close table",
              )
            }
          >
            Close table
          </button>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="qr-print-only">
        <QrCard
          image={image}
          label={table.label}
          restaurant={data.restaurant.name}
          outlet={outlet.name}
        />
      </div>
    </article>
  );
}

export function QrPage() {
  const { data, run, busy, notify, go, form } = useDesk();
  const [origin, setOrigin] = useState("");
  const [floor, setFloor] = useState("All floors");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const tables: Row[] = data.tables ?? [];
  const outlet = data.outlets.find((o: Row) => o.id === data.outletId);
  const floors = [...new Set<string>(tables.map((t) => t.floor))];
  const shown = tables.filter(
    (t) =>
      (floor === "All floors" || t.floor === floor) &&
      t.label.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const allVisible =
    shown.length > 0 && shown.every((t) => selected.includes(t.id));
  const tableIds = tables.map((t) => t.id).join(",");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  useEffect(() => {
    setSelected(tables.map((t) => t.id));
    setFloor("All floors");
    setSearch("");
  }, [data.outletId, tableIds]);
  useEffect(() => {
    if (selectAllRef.current)
      selectAllRef.current.indeterminate =
        !allVisible && shown.some((t) => selected.includes(t.id));
  }, [allVisible, selected, shown]);
  const toggleVisible = () =>
    setSelected((current) =>
      allVisible
        ? current.filter((id) => !shown.some((t) => t.id === id))
        : [...new Set([...current, ...shown.map((t) => t.id)])],
    );
  const toggleOrdering = () => {
    const save = () =>
      run("qrPolicy", {
        outletId: outlet.id,
        version: outlet.version,
        enabled: !outlet.qr_enabled,
      }).then(() =>
        notify(
          outlet.qr_enabled ? "QR ordering paused." : "QR ordering enabled.",
        ),
      );
    if (outlet.qr_enabled)
      form("Pause QR ordering?", [], save, "Pause ordering");
    else void save().catch(() => {});
  };
  const print = () => {
    if (
      document.querySelectorAll(".qr-card.is-selected .qr-screen-card img")
        .length !== selected.length
    ) {
      notify("The cards are still preparing. Try again in a moment.");
      return;
    }
    window.print();
  };
  if (!outlet.qr_enabled)
    return (
      <section className="panel">
        <div className="panel-heading">
          <h2>Table QR is off</h2>
        </div>
        <Empty
          action={
            isManager(data.actor) ? (
              <button className="button" onClick={toggleOrdering}>
                Enable Table QR
              </button>
            ) : undefined
          }
        >
          Enable it in Outlets to display and print cards.
        </Empty>
      </section>
    );
  return (
    <div className="qr-page">
      <section className="qr-controls panel">
        <div className="qr-controls-leading">
          <label className="qr-select-all">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allVisible}
              disabled={!shown.length}
              onChange={toggleVisible}
              aria-label="Select visible tables"
            />
            <span>{shown.length} tables</span>
          </label>
          <div className="search-box">
            <Icon name="search" />
            <input
              aria-label="Search tables"
              placeholder="Search tables"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {floors.length > 1 && (
            <select
              className="qr-floor-filter"
              aria-label="Floor filter"
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
            >
              <option>All floors</option>
              {floors.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          )}
        </div>
        <div className="qr-controls-actions">
          {isManager(data.actor) ? (
            <>
              <div className="qr-ordering-control">
                <span>Ordering</span>
                <button
                  className="qr-ordering-switch"
                  type="button"
                  role="switch"
                  aria-label="Customer QR ordering"
                  aria-checked={!!outlet.qr_enabled}
                  disabled={busy}
                  onClick={toggleOrdering}
                >
                  <span />
                </button>
              </div>
              <ActivationSwitch />
            </>
          ) : (
            <Badge value={outlet.qr_enabled ? "LIVE" : "PAUSED"} />
          )}
          <button
            className="button primary"
            title="Print selected table cards"
            disabled={!selected.length || !origin}
            onClick={print}
          >
            <Icon name="print" />
            Print ({selected.length})
          </button>
        </div>
      </section>
      <div className="qr-grid">
        {origin &&
          tables.map((table) => (
            <div
              key={table.id}
              className={
                shown.some((t) => t.id === table.id)
                  ? "qr-grid-item"
                  : "qr-grid-item qr-filtered"
              }
            >
              <TableCard
                table={table}
                selected={selected.includes(table.id)}
                onSelect={() =>
                  setSelected((current) =>
                    current.includes(table.id)
                      ? current.filter((id) => id !== table.id)
                      : [...current, table.id],
                  )
                }
                origin={origin}
              />
            </div>
          ))}
      </div>
      {!tables.length && (
        <Empty
          action={
            <button className="button primary" onClick={() => go("/app/floor")}>
              Add tables
            </button>
          }
        >
          No tables yet.
        </Empty>
      )}
      {tables.length > 0 && !shown.length && <Empty>No matching tables.</Empty>}
    </div>
  );
}
