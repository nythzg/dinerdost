"use client";
import { useEffect, useState } from "react";
import { businessDate, paymentMethods } from "@dinerdost/core";
import { request, type Row } from "@/lib/client";
import { useDesk } from "@/features/workspace/context";
export function useActivity(kind: string, enabled = true, status?: string) {
  const { data } = useDesk(),
    [filter, setFilter] = useState<Record<string, string>>({}),
    [offset, setOffset] = useState(0),
    [result, setResult] = useState<{
      key: string;
      items: Row[];
      hasMore: boolean;
    }>({ key: "", items: [], hasMore: false }),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const params = new URLSearchParams({
      outletId: data.outletId,
      offset: String(offset),
      ...filter,
      ...(status ? { status } : {}),
    }),
    key = kind + "?" + params.toString();
  useEffect(() => setOffset(0), [status, data.outletId]);
  useEffect(() => {
    setFilter({});
    setOffset(0);
  }, [kind, data.outletId]);
  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    setLoading(true);
    void request("/api/activity/" + key, { signal: abort.signal })
      .then((reply) => {
        setResult({ key, items: reply.items, hasMore: reply.hasMore });
        setError("");
      })
      .catch((error) => {
        if (error.name !== "AbortError") setError(error.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [key, data, enabled]);
  const update = (next: Record<string, string>) => {
    setOffset(0);
    setFilter(
      Object.fromEntries(Object.entries(next).filter(([, v]) => v !== "")),
    );
  };
  return {
    items: result.key === key ? result.items : [],
    controls: (
      <ActivityFilter
        key={kind + data.outletId}
        value={filter}
        onChange={update}
        amount={kind !== "checklists"}
        quantity={["invoices", "movements", "purchases"].includes(kind)}
        statusOptions={
          kind === "invoices"
            ? ["FINAL_TAX_INVOICE", "PROVISIONAL_BILL"]
            : kind === "payments"
              ? [...paymentMethods]
              : kind === "movements"
                ? ["RECEIPT", "RECIPE_CONSUMPTION", "WASTAGE"]
                : ["DRAFT", "APPROVED", "COMPLETED", "CANCELLED"]
        }
      />
    ),
    pagination: (
      <div className="activity-pagination">
        <button
          className="button small"
          disabled={offset === 0 || loading}
          onClick={() => setOffset((value) => Math.max(0, value - 100))}
        >
          Previous
        </button>
        <span>
          {offset + 1}–{offset + (result.key === key ? result.items.length : 0)}
        </span>
        <button
          className="button small"
          disabled={result.key !== key || !result.hasMore || loading}
          onClick={() => setOffset((value) => value + 100)}
        >
          Next
        </button>
        {loading && <span role="status">Loading…</span>}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </div>
    ),
  };
}
function ActivityFilter({
  value,
  onChange,
  amount,
  quantity,
  statusOptions,
}: {
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  amount: boolean;
  quantity: boolean;
  statusOptions: string[];
}) {
  const [period, setPeriod] = useState("all"),
    [draft, setDraft] = useState(value);
  function changePeriod(period: string) {
    setPeriod(period);
    const today = businessDate(),
      date = new Date(today + "T00:00:00Z");
    let from = today,
      to = today;
    if (period === "week") {
      date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
      from = date.toISOString().slice(0, 10);
      date.setUTCDate(date.getUTCDate() + 6);
      to = date.toISOString().slice(0, 10);
    }
    if (period === "month") {
      from = today.slice(0, 7) + "-01";
      date.setUTCMonth(date.getUTCMonth() + 1, 0);
      to = date.toISOString().slice(0, 10);
    }
    const next = {
      ...draft,
      from: period === "all" ? "" : from,
      to: period === "all" ? "" : to,
    };
    setDraft(next);
    if (period !== "custom") onChange(next);
  }
  const field = (name: string, label: string, type = "number", scale = 1) => (
    <label>
      {label}
      <input
        aria-label={label}
        type={type}
        min={type === "number" ? 0 : undefined}
        step={type === "number" ? "any" : undefined}
        value={
          draft[name] === undefined || draft[name] === ""
            ? ""
            : type === "number"
              ? Number(draft[name]) / scale
              : draft[name]
        }
        onChange={(event) =>
          setDraft({
            ...draft,
            [name]:
              event.target.value === ""
                ? ""
                : type === "number"
                  ? String(Math.round(Number(event.target.value) * scale))
                  : event.target.value,
          })
        }
      />
    </label>
  );
  return (
    <form
      className="activity-filters"
      onSubmit={(event) => {
        event.preventDefault();
        onChange(draft);
      }}
    >
      <label>
        Period
        <select
          aria-label="Period"
          value={period}
          onChange={(event) => changePeriod(event.target.value)}
        >
          <option value="all">All dates</option>
          <option value="day">Daily</option>
          <option value="week">Weekly</option>
          <option value="month">Monthly</option>
          <option value="custom">Custom dates</option>
        </select>
      </label>
      {period === "custom" && (
        <>
          {field("from", "From date", "date")}
          {field("to", "To date", "date")}
        </>
      )}
      {amount && (
        <>
          {field("minAmount", "Min amount (₹)", "number", 100)}
          {field("maxAmount", "Max amount (₹)", "number", 100)}
        </>
      )}
      {quantity && (
        <>
          {field("minQuantity", "Min quantity", "number", 1000)}
          {field("maxQuantity", "Max quantity", "number", 1000)}
        </>
      )}
      <label>
        Search
        <input
          aria-label="Filter search"
          value={draft.search ?? ""}
          onChange={(event) =>
            setDraft({ ...draft, search: event.target.value })
          }
        />
      </label>
      <label>
        Status
        <select
          aria-label="Filter status"
          value={draft.status ?? ""}
          onChange={(event) =>
            setDraft({ ...draft, status: event.target.value })
          }
        >
          <option value="">All</option>
          {statusOptions.map((value) => (
            <option key={value} value={value}>
              {value.replaceAll("_", " ").toLowerCase()}
            </option>
          ))}
        </select>
      </label>
      <button className="button" type="submit">
        Apply
      </button>
      <button
        className="text-button"
        type="button"
        onClick={() => {
          setPeriod("all");
          setDraft({});
          onChange({});
        }}
      >
        Reset
      </button>
    </form>
  );
}
