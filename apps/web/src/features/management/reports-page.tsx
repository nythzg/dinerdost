"use client";
import { T } from "@/lib/staff-language";
import { useCallback, useEffect, useState } from "react";
import { businessDate, can } from "@dinerdost/core";
import { DataTable, Empty } from "@/components/ui";
import { label, money, request, type Row } from "@/lib/client";
import { useDesk } from "../workspace/context";
import { StockSummary } from "../workspace/stock-summary";
import { WasteReport } from "./waste-report";
import { DishReport } from "./dish-report";
import { DailyStockCounts } from "./daily-stock-counts";

import { ReportCharts } from "./report-charts";
export function Reports() {
  const { data } = useDesk(),
    [tab, setTab] = useState("Sales"),
    [outlet, setOutlet] = useState(data.outletId),
    [day, setDay] = useState(businessDate()),
    [from, setFrom] = useState(businessDate().slice(0, 8) + "01"),
    [to, setTo] = useState(businessDate());
  return (
    <>
      <div className="tabs report-tabs">
        {[
          "Sales",
          ...(can(data.actor, "inventory")
            ? ["Stock", "Waste", "Usage", "Stock variance"]
            : []),
          "Dish profit",
        ].map((name) => (
          <button
            key={name}
            className={tab === name ? "selected" : ""}
            onClick={() => {
              if (name !== "Dish profit" && !outlet) setOutlet(data.outletId);
              setTab(name);
            }}
          >
            {name}
          </button>
        ))}
      </div>
      {tab === "Sales" ? (
        <SalesReport />
      ) : (
        <>
          <div className="toolbar reports-period">
            {tab === "Dish profit" ? (
              <>
                <label>
                  From
                  <input
                    aria-label="Report from"
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </label>
                <label>
                  To
                  <input
                    aria-label="Report to"
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </label>
              </>
            ) : (
              <label>
                Date
                <input
                  aria-label="Report business date"
                  type="date"
                  value={day}
                  max={businessDate()}
                  onChange={(e) => setDay(e.target.value)}
                />
              </label>
            )}
            <select
              aria-label="Report outlet"
              value={outlet}
              onChange={(e) => setOutlet(e.target.value)}
            >
              {tab === "Dish profit" && (
                <option value="">All assigned outlets</option>
              )}
              {data.outlets.map((o: Row) => (
                <option value={o.id} key={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          {tab === "Stock" ? (
            <StockSummary outletId={outlet} businessDay={day} hideControls />
          ) : tab === "Stock variance" ? (
            <section className="panel">
              <DailyStockCounts outletId={outlet} day={day} readOnly />
            </section>
          ) : tab === "Waste" || tab === "Usage" ? (
            <section className="panel">
              <WasteReport
                key={tab}
                outletId={outlet}
                day={day}
                usage={tab === "Usage"}
              />
            </section>
          ) : (
            <DishReport outletId={outlet} from={from} to={to} />
          )}
        </>
      )}
    </>
  );
}
function SalesReport() {
  const { data } = useDesk();
  const [from, setFrom] = useState(businessDate().slice(0, 8) + "01"),
    [to, setTo] = useState(businessDate());
  const [outlet, setOutlet] = useState(data.outletId),
    [report, setReport] = useState<Row | null>(null),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setReport(
        await request(
          `/api/reports?from=${from}&to=${to}` +
            (outlet ? `&outlet=${outlet}` : ""),
        ),
      );
      setError("");
    } catch (e) {
      setReport(null);
      setError((e as Error).message);
    }
  }, [from, to, outlet]);
  useEffect(() => {
    void load();
  }, [load]);
  const download = () => {
    if (!report) return;
    const clean = (value: unknown) =>
      '"' +
      String(value ?? "")
        .replace(/^[=+\-@\t\r]/, "'$&")
        .replaceAll('"', '""') +
      '"';
    const rows = [
      ["From", report.from],
      ["To", report.to],
      ["Net receipts (paise)", report.receipts],
      ["Gross issued amount (paise)", report.grossReceipts],
      ["Manual refunds (paise)", report.refunds],
      ["Paid replacement credits (paise)", report.replacementCredits??0],
      ["Net sales (paise)", report.netSales],
      ["Tax (paise)", report.tax],
      ["Charges (paise)", report.charges],
      ["COGS (paise)", report.cogs],
      ["Operating expenses (paise)", report.expenses],
      ["Operating result (paise)", report.operatingResult],
      [],
      ["Channel", "Orders", "Receipts (paise)"],
      ...report.channels.map((row: Row) => [
        row.source,
        row.orders,
        row.amount,
      ]),
      [],
      ["Payment method", "Receipts (paise)"],
      ...report.methods.map((row: Row) => [row.method, row.amount]),
      [],["Refund record","Order","Invoice","Amount (paise)","Mode","Reason"],
      ...(report.refundRows??[]).map((r:Row)=>[r.number,r.order_id,r.invoice_id,r.amount,r.mode,r.reason]),
      [],['Replacement record','Original order','Replacement order','Credit (paise)','Reason'],
      ...(report.replacementRows??[]).map((r:Row)=>[r.number,r.source_order_id,r.target_order_id,r.amount,r.reason]),
    ];
    const url = URL.createObjectURL(
      new Blob([rows.map((row) => row.map(clean).join(",")).join("\r\n")], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `dinerdost-report-${from}-${to}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <>
      <div className="toolbar reports-period">
        <label>
          <T>{"From"}</T>
          <input
            aria-label="Report from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          <T>{"To"}</T>
          <input
            aria-label="Report to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <select
          aria-label="Report outlet"
          value={outlet}
          onChange={(e) => setOutlet(e.target.value)}
        >
          <option value="">All assigned outlets</option>
          {data.outlets.map((row: Row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
        <button className="button" disabled={!report} onClick={download}>
          Export CSV
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {!report ? (
        !error && <Empty>Loading report…</Empty>
      ) : (
        <>
          {Number(report.refunds)>0&&<p className="panel">Manual refunds: <strong>{money(report.refunds)}</strong> · Net receipts below include these adjustments. Original payment-method totals retain collected amounts.</p>}
          {Number(report.replacementCredits)>0&&<p className="panel">Paid replacement credits: <strong>{money(report.replacementCredits)}</strong> · Net sales include linked credits against previously issued invoices. Credits are not new collections.</p>}
          <div className="metric-grid three">
            {[
              ["Settled sales", report.receipts],
              ["Net sales", report.netSales],
              ["Cost of goods", report.cogs],
              ["Operating expenses", report.expenses],
              ["Gross margin", report.grossMargin],
              ["Operating result", report.operatingResult],
            ].map(([name, amount]) => (
              <article className="metric" key={name}>
                <span>{name}</span>
                <strong>{money(amount)}</strong>
              </article>
            ))}
          </div>
          <ReportCharts report={report} />
          <section className="panel">
            <div className="panel-heading">
              <h2>Sales by channel</h2>
              <span className="muted">{report.orders} settled orders</span>
            </div>
            <DataTable
              headers={["Channel", "Settled orders", "Received"]}
              rows={report.channels.map((row: Row) => [
                label(row.source),
                row.orders,
                money(row.amount),
              ])}
            />
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>Payment methods</h2>
            </div>
            <DataTable
              headers={["Method", "Payments", "Received"]}
              rows={report.methods.map((row: Row) => [
                label(row.method),
                row.payments,
                money(row.amount),
              ])}
            />
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>Daily sales</h2>
            </div>
            <DataTable
              headers={["Date", "Orders", "Received"]}
              rows={report.daily.map((row: Row) => [
                String(row.date).slice(0, 10),
                row.orders,
                money(row.amount),
              ])}
            />
          </section>
          <p className="muted">
            Final invoices and approved expenses. Stock purchases{" "}
            {money(report.stockPurchases)} are listed separately from consumed
            stock costs.
          </p>
        </>
      )}
    </>
  );
}
