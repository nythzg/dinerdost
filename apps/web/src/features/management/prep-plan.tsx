"use client";
import { useEffect, useState } from "react";
import { businessDate } from "@dinerdost/core";
import { DataTable, Empty } from "@/components/ui";
import { request, type Row } from "@/lib/client";
import { useDesk } from "../workspace/context";
export function PrepPlan() {
  const { data } = useDesk();
  const [day, setDay] = useState(businessDate()), [plan, setPlan] = useState<Row | null>(null), [error, setError] = useState("");
  useEffect(() => { let active = true; void request(`/api/prep?outlet=${data.outletId}&date=${day}`).then(result => { if (active) { setPlan(result); setError(""); } }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [day, data.outletId]);
  return <div className="form"><label className="field">Prep date<input aria-label="Prep date" type="date" value={day} onChange={e => setDay(e.target.value)} /></label>{error ? <p className="error">{error}</p> : !plan ? <Empty>Loading prep plan…</Empty> : <><DataTable headers={["Dish", "Suggested quantity", "Matching weekdays"]} rows={plan.items.map((item: Row) => [item.name, item.quantityMilli === null ? "More history needed" : `${item.quantityMilli / 1000} ${item.unit}`, item.samples])} empty="No matching weekday sales history yet." /><p className="muted">Based on up to eight weeks of matching weekdays. Review before preparing.</p></>}</div>;
}
