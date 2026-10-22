"use client";
import { T } from "@/lib/staff-language";
import { useId, useState, type FormEvent } from "react";
import { quantityMilli, wholeUnit } from "@dinerdost/core";
import { Icon } from "@/components/ui";
import type { Row } from "@/lib/client";
import { showStaffOrderPlaced } from "@/lib/order-placed";
import { useDesk } from "../workspace/context";

type EditorLine = {
  item: Row;
  unit: string;
  quantity: string;
  variant?: string;
};

function quantityError(value: string, unit: string) {
  if (!value) return "Enter a quantity.";
  if (Number(value) === 0) return "Use Delete to remove this item.";
  try {
    const amount = quantityMilli(value);
    if (wholeUnit(unit) && amount % 1000 !== 0)
      return "Use whole numbers, such as 1 or 2.";
    return "";
  } catch {
    return wholeUnit(unit)
      ? "Enter a whole number from 1 to 10,000."
      : "Enter 0.001 to 10,000, with up to 3 decimal places.";
  }
}

export function RoundEditor({
  round,
  save,
}: {
  round: Row;
  save: (input: Row) => Promise<unknown>;
}) {
  const { data, close, notify } = useDesk();
  const id = useId();
  const [lines, setLines] = useState<EditorLine[]>(() =>
    round.items.map((item: Row) => {
      const menuItem = data.menu.find(
        (entry: Row) => entry.id === item.item_id,
      );
      return {
        item,
        unit: String(menuItem?.unit ?? "portion"),
        quantity: String(Number(item.quantity_milli) / 1000),
        // Keep a missing variant invalid rather than silently dropping its price.
        variant: item.variant
          ? (menuItem?.variants.find(
              (option: Row) => option.name === item.variant,
            )?.id ?? item.variant)
          : undefined,
      };
    }),
  );
  const [removed, setRemoved] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const visible = lines.filter((line) => !removed.includes(line.item.id));
  const valid =
    visible.length > 0 &&
    visible.every((line) => !quantityError(line.quantity, line.unit));

  function change(itemId: string, quantity: string) {
    setLines((previous) =>
      previous.map((line) =>
        line.item.id === itemId ? { ...line, quantity } : line,
      ),
    );
    setError("");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setError("");
    try {
      const result = await save({
        version: round.version,
        submit: true,
        items: visible.map(({ item, quantity, variant }) => ({
          itemId: item.item_id,
          quantity,
          modifiers: (item.modifiers ?? []).map((modifier: Row) => modifier.id),
          ...(variant ? { variant } : {}),
          note: item.note,
        })),
      });
      close();
      notify("Round updated.");
      if (round.status === 'DRAFT') {
        const saved = result as Row;
        showStaffOrderPlaced(saved.order ?? saved, data);
      }
    } catch (failure) {
      setError((failure as Error).message);
      setSaving(false);
    }
  }

  return (
    <form className="round-editor" onSubmit={submit} noValidate>
      <fieldset disabled={saving}>
        <div className="round-editor-lines">
          {visible.map(({ item, quantity, unit }) => {
            const inputId = id + item.id;
            const issue = quantityError(quantity, unit);
            const whole = wholeUnit(unit);
            const amount = Number(quantity);
            const minimum = whole ? 1 : 0.001;
            const step = whole ? 1000 : 1;
            const options = [
              item.variant,
              ...(item.modifiers ?? []).map((modifier: Row) => modifier.name),
            ].filter(Boolean);
            return (
              <div
                className="round-editor-line"
                key={item.id}
                role="group"
                aria-labelledby={inputId + "-name"}
              >
                <div className="round-editor-name">
                  <strong id={inputId + "-name"}>{item.name}</strong>
                  {options.length > 0 && <small>{options.join(" · ")}</small>}
                  {item.note && <small>{item.note}</small>}
                </div>
                <div className="round-editor-controls">
                  <div className="round-editor-quantity">
                    <label className="sr-only" htmlFor={inputId}>
                      {item.name} quantity
                    </label>
                    <div className="round-editor-stepper">
                      <button
                        type="button"
                        aria-label={"Decrease " + item.name + " quantity"}
                        disabled={!!issue || amount <= minimum}
                        onClick={() =>
                          change(
                            item.id,
                            String((Math.round(amount * 1000) - step) / 1000),
                          )
                        }
                      >
                        <Icon name="minus" />
                      </button>
                      <input
                        id={inputId}
                        type="number"
                        inputMode={whole ? "numeric" : "decimal"}
                        min={minimum}
                        max={10000}
                        step={whole ? 1 : 0.001}
                        required
                        value={quantity}
                        aria-invalid={!!issue}
                        aria-describedby={
                          issue ? inputId + "-error" : undefined
                        }
                        onChange={(event) =>
                          change(item.id, event.target.value)
                        }
                      />
                      <button
                        type="button"
                        aria-label={"Increase " + item.name + " quantity"}
                        disabled={!!issue || amount >= 10000}
                        onClick={() =>
                          change(
                            item.id,
                            String((Math.round(amount * 1000) + step) / 1000),
                          )
                        }
                      >
                        <Icon name="plus" />
                      </button>
                    </div>
                    {unit !== "portion" && (
                      <span className="round-editor-unit">{unit}</span>
                    )}
                  </div>
                  <button
                    className="button round-editor-delete danger-text"
                    type="button"
                    aria-label={"Delete " + item.name}
                    onClick={() => {
                      setRemoved((previous) => [...previous, item.id]);
                      setError("");
                    }}
                  >
                    <Icon name="trash" />
                    <T>{"Delete"}</T>
                  </button>
                </div>
                {issue && (
                  <p
                    className="round-editor-error"
                    id={inputId + "-error"}
                    role="alert"
                  >
                    {issue}
                  </p>
                )}
              </div>
            );
          })}
          {visible.length === 0 && (
            <p className="round-editor-empty">
              Keep at least one item. To cancel the entire round, use Void
              round.
            </p>
          )}
        </div>
        {removed.length > 0 && (
          <button
            type="button"
            className="text-button round-editor-undo"
            onClick={() => setRemoved((previous) => previous.slice(0, -1))}
          >
            Undo delete
          </button>
        )}
        {error && (
          <p className="round-editor-error" role="alert">
            {error}
          </p>
        )}
        <div className="round-editor-footer">
          <button className="button" type="button" onClick={close}>
            <T>{"Cancel"}</T>
          </button>
          <button
            className="button primary"
            type="submit"
            disabled={!valid || saving}
          >
            {saving
              ? "Saving…"
              : round.status === "DRAFT"
                ? "Save & submit"
                : "Save changes"}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
