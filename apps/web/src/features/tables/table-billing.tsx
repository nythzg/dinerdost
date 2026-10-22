"use client";
import { T } from "@/lib/staff-language";
import { useEffect, useState } from "react";
import { Badge, Empty, Icon } from "@/components/ui";
import { request, type Row } from "@/lib/client";
import { useDesk } from "../workspace/context";
import { OrderDetail } from "../orders/order-pages";
import { ClearTableButton } from "./clear-table-button";
import { useTableActivity } from "./use-table-activity";

export function TableBilling({ tableId }: { tableId: string }) {
  const { data, go } = useDesk();
  const [bills, setBills] = useState<Row | null>(null),
    [selected, setSelected] = useState(""),
    [error, setError] = useState("");
  useTableActivity(bills?.sessions.length ? tableId : undefined);
  useEffect(() => {
    let current = true;
    void request("/api/tables/" + tableId + "/billing?merged=1")
      .then((result) => {
        if (!current) return;
        setBills(result);
        setSelected((previous) =>
          result.orders.some((order: Row) => order.id === previous)
            ? previous
            : (result.orders[0]?.id ?? ""),
        );
        setError("");
      })
      .catch((failure) => {
        if (current) setError(failure.message);
      });
    return () => {
      current = false;
    };
  }, [tableId, data.sessions, data.orders]);
  if (error) return <Empty>{error}</Empty>;
  if (!bills)
    return <div className="loader" aria-label="Loading table bills" />;
  return (
    <>
      <div className="toolbar table-billing-toolbar">
        <strong>
          {bills.groupLabel}
          {bills.members?.length > 1 ? " (Merged)" : ""}
        </strong>
        <Badge value={bills.sessions.length ? "OCCUPIED" : "AVAILABLE"} />
        <button className="button" onClick={() => go("/app/floor")}>
          <T>{"Tables"}</T>
        </button>
        {!selected && <ClearTableButton tableId={tableId} bills={bills}/>}
        {bills.orders.length > 1 && (
          <select
            aria-label="Table bill"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            {bills.orders.map((order: Row) => (
              <option key={order.id} value={order.id}>
                Order #{order.number} ·{" "}
                {bills.sessions.find(
                  (session: Row) => session.id === order.session_id,
                )?.table_label ?? ""}{" "}
                ·{" "}
                {bills.sessions.find(
                  (session: Row) => session.id === order.session_id,
                )?.label ?? ""}
              </option>
            ))}
          </select>
        )}
        {bills.sessions
          .filter(
            (session: Row) =>
              !bills.orders.some(
                (order: Row) =>
                  order.session_id === session.id &&
                  !["SETTLED", "VOIDED", "REJECTED"].includes(order.status),
              ),
          )
          .map((session: Row) => (
            <button
              key={session.id}
              className="button primary"
              onClick={() => go("/app/pos?session=" + session.id)}
            >
              <Icon name="plus" />
              Add order
              {bills.sessions.length > 1
                ? " · " + session.table_label + " · " + session.label
                : ""}
            </button>
          ))}
      </div>
      {selected ? (
        <OrderDetail key={selected} id={selected} tableBills={bills} />
      ) : (
        <Empty>
          {bills.sessions.length
            ? "No orders for this table yet."
            : "No active table visit."}
        </Empty>
      )}
    </>
  );
}
