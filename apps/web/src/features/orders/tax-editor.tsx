"use client";
import { T } from "@/lib/staff-language";
import { useState } from "react";
import { type Row } from "@/lib/client";

export function TaxEditor({
  order,
  save,
}: {
  order: Row;
  save: (input: Row) => Promise<unknown>;
}) {
  const [mode, setMode] = useState(
    order.tax_bps_override == null ? "MENU" : "CUSTOM",
  );
  const [rate, setRate] = useState(String((order.tax_bps_override ?? 0) / 100));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        void save({
          version: order.version,
          taxBps: mode === "MENU" ? null : Math.round(Number(rate) * 100),
          reason,
        })
          .catch((error) => setError(error.message))
          .finally(() => setBusy(false));
      }}
    >
      <label className="field">
        Tax option
        <select
          aria-label="Tax option"
          value={mode}
          disabled={busy}
          onChange={(event) => setMode(event.target.value)}
        >
          <option value="MENU">Menu tax rates</option>
          <option value="CUSTOM">Custom rate</option>
        </select>
      </label>
      {mode === "CUSTOM" && (
        <label className="field">
          Tax rate (%)
          <input
            aria-label="Tax rate (%)"
            type="number"
            required
            min="0"
            max="100"
            step="0.01"
            value={rate}
            disabled={busy}
            onChange={(event) => setRate(event.target.value)}
          />
        </label>
      )}
      <label className="field">
        <T>{"Reason"}</T>
        <input
          aria-label="Reason"
          required
          minLength={3}
          maxLength={500}
          value={reason}
          disabled={busy}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <small className="muted">
        Applies to this order and added rounds. Reapply rewards after changing
        tax.
      </small>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <button className="button primary" disabled={busy}>
        {busy ? "Saving…" : "Save tax"}
      </button>
    </form>
  );
}
