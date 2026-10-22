"use client";
import Link from "next/link";
import { can } from "@dinerdost/core";
import { T } from "@/lib/staff-language";
import { useDesk } from "./context";
export function StockCountReminder() {
  const { data } = useDesk();
  const count = Number(data.stockCountStatus?.missingOpening ?? 0);
  if (!count) return null;
  return (
    <div className="stock-count-reminder" role="status">
      <span>
        <T>{"Opening stock counts pending"}</T> · {count}
      </span>
      {can(data.actor, "inventory") && (
        <Link className="text-button" href="/app/inventory?view=counts">
          <T>{"Record counts"}</T>
        </Link>
      )}
    </div>
  );
}
