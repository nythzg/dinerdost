import { notFound, redirect } from "next/navigation";
import { kotReceipt } from "@dinerdost/services";
import { context } from "@/lib/server";
import { businessDateTime } from "@dinerdost/core";
import type { Row } from "@/lib/client";
export default async function KotPage({
  params,
}: {
  params: Promise<{ orderId: string; roundId: string }>;
}) {
  let receipt;
  try {
    const { db, actor } = await context(),
      p = await params;
    receipt = await kotReceipt(db, actor, p.orderId, p.roundId);
  } catch (error) {
    if ((error as { status?: number }).status === 401) redirect("/signin");
    notFound();
  }
  return (
    <main className="kot-receipt" data-kot-receipt>
      {receipt.tickets.map((ticket: Row) => (
        <article key={ticket.id} className="kot-station">
          <h1>{receipt.outlet}</h1>
          <h2>
            KOT #{receipt.number} · Round {receipt.round}
          </h2>
          <p>
            <strong>
              {ticket.production_stream} · {ticket.station}
            </strong>
          </p>
          <p>
            {receipt.table
              ? "Table " + receipt.table
              : receipt.type.replaceAll("_", " ")}{" "}
            · {receipt.course}
          </p>
          <p>{businessDateTime(ticket.created_at).replace("T", " ")} IST</p>
          <hr />
          {ticket.items.map((line: Row, index: number) => (
            <div className="kot-item" key={index}>
              <strong>
                {Number(line.quantity_milli) / 1000} × {line.name}
              </strong>
              {line.variant && <p>{line.variant}</p>}
              {line.modifiers?.length > 0 && (
                <p>{line.modifiers.map((m: Row) => m.name).join(", ")}</p>
              )}
              {line.note && <p className="kot-note">{line.note}</p>}
            </div>
          ))}
          <hr />
          <small>Ticket {String(ticket.id).slice(0, 8)}</small>
        </article>
      ))}
    </main>
  );
}
