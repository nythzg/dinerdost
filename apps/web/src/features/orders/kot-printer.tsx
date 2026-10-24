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
import {applyKotPaperSize} from "./kot-paper-size";
import { useDesk } from "../workspace/context";
type KotSelection={streams:('FOOD'|'BAR')[];layout:'SEPARATE'|'COMBINED'};
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
  const { data, notify, modal, close } = useDesk(),
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
  const startPrint = async (orderId: string, roundId: string, automatic = false, selection?:KotSelection) => {
    if(data.supportView)return;
    setBusy(true);
    try {
      const job = await command(
        "kotPrint",
        { automatic, ...selection },
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
  const print = async(orderId:string,roundId:string,automatic=false)=>{
    if(automatic)return startPrint(orderId,roundId,true);
    const departments:('FOOD'|'BAR')[]=data.actor.role==='BARTENDER'?['BAR']:data.actor.role==='KITCHEN'?['FOOD']:['FOOD','BAR'];
    modal('Print KOT',<KotPrintOptions departments={departments} cancel={close} print={selection=>{close();void startPrint(orderId,roundId,false,selection)}}/>);
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
              applyKotPaperSize(doc);
              void receipt.offsetHeight;
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

function KotPrintOptions({departments,cancel,print}:{departments:('FOOD'|'BAR')[];cancel:()=>void;print:(selection:KotSelection)=>void}){
 const [streams,setStreams]=useState(departments),[layout,setLayout]=useState<KotSelection['layout']>('SEPARATE');
 return <form className="form kot-print-options" onSubmit={event=>{event.preventDefault();if(streams.length)print({streams,layout})}}>
  <p className="muted">Print on a 3-inch paper roll.</p>
  <fieldset><legend>Departments</legend>{departments.map(stream=><label key={stream}><input type="checkbox" checked={streams.includes(stream)} onChange={event=>setStreams(old=>event.target.checked?[...old,stream]:old.filter(value=>value!==stream))}/>{stream==='FOOD'?'Food':'Bar'}</label>)}</fieldset>
  <fieldset><legend>Ticket layout</legend><label><input type="radio" name="kot-layout" checked={layout==='SEPARATE'} onChange={()=>setLayout('SEPARATE')}/>Separate Food / Bar KOTs</label><label><input type="radio" name="kot-layout" checked={layout==='COMBINED'} onChange={()=>setLayout('COMBINED')}/>One combined KOT</label></fieldset>
  {!streams.length&&<small>Select at least one department.</small>}
  <div className="kot-print-actions"><button type="button" className="button" onClick={cancel}>Cancel</button><button className="button primary" disabled={!streams.length}>Print KOT</button></div>
 </form>;
}
