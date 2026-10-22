"use client";
import { T } from "@/lib/staff-language";
import { useContext, useState } from "react";
import { wholeUnit } from "@dinerdost/core";
import { Icon } from "@/components/ui";
import { money, type Row } from "@/lib/client";
import { DeskContext } from "./context";
export function DishPicker({
  item,
  onAdd,
  onClose,
}: {
  item: Row;
  onAdd: (line: Row) => void;
  onClose?: () => void;
}) {
  const desk = useContext(DeskContext);
  const close = onClose ?? desk?.close ?? (() => {});
  const portions =
    item.variants.length === 2 &&
    item.variants.some((v: Row) => v.id === "half") &&
    item.variants.some((v: Row) => v.id === "full");
  const [variant, setVariant] = useState(portions ? "half" : ""),
    [modifiers, setModifiers] = useState<string[]>([]),
    [quantity, setQuantity] = useState("1"),
    [note, setNote] = useState("");
  const selected = item.variants.find((v: Row) => v.id === variant);
  const price =
    Number(item.price) +
    Number(selected?.price ?? 0) +
    item.modifiers
      .filter((m: Row) => modifiers.includes(m.id))
      .reduce((n: number, m: Row) => n + Number(m.price), 0);
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        onAdd({
          ...item,
          price,
          variant: variant || undefined,
          modifiers,
          note,
          quantity: Number(quantity),
        });
        close();
      }}
    >
      {portions && (
        <fieldset className="portion-options">
          <legend>
            <T>{"Portion"}</T>
          </legend>
          {item.variants.map((option: Row) => (
            <label
              key={option.id}
              className={variant === option.id ? "selected" : ""}
            >
              <input
                type="radio"
                name="portion"
                value={option.id}
                checked={variant === option.id}
                onChange={() => setVariant(option.id)}
              />
              <strong>
                <T>{option.name}</T>
              </strong>
              <span>{money(Number(item.price) + Number(option.price))}</span>
            </label>
          ))}
        </fieldset>
      )}
      {!portions && item.variants.length > 0 && (
        <label className="field">
          <T>{"Variant"}</T>
          <select
            aria-label="Variant"
            value={variant}
            onChange={(e) => setVariant(e.target.value)}
          >
            {!portions && (
              <option value="">
                <T>{"Standard"}</T>
              </option>
            )}
            {item.variants.map((v: Row) => (
              <option key={v.id} value={v.id}>
                {v.name} ·{" "}
                {portions
                  ? money(Number(item.price) + Number(v.price))
                  : "+" + money(v.price)}
              </option>
            ))}
          </select>
        </label>
      )}
      {item.modifiers.length > 0 && (
        <div className="modifier-list">
          <h3>
            <T>{"Add-ons"}</T>
          </h3>
          {item.modifiers.map((m: Row) => (
            <label key={m.id}>
              <input
                type="checkbox"
                aria-label={m.name}
                checked={modifiers.includes(m.id)}
                onChange={(e) =>
                  setModifiers(
                    e.target.checked
                      ? [...modifiers, m.id]
                      : modifiers.filter((id) => id !== m.id),
                  )
                }
              />
              <span>{m.name}</span>
              <strong>+{money(m.price)}</strong>
            </label>
          ))}
        </div>
      )}
      <label className="field">
        <T>{"Quantity"}</T>
        <input
          type="number"
          aria-label="Quantity"
          min={wholeUnit(item.unit) ? 1 : 0.001}
          max={10000}
          step={wholeUnit(item.unit) ? 1 : 0.001}
          required
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </label>
      <label className="field">
        <T>{"Kitchen note"}</T>
        <textarea
          aria-label="Kitchen note"
          maxLength={250}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Any preparation requests?"
        />
      </label>
      <button className="button primary">
        Add · {money(Math.round(price * Number(quantity)))}
        <Icon name="plus" />
      </button>
    </form>
  );
}
