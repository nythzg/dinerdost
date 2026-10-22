"use client";
import { T } from "@/lib/staff-language";
import { useState } from "react";
import { quote, roundAdjustment } from "@dinerdost/core";
import { money, type Row } from "@/lib/client";

export function AdjustmentsEditor({
  rounds,
  save,
  loyaltyCap,
}: {
  rounds: Row[];
  save: (roundId: string, input: Row) => Promise<unknown>;
  loyaltyCap?: { value: number; version: number; save: (limit: number, version: number) => Promise<{version: number}> };
}) {
  const [roundId, setRoundId] = useState(rounds[0].id),
    [discount, setDiscount] = useState(
      String(Number(rounds[0].manual_discount ?? 0) / 100),
    ),
    [rounding, setRounding] = useState(!!rounds[0].rounding_enabled),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [cap, setCap] = useState(String(Number(loyaltyCap?.value ?? 0) / 100));
  const [capVersion, setCapVersion] = useState(loyaltyCap?.version ?? 0);
  const [capBusy, setCapBusy] = useState(false), [capMessage, setCapMessage] = useState(''), [capError, setCapError] = useState('');
  const capAmount = Math.round(Number(cap) * 100);
  const capValid = /^\d+(\.\d{1,2})?$/.test(cap) && Number.isSafeInteger(capAmount) && capAmount >= 0 && capAmount <= 1000000000;
  const round = rounds.find((r) => r.id === roundId)!;
  const amount = Math.round(Number(discount) * 100);
  const valid =
    Number.isSafeInteger(amount) &&
    amount >= 0 &&
    amount <= Number(round.subtotal);
  const calculated = valid
    ? quote(
        round.items.map((i: Row) => ({
          unit_price: Number(i.unit_price),
          quantity_milli: Number(i.quantity_milli),
          tax_bps: Number(i.tax_bps),
        })),
        amount,
      )
    : null;
  const beforeRounding =
    (calculated?.payable ?? 0) + Number(round.charges_total);
  const previewPayable=beforeRounding+roundAdjustment(beforeRounding,rounding,'DOWN');
  const coversReceived=previewPayable>=Number(round.paid);
  return (
    <>
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy || capBusy || !valid || !coversReceived) return;
        setBusy(true);
        setError("");
        void save(roundId, {
          version: round.version,
          discount: amount,
          roundToRupee: rounding,
          roundingMode: "DOWN",
        })
          .catch((e) => setError(e.message))
          .finally(() => setBusy(false));
      }}
    >
      {rounds.length > 1 && (
        <label className="field">
          <T>{"Round"}</T>
          <select
            aria-label="Adjustment round"
            disabled={busy}
            value={roundId}
            onChange={(e) => {
              const next = rounds.find((r) => r.id === e.target.value)!;
              setRoundId(next.id);
              setDiscount(String(Number(next.manual_discount ?? 0) / 100));
              setRounding(!!next.rounding_enabled);
            }}
          >
            {rounds.map((r) => (
              <option key={r.id} value={r.id}>
                <T>{"Round "}</T>
                {r.round_number}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="field">
        <T>{"Discount (₹)"}</T>
        <input
          aria-label="Discount (₹)"
          type="number"
          step="0.01"
          required
          min="0"
          max={Number(round.subtotal) / 100}
          value={discount}
          disabled={busy}
          onChange={(e) => setDiscount(e.target.value)}
        />
      </label>
      <label className="adjustment-toggle">
        <input
          type="checkbox"
          checked={rounding}
          disabled={busy}
          onChange={(e) => setRounding(e.target.checked)}
        />
        <T>{"Round down to ₹1"}</T>
      </label>
      <div className="total-row">
        <span>
          <T>{"Round off"}</T>
        </span>
        <strong>
          {money(valid ? roundAdjustment(beforeRounding, rounding, "DOWN") : 0)}
        </strong>
      </div>
      <div className="total-row">
        <span>
          <T>{"Total"}</T>
        </span>
        <strong>
          {money(
            valid
              ? beforeRounding +
                  roundAdjustment(beforeRounding, rounding, "DOWN")
              : 0,
          )}
        </strong>
      </div>
      <small className="muted">
        Replaces any selected coupon or points for this round.
      </small>
      {valid&&!coversReceived&&<p className="error" role="alert">The total must cover the {money(round.paid)} already received.</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary" disabled={busy || capBusy || !valid || !coversReceived}>
        {busy ? "Saving…" : "Save adjustments"}
      </button>
    </form>
      {loyaltyCap && <section className="form loyalty-cap-settings" aria-label="Outlet loyalty cap">
        <label className="field">
          <T>Loyalty cap per bill (₹)</T>
          <input aria-label="Loyalty cap per bill (₹)" type="number" min="0" max="10000000" step="0.01" value={cap} disabled={busy || capBusy} onChange={event=>{setCap(event.target.value);setCapMessage('');setCapError('')}}/>
        </label>
        <small className="muted">Outlet-wide default for loyalty claims. Existing discounts remain unchanged.</small>
        {capError && <p className="error" role="alert">{capError}</p>}
        {capMessage && <p className="success-note" role="status">{capMessage}</p>}
        <button className="button" type="button" disabled={busy || capBusy || !capValid} onClick={()=>{
          if(busy || capBusy || !capValid)return;
          setCapBusy(true);setCapMessage('');setCapError('');
          void loyaltyCap.save(capAmount,capVersion).then(result=>{setCapVersion(result.version);setCapMessage('Loyalty cap saved.')}).catch(issue=>setCapError((issue as Error).message)).finally(()=>setCapBusy(false));
        }}>{capBusy?'Saving…':'Save loyalty cap'}</button>
      </section>}
    </>
  );
}
