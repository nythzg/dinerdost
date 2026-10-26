import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { stockCountSheet } from '@dinerdost/services';
import { context } from '@/lib/server';
import { CountSheetPrint } from '@/features/management/count-sheet-print';
import '@/features/management/stock-count-sheets.css';

export default async function StockCountSheetPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  let sheet;
  try {
    const { db, actor } = await context();
    sheet = await stockCountSheet(db, actor, await searchParams);
  } catch (error) {
    if ((error as { status?: number }).status === 401) redirect('/signin');
    notFound();
  }
  return <main className="stock-count-print">
    <div className="count-sheet-print-actions"><Link href="/app/inventory?view=counts">Back to inventory</Link><CountSheetPrint /></div>
    <h1>{sheet.phase === 'OPENING' ? 'Opening' : 'Closing'} stock count sheet</h1>
    <p>{sheet.outletName} · {sheet.date} · India business date</p>
    {sheet.search && <p>Items matching: {sheet.search}</p>}
    <p>Counted by: ____________________ &nbsp; Time: __________</p>
    <p>Write quantities in the listed base unit. Blank means not counted; write 0 for an observed zero.</p>
    <table><thead><tr><th>Item</th><th>Unit</th><th>Physical count</th><th>Notes</th></tr></thead><tbody>{sheet.items.map(item => <tr key={item.ingredientId}><td>{item.name}{item.eligibility && <small>{item.eligibility}</small>}</td><td>{item.unit}</td><td /><td /></tr>)}</tbody></table>
    {!sheet.items.length && <p>No active stock items match this sheet.</p>}
    <p className="count-sheet-print-footer">{sheet.items.length} items · Physical observations only; no stock adjustment. Historical days remain read-only.</p>
  </main>;
}
