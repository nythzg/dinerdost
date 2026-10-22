"use client";
import { useEffect, useState } from "react";
import { can } from "@dinerdost/core";
import { T } from "@/lib/staff-language";
import { request, type Row } from "@/lib/client";
import { useDesk } from "../workspace/context";

export function ClearTableButton({ tableId, sessionId, bills }: {
  tableId: string; sessionId?: string; bills?: Row;
}) {
  const { data, run, form, go, busy } = useDesk();
  const [loaded, setLoaded] = useState<{ tableId: string; bills: Row } | null>(null);
  useEffect(() => {
    if (bills || !can(data.actor, "sessions")) return;
    let current = true;
    void request("/api/tables/" + tableId + "/billing?merged=1")
      .then(value => { if (current) setLoaded({ tableId, bills: value }); })
      .catch(() => { if (current) setLoaded(null); });
    return () => { current = false; };
  }, [bills, tableId, data.actor, data.sessions, data.orders]);
  const current = bills ?? (loaded?.tableId === tableId ? loaded.bills : null);
  if (!can(data.actor, "sessions") || !current?.sessions.length ||
    (sessionId && !current.sessions.some((session: Row) => session.id === sessionId))) return null;
  return <button className="button" disabled={busy || current.orders.some((order: Row) => !["SETTLED", "VOIDED", "REJECTED"].includes(order.status))}
    title="Settle or reject every order before clearing the table."
    onClick={() => form("Clear " + current.groupLabel, [{
      name: "reason", label: "Reason", value: "Guests left; table cleared for new customers",
      help: "Makes the table available for new customers. Existing bills are kept.",
    }], async values => {
      await run("closeTable", { ...values, tableId, includeMerged: true,
        sessionIds: current.sessions.map((session: Row) => session.id) });
      go("/app/floor");
    }, "Clear table")}
  ><T>Clear table</T></button>;
}
