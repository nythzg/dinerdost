"use client";
import { useState } from "react";
import { Icon } from "@/components/ui";
import { money, type Row } from "@/lib/client";
import { useDesk } from "../workspace/context";

export function InventoryValue({ item }: { item: Row }) {
  const { form, run } = useDesk();
  return (
    <button
      className="text-button stock-value-button"
      aria-label={"Edit " + item.name + " value"}
      disabled={Number(item.on_hand) <= 0}
      onClick={() =>
        form(
          "Edit stock value · " + item.name,
          [
            {
              name: "value",
              label: "Current stock value (₹)",
              type: "number",
              value: Number(item.value) / 100,
              min: 0,
              max: 10000000000,
              step: 0.01,
              help:
                Number(item.on_hand) / 1000 +
                " " +
                item.unit +
                " remaining. Past sales and receipt costs are retained.",
            },
            { name: "reason", label: "Reason", type: "textarea" },
          ],
          (v) =>
            run("stockValue", {
              ingredientId: item.id,
              version: item.version,
              expectedOnHand: Number(item.on_hand),
              expectedValue: Number(item.value),
              value: Math.round(Number(v.value) * 100),
              reason: v.reason,
            }),
          "Save value",
        )
      }
    >
      {money(item.value)}
      <Icon name="edit" />
    </button>
  );
}
export function InventoryDelete({ item }: { item: Row }) {
  const { modal } = useDesk();
  return (
    <button
      className="button small danger-text"
      aria-label={"Delete " + item.name}
      onClick={() =>
        modal("Delete inventory item", <DeleteInventory item={item} />)
      }
    >
      Delete
    </button>
  );
}
function DeleteInventory({ item }: { item: Row }) {
  const { data, run, close, busy } = useDesk(),
    [error, setError] = useState("");
  const stock = Number(item.on_hand) > 0 || Number(item.reserved) > 0,
    recipe =
      (data.recipes ?? []).some((r: Row) => r.ingredient_id === item.id) ||
      (data.menu ?? []).some((m: Row) => m.liquor_ingredient_id === item.id);
  return (
    <div className="form">
      <p>
        {stock
          ? "Record remaining stock as wastage or finish its orders before deleting this item."
          : recipe
            ? "Remove this stock item from recipes and liquor items before deleting it."
            : "Remove " +
              item.name +
              " from Inventory? Recorded movements and costs will be kept."}
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="inline-actions">
        <button className="button" disabled={busy} onClick={close}>
          Cancel
        </button>
        <button
          className="button primary"
          disabled={busy || stock || recipe}
          onClick={() =>
            void run("ingredientArchive", {
              ingredientId: item.id,
              version: item.version,
            })
              .then(close)
              .catch((e) => setError(e.message))
          }
        >
          Delete item
        </button>
      </div>
    </div>
  );
}
