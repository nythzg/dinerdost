'use client';
import { useEffect, useRef, useState } from 'react';
import type { stockCountSheet, previewStockCountImport } from '@dinerdost/services';
import { businessDate } from '@dinerdost/core';
import { request, idempotentPost } from '@/lib/client';
import { T } from '@/lib/staff-language';
import { useDesk } from '../workspace/context';
import './stock-count-sheets.css';

type Sheet = Awaited<ReturnType<typeof stockCountSheet>>;
type Preview = Awaited<ReturnType<typeof previewStockCountImport>>;
const endpoint = '/api/inventory-tools/count-sheets';
export function StockCountSheets({ outletId, day, search, editable, onSaved }: { outletId: string; day: string; search: string; editable: boolean; onSaved: () => void }) {
  const { refresh, notify } = useDesk();
  const [phase, setPhase] = useState<'OPENING' | 'CLOSING'>('OPENING');
  const [sheet, setSheet] = useState<Sheet | null>(null), [csv, setCsv] = useState(''), [note, setNote] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false), [reload, setReload] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null), fileSequence = useRef(0);
  const params = new URLSearchParams({ outletId, date: day, phase, search });
  const canImport = editable && day === businessDate();
  useEffect(() => {
    const abort = new AbortController();
    setSheet(null); setError('');
    void request<Sheet>(endpoint + '?' + new URLSearchParams({ outletId, date: day, phase, search }), { signal: abort.signal }).then(setSheet).catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    return () => abort.abort();
  }, [outletId, day, phase, search, reload]);
  const reset = (clearFile = true) => { fileSequence.current++; setPreview(null); setCsv(''); setSaved(false); setError(''); if (clearFile && fileRef.current) fileRef.current.value = ''; };
  const download = () => {
    if (!sheet) return;
    const href = URL.createObjectURL(new Blob(['\uFEFF' + sheet.csv], { type: 'text/csv;charset=utf-8' })), link = document.createElement('a');
    link.href = href; link.download = `stock-count-${phase.toLowerCase()}-${day}.csv`; link.click(); URL.revokeObjectURL(href);
  };
  const loadFile = async (file?: File) => {
    reset(false); if (!file) return;
    const sequence = fileSequence.current;
    setBusy(true);
    try {
      if (file.size > 1024 * 1024) throw new Error('Choose a CSV no larger than 1 MiB.');
      const text = await file.text();
      if (!text.trim()) throw new Error('The selected CSV is empty. Download and complete a count sheet first.');
      if (sequence === fileSequence.current) setCsv(text);
    } catch (e) { if (sequence === fileSequence.current) setError((e as Error).message); }
    finally { if (sequence === fileSequence.current) setBusy(false); }
  };
  const input = { outletId, date: day, phase, csv, note };
  const review = async () => {
    setBusy(true); setPreview(null); setSaved(false); setError('');
    try { setPreview(await request<Preview>(endpoint, { method: 'POST', body: JSON.stringify({ action: 'preview', input }) })); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const confirm = async () => {
    if (!preview?.valid || !preview.previewToken || !canImport) return;
    setBusy(true); setError('');
    try {
      const result = await idempotentPost<{ counts: unknown[] }>(endpoint, { action: 'import', input: { ...input, previewToken: preview.previewToken } });
      setSaved(true); setPreview(null); setCsv(''); if (fileRef.current) fileRef.current.value = '';
      setReload(n => n + 1); onSaved(); notify(`${result.counts.length} stock counts recorded.`);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
      // Retain the exact preview on network/server failures, so retry uses the same idempotency key.
      if ((e as { status?: number }).status && (e as { status: number }).status < 500) setPreview(null);
    } finally { setBusy(false); }
  };
  return <div className="count-sheet-tools">
    <p className="muted">{day} · India time · <T>Download a sheet, enter physical counts, then preview before recording.</T></p>
    <label><T>Count phase</T><select aria-label="Count sheet phase" value={phase} disabled={busy} onChange={e => { reset(); setPhase(e.target.value as typeof phase); }}><option value="OPENING">Opening</option><option value="CLOSING">Closing</option></select></label>
    <div className="count-sheet-actions">
      <button type="button" className="button" disabled={!sheet?.items.length || busy} onClick={download}><T>Download count sheet</T></button>
      {sheet?.items.length ? <a className="button" href={'/stock-count-sheet?' + params} target="_blank" rel="noopener noreferrer"><T>Print count sheet</T></a> : null}
    </div>
    {sheet && <p className="muted">{sheet.items.length} items{search ? ` matching “${search}”` : ''}. <T>Quantities use the listed base units. Blank counts are skipped; zero is recorded.</T></p>}
    {canImport ? <section className="count-sheet-import" aria-label="Import physical counts">
      <label><T>Upload completed CSV</T><input ref={fileRef} type="file" accept=".csv,text/csv" aria-label="Completed count sheet" disabled={busy} onChange={e => void loadFile(e.target.files?.[0])} /></label>
      <label><T>Correction reason</T><textarea aria-label="Count import correction reason" value={note} maxLength={500} disabled={busy} onChange={e => { setNote(e.target.value); setPreview(null); setSaved(false); }} placeholder="Required when correcting a recorded count" /></label>
      <p className="muted"><T>Keep the identity, date, phase, unit and version columns unchanged. Fill only Count. Up to 1,000 items, 1 MiB.</T></p>
      <button type="button" className="button" disabled={!csv || busy} onClick={() => void review()}><T>Preview import</T></button>
      {preview && <div className="count-sheet-preview" aria-live="polite">
        <p role="status">{preview.rows.length} <T>counts to record</T> · {preview.skipped} <T>blank rows skipped</T></p>
        {preview.errors.length > 0 && <div role="alert" className="error"><strong><T>Nothing has been imported. Fix these errors and preview again.</T></strong><ul>{preview.errors.map((issue, n) => <li key={n}>{issue.row ? `Row ${issue.row}: ` : ''}{issue.message}</li>)}</ul></div>}
        {!!preview.rows.length && <div className="table-scroll"><table><thead><tr><th>Item</th><th>Unit</th><th>Count</th><th>Observation</th></tr></thead><tbody>{preview.rows.map(row => <tr key={row.ingredientId}><td>{row.name}</td><td>{row.unit}</td><td>{row.quantityMilli / 1000}</td><td>{row.correction ? `Correction · v${row.version + 1}` : 'First count'}</td></tr>)}</tbody></table></div>}
        {preview.valid && <><p className="muted"><T>This records physical observations only. Stock balances and past records stay unchanged.</T></p><button type="button" className="button primary" disabled={busy} onClick={() => void confirm()}><T>Confirm and record counts</T></button></>}
      </div>}
    </section> : <p className="muted"><T>Previous days and reports are read-only. Use today's Inventory counts to import.</T></p>}
    {busy && <p role="status"><T>Working…</T></p>}
    {saved && <p role="status"><T>Counts recorded. Download a fresh sheet for another count or correction.</T></p>}
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}
