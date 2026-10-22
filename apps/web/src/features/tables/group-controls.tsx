"use client";
import { useState } from "react";
import { TableQr } from "@/components/table-qr";
import { type Row } from "@/lib/client";
import { useDesk } from "../workspace/context";

export function GroupQr({ tables }: { tables: Row[] }) {
  const { data } = useDesk(),
    [chosen, setChosen] = useState(tables[0].id);
  const table = tables.find((t) => t.id === chosen) ?? tables[0];
  return (
    <>
      <label className="field group-control-field">
        Table QR
        <select
          aria-label="Table QR for"
          value={table.id}
          onChange={(e) => setChosen(e.target.value)}
        >
          {tables.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <TableQr
        key={table.id}
        url={window.location.origin + "/q/" + table.public_key}
        label={table.label}
        restaurant={data.restaurant.name}
        outlet={data.outlets.find((o: Row) => o.id === data.outletId)?.name}
      />
    </>
  );
}
export function GroupCapacity({
  tables,
  floors,
}: {
  tables: Row[];
  floors: string[];
}) {
  const { run, busy, close } = useDesk();
  const [selected, setSelected] = useState(tables[0].id),
    [error, setError] = useState("");
  const table = tables.find((t) => t.id === selected) ?? tables[0];
  return (
    <form
      className="form"
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        const values = new FormData(event.currentTarget);
        try {
          await run("tableCapacity", {
            tableId: table.id,
            version: table.version,
            seats: Number(values.get("seats")),
            floor: values.get("floor"),
          });
          close();
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      <label className="field">
        Table
        <select
          aria-label="Table capacity for"
          value={table.id}
          onChange={(e) => setSelected(e.target.value)}
        >
          {tables.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Seats
        <input
          key={table.id + "seats"}
          aria-label="Seats"
          name="seats"
          type="number"
          min="1"
          max="100"
          required
          defaultValue={table.seats}
        />
      </label>
      <label className="field">
        Floor
        <select
          key={table.id + "floor"}
          aria-label="Floor"
          name="floor"
          defaultValue={table.floor}
          required
        >
          {floors.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary" disabled={busy}>
        Save
      </button>
    </form>
  );
}
