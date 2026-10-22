"use client";
import { T } from "@/lib/staff-language";
import { useState } from "react";
import type { Row } from "@/lib/client";
import { useDesk } from "../workspace/context";
import { CustomerFields } from "./customer-fields";

export function IdentityForm({
  order,
  roundId,
  save,
}: {
  order: Row;
  roundId: string;
  save: (input: Row, roundId: string) => Promise<unknown>;
}) {
  const { data, busy, close } = useDesk();
  const [name, setName] = useState(order.customer_snapshot?.name ?? ""),
    [phone, setPhone] = useState(order.customer_snapshot?.phone ?? ""),
    [error, setError] = useState("");
  return (
    <form
      className="form"
      onSubmit={async (event) => {
        event.preventDefault();
        setError("");
        try {
          await save({ name, phone, version: order.version }, roundId);
          close();
        } catch (e) {
          setError((e as Error).message);
        }
      }}
    >
      <CustomerFields
        outletId={data.outletId}
        name={name}
        phone={phone}
        labels={["Name", "Mobile number"]}
        onChange={(nextName, nextPhone) => {
          setName(nextName);
          setPhone(nextPhone);
        }}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button
        className="button primary"
        disabled={busy || !name.trim() || !phone.trim()}
      >
        <T>{"Save"}</T>
      </button>
    </form>
  );
}
