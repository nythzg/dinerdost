"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { can } from "@dinerdost/core";
import { Icon } from "@/components/ui";
import { command, type Row } from "@/lib/client";
import { useDesk } from "../workspace/context";
type PrintJob = { url: string; key: string };
const PrintContext = createContext<{
  print: (
    orderId: string,
    roundId: string,
    automatic?: boolean,
  ) => Promise<void>;
  busy: boolean;
} | null>(null);
export function KotPrintProvider({ children }: { children: ReactNode }) {
  const { data, notify } = useDesk(),
    [queue, setQueue] = useState<PrintJob[]>([]),
    [busy, setBusy] = useState(false),
    known = useRef<{ outlet: string; ids: Set<string> }>({
      outlet: "",
      ids: new Set(),
    }),
    printKey = useRef(0);
  const mode =
    data.outlets.find((o: Row) => o.id === data.outletId)?.kot_print_mode ??
    "OFF";
  const print = async (orderId: string, roundId: string, automatic = false) => {
    setBusy(true);
    if(data.supportView)return;
    try {
      const job = await command(
        "kotPrint",
        { automatic },
        { orderId, roundId },
      );
      if (job.url)
        setQueue((q) => [
          ...q,
          { url: job.url, key: String(++printKey.current) },
        ]);
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if(data.supportView)return;
    const tickets: Row[] = data.kotPrintTickets ?? [],
      current = new Set<string>(tickets.map((t) => t.id));
    if (known.current.outlet !== data.outletId) {
      known.current = { outlet: data.outletId, ids: current };
      return;
    }
    const added = tickets.filter((t) => !known.current.ids.has(t.id));
    if (mode !== "AUTO" || !can(data.actor, "payments")) {
      known.current.ids = current;
      return;
    }
    if (document.hidden) return;
    known.current.ids = current;
    const rounds = new Map<string, Row>();
    for (const t of added)
      if (!t.auto_print_requested_at) rounds.set(t.round_id, t);
    void (async () => {
      for (const t of rounds.values())
        await print(t.order_id, t.round_id, true);
    })();
  }, [data.kotPrintTickets, data.outletId, mode]);
  const first = queue[0];
  return (
    <PrintContext.Provider value={{ print, busy }}>
      {children}
      {first && (
        <iframe
          key={first.key}
          className="kot-print-frame"
          title="Kitchen ticket print"
          src={first.url}
          onLoad={async (event) => {
            const frame = event.currentTarget,
              doc = frame.contentDocument,
              win = frame.contentWindow;
            try {
              const receipt =
                doc?.querySelector<HTMLElement>("[data-kot-receipt]");
              if (!receipt || !doc || !win)
                throw Error("Kitchen ticket unavailable. Retry Print KOT.");
              await doc.fonts.ready;
              const height = Math.max(
                  60,
                  Math.ceil((receipt.scrollHeight * 25.4) / 96 + 7),
                ),
                style = doc.createElement("style");
              style.textContent = `@media print { @page kitchenTicket { size:80mm ${height}mm; margin:3mm; } }`;
              doc.head.append(style);
              win.focus();
              win.print();
            } catch (error) {
              notify((error as Error).message);
            } finally {
              setQueue((q) => q.filter((j) => j.key !== first.key));
            }
          }}
        />
      )}
    </PrintContext.Provider>
  );
}
export function KotPrintControl({
  orderId,
  roundId,
}: {
  orderId: string;
  roundId: string;
}) {
  const printer = useContext(PrintContext);
  if (!printer) return null;
  return (
    <button
      className="button small round-kot-print"
      disabled={printer.busy}
      onClick={() => void printer.print(orderId, roundId)}
    >
      <Icon name="print" />
      Print KOT
    </button>
  );
}
