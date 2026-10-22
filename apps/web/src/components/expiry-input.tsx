"use client";
import { useState } from "react";
import { T } from "@/lib/staff-language";

/** Keep the receipt date and time compact while submitting one India-local value. */
export function ExpiryInput({
  name,
  label = "Expiry (India time)",
  value,
  onChange,
}: {
  name?: string;
  label?: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  const [local, setLocal] = useState("");
  const current = value ?? local;
  const [day = "", time = ""] = current.split("T");
  const change = (next: string) => {
    setLocal(next);
    onChange?.(next);
  };
  return (
    <fieldset className="expiry-input">
      <legend>
        <T>{label}</T>
      </legend>
      <div>
        <label>
          <span>
            <T>Date</T>
          </span>
          <input
            type="date"
            aria-label={label + " date"}
            required
            value={day}
            onChange={(e) => change(e.target.value + "T" + time)}
          />
        </label>
        <label>
          <span>
            <T>Time</T>
          </span>
          <input
            type="time"
            aria-label={label + " time"}
            required
            value={time}
            onChange={(e) => change(day + "T" + e.target.value)}
          />
        </label>
      </div>
      {name && <input type="hidden" name={name} value={current} />}
    </fieldset>
  );
}
