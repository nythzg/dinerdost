"use client";
import { useEffect, useState, type FormEvent } from "react";
import { businessDate } from "@dinerdost/core";
import { DataTable } from "@/components/ui";
import { date as displayDate, request, type Row } from "@/lib/client";
import { T } from "@/lib/staff-language";
import { useDesk } from "../workspace/context";
const qty = (value: unknown) =>
  value == null
    ? "—"
    : Number(Number(value) / 1000).toLocaleString("en-IN", {
        maximumFractionDigits: 3,
      });
export function DailyStockCounts({
  outletId,
  day,
  readOnly = false,
}: {
  outletId: string;
  day?: string;
  readOnly?: boolean;
}) {
  const { modal } = useDesk();
  const [selectedDay, setDay] = useState(businessDate()),
    [search, setSearch] = useState(""),
    [offset, setOffset] = useState(0),
    [refresh, setRefresh] = useState(0),
    [result, setResult] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [exporting, setExporting] = useState(false);
  const selected = day ?? selectedDay;
  const url = (page: number) =>
    `/api/stock-counts?outletId=${outletId}&date=${selected}&search=${encodeURIComponent(search)}&offset=${page}`;
  useEffect(() => setOffset(0), [outletId, selected, search]);
  useEffect(() => {
    const abort = new AbortController();
    setResult(null);
    setError("");
    void request(url(offset), { signal: abort.signal })
      .then(setResult)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, [outletId, selected, search, offset, refresh]);
  const editable = !readOnly && selected === businessDate();
  const count = (phase: "OPENING" | "CLOSING") =>
    modal(
      phase === "OPENING" ? "Opening stock" : "Closing stock",
      <CountForm
        outletId={outletId}
        day={selected}
        phase={phase}
        rows={result!.items}
        onSaved={() => setRefresh((n) => n + 1)}
      />,
    );
  const download = async () => {
    setExporting(true);
    setError("");
    try {
      const items: Row[] = [];
      for (let page = 0; ; page += 100) {
        const batch = await request(url(page));
        items.push(...batch.items);
        if (!batch.hasMore) break;
        if (!batch.items.length || page >= 99900)
          throw new Error("Narrow the search and export again.");
      }
      const rows = [
        [
          "Date",
          "Item",
          "Unit",
          "Opening counted",
          "Opening ledger balance",
          "Opening difference",
          "Receipts",
          "Recipe usage",
          "Waste",
          "Other net movement",
          "Expected closing",
          "Closing counted",
          "Variance (counted minus expected)",
        ],
        ...items.map((i) =>
          [
            selected,
            i.name,
            i.unit,
            i.opening?.quantityMilli,
            i.opening?.systemQuantityMilli,
            i.opening?.systemVariance,
            i.receipts,
            i.recipeUsage,
            i.waste,
            i.other,
            i.expectedClosing,
            i.closing?.quantityMilli,
            i.variance,
          ].map((v, index) =>
            index > 2 && v != null ? Number(v) / 1000 : (v ?? ""),
          ),
        ),
      ];
      const cell = (v: unknown) =>
        '"' +
        (typeof v === "number"
          ? String(v)
          : String(v).replace(/^[=+\-@\t\r]/, "'$&")
        ).replaceAll('"', '""') +
        '"';
      const link = document.createElement("a"),
        href = URL.createObjectURL(
          new Blob([rows.map((r) => r.map(cell).join(",")).join("\r\n")], {
            type: "text/csv;charset=utf-8",
          }),
        );
      link.href = href;
      link.download = `stock-variance-${selected}.csv`;
      link.click();
      URL.revokeObjectURL(href);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  };
  return (
    <>
      <div className="panel-tools stock-count-toolbar">
        {!day && (
          <input
            aria-label="Count business date"
            type="date"
            value={selectedDay}
            max={businessDate()}
            onChange={(e) => setDay(e.target.value)}
          />
        )}
        <input
          aria-label="Search daily stock"
          placeholder="Search stock"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {editable && (
          <>
            <button
              className="button"
              disabled={
                !result?.items.some((i: Row) => !i.retired && !i.closing)
              }
              onClick={() => count("OPENING")}
            >
              <T>{"Opening stock"}</T>
            </button>
            <button
              className="button"
              disabled={
                !result?.items.some((i: Row) => !i.retired && i.opening)
              }
              onClick={() => count("CLOSING")}
            >
              <T>{"Closing stock"}</T>
            </button>
          </>
        )}
        <button
          className="button"
          disabled={!result || exporting}
          onClick={() => void download()}
        >
          <T>{"Export CSV"}</T>
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!result ? (
        <p className="muted">Loading counts…</p>
      ) : (
        <>
          <p className="stock-count-summary">
            {selected} · India time · Opening {result.status.opened}/
            {result.status.total} · Closing {result.status.closed}/
            {result.status.total}
          </p>
          {selected === businessDate() && result.status.missingOpening > 0 && (
            <div className="stock-count-reminder" role="status">
              <T>{"Opening stock counts pending"}</T> ·{" "}
              {result.status.missingOpening}.{" "}
              <T>{"Ordering remains available."}</T>
            </div>
          )}
          {(result.missingRecipes > 0 || result.untrackedItems > 0) && (
            <p className="stock-count-summary">
              Recipe coverage incomplete: {result.missingRecipes} active dishes
              without recipes; {result.untrackedItems} released items with
              unrecorded usage on this date.
            </p>
          )}
          <DataTable
            headers={[
              "Item / unit",
              "Opening counted",
              "Receipts",
              "Recipe used",
              "Waste / other",
              "Expected closing",
              "Closing counted",
              "Variance",
            ]}
            rows={result.items.map((i: Row) => [
              <div>
                <strong>{i.name}</strong>
                <small>
                  {i.unit}
                  {i.retired ? " · Archived" : ""}
                </small>
              </div>,
              <CountValue value={i.opening} opening />,
              qty(i.receipts),
              qty(i.recipeUsage),
              <span>
                {qty(i.waste)}
                <small>Other {qty(i.other)}</small>
              </span>,
              qty(i.expectedClosing),
              <CountValue value={i.closing} />,
              <span
                className={
                  i.variance == null || Number(i.variance) === 0
                    ? ""
                    : Number(i.variance) < 0
                      ? "error"
                      : "stock-count-surplus"
                }
              >
                {qty(i.variance)}
                {i.variance != null && Number(i.variance) !== 0 && (
                  <small>
                    {Number(i.variance) < 0 ? "Shortage" : "Surplus"}
                  </small>
                )}
              </span>,
            ])}
            empty="No stock items for this date."
          />
          <p className="stock-count-summary">
            Counts are observations; stock balances are unchanged. Variance
            needs review and is not proof of theft.
          </p>
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
              disabled={!result.hasMore}
              onClick={() => setOffset((n) => n + 100)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </>
  );
}
function CountValue({
  value,
  opening = false,
}: {
  value: Row | null;
  opening?: boolean;
}) {
  return value ? (
    <span
      title={`${value.recordedBy} · ${displayDate(value.recordedAt)}${value.note ? " · " + value.note : ""}`}
    >
      {qty(value.quantityMilli)}
      <small>
        v{value.version} · {value.recordedBy}
      </small>
      {opening && Number(value.systemVariance) !== 0 && (
        <small className="error">vs ledger {qty(value.systemVariance)}</small>
      )}
    </span>
  ) : (
    <span className="muted">Not counted</span>
  );
}
function CountForm({
  outletId,
  day,
  phase,
  rows,
  onSaved,
}: {
  outletId: string;
  day: string;
  phase: "OPENING" | "CLOSING";
  rows: Row[];
  onSaved: () => void;
}) {
  const { run, busy, close } = useDesk(),
    [error, setError] = useState("");
  const field = phase === "OPENING" ? "opening" : "closing";
  const items = rows.filter(
    (i) => !i.retired && (phase === "OPENING" ? !i.closing : !!i.opening),
  );
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const values = new FormData(event.currentTarget);
    try {
      const counts = items.flatMap((i) => {
        const text = String(values.get(i.id) ?? "").trim();
        if (!text) return [];
        if (!/^\d+(\.\d{1,3})?$/.test(text))
          throw new Error(
            "Use nonnegative quantities with up to three decimals.",
          );
        const value = Math.round(Number(text) * 1000);
        if (i[field] && value === Number(i[field].quantityMilli)) return [];
        return [
          {
            ingredientId: i.id,
            quantityMilli: value,
            version: i[field]?.version ?? 0,
          },
        ];
      });
      if (!counts.length)
        throw new Error("Enter at least one new or corrected count.");
      await run("stockCounts", {
        outletId,
        date: day,
        phase,
        counts,
        note: String(values.get("note") ?? ""),
      });
      onSaved();
      close();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <form className="form" onSubmit={(event) => void submit(event)}>
      <p className="muted">
        Enter physical counts in each item's unit. Blank items remain uncounted.
      </p>
      <div className="stock-count-fields">
        {items.map((i) => (
          <label key={i.id}>
            {i.name} ({i.unit})
            <input
              name={i.id}
              aria-label={`${i.name} ${phase.toLowerCase()} count`}
              type="number"
              min="0"
              max="1000000"
              step="0.001"
              inputMode="decimal"
              defaultValue={
                i[field] ? Number(i[field].quantityMilli) / 1000 : ""
              }
            />
            {i[field] && (
              <small>
                Recorded {qty(i[field].quantityMilli)} · correction creates a
                new audited version
              </small>
            )}
          </label>
        ))}
      </div>
      <label>
        Note / correction reason
        <textarea name="note" aria-label="Count note" maxLength={500} />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary" disabled={busy} type="submit">
        <T>{"Save counts"}</T>
      </button>
    </form>
  );
}
