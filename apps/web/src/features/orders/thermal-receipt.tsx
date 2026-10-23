import { roundRatio } from "@dinerdost/core";
import type { Row } from "@/lib/client";
import "./thermal-receipt.css";

const amount = (value: unknown) =>
  (Number(value ?? 0) / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** All printed content comes from the issued snapshot, never current outlet settings. */
export function ThermalReceipt({ bill }: { bill: Row }) {
  const settings = bill.receipt ?? {},
    discounts = bill.discountBreakdown ?? [{name:'Discount',amount:bill.totals.discount}],
    savedAmount =
      Number(bill.totals.discount) +
      Math.max(0, -Number(bill.totals.roundOff ?? 0)),
    final = bill.documentType === "FINAL_TAX_INVOICE",
    issued = new Date(bill.issuedAt),
    quantity =
      bill.items.reduce(
        (sum: number, item: Row) => sum + Number(item.quantity_milli),
        0,
      ) / 1000,
    taxes = bill.taxes?.length
      ? bill.taxes
      : [{ name: "Tax", amount: bill.totals.tax }],
    type =
      (
        {
          DINE_IN: "Dine In",
          TAKEAWAY: "Takeaway",
          DELIVERY: "Delivery",
        } as Record<string, string>
      )[bill.orderType] ?? "Order";
  return (
    <article
      className="thermal-receipt"
      aria-label={final ? "Final tax invoice" : "Provisional bill"}
    >
      <header className="receipt-brand">
        {settings.logoId && (
          <img
            className="receipt-logo"
            src={"/api/receipt-images/" + settings.logoId}
            alt={bill.restaurant.name + " logo"}
          />
        )}
        <h1>{bill.restaurant.name}</h1>
        {bill.outlet.address && (
          <p className="receipt-address">{bill.outlet.address}</p>
        )}
        {bill.outlet.gstin && <p>GSTIN : {bill.outlet.gstin}</p>}
        {settings.phone && <p>Mob No : {settings.phone}</p>}
      </header>
      {!final && (
        <p className="receipt-provisional">
          PROVISIONAL BILL · NOT A TAX INVOICE
        </p>
      )}
      <section className="receipt-customer">
        Name: <span>{bill.customer?.name ?? "Guest"}</span>
        {bill.customer?.phone && <> (M: {bill.customer.phone})</>}
      </section>
      <section className="receipt-details">
        <div>
          <span>
            Date:{" "}
            {new Intl.DateTimeFormat("en-GB", {
              day: "2-digit",
              month: "2-digit",
              year: "2-digit",
              timeZone: "Asia/Kolkata",
            }).format(issued)}
          </span>
          <strong>
            {type}
            {bill.tableLabel ? ": " + bill.tableLabel : ""}
          </strong>
        </div>
        <div>
          <time dateTime={bill.issuedAt}>
            {new Intl.DateTimeFormat("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              hourCycle: "h23",
              timeZone: "Asia/Kolkata",
            }).format(issued)}
          </time>
        </div>
        <div>
          <span>Cashier: {bill.actor}</span>
          <span>Bill No.: {bill.number}</span>
        </div>
      </section>
      <table className="receipt-items">
        <colgroup>
          <col className="receipt-item-column" />
          <col className="receipt-qty-column" />
          <col className="receipt-price-column" />
          <col className="receipt-amount-column" />
        </colgroup>
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty.</th>
            <th>Price</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {bill.items.map((item: Row, index: number) => (
            <tr key={index}>
              <td>
                {item.name}
                {item.variant && <small>{item.variant}</small>}
                {item.modifiers?.length > 0 && (
                  <small>
                    {item.modifiers
                      .map((modifier: Row) => modifier.name)
                      .join(", ")}
                  </small>
                )}
              </td>
              <td>{Number(item.quantity_milli) / 1000}</td>
              <td>{amount(item.unit_price)}</td>
              <td>
                {amount(
                  roundRatio(
                    Number(item.unit_price) * Number(item.quantity_milli),
                    1000,
                  ),
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <section className="receipt-summary" aria-label="Bill totals">
        <div className="receipt-subtotal">
          <span>Total Qty: {quantity}</span>
          <span>Sub Total</span>
          <span>{amount(bill.totals.subtotal)}</span>
        </div>
        {discounts.filter((discount:Row)=>Number(discount.amount)>0).map((discount:Row,index:number) => (
          <div className="receipt-summary-row" key={'discount-'+index}>
            <span>{discount.name}{discount.code?' '+discount.code:''}</span>
            <span>−{amount(discount.amount)}</span>
          </div>
        ))}
        {taxes.map((tax: Row, index: number) => (
          <div className="receipt-summary-row" key={index}>
            <span>
              {tax.name}
              {tax.rateBps != null ? " " + Number(tax.rateBps) / 100 + "%" : ""}
            </span>
            <span>{amount(tax.amount)}</span>
          </div>
        ))}
        {(bill.charges ?? []).map((charge: Row, index: number) => (
          <div className="receipt-summary-row" key={"charge-" + index}>
            <span>{charge.name}</span>
            <span>{amount(charge.amount)}</span>
          </div>
        ))}
        {!bill.charges?.length && Number(bill.totals.charges) > 0 && (
          <div className="receipt-summary-row">
            <span>Other charges</span>
            <span>{amount(bill.totals.charges)}</span>
          </div>
        )}
      </section>
      <section className="receipt-grand">
        {Number(bill.totals.roundOff ?? 0) !== 0 && (
          <div className="receipt-summary-row">
            <span>Round off</span>
            <span>
              {Number(bill.totals.roundOff) > 0 ? "+" : "−"}
              {amount(Math.abs(Number(bill.totals.roundOff)))}
            </span>
          </div>
        )}
        <div className="receipt-summary-row">
          <strong>Grand Total</strong>
          <strong>₹{amount(bill.totals.payable)}</strong>
        </div>
        {savedAmount > 0 && (
          <p className="receipt-savings">Saved amount ₹{amount(savedAmount)}</p>
        )}
      </section>
      {!final && (
        <section className="receipt-balance">
          <div className="receipt-summary-row">
            <span>Received</span>
            <span>{amount(bill.totals.paid)}</span>
          </div>
          <div className="receipt-summary-row">
            <span>Outstanding</span>
            <strong>{amount(bill.totals.outstanding)}</strong>
          </div>
        </section>
      )}
      {bill.replacement&&<section className="receipt-balance"><p>Paid replacement · {bill.replacement.number}<br/>Original order #{bill.replacement.sourceOrderNumber}{bill.replacement.originalInvoiceNumber?' · '+bill.replacement.originalInvoiceNumber:''}</p><div className="receipt-summary-row"><span>Original payment credit</span><strong>{amount(bill.replacement.credit)}</strong></div><div className="receipt-summary-row"><span>Supplementary amount</span><strong>{amount(Number(bill.totals.payable)-Number(bill.replacement.credit))}</strong></div></section>}
      <footer className="receipt-footer">
        {settings.fssai && (
          <p>
            <strong>
              FSSAI Lic No.
              <br />
              {settings.fssai}
            </strong>
          </p>
        )}
        {settings.email && (
          <p>
            For Any Feedback or Queries
            <br />
            Please Email Us At
            <br />
            <strong>{settings.email}</strong>
          </p>
        )}
        <p>{settings.footer ?? "Thank You, Visit Again!!!"}</p>
        {settings.deliveryText && <p>{settings.deliveryText}</p>}
        {!final && (
          <small>
            Provisional only. Payment and settlement are not confirmed.
          </small>
        )}
      </footer>
    </article>
  );
}
