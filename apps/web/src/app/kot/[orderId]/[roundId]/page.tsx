import { notFound, redirect } from "next/navigation";
import { kotReceipt } from "@dinerdost/services";
import { context } from "@/lib/server";
import { businessDateTime } from "@dinerdost/core";
import type { Row } from "@/lib/client";
import {KotPaperSize} from '@/features/orders/kot-paper-size';
export default async function KotPage({params,searchParams}:{params:Promise<{orderId:string;roundId:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
 let receipt;
 try{
  const {db,actor}=await context(),p=await params,query=await searchParams;
  receipt=await kotReceipt(db,actor,p.orderId,p.roundId,{...(query.streams!==undefined?{streams:typeof query.streams==='string'?query.streams.split(','):query.streams}:{}),...(query.layout!==undefined?{layout:query.layout}:{}),...(query.tickets!==undefined?{ticketIds:typeof query.tickets==='string'?query.tickets.split(','):query.tickets}:{})});
 }catch(error){if((error as {status?:number}).status===401)redirect('/signin');notFound()}
 const byDepartment=new Map<string,Row[]>();
 for(const ticket of receipt.tickets){
  const parts=new Map<string,Row[]>();
  for(const item of ticket.items){const items=parts.get(item.production_stream)??[];items.push(item);parts.set(item.production_stream,items)}
  for(const [stream,items] of parts){const group=byDepartment.get(stream)??[];group.push({...ticket,production_stream:stream,items});byDepartment.set(stream,group)}
 }
 const groups:Row[][]=receipt.layout==='COMBINED'?[receipt.tickets]:[...byDepartment.values()];
 return <main className="kot-receipt" data-kot-receipt><KotPaperSize/>{groups.map((tickets,index)=><article className="kot-group" key={index}>
  <h1>{receipt.outlet}</h1><h2>KOT #{receipt.number} · Round {receipt.round}</h2>
  <p><strong>{[...new Set(tickets.flatMap((ticket:Row)=>ticket.items.map((item:Row)=>item.production_stream)))].join(' + ')}</strong></p>
  <p>{receipt.table?'Table '+receipt.table:receipt.type.replaceAll('_',' ')} · {receipt.course}</p>
  {tickets.map((ticket:Row)=><section className="kot-station" key={ticket.id}>
   <h3>{ticket.production_stream} · {ticket.station}</h3><p>{businessDateTime(ticket.created_at).replace('T',' ')} IST</p><hr/>
   {ticket.items.map((line:Row,lineIndex:number)=><div className="kot-item" key={lineIndex}><strong>{Number(line.quantity_milli)/1000} × {line.name}</strong>{line.variant&&<p>{line.variant}</p>}{line.modifiers?.length>0&&<p>{line.modifiers.map((modifier:Row)=>modifier.name).join(', ')}</p>}{line.note&&<p className="kot-note">{line.note}</p>}</div>)}
   <hr/><small>Ticket {String(ticket.id).slice(0,8)}</small>
  </section>)}
 </article>)}</main>;
}
