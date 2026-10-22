"use client";
import { useState, type FormEvent } from "react";
import {
  paymentMethods,
  paymentMethodNames,
  type PaymentMethod,
} from "@dinerdost/core";
import type { Row } from "@/lib/client";
import { useDesk } from "../workspace/context";

export function PaymentMethodSettings({ outlet }: { outlet: Row }) {
  const { run, close, busy } = useDesk();
  const [version] = useState(outlet.version);
  const [selected, setSelected] = useState<PaymentMethod[]>(
    outlet.payment_methods,
  );
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected.length || busy) return;
    try {
      await run("paymentMethods", {
        outletId: outlet.id,
        version,
        methods: selected,
      });
      close();
    } catch (failure) {
      setError((failure as Error).message);
    }
  }
  return (
    <form className="form" onSubmit={submit}>
      <div className="payment-method-options">
        {paymentMethods.map((method) => (
          <label key={method}>
            <input
              type="checkbox"
              checked={selected.includes(method)}
              disabled={busy}
              onChange={(event) =>
                setSelected((previous) =>
                  event.target.checked
                    ? [...previous, method]
                    : previous.filter((entry) => entry !== method),
                )
              }
            />
            <span>{paymentMethodNames[method]}</span>
          </label>
        ))}
      </div>
      <small>Staff must verify receipts for digital payments.</small>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary" disabled={busy || !selected.length}>
        Save methods
      </button>
    </form>
  );
}
