"use client";
import { useState } from "react";
import { can, type PaymentMethod } from "@dinerdost/core";
import { money, request, type Row } from "@/lib/client";
import { useDesk } from "../workspace/context";

export function PreparedCancellation({
  round,
  reallocate,
  save,
}: {
  round: Row;
  reallocate: boolean;
  save: (input: Row) => Promise<unknown>;
}) {
  const [reason, setReason] = useState(""),
    [hours, setHours] = useState(""),[minutes,setMinutes]=useState(""),[preparedConfirmed,setPreparedConfirmed]=useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        void save({
          version: round.version,
          reason,
          reallocate,
          ...(reallocate&&round.web_kitchen_stages_enabled===false?{preparedConfirmed}:{}),
          ...(reallocate ? { useBy: new Date(Date.now()+(Number(hours)*60+Number(minutes))*60000).toISOString() } : {}),
        })
          .catch((e) => setError(e.message))
          .finally(() => setBusy(false));
      }}
    >
      <p>
        {reallocate
          ? "Cancel this unpaid round and offer all its prepared portions under Ready to serve."
          : "Cancel this unpaid round. Already prepared food is recorded as waste."}
      </p>
      <label className="field">
        Reason
        <textarea
          value={reason}
          minLength={5}
          maxLength={500}
          required
          disabled={busy}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {reallocate && (
        <fieldset className="field prepared-timer"><legend>Prepared food timer</legend>
          <span className="prepared-duration"><label>Hours<input type="number" aria-label="Prepared food hours" min="0" max="8760" step="1" required value={hours} disabled={busy} onChange={event=>setHours(event.target.value)}/></label><b aria-hidden="true">:</b><label>Minutes<input type="number" aria-label="Prepared food minutes" min="0" max="59" step="1" required value={minutes} disabled={busy} onChange={event=>setMinutes(event.target.value)}/></label></span>
          <small>
            Countdown starts when saved. Enter the approved remaining time. Reallocation cannot extend an
            existing deadline.
          </small>
        </fieldset>
      )}
      {reallocate&&round.web_kitchen_stages_enabled===false&&<label className="selected-action"><input type="checkbox" required disabled={busy} checked={preparedConfirmed} onChange={event=>setPreparedConfirmed(event.target.checked)}/>I confirm this food has actually been prepared</label>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary" disabled={busy || (reallocate && Number(hours)*60+Number(minutes)<=0)}>
        {busy
          ? "Saving…"
          : reallocate
            ? "Reallocate prepared food"
            : "Cancel round"}
      </button>
    </form>
  );
}

export function SelectedRoundActions({
  order,
  round,
  methods,
  perform,
}: {
  order: Row;
  round: Row;
  methods: PaymentMethod[];
  perform: (action: string, input?: unknown, extra?: Row) => Promise<any>;
}) {
  const { data } = useDesk();
  const remaining = Number(round.payable) - Number(round.paid);
  const options = [
    ...(order.customer_id
      ? [{ key: "reviewRewards", label: "Review rewards" }]
      : []),
    ...(can(data.actor, "payments") &&
    remaining > 0 &&
    methods.includes("CASH") &&
    !round.payments.some((p: Row) =>
      ["AWAITING_VERIFICATION", "UNKNOWN", "INITIATED"].includes(p.state),
    )
      ? [
          {
            key: "recordPayment",
            label: "Record cash I have received · " + money(remaining),
          },
        ]
      : []),
    ...(can(data.actor, "payments") &&
    Number(round.payable) === 0 &&
    round.payment_status !== "PAID"
      ? [{ key: "zeroTotal", label: "Authorize zero total" }]
      : []),
    ...(can(data.actor,"kitchen")&&can(data.actor,"orders")&&["RELEASED","PREPARING"].includes(round.kot_status)?[{key:"completePreparedService",label:"Complete kitchen and service · I confirm food is prepared and served"}]:[]),
    ...(round.kot_status === "READY"
      ? [{ key: "serve", label: "Mark prepared food served" }]
      : []),
  ];
  const [selected, setSelected] = useState<string[]>([]),
    [done, setDone] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy || !selected.length) return;
        setBusy(true);
        setError("");
        try {
          for (const option of options.filter(
            (option) =>
              selected.includes(option.key) && !done.includes(option.key),
          )) {
            const fresh = await request("/api/orders/" + order.id),
              current = fresh.rounds.find((r: Row) => r.id === round.id);
            if (current.status !== "ACCEPTED" || fresh.status === "SETTLED")
              throw Error(
                "This round changed. Close this panel and review it again.",
              );
            if (
              option.key === "recordPayment" &&
              Number(current.payable) - Number(current.paid) !== remaining
            )
              throw Error(
                "The outstanding amount changed. Review the receipt before recording cash.",
              );
            const input =
              option.key === "recordPayment"
                ? {
                    version: current.version,
                    method: "CASH",
                    amount: remaining,
                    reference: "",
                  }
                : option.key === "completePreparedService"?{version:current.version,confirmedPreparedAndServed:true}
                : option.key === "zeroTotal"
                  ? { version: current.version }
                  : undefined;
            await perform(option.key, input, { roundId: round.id });
            setDone((previous) => [...previous, option.key]);
          }
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        Select only the steps you want to complete. Cash selection confirms you
        have received the shown amount; service selection confirms the food has
        been served.
      </p>
      {options.map((option) => (
        <label className="selected-action" key={option.key}>
          <input
            type="checkbox"
            disabled={busy || done.includes(option.key)}
            checked={selected.includes(option.key)}
            onChange={(e) =>
              setSelected((previous) =>
                e.target.checked
                  ? [...previous, option.key]
                  : previous.filter((key) => key !== option.key),
              )
            }
          />
          <span>
            {option.label}
            {done.includes(option.key) ? " · Completed" : ""}
          </span>
        </label>
      ))}
      {!options.length && (
        <p>No eligible steps are available for this round.</p>
      )}
      {error && (
        <p role="alert" className="error">
          {error} Completed steps remain recorded.
        </p>
      )}
      <button
        className="button primary"
        disabled={busy || !selected.some((key) => !done.includes(key))}
      >
        {busy ? "Completing…" : "Complete selected actions"}
      </button>
    </form>
  );
}
