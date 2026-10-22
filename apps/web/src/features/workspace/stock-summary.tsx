"use client";
import { T, useStaffTranslation } from "@/lib/staff-language";
import { useEffect, useState } from "react";
import { businessDate } from "@dinerdost/core";
import { DataTable } from "@/components/ui";
import { request, type Row } from "@/lib/client";
import { useDesk } from "./context";
export function StockSummary({
  outletId,
  businessDay,
  hideControls = false,
}: { outletId?: string; businessDay?: string; hideControls?: boolean } = {}) {
  const t = useStaffTranslation();
  const { data } = useDesk(),
    [day, setDay] = useState(businessDate()),
    [search, setSearch] = useState(""),
    [offset, setOffset] = useState(0),
    [result, setResult] = useState<Row | null>(null),
    [error, setError] = useState("");
  const selectedOutlet = outletId ?? data.outletId,
    selectedDay = businessDay ?? day;
  useEffect(() => setOffset(0), [selectedOutlet, selectedDay]);
  useEffect(() => {
    const abort = new AbortController();
    setError("");
    setResult(null);
    void request(
      `/api/stock-summary?outletId=${selectedOutlet}&date=${selectedDay}&search=${encodeURIComponent(search)}&offset=${offset}`,
      { signal: abort.signal },
    )
      .then(setResult)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, [data, selectedOutlet, selectedDay, search, offset]);
  const quantity = (value: unknown) =>
    Number(Number(value) / 1000).toLocaleString("en-IN", {
      maximumFractionDigits: 3,
    });
  return (
    <section className="panel stock-summary-panel">
      <div className="panel-heading">
        {!hideControls && (
          <h2>
            <T>{"Stock"}</T>
          </h2>
        )}
        {!hideControls && (
          <input
            aria-label="Stock business date"
            type="date"
            value={day}
            max={businessDate()}
            onChange={(e) => {
              setDay(e.target.value);
              setOffset(0);
            }}
          />
        )}
        <input
          aria-label="Search stock summary"
          placeholder={t("Search stock")}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOffset(0);
          }}
        />
      </div>
      <small className="stock-period">
        {selectedDay} · India time · quantities in each item’s unit
      </small>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : !result ? (
        <p className="muted">Loading stock…</p>
      ) : (
        <DataTable
          headers={[
            "Item",
            "Unit",
            "Opening stock",
            "Movement",
            "Closing stock",
          ]}
          rows={result.items.map((i: Row) => [
            i.name,
            i.unit,
            quantity(i.opening),
            quantity(i.movement),
            quantity(i.closing),
          ])}
          empty="No inventory items."
        />
      )}
      <div className="activity-pagination">
        <button
          className="button"
          disabled={!offset}
          onClick={() => setOffset((n) => Math.max(0, n - 100))}
        >
          <T>{"Previous"}</T>
        </button>
        <button
          className="button"
          disabled={!result?.hasMore}
          onClick={() => setOffset((n) => n + 100)}
        >
          <T>{"Next"}</T>
        </button>
      </div>
    </section>
  );
}
