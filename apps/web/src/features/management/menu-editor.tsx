"use client";
import { useState } from "react";
import { Form, type Field } from "@/components/ui";
import { FileUpload } from "@/components/file-upload";
import type { Row } from "@/lib/client";
import { useDesk } from "../workspace/context";
export function MenuEditor({
  fields,
  item,
  liquor,
  save,
}: {
  fields: Field[];
  item?: Row;
  liquor: boolean;
  save: (input: Row) => Promise<unknown>;
}) {
  const { data, close, notify } = useDesk();
  const [recipe, setRecipe] = useState<{ id: string; quantity: string }[]>(
    (data.recipes ?? [])
      .filter((r: Row) => r.item_id === item?.id)
      .map((r: Row) => ({
        id: r.ingredient_id,
        quantity: String(Number(r.quantity_milli) / 1000),
      })),
  );
  const [image, setImage] = useState(item?.image_url ?? ""),
    [half, setHalf] = useState(
      !!item?.variants?.some((v: Row) => v.id === "half"),
    ),
    [full, setFull] = useState(
      String(
        (Number(item?.price ?? 0) +
          Number(
            item?.variants?.find((v: Row) => v.id === "full")?.price ?? 0,
          )) /
          100,
      ),
    ),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
  return (
    <Form
      fields={fields
        .filter((f) => f.name !== "imageUrl")
        .map((f) =>
          f.name === "price" && half ? { ...f, label: "Half price (₹)" } : f,
        )}
      busy={busy || uploading}
      onSubmit={async (values) => {
        setBusy(true);
        setError("");
        try {
          if (uploading) throw new Error("Wait for the image upload.");
          if (!image.trim()) throw new Error("Upload an item picture.");
          const variants = half
            ? [
                { id: "half", name: "Half", price: 0 },
                {
                  id: "full",
                  name: "Full",
                  price: Math.round((Number(full) - values.price) * 100),
                },
              ]
            : (item?.variants ?? []).filter(
                (v: Row) => !["half", "full"].includes(v.id),
              );
          if (
            half &&
            (values.unit !== "portion" || Number(full) < values.price)
          )
            throw new Error(
              "Half/Full requires portion units and Full price at least Half price.",
            );
          const configured = recipe.map((r) => ({
            id: r.id,
            quantityMilli: Math.round(Number(r.quantity) * 1000),
          }));
          if (
            !liquor &&
            configured.some(
              (r) =>
                !r.id ||
                !Number.isSafeInteger(r.quantityMilli) ||
                r.quantityMilli <= 0,
            )
          )
            throw new Error("Choose each stock item and its recipe quantity.");
          await save({
            ...values,
            imageUrl: image,
            variants,
            ...(!liquor ? { recipe: configured } : {}),
          });
          close();
          notify("Menu item saved.");
        } catch (error) {
          setError((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <FileUpload
        outletId={data.outletId}
        purpose="MENU"
        onBusy={setUploading}
        value={image}
        onChange={setImage}
      />
      {!liquor && (
        <>
          <label className="checkbox-field menu-portions-toggle">
            <input
              type="checkbox"
              checked={half}
              onChange={(event) => setHalf(event.target.checked)}
            />
            <span>Half / Full portions</span>
          </label>
          {half && (
            <label className="field">
              Full price (₹)
              <input
                aria-label="Full price (₹)"
                type="number"
                min="0"
                max="10000000"
                step="0.01"
                value={full}
                onChange={(event) => setFull(event.target.value)}
                required
              />
            </label>
          )}
        </>
      )}
      {!liquor && (
        <fieldset className="recipe-editor">
          <legend>Stock recipe</legend>
          <small className="muted">
            Stock quantity per ordered selling unit.
          </small>
          {recipe.map((line, index) => (
            <div className="recipe-editor-row" key={index}>
              <label>
                Stock item
                <select
                  aria-label={"Recipe stock " + (index + 1)}
                  required
                  value={line.id}
                  onChange={(e) =>
                    setRecipe((rows) =>
                      rows.map((r, i) =>
                        i === index ? { ...r, id: e.target.value } : r,
                      ),
                    )
                  }
                >
                  <option value="">Choose stock</option>
                  {(data.ingredients ?? []).map((i: Row) => (
                    <option value={i.id} key={i.id}>
                      {i.name} · {i.unit}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Quantity
                <input
                  aria-label={"Recipe quantity " + (index + 1)}
                  type="number"
                  min="0.001"
                  max="10000"
                  step="0.001"
                  required
                  value={line.quantity}
                  onChange={(e) =>
                    setRecipe((rows) =>
                      rows.map((r, i) =>
                        i === index ? { ...r, quantity: e.target.value } : r,
                      ),
                    )
                  }
                />
              </label>
              <button
                type="button"
                className="icon-button"
                aria-label={"Remove recipe stock " + (index + 1)}
                onClick={() =>
                  setRecipe((rows) => rows.filter((_, i) => i !== index))
                }
              >
                ×
              </button>
            </div>
          ))}
          {!recipe.length && <p className="muted">Recipe not configured.</p>}
          <button
            type="button"
            className="button"
            onClick={() =>
              setRecipe((rows) => [...rows, { id: "", quantity: "" }])
            }
          >
            Add stock item
          </button>
        </fieldset>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </Form>
  );
}
