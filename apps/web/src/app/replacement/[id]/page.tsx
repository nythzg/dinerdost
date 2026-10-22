import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getWebReplacementDocument } from '@dinerdost/services';
import { context } from '@/lib/server';
import { ReplacementPrint } from '@/features/orders/replacement-print';
const money=(value:unknown)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(Number(value)/100);
export default async function ReplacementPage({params}:{params:Promise<{id:string}>}){
 let document;try{const {db,actor}=await context();document=await getWebReplacementDocument(db,actor,(await params).id)}catch(error){if((error as {status?:number}).status===401)redirect('/signin');notFound()}
 const s=document.snapshot;
 return <main className="invoice-page"><div className="invoice-actions"><Link className="subtle-link" href={'/app/orders/'+document.target_order_id}>Replacement order</Link><ReplacementPrint/></div><article className="invoice-paper refund-document">
  <header><div><h1>Paid replacement record</h1><strong>{s.number}</strong><p>Order #{s.sourceOrderNumber} → #{s.targetOrderNumber}</p></div><div><p>Payment credit</p><h2>{money(s.credit)}</h2></div></header>
  <section><p>Original final payable: {money(s.originalPayable)}</p><p>Replacement final payable at creation: {money(s.replacementPayable)}</p><p>Extra due at creation: {money(s.extraDue)}</p><p>Reason: {s.reason}</p><p>Recorded by {s.actor}<br/>{new Date(document.created_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST</p></section>
  <section><h3>Original receipts credited</h3>{s.allocations.map((p:{paymentId:string;reference:string;amount:number})=><div className="refund-receipt" key={p.paymentId}><span>{p.reference||p.paymentId}</span><strong>{money(p.amount)}</strong></div>)}</section>
  <footer><p>This is a linked payment credit. No new money or gateway refund was recorded. Original invoices and receipts remain preserved. The replacement invoice shows its items, taxes, credit and supplementary amount after actual service and final settlement.</p><Link className="text-button" href={'/app/orders/'+document.source_order_id}>Original order</Link>{document.source_invoice_id&&<> · <Link className="text-button" href={'/invoice/'+document.source_invoice_id}>Original bill</Link></>}</footer>
 </article></main>;
}
