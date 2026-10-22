"use client";
import { useEffect, useState } from "react";
import { businessDate } from "@dinerdost/core";
import { DataTable } from "@/components/ui";
import { date as formatDate, money, request, type Row } from "@/lib/client";
export function WasteReport({
  outletId,
  day: controlledDay,
  usage = false,
}: {
  outletId: string;
  day?: string;
  usage?: boolean;
}) {
  const [day, setDay] = useState(businessDate()),
    [offset, setOffset] = useState(0),
    [search, setSearch] = useState(""),
    [result, setResult] = useState<Row | null>(null),
    [error, setError] = useState("");
  const selected = controlledDay ?? day;
  useEffect(() => {
    setOffset(0);
  }, [selected, outletId, search]);
  useEffect(() => {
    const abort = new AbortController();
    setResult(null);
    setError("");
    void request(
      `/api/stock-reports?outletId=${outletId}&date=${selected}&offset=${offset}&search=${encodeURIComponent(search)}${usage ? "&view=usage" : ""}`,
      { signal: abort.signal },
    )
      .then(setResult)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, [outletId, selected, offset, search, usage]);
  return (
    <div className="waste-report">
      <div className="panel-tools">
        {!controlledDay && (
          <input
            type="date"
            aria-label="Waste business date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        )}
        <input
          aria-label={usage ? "Search usage" : "Search waste"}
          placeholder={usage ? "Search usage" : "Search waste"}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : !result ? (
        <p className="muted">Loading…</p>
      ) : usage ? (
        <DataTable
          headers={[
            "Item",
            "Opening",
            "Recipe usage",
            "Actual cost",
            "Closing",
          ]}
          rows={result.items.map((r: Row) => [
            r.name,
            Number(r.opening) / 1000 + " " + r.unit,
            Number(r.quantity) / 1000 + " " + r.unit,
            money(r.cost),
            Number(r.closing) / 1000 + " " + r.unit,
          ])}
          empty="No stock items for this date."
        />
      ) : (
        <DataTable
          headers={["Item", "Batch", "Quantity", "Cost", "Reason", "Recorded"]}
          rows={result.items.map((r: Row) => [
            r.name,
            r.batch_number ?? "—",
            Number(r.quantity) / 1000 + " " + r.unit,
            money(r.cost),
            r.reason,
            formatDate(r.created_at),
          ])}
          empty="No waste recorded for this date."
        />
      )}
      <div className="activity-pagination">
        <button
          className="button"
          disabled={!offset}
          onClick={() => setOffset((n) => Math.max(0, n - 100))}
        >
          Previous
        </button>
        <button
          className="button"
          disabled={!result?.hasMore}
          onClick={() => setOffset((n) => n + 100)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
