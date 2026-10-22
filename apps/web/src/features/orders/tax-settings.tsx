"use client";
import { T } from "@/lib/staff-language";
import { useState } from "react";
import type { NamedTax } from "@dinerdost/core";
import { useDesk } from "../workspace/context";
import type { Row } from "@/lib/client";

export function TaxSettings({
  order,
  save,
}: { order?: Row; save?: (input: Row) => Promise<unknown> } = {}) {
  const { data, run, close, busy } = useDesk();
  const outlet = data.outlets.find((row: any) => row.id === data.outletId);
  const [taxes, setTaxes] = useState<{ name: string; rate: string }[]>(
    (
      (order ? order.tax_components : outlet.tax_components) ?? [
        {
          name: "Tax",
          rateBps: Number(
            order ? (order.tax_bps_override ?? 0) : outlet.tax_bps,
          ),
        },
      ]
    ).map((tax: NamedTax) => ({
      name: tax.name,
      rate: String(tax.rateBps / 100),
    })),
  );
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  return (
    <form
      className="form"
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        try {
          const components = taxes.map((tax) => ({
            name: tax.name,
            rateBps: Math.round(Number(tax.rate) * 100),
          }));
          if (order && save)
            await save({ version: order.version, taxes: components, reason });
          else
            await run("taxSettings", {
              outletId: data.outletId,
              version: outlet.version,
              taxes: taxes.map((tax) => ({
                name: tax.name,
                rateBps: Math.round(Number(tax.rate) * 100),
              })),
            });
          close();
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      {taxes.map((tax, index) => (
        <div className="named-tax-row" key={index}>
          <label>
            Tax name
            <input
              aria-label={"Tax name " + (index + 1)}
              required
              maxLength={40}
              value={tax.name}
              onChange={(event) =>
                setTaxes((rows) =>
                  rows.map((row, i) =>
                    index === i ? { ...row, name: event.target.value } : row,
                  ),
                )
              }
            />
          </label>
          <label>
            Rate (%)
            <input
              aria-label={"Tax rate " + (index + 1)}
              type="number"
              required
              min="0"
              max="100"
              step="0.01"
              value={tax.rate}
              onChange={(event) =>
                setTaxes((rows) =>
                  rows.map((row, i) =>
                    index === i ? { ...row, rate: event.target.value } : row,
                  ),
                )
              }
            />
          </label>
          <button
            type="button"
            className="text-button"
            aria-label={"Remove tax " + (index + 1)}
            onClick={() =>
              setTaxes((rows) => rows.filter((_, i) => index !== i))
            }
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="button"
        disabled={taxes.length >= 10 || busy}
        onClick={() => setTaxes((rows) => [...rows, { name: "", rate: "0" }])}
      >
        Add tax
      </button>
      <p className="muted">
        {order
          ? "Applies to this bill and added rounds. Saved outlet defaults stay unchanged."
          : "Saved once for future orders. Existing orders keep their tax settings."}
      </p>
      {order && (
        <label className="field">
          <T>{"Reason"}</T>
          <input
            aria-label="Reason"
            required
            minLength={3}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary" disabled={busy}>
        Save taxes
      </button>
    </form>
  );
}
