"use client";
import { useEffect, useState } from "react";
import { DataTable } from "@/components/ui";
import { money, request, type Row } from "@/lib/client";
export function DishReport({
  outletId,
  from,
  to,
}: {
  outletId: string;
  from: string;
  to: string;
}) {
  const [sort, setSort] = useState("DEMAND"),
    [search, setSearch] = useState(""),
    [offset, setOffset] = useState(0),
    [result, setResult] = useState<Row | null>(null),
    [error, setError] = useState("");
  useEffect(() => setOffset(0), [outletId, from, to, sort, search]);
  useEffect(() => {
    const abort = new AbortController();
    setError("");
    setResult(null);
    void request(
      `/api/dish-report?outletId=${outletId}&from=${from}&to=${to}&sort=${sort}&search=${encodeURIComponent(search)}&offset=${offset}`,
      { signal: abort.signal },
    )
      .then(setResult)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, [outletId, from, to, sort, search, offset]);
  return (
    <section className="panel">
      <div className="panel-tools">
        <input
          aria-label="Search dish report"
          placeholder="Search dishes"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Rank dishes by"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="DEMAND">Most ordered</option>
          <option value="PROFIT">Highest profit</option>
          <option value="SALES">Highest sales</option>
        </select>
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : !result ? (
        <p className="muted">Loading dishes…</p>
      ) : (
        <>
          <DataTable
            headers={[
              "Dish",
              "Orders",
              "Quantity",
              "Net sales",
              "Ingredient cost",
              "Profit",
            ]}
            rows={result.items.map((r: Row) => [
              r.name,
              r.orders,
              Number(r.quantity) / 1000 +
                " " +
                (r.unit ?? "(unit not recorded)"),
              money(r.net_sales),
              r.cogs == null ? "Unknown" : money(r.cogs),
              r.profit == null ? (
                <span
                  title={
                    r.unknown_cost_lines + " sale lines lack recorded cost"
                  }
                >
                  Unknown
                </span>
              ) : (
                money(r.profit)
              ),
            ])}
            empty="No settled dishes in this period."
          />
          <p className="stock-period">{result.basis}</p>
        </>
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
    </section>
  );
}
