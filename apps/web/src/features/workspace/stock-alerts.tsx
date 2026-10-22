"use client";
import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui";
import { useStaffTranslation } from "@/lib/staff-language";
import { date, type Row } from "@/lib/client";
import { useDesk } from "./context";
export function StockAlerts() {
  const { data,run,busy } = useDesk(),
    alerts = data.stockAlerts;
  const t = useStaffTranslation();
  const [dismissed, setDismissed] = useState("");
  const signature = alerts?.signature ?? "";
  if (dismissed === signature || data.uiDismissals?.includes("STOCK:"+signature)) return null;
  if (!alerts || (!alerts.availability.length && !alerts.batches.length))
    return null;
  const rows = [
    ...alerts.batches.map((b: Row) => ({
      id: b.id,
      name: b.name,
      batch: b.batch_number,
      detail:
        b.phase === "UNKNOWN"
          ? b.expires_on
            ? "Date only · " + String(b.expires_on).slice(0, 10)
            : "Expiry not recorded"
          : date(b.expires_at ?? b.expires_on),
      phase: b.phase,
      amount: Number(b.on_hand) / 1000 + " " + b.unit,
    })),
    ...alerts.availability.map((i: Row) => ({
      id: i.id,
      name: i.name,
      phase: "NO_STOCK",
      detail: "No usable available stock",
      amount: "",
      batch: "",
    })),
  ];
  const labels: Record<string, string> = {
    EXPIRED: "Expired",
    UNKNOWN: "Expiry needed",
    "6H": "Within 6h",
    "12H": "Within 12h",
    "24H": "Within 24h",
    "48H": "Within 48h",
    NO_STOCK: "No stock",
  };
  return (
    <section className="panel stock-alerts-panel" aria-label="Stock alerts">
      <div className="panel-heading">
        <h2>Stock alerts</h2>
        <div className="stock-alert-tools">
          <Link className="subtle-link" href="/app/inventory">
            Inventory
          </Link>
          <button
            className="icon-button"
            aria-label={t("Close stock alerts")}
            disabled={busy}
            onClick={() => {setDismissed(signature);void run("dismissAlert",{outletId:data.outletId,kind:"STOCK",stateKey:signature}).catch(()=>setDismissed(""))}}
          >
            <Icon name="close" />
          </button>
        </div>
      </div>
      <div className="stock-alert-list">
        {rows.slice(0, 8).map((r) => (
          <div key={r.id} className="stock-alert-row">
            <span className={"stock-alert-phase " + r.phase.toLowerCase()}>
              {labels[r.phase]}
            </span>
            <strong>
              {r.name}
              <small>{r.batch}</small>
            </strong>
            <span>{r.detail}</span>
            <span>{r.amount}</span>
          </div>
        ))}
      </div>
      {(rows.length > 8 || alerts.hasMore) && (
        <details className="stock-alert-more">
          <summary>More stock alerts</summary>
          {rows.slice(8).map((r) => (
            <p key={r.id}>
              <strong>{r.name}</strong> · {labels[r.phase]} · {r.batch} ·{" "}
              {r.detail}
            </p>
          ))}
          {alerts.hasMore && (
            <small>
              Showing the first 100 stock items and batches. Review Inventory
              for remaining stock.
            </small>
          )}
        </details>
      )}
    </section>
  );
}
