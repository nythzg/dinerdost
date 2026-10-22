"use client";
import { useState } from "react";
import { ExpiryInput } from "@/components/expiry-input";
import { businessLocalToISO, quantityMilli } from "@dinerdost/core";
import { type Row } from "@/lib/client";
import { useDesk } from "../workspace/context";
export function StockReceipt({ selected }: { selected?: Row }) {
  const { data, run, busy, close } = useDesk(),
    initial = selected ?? data.ingredients?.[0];
  const [ingredientId, setIngredient] = useState(initial?.id ?? ""),
    [cost, setCost] = useState(
      initial?.purchase_rate == null
        ? ""
        : String(Number(initial.purchase_rate) / 100),
    ),
    [packId,setPack]=useState(''),[quantity,setQuantity]=useState('1'),
    [error, setError] = useState("");
  const item = data.ingredients?.find((i: Row) => i.id === ingredientId);
  const packs=(data.purchasePacks??[]).filter((pack:Row)=>pack.ingredient_id===ingredientId),pack=packs.find((pack:Row)=>pack.id===packId);
  return (
    <form
      className="form"
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        const f = new FormData(event.currentTarget);
        try {
          await run("receipt", {
            ingredientId,
            batchNumber: f.get("batchNumber"),
            ...(pack?{packId:pack.id,packVersion:pack.version,packQuantityMilli:quantityMilli(quantity),packCost:Math.round(Number(cost)*100)}:{quantityMilli:quantityMilli(quantity),unitCost:Math.round(Number(cost)*100)}),
            expiresAt: businessLocalToISO(String(f.get("expiry"))),
            reference: f.get("reference"),
          });
          close();
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      <label className="field">
        Ingredient
        <select
          aria-label="Ingredient"
          required
          value={ingredientId}
          onChange={(e) => {
            const next = data.ingredients.find(
              (i: Row) => i.id === e.target.value,
            );
            setIngredient(e.target.value);
            setPack('');setQuantity('1');
            setCost(
              next?.purchase_rate == null
                ? ""
                : String(Number(next.purchase_rate) / 100),
            );
          }}
        >
          {(data.ingredients ?? []).map((i: Row) => (
            <option key={i.id} value={i.id}>
              {i.name} ({i.unit})
            </option>
          ))}
        </select>
      </label>
      {!!packs.length&&<label className="field">Buying unit<select aria-label="Buying unit" value={packId} onChange={event=>{setPack(event.target.value);setQuantity('1');setCost(event.target.value?'':item?.purchase_rate==null?'':String(Number(item.purchase_rate)/100))}}><option value="">{item?.unit} (base unit)</option>{packs.map((pack:Row)=><option key={pack.id} value={pack.id}>{pack.name} · {Number(pack.factor_milli)/1000} {item?.unit} each</option>)}</select></label>}
      <label className="field">
        Batch / lot number
        <input
          aria-label="Batch / lot number"
          name="batchNumber"
          required
          maxLength={80}
        />
      </label>
      <label className="field">
        Quantity ({pack?.name??item?.unit})
        <input
          aria-label="Quantity"
          name="quantity"
          type="number"
          min="0.001"
          step="0.001"
          max="1000000"
          required
          value={quantity}
          onChange={event=>setQuantity(event.target.value)}
        />
      </label>
      <label className="field">
        Cost per {pack?.name??item?.unit} (₹)
        <input
          aria-label={pack?'Cost per pack (₹)':'Cost per unit (₹)'}
          type="number"
          min="0"
          step="0.01"
          max="1000000"
          required
          value={cost}
          onChange={(e) => setCost(e.target.value)}
        />
      </label>
      {pack&&<p className="muted" aria-live="polite">Adds {Number(quantity)*Number(pack.factor_milli)/1000} {item?.unit}. Total receipt cost ₹{(Number(quantity)*Number(cost)).toFixed(2)}.</p>}
      <ExpiryInput name="expiry" />
      <label className="field">
        Invoice / GRN reference
        <input
          aria-label="Invoice / GRN reference"
          name="reference"
          required
          minLength={3}
          maxLength={120}
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary" disabled={busy}>
        Receive stock
      </button>
    </form>
  );
}
