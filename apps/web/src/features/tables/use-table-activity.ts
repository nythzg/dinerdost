"use client";
import { useCallback } from "react";
import { command } from "@/lib/client";
import { useActivityHeartbeat } from "@/lib/use-activity-heartbeat";

export function useTableActivity(tableId?: string) {
  const send = useCallback(
    () => command("tableActivity", { tableId }),
    [tableId],
  );
  useActivityHeartbeat(!!tableId, send);
}
