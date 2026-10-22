"use client";
import { useState } from "react";
import { Icon } from "@/components/ui";
import type { Row } from "@/lib/client";
import { useDesk } from "../workspace/context";
type Option = { id: string; name: string; price: number };
export function MenuOptions({ item }: { item: Row }) {
  const { run, busy, close, notify } = useDesk();
  const [variants, setVariants] = useState<Option[]>(item.variants),
    [modifiers, setModifiers] = useState<Option[]>(item.modifiers);
  return (
    <form
      className="form"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await run("menu", {
            id: item.id,
            version: item.version,
            outletId: item.outlet_id,
            name: item.name,
            category: item.category,
            description: item.description,
            price: Number(item.price),
            taxBps: item.tax_bps,
            unit: item.unit,
            pegMl: item.peg_ml,
            liquorIngredientId: item.liquor_ingredient_id,
            station: item.station,
            active: item.active,
            variants,
            modifiers,
          });
          close();
          notify("Menu options saved.");
        } catch {}
      }}
    >
      {[
        { title: "Variants", rows: variants, set: setVariants },
        { title: "Add-ons", rows: modifiers, set: setModifiers },
      ].map((group) => (
        <section className="option-editor" key={group.title}>
          <div>
            <h3>{group.title}</h3>
            <button
              type="button"
              className="text-button"
              onClick={() =>
                group.set([
                  ...group.rows,
                  { id: crypto.randomUUID(), name: "", price: 0 },
                ])
              }
            >
              + Add
            </button>
          </div>
          {group.rows.map((option) => (
            <div className="option-editor-row" key={option.id}>
              <input
                aria-label={group.title + " name"}
                placeholder="Name"
                required
                value={option.name}
                maxLength={80}
                onChange={(e) =>
                  group.set(
                    group.rows.map((o) =>
                      o.id === option.id ? { ...o, name: e.target.value } : o,
                    ),
                  )
                }
              />
              <label>
                <span>Extra ₹</span>
                <input
                  aria-label={option.name + " extra price"}
                  type="number"
                  step="0.01"
                  min="0"
                  value={option.price / 100}
                  onChange={(e) =>
                    group.set(
                      group.rows.map((o) =>
                        o.id === option.id
                          ? {
                              ...o,
                              price: Math.round(Number(e.target.value) * 100),
                            }
                          : o,
                      ),
                    )
                  }
                />
              </label>
              <button
                className="icon-button"
                aria-label={"Remove " + option.name}
                type="button"
                onClick={() =>
                  group.set(group.rows.filter((o) => o.id !== option.id))
                }
              >
                <Icon name="close" />
              </button>
            </div>
          ))}
          {!group.rows.length && (
            <small>No {group.title.toLowerCase()} added.</small>
          )}
        </section>
      ))}
      <button className="button primary" disabled={busy} type="submit">
        Save options
        <Icon name="check" />
      </button>
    </form>
  );
}
