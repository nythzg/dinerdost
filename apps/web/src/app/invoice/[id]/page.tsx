import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getInvoice } from "@dinerdost/services";
import { context } from "@/lib/server";
import { PrintButton } from "@/features/orders/print-button";
import { ThermalReceipt } from "@/features/orders/thermal-receipt";
export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let document;
  try {
    const { db, actor } = await context();
    document = await getInvoice(db, actor, (await params).id);
  } catch (error) {
    if ((error as { status?: number }).status === 401) redirect("/signin");
    notFound();
  }
  return (
    <main className="invoice-page">
      <div className="invoice-actions">
        <Link className="subtle-link" href={"/app/orders/" + document.order_id}>
          Back to order
        </Link>
        <PrintButton
          orderId={document.order_id}
          invoiceId={document.id}
          final={document.document_type === "FINAL_TAX_INVOICE"}
        />
      </div>
      <ThermalReceipt bill={document.snapshot} />
    </main>
  );
}
