"use client";
import { T } from "@/lib/staff-language";
import { useEffect, useState } from "react";
import { DataTable } from "@/components/ui";
import { request, type Row } from "@/lib/client";
import { useDesk } from "../workspace/context";
export function LoyaltyLeaderboard() {
  const { data } = useDesk(),
    [items, setItems] = useState<Row[]>([]),
    [search, setSearch] = useState(""),
    [period, setPeriod] = useState("OVERALL"),
    [offset, setOffset] = useState(0),
    [more, setMore] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    void request(
      `/api/loyalty?outletId=${data.outletId}&period=${period}&offset=${offset}&search=${encodeURIComponent(search)}`,
      { signal: abort.signal },
    )
      .then((reply) => {
        setItems(reply.items);
        setMore(reply.hasMore);
        setError("");
      })
      .catch((error) => {
        if (error.name !== "AbortError") setError(error.message);
      });
    return () => abort.abort();
  }, [data.outletId, data, search, offset, period]);
  return (
    <section className="panel">
      <div className="panel-heading">
        <select
          aria-label="Leaderboard period"
          value={period}
          onChange={(e) => {
            setPeriod(e.target.value);
            setOffset(0);
          }}
        >
          <option value="OVERALL">
            <T>{"Overall"}</T>
          </option>
          <option value="YEAR">
            <T>{"Annual"}</T>
          </option>
          <option value="MONTH">
            <T>{"Monthly"}</T>
          </option>
          <option value="WEEK">
            <T>{"Weekly"}</T>
          </option>
        </select>
        <input
          aria-label="Search leaderboard"
          placeholder="Search customer"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setOffset(0);
          }}
        />
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <DataTable
        headers={[
          "Rank",
          "Customer",
          "Points balance",
          period === "OVERALL" ? "Lifetime earned" : "Period earned",
        ]}
        rows={items.map((row) => [
          "#" + row.rank,
          <strong>
            {row.name}
            <small>
              <T>{"Customer "}</T>
              {row.id.slice(0, 8)}
            </small>
          </strong>,
          Number(row.points).toLocaleString("en-IN"),
          Number(
            period === "OVERALL" ? row.earned : row.period_earned,
          ).toLocaleString("en-IN"),
        ])}
        empty="Customer points will appear here."
      />
      <div className="activity-pagination">
        <button
          className="button"
          disabled={!offset}
          onClick={() => setOffset((value) => Math.max(0, value - 100))}
        >
          <T>{"Previous"}</T>
        </button>
        <button
          className="button"
          disabled={!more}
          onClick={() => setOffset((value) => value + 100)}
        >
          <T>{"Next"}</T>
        </button>
      </div>
    </section>
  );
}
