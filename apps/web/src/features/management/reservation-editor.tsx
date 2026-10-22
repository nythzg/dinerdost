"use client";
import { T } from "@/lib/staff-language";
import { useState, type FormEvent } from "react";
import {
  businessDate,
  businessDateTime,
  businessLocalToISO,
} from "@dinerdost/core";
import { Icon } from "@/components/ui";
import type { Row } from "@/lib/client";
import { useDesk } from "../workspace/context";
import { CustomerFields } from "../customers/customer-fields";

export function ReservationEditor({
  record,
  save,
}: {
  record?: Row;
  save: (input: Row) => Promise<unknown>;
}) {
  const { data, close, busy } = useDesk();
  const existing = record?.data ?? {};
  const [guest, setGuest] = useState(existing.guest ?? ""),
    [phone, setPhone] = useState(existing.phone ?? "");
  const initial = existing.at
    ? businessDateTime(existing.at)
    : businessDate() + "T19:00";
  const [day, setDay] = useState(initial.slice(0, 10));
  const [month, setMonth] = useState(initial.slice(0, 7));
  const [hour, setHour] = useState(Number(initial.slice(11, 13)) % 12 || 12);
  const [minute, setMinute] = useState(initial.slice(14, 16));
  const [period, setPeriod] = useState(
    Number(initial.slice(11, 13)) >= 12 ? "PM" : "AM",
  );
  const [error, setError] = useState("");
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const offset = first.getUTCDay();
  const changeMonth = (by: number) => {
    const next = new Date(Date.UTC(year, monthNumber - 1 + by, 1));
    setMonth(next.toISOString().slice(0, 7));
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    try {
      const at = businessLocalToISO(
        day +
          "T" +
          String((hour % 12) + (period === "PM" ? 12 : 0)).padStart(2, "0") +
          ":" +
          minute,
      );
      await save({
        guest,
        phone,
        guests: Number(fields.get("guests")),
        tableId: String(fields.get("tableId")),
        at,
        durationMinutes: Number(fields.get("durationMinutes")),
        note: String(fields.get("note") ?? ""),
      });
      close();
    } catch (failure) {
      setError((failure as Error).message);
    }
  }
  return (
    <form className="form reservation-editor" onSubmit={submit}>
      <div className="form-grid">
        <CustomerFields
          outletId={data.outletId}
          name={guest}
          phone={phone}
          labels={["Guest name", "Mobile number"]}
          onChange={(name, phone) => {
            setGuest(name);
            setPhone(phone);
          }}
        />
        <label className="field">
          <T>{"Table"}</T>
          <select name="tableId" required defaultValue={existing.tableId ?? ""}>
            <option value="" disabled>
              Select table
            </option>
            {data.tables.map((table: Row) => (
              <option value={table.id} key={table.id}>
                {table.label} · {table.seats} seats
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <T>{"Guests"}</T>
          <input
            name="guests"
            type="number"
            min={1}
            max={100}
            step={1}
            required
            defaultValue={existing.guests ?? 2}
          />
        </label>
      </div>
      <section className="reservation-calendar" aria-label="Reservation date">
        <div className="reservation-calendar-heading">
          <button
            className="icon-button"
            type="button"
            aria-label="Previous month"
            onClick={() => changeMonth(-1)}
          >
            <Icon name="chevron" className="previous-month" />
          </button>
          <strong>
            {first.toLocaleDateString("en-IN", {
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            })}
          </strong>
          <button
            className="icon-button"
            type="button"
            aria-label="Next month"
            onClick={() => changeMonth(1)}
          >
            <Icon name="chevron" />
          </button>
        </div>
        <div className="reservation-days">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((label) => (
            <span key={label}>{label}</span>
          ))}
          {Array.from({ length: offset }, (_, index) => (
            <span key={"blank-" + index} />
          ))}
          {Array.from({ length: days }, (_, index) => {
            const value = month + "-" + String(index + 1).padStart(2, "0");
            return (
              <button
                type="button"
                key={value}
                aria-label={"Reserve on " + value}
                aria-pressed={day === value}
                className={day === value ? "selected" : ""}
                disabled={value < businessDate()}
                onClick={() => setDay(value)}
              >
                {index + 1}
              </button>
            );
          })}
        </div>
        <small>Selected: {day} · India time</small>
      </section>
      <div
        className="reservation-time"
        role="group"
        aria-label="Reservation time"
      >
        <label className="field">
          Hour
          <select
            aria-label="Reservation hour"
            value={hour}
            onChange={(event) => setHour(Number(event.target.value))}
          >
            {Array.from({ length: 12 }, (_, index) => (
              <option key={index + 1}>{index + 1}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Minute
          <select
            aria-label="Reservation minute"
            value={minute}
            onChange={(event) => setMinute(event.target.value)}
          >
            {Array.from({ length: 60 }, (_, index) => (
              <option key={index} value={String(index).padStart(2, "0")}>
                {String(index).padStart(2, "0")}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Period
          <select
            aria-label="Reservation period"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
          >
            <option>AM</option>
            <option>PM</option>
          </select>
        </label>
        <label className="field">
          Duration
          <select
            name="durationMinutes"
            defaultValue={existing.durationMinutes ?? 90}
          >
            {[30, 60, 90, 120, 180, 240].map((value) => (
              <option key={value} value={value}>
                {value} min
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        Note
        <textarea
          name="note"
          maxLength={500}
          defaultValue={existing.note ?? ""}
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary" disabled={busy}>
        {busy ? "Saving…" : "Save reservation"}
      </button>
    </form>
  );
}
