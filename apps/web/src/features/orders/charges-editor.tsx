"use client";
import { T } from "@/lib/staff-language";
import { useState } from "react";
import { Icon } from "@/components/ui";
import { type Row } from "@/lib/client";

export function ChargesEditor({
  rounds,
  save,
}: {
  rounds: Row[];
  save: (input: Row) => Promise<unknown>;
}) {
  const [roundId, setRoundId] = useState(rounds[0].id);
  const values = (round: Row) =>
    (round.charges ?? []).map((charge: Row) => ({
      name: charge.name,
      amount: String(Number(charge.amount) / 100),
    }));
  const [charges, setCharges] = useState<{ name: string; amount: string }[]>(
    values(rounds[0]),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const round = rounds.find((round) => round.id === roundId)!;
  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        void save({
          roundId,
          version: round.version,
          charges: charges.map((charge) => ({
            name: charge.name,
            amount: Math.round(Number(charge.amount) * 100),
          })),
        })
          .catch((error) => setError(error.message))
          .finally(() => setBusy(false));
      }}
    >
      {rounds.length > 1 && (
        <label className="field">
          <T>{"Round"}</T>
          <select
            aria-label="Charges round"
            value={roundId}
            disabled={busy}
            onChange={(event) => {
              setRoundId(event.target.value);
              setCharges(
                values(
                  rounds.find((round) => round.id === event.target.value)!,
                ),
              );
            }}
          >
            {rounds.map((round) => (
              <option key={round.id} value={round.id}>
                <T>{"Round "}</T>
                {round.round_number}
              </option>
            ))}
          </select>
        </label>
      )}
      {charges.map((charge, index) => (
        <div className="charge-editor-line" key={index}>
          <label className="field">
            <T>{"Name"}</T>
            <input
              aria-label={"Charge " + (index + 1) + " name"}
              required
              maxLength={60}
              value={charge.name}
              disabled={busy}
              onChange={(event) =>
                setCharges((previous) =>
                  previous.map((line, position) =>
                    position === index
                      ? { ...line, name: event.target.value }
                      : line,
                  ),
                )
              }
            />
          </label>
          <label className="field">
            <T>{"Amount (₹)"}</T>
            <input
              aria-label={"Charge " + (index + 1) + " amount"}
              type="number"
              required
              min="0.01"
              max="10000000"
              step="0.01"
              value={charge.amount}
              disabled={busy}
              onChange={(event) =>
                setCharges((previous) =>
                  previous.map((line, position) =>
                    position === index
                      ? { ...line, amount: event.target.value }
                      : line,
                  ),
                )
              }
            />
          </label>
          <button
            className="icon-button"
            type="button"
            aria-label={"Remove charge " + (index + 1)}
            disabled={busy}
            onClick={() =>
              setCharges((previous) =>
                previous.filter((_, position) => position !== index),
              )
            }
          >
            <Icon name="trash" />
          </button>
        </div>
      ))}
      <button
        className="button"
        type="button"
        disabled={busy || charges.length >= 20}
        onClick={() =>
          setCharges((previous) => [...previous, { name: "", amount: "" }])
        }
      >
        <Icon name="plus" />
        <T>{"Add charge"}</T>
      </button>
      <small className="muted">
        Fixed amounts, added after item tax. Reapply rewards after changing
        charges.
      </small>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <button className="button primary" disabled={busy}>
        {busy ? "Saving…" : "Save charges"}
      </button>
    </form>
  );
}
