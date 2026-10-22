"use client";
import { T } from "@/lib/staff-language";
import { useState } from "react";
import { paymentMethodNames, type PaymentMethod } from "@dinerdost/core";
import { money, type Row } from "@/lib/client";

export function PaymentRecorder({
  methods,
  remaining,
  save,
}: {
  methods: PaymentMethod[];
  remaining: number;
  save: (input: Row) => Promise<unknown>;
}) {
  const [method, setMethod] = useState(methods[0]);
  const [amount, setAmount] = useState((remaining / 100).toFixed(2));
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const paise = Math.round(Number(amount) * 100);
  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        void save({
          method,
          amount: paise,
          reference: method === "CASH" ? "" : reference,
        })
          .catch((error) => setError(error.message))
          .finally(() => setBusy(false));
      }}
    >
      <label className="field">
        Method
        <select
          aria-label="Method"
          value={method}
          onChange={(event) => setMethod(event.target.value as PaymentMethod)}
          disabled={busy}
        >
          {methods.map((method) => (
            <option key={method} value={method}>
              {paymentMethodNames[method]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <T>{"Amount (₹)"}</T>
        <input
          type="number"
          min="0.01"
          max={remaining / 100}
          step="0.01"
          required
          value={amount}
          disabled={busy}
          onChange={(event) => setAmount(event.target.value)}
        />
      </label>
      {method !== "CASH" && (
        <label className="field">
          Merchant / bank reference
          <input
            required
            minLength={6}
            maxLength={120}
            value={reference}
            disabled={busy}
            onChange={(event) => setReference(event.target.value)}
          />
        </label>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <button className="button primary" disabled={busy}>
        {busy ? "Recording…" : "Record payment · " + money(paise || 0)}
      </button>
    </form>
  );
}
