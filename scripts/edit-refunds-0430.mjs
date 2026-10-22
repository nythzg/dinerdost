import {readFile,writeFile} from 'node:fs/promises';
const replace=(s,a,b)=>{if(!s.includes(a))throw new Error('Missing '+a.slice(0,95));return s.replace(a,b)};async function edit(p,f){await writeFile(p,f(await readFile(p,'utf8')))}
await edit('apps/web/src/app/api/commands/route.ts',s=>replace(s,'      case "loyaltyCap":',`      case "webRefund":
        result=await service.submitWebRefund(db,actor,key,orderId(),data.input);
        break;
      case "webRefundDecision":
        result=await service.decideWebRefund(db,actor,key,recordId(),data.input);
        break;
      case "loyaltyCap":`));
await edit('apps/web/src/features/orders/order-actions-menu.tsx',s=>{
 s=replace(s,'"use client";','"use client";\nimport {can} from "@dinerdost/core";\nimport {Refunds} from "./refunds";');
 return replace(s,'  <button role="menuitem" disabled aria-describedby={id+\'-refund\'}>Refund taken</button><small id={id+\'-refund\'}>Refund recording is not available yet.</small>',`  {can(desk.data.actor,'payments')&&<button role="menuitem" disabled={desk.busy||Number(order.totals?.paid??order.paid??0)<=0} onClick={()=>{close(true);desk.modal('Refund taken',<Refunds orderId={order.id} changed={changed}/>)}}>Refund taken</button>}`);
});
await edit('apps/web/src/features/orders/order-pages.tsx',s=>{
 s=replace(s,'"use client";','"use client";\nimport {Refunds,RefundApprovals} from "./refunds";');
 s=replace(s,'            <div className="total-row grand-total">',`            {Number(order.refund_total)>0&&<><div className="total-row"><span>Refunded</span><strong>{money(order.refund_total)}</strong></div><div className="total-row"><span>Net received</span><strong>{money(Number(order.totals.paid)-Number(order.refund_total))}</strong></div></>}
            <div className="total-row grand-total">`);
 s=replace(s,'      <div className="panel-heading payment-page-toolbar">',`      <div className="panel-heading payment-page-toolbar">
        {isManager(data.actor)&&<button className="button" onClick={()=>desk.modal('Refund requests',<RefundApprovals/>)}>Refund requests</button>}`);
 return s;
});
await edit('packages/services/src/orders.ts',s=>replace(s,'    deviceAccess,','    ...(!actor.application||actor.application===\'MASTER\'?{refund_total:num((await one(tx,\'SELECT coalesce(sum(amount),0) AS amount FROM web_refunds WHERE order_id=$1\',[orderId])).amount)}:{}),\n    deviceAccess,'));
await edit('packages/services/src/reports.ts',s=>{
 s="import {settledRefundsRead} from './web-refunds';\n"+s;
 s=replace(s,'    const netSales = num(summary.net_sales),',`    const refunds=await settledRefundsRead(tx,params[0] as string[],data.from,data.to);
    const refundRows=(await tx.query(\`SELECT r.id,r.amount,r.mode,r.reason,r.invoice_id,r.order_id,r.created_at,r.snapshot->>'number' AS number,o.source,(greatest(r.created_at,f.created_at) AT TIME ZONE 'Asia/Kolkata')::date AS day
      FROM web_refunds r JOIN invoices f ON f.order_id=r.order_id AND f.restro_id=r.restro_id AND f.document_type='FINAL_TAX_INVOICE' JOIN orders o ON o.id=r.order_id AND o.restro_id=r.restro_id
      WHERE r.outlet_id=ANY($1::uuid[]) AND (greatest(r.created_at,f.created_at) AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $2::date AND $3::date ORDER BY r.created_at,r.id\`,params)).rows;
    for(const refund of refundRows){const channel=channels.find(c=>c.source===refund.source);if(channel)channel.amount=num(channel.amount)-num(refund.amount);else channels.push({source:refund.source,orders:0,amount:-num(refund.amount)});const day=String(refund.day).slice(0,10),entry=daily.find(d=>String(d.date).slice(0,10)===day);if(entry)entry.amount=num(entry.amount)-num(refund.amount);else daily.push({date:day,orders:0,amount:-num(refund.amount)});}
    daily.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    const netSales = num(summary.net_sales)-num(refunds.net_sales),`);
 s=replace(s,'      receipts: num(summary.receipts),','      grossReceipts:num(summary.receipts),refunds:num(refunds.amount),refundRows,\n      receipts: num(summary.receipts)-num(refunds.amount),');
 s=replace(s,'      tax: num(summary.tax),','      tax: num(summary.tax)-num(refunds.tax),');s=replace(s,'      charges: num(summary.charges),','      charges: num(summary.charges)-num(refunds.charges),');
 return replace(s,'Issued final invoices and approved expenses; tax and named charges are shown separately.','Issued final invoices less immutable manual refund adjustments, plus approved expenses. Receipt-method rows retain original collections; refund outflows are listed separately.');
});
await edit('packages/services/src/workspace.ts',s=>{
 s="import {settledRefundsRead} from './web-refunds';\n"+s;s=replace(s,'  can,','  can,\n  businessDate,');
 const anchor='    if (can(actor, "inventory")';const position=s.indexOf(anchor,s.indexOf('result.metrics ='));if(position<0)throw new Error('Metrics followup');
 return s.slice(0,position)+`    if(result.metrics){const refunds=await settledRefundsRead(tx,[selected],businessDate(),businessDate());result.metrics.gross_settled=result.metrics.settled;result.metrics.refunds=num(refunds.amount);result.metrics.settled=num(result.metrics.settled)-num(refunds.amount);}
`+s.slice(position);
});
await edit('apps/web/src/features/management/reports-page.tsx',s=>{s=replace(s,'      ["Receipts (paise)", report.receipts],','      ["Net receipts (paise)", report.receipts],\n      ["Gross issued amount (paise)", report.grossReceipts],\n      ["Manual refunds (paise)", report.refunds],');s=replace(s,'      ...report.methods.map((row: Row) => [row.method, row.amount]),','      ...report.methods.map((row: Row) => [row.method, row.amount]),\n      [],["Refund record","Order","Invoice","Amount (paise)","Mode","Reason"],\n      ...(report.refundRows??[]).map((r:Row)=>[r.number,r.order_id,r.invoice_id,r.amount,r.mode,r.reason]),');s=replace(s,'          <div className="metric-grid three">','          {Number(report.refunds)>0&&<p className="panel">Manual refunds: <strong>{money(report.refunds)}</strong> · Net receipts below include these adjustments. Original payment-method totals retain collected amounts.</p>}\n          <div className="metric-grid three">');return s});
console.log('Manual refunds, manager approval, linked documents and net reporting connected.');
