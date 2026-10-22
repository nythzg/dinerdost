"use client";
import { T } from "@/lib/staff-language";
import { useState } from "react";
import { ExpiryInput } from "@/components/expiry-input";
import { businessLocalToISO, quantityMilli } from "@dinerdost/core";
import { type Row } from "@/lib/client";
import { useDesk } from "../workspace/context";

export function PurchaseReceipt({
  purchase,
  after,
}: {
  purchase: Row;
  after: () => Promise<void>;
}) {
  const { data, run, busy, close } = useDesk();
  const [lines, setLines] = useState<Row[]>([]),
    [reference, setReference] = useState(purchase.data.reference),
    [error, setError] = useState("");
  const ingredients = (data.ingredients ?? []).filter(
    (ingredient: Row) =>
      ingredient.production_stream === purchase.production_stream,
  );
  const change = (index: number, field: string, value: string) =>
    setLines((rows) =>
      rows.map((row, i) => (index === i ? { ...row, [field]: value } : row)),
    );
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        try {
          const input = {
            purchaseId: purchase.id,
            version: purchase.version,
            reference,
            lines: lines.map((line) => ({
              ingredientId: line.ingredientId,
              batchNumber: line.batchNumber,
              quantityMilli: quantityMilli(line.quantity),
              unitCost: Math.round(Number(line.cost) * 100),
              expiresAt: businessLocalToISO(line.expiresOn),
            })),
          };
          void run("receivePurchase", input)
            .then(async () => {
              await after();
              close();
            })
            .catch((e) => setError(e.message));
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      <label className="field">
        Receipt reference
        <input
          aria-label="Receipt reference"
          value={reference}
          required
          minLength={3}
          maxLength={120}
          onChange={(e) => setReference(e.target.value)}
        />
      </label>
      {lines.map((line, index) => (
        <fieldset key={index} className="purchase-receipt-line">
          <legend>Batch {index + 1}</legend>
          <label>
            Ingredient
            <select
              aria-label={"Received ingredient " + (index + 1)}
              required
              value={line.ingredientId}
              onChange={(e) => {
                change(index, "ingredientId", e.target.value);
                const ingredient = ingredients.find(
                  (i: Row) => i.id === e.target.value,
                );
                change(
                  index,
                  "cost",
                  ingredient?.purchase_rate == null
                    ? ""
                    : String(Number(ingredient.purchase_rate) / 100),
                );
              }}
            >
              <option value="">
                <T>{"Choose…"}</T>
              </option>
              {ingredients.map((ingredient: Row) => (
                <option key={ingredient.id} value={ingredient.id}>
                  {ingredient.name} ({ingredient.unit})
                </option>
              ))}
            </select>
          </label>
          <label>
            Batch number
            <input
              required
              aria-label={"Batch number " + (index + 1)}
              value={line.batchNumber}
              maxLength={80}
              onChange={(e) => change(index, "batchNumber", e.target.value)}
            />
          </label>
          <label>
            <T>{"Quantity"}</T>
            <input
              required
              aria-label={"Received quantity " + (index + 1)}
              type="number"
              min="0.001"
              step="0.001"
              value={line.quantity}
              onChange={(e) => change(index, "quantity", e.target.value)}
            />
          </label>
          <label>
            Cost per unit (₹)
            <input
              required
              aria-label={"Received unit cost " + (index + 1)}
              type="number"
              min="0"
              step="0.01"
              value={line.cost}
              onChange={(e) => change(index, "cost", e.target.value)}
            />
          </label>
          <ExpiryInput
            label={"Received expiry " + (index + 1)}
            value={line.expiresOn}
            onChange={(value) => change(index, "expiresOn", value)}
          />
          <button
            className="text-button"
            type="button"
            onClick={() =>
              setLines((rows) => rows.filter((_, i) => i !== index))
            }
          >
            Remove batch
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="button"
        disabled={lines.length >= 100 || !ingredients.length}
        onClick={() =>
          setLines((rows) => [
            ...rows,
            {
              ingredientId: "",
              batchNumber: "",
              quantity: "1",
              cost: "0",
              expiresOn: "",
            },
          ])
        }
      >
        Add received batch
      </button>
      {!ingredients.length && (
        <p className="muted">
          Add stock ingredients for this purchase's food/bar stream first.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary" disabled={busy || !lines.length}>
        Receive delivery
      </button>
    </form>
  );
}
