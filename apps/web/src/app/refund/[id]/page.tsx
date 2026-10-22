import Link from 'next/link';
import {notFound,redirect} from 'next/navigation';
import {getWebRefundDocument} from '@dinerdost/services';
import {context} from '@/lib/server';
import {RefundPrint} from '@/features/orders/refund-print';
const money=(value:unknown)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(Number(value)/100);
export default async function RefundPage({params}:{params:Promise<{id:string}>}){
 let document;try{const {db,actor}=await context();document=await getWebRefundDocument(db,actor,(await params).id)}catch(error){if((error as {status?:number}).status===401)redirect('/signin');notFound()}
 const s=document.snapshot;
 return <main className="invoice-page"><div className="invoice-actions"><Link className="subtle-link" href={'/app/orders/'+document.order_id}>Back to order</Link><RefundPrint/></div><article className="invoice-paper refund-document">
  <header><div><p>{s.original.restaurant.name} · {s.original.outlet.name}</p><h1>Manual refund record</h1><strong>{s.number}</strong><p>Credit adjustment linked to {s.invoiceNumber}<br/>Order #{s.orderNumber}</p></div><div><p>Refund recorded</p><h2>{money(s.amount)}</h2></div></header>
  <section><p>Mode: {s.mode} · Reference: {s.reference||'—'}</p><p>Reason: {s.reason}</p><p>Recorded by {s.actor}<br/>{new Date(document.created_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})} IST</p></section>
  <section><h3>Original receipts</h3>{s.allocations.map((p:{paymentId:string;reference:string;amount:number})=><div className="refund-receipt" key={p.paymentId}><span>{p.reference||p.paymentId}</span><strong>{money(p.amount)}</strong></div>)}</section>
  <section><h3>Credit adjustment</h3>{[['Net sales',s.netSales],['Tax',s.tax],['Charges',s.charges],['Round off',s.roundOff]].map(([label,value])=><div className="total-row" key={label}><span>{label}</span><strong>−{money(value)}</strong></div>)}</section>
  <footer><p>Recorded only. No gateway refund was initiated. The original invoice and payment records remain unchanged.</p><Link className="text-button" href={'/invoice/'+document.invoice_id}>Original bill</Link></footer>
 </article></main>;
}
