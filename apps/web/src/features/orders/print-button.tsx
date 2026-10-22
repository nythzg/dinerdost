"use client";
import { useEffect, useState } from "react";
import { command } from "@/lib/client";
import { Icon } from "@/components/ui";
export function PrintButton({
  orderId,
  invoiceId,
  final,
}: {
  orderId: string;
  invoiceId: string;
  final: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const paper = document.querySelector<HTMLElement>(".thermal-receipt");
    if (!paper) return;
    const style = document.createElement("style");
    style.dataset.receiptPaper = "true";
    document.head.append(style);
    const fitPaper = () => {
      if (window.matchMedia("print").matches) return;
      const css = getComputedStyle(paper);
      const contentHeight =
        paper.scrollHeight -
        parseFloat(css.paddingTop) -
        parseFloat(css.paddingBottom);
      const height = Math.max(60, Math.ceil((contentHeight * 25.4) / 96 + 7));
      style.textContent = `@media print { @page thermalReceipt { size: 80mm ${height}mm; margin: 3mm; } }`;
    };
    const observer = new ResizeObserver(fitPaper);
    observer.observe(paper);
    fitPaper();
    return () => {
      observer.disconnect();
      style.remove();
    };
  }, [orderId, final]);
  return (
    <div className="inline-actions">
      {error && <span className="danger-text">{error}</span>}
      <button
        className="button primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await command("recordPrint", { invoiceId }, { orderId });
            await document.fonts.ready;
            await Promise.all(
              Array.from(
                document.querySelectorAll<HTMLImageElement>(
                  ".thermal-receipt img",
                ),
              ).map((image) => image.decode()),
            );
            window.print();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Icon name="print" />
        {busy ? "Preparing…" : "Print / save PDF"}
      </button>
    </div>
  );
}
