import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Database, Sql } from '@dinerdost/database';
import { businessDate, ensure, requireOutlet, requirePermission, type Actor } from '@dinerdost/core';
import { command, num, one, type Row } from './shared';
import { actorStream } from './operational-access';
import { assertPlatformFeature } from './platform-policy';
import { recordStockCountsTransaction } from './stock-counts';
import { COUNT_SHEET_BYTES, COUNT_SHEET_LIMIT, countSheetCsv, readCountSheetCsv, sheetText } from './stock-count-sheet-csv';

const contextSchema = z.object({ outletId: z.uuid(), date: z.iso.date(), phase: z.enum(['OPENING', 'CLOSING']) });
const importSchema = contextSchema.extend({ csv: z.string().max(COUNT_SHEET_BYTES), note: z.string().trim().max(500).default('') }).strict();
type CountContext = z.infer<typeof contextSchema>;
type ImportData = z.infer<typeof importSchema>;
type Proposed = { row: number; ingredientId: string; name: string; unit: string; quantityMilli: number; version: number; correction: boolean };
type Issue = { row: number; message: string };

async function access(db: Database, actor: Actor, data: CountContext, current = false) {
  ensure(!actor.application || actor.application === 'MASTER', 'APPLICATION_FORBIDDEN', 'Count sheets are available in the web application only.', 403);
  requirePermission(actor, 'inventory');
  requireOutlet(actor, data.outletId);
  ensure(current ? data.date === businessDate() : data.date <= businessDate(), 'COUNT_DATE_LOCKED', "Import counts for today's India business date. Previous days are read-only.", 409);
  await assertPlatformFeature(db, actor, 'inventory');
}

async function sheetItems(tx: Sql, actor: Actor, data: CountContext, search = '') {
  return (await tx.query<Row>(`SELECT i.id,i.name,i.unit,i.production_stream,i.retired_at,
    o.version AS opening_version,o.quantity_milli AS opening_quantity,
    c.version AS closing_version,c.quantity_milli AS closing_quantity
    FROM ingredients i
    LEFT JOIN LATERAL (SELECT version,quantity_milli FROM daily_stock_counts WHERE ingredient_id=i.id AND business_date=$2::date AND phase='OPENING' ORDER BY version DESC LIMIT 1) o ON true
    LEFT JOIN LATERAL (SELECT version,quantity_milli FROM daily_stock_counts WHERE ingredient_id=i.id AND business_date=$2::date AND phase='CLOSING' ORDER BY version DESC LIMIT 1) c ON true
    WHERE i.outlet_id=$1 AND i.retired_at IS NULL AND ($3::text IS NULL OR i.production_stream=$3)
      AND ($4='' OR i.name ILIKE '%' || $4 || '%') ORDER BY i.name,i.id LIMIT $5`,
    [data.outletId, data.date, actorStream(actor), search.replace(/[\\%_]/g, '\\$&'), COUNT_SHEET_LIMIT + 1])).rows;
}
function eligibility(item: Row, phase: CountContext['phase']) {
  return phase === 'OPENING' && item.closing_version ? 'Opening is locked after closing.' : phase === 'CLOSING' && !item.opening_version ? 'Record opening before closing.' : '';
}

export async function stockCountSheet(db: Database, actor: Actor, input: unknown) {
  const data = contextSchema.extend({ search: z.string().trim().max(120).default('') }).strict().parse(input);
  await access(db, actor, data);
  return db.transaction(actor.restroId, async tx => {
    const outlet = await one(tx, 'SELECT name FROM outlets WHERE id=$1', [data.outletId]);
    const records = await sheetItems(tx, actor, data, data.search);
    ensure(records.length <= COUNT_SHEET_LIMIT, 'SHEET_TOO_MANY_ROWS', 'More than 1,000 items match. Narrow the search before downloading a sheet.');
    const items = records.map(item => ({
      ingredientId: item.id as string, name: item.name as string, unit: item.unit as string,
      version: num(item[data.phase === 'OPENING' ? 'opening_version' : 'closing_version']),
      recordedQuantityMilli: item[data.phase === 'OPENING' ? 'opening_quantity' : 'closing_quantity'] == null ? null : num(item[data.phase === 'OPENING' ? 'opening_quantity' : 'closing_quantity']),
      eligibility: eligibility(item, data.phase),
    }));
    const csv = countSheetCsv(items.map(item => [data.outletId, data.date, data.phase, item.ingredientId, item.name, item.unit, item.version, item.recordedQuantityMilli == null ? '' : String(item.recordedQuantityMilli / 1000), '']));
    ensure(Buffer.byteLength(csv, 'utf8') <= COUNT_SHEET_BYTES, 'SHEET_TOO_LARGE', 'The sheet is too large. Narrow the search before downloading.');
    return { ...data, outletName: String(outlet.name), items, csv };
  });
}

async function preview(tx: Sql, actor: Actor, data: ImportData, lock = false) {
  const rows: Proposed[] = [], errors: Issue[] = [];
  let cells: string[][];
  try { cells = readCountSheetCsv(data.csv); }
  catch (e) { return { valid: false as const, rows, errors: [{ row: 0, message: (e as Error).message }], skipped: 0, previewToken: null }; }
  // Load only submitted IDs, rather than a screen/search page; never trust labels to identify stock.
  const ids = [...new Set(cells.map(row => row[3]).filter(value => z.uuid().safeParse(value).success))];
  const records = ids.length ? (await tx.query<Row>(`SELECT i.id,i.name,i.unit,i.production_stream,
    o.version AS opening_version,c.version AS closing_version
    FROM ingredients i
    LEFT JOIN LATERAL (SELECT version FROM daily_stock_counts WHERE ingredient_id=i.id AND business_date=$2::date AND phase='OPENING' ORDER BY version DESC LIMIT 1) o ON true
    LEFT JOIN LATERAL (SELECT version FROM daily_stock_counts WHERE ingredient_id=i.id AND business_date=$2::date AND phase='CLOSING' ORDER BY version DESC LIMIT 1) c ON true
    WHERE i.outlet_id=$1 AND i.retired_at IS NULL AND i.id=ANY($3::uuid[]) AND ($4::text IS NULL OR i.production_stream=$4)
    ORDER BY i.id ${lock ? 'FOR UPDATE OF i' : ''}`, [data.outletId, data.date, ids, actorStream(actor)])).rows : [];
  const byId = new Map(records.map(item => [item.id, item])), seen = new Set<string>();
  let skipped = 0;
  for (let index = 0; index < cells.length; index++) {
    const cell = cells[index], row = index + 2, item = byId.get(cell[3]);
    const issue = (message: string) => errors.push({ row, message });
    if (cell.length !== 9) { issue('Keep all nine columns from the downloaded sheet.'); continue; }
    if (seen.has(cell[3])) { issue('Duplicate stock item. Keep one row per item.'); continue; }
    seen.add(cell[3]);
    if (cell[0] !== data.outletId || cell[1] !== data.date || cell[2] !== data.phase) { issue('Outlet, business date or phase does not match this import. Download a fresh sheet.'); continue; }
    if (!item) { issue('Item is unavailable, retired or outside your authorized outlet/stock stream.'); continue; }
    if (cell[4] !== item.name && cell[4] !== sheetText(String(item.name))) { issue('Item name changed. Download a fresh sheet.'); continue; }
    if (cell[5] !== item.unit) { issue('Unit does not match the stock base unit. Download a fresh sheet.'); continue; }
    const quantity = cell[8].trim();
    if (!quantity) { skipped++; continue; }
    if (!/^\d+(\.\d{1,3})?$/.test(quantity) || !Number.isFinite(Number(quantity)) || Number(quantity) > 1000000) { issue('Count must be 0 to 1,000,000 with at most three decimals, in the listed base unit.'); continue; }
    const version = num(item[data.phase === 'OPENING' ? 'opening_version' : 'closing_version']);
    if (!/^\d+$/.test(cell[6]) || Number(cell[6]) !== version) { issue('Count changed since this sheet was downloaded. Download and preview a fresh sheet.'); continue; }
    const blocked = eligibility(item, data.phase);
    if (blocked) { issue(blocked); continue; }
    if (version && data.note.length < 5) { issue('Add a correction reason of at least five characters.'); continue; }
    rows.push({ row, ingredientId: String(item.id), name: String(item.name), unit: String(item.unit), quantityMilli: Math.round(Number(quantity) * 1000), version, correction: version > 0 });
  }
  if (!rows.length && !errors.length) errors.push({ row: 0, message: 'Enter at least one Count. Blank quantities remain unknown and are skipped.' });
  const valid = errors.length === 0;
  const previewToken = valid ? createHash('sha256').update(JSON.stringify({ data, rows })).digest('hex') : null;
  return { valid, rows, errors, skipped, previewToken };
}

export async function previewStockCountImport(db: Database, actor: Actor, input: unknown) {
  const data = importSchema.parse(input);
  await access(db, actor, data, true);
  return db.transaction(actor.restroId, tx => preview(tx, actor, data));
}

export async function importStockCountSheet(db: Database, actor: Actor, key: string, input: unknown) {
  const { previewToken, ...data } = importSchema.extend({ previewToken: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(input);
  await access(db, actor, data, true);
  return command(db, actor, key, 'STOCK_COUNT_SHEET_IMPORTED', { ...data, previewToken }, async tx => {
    // Serializes with manual counts and other imports. All rows are checked before any observation is appended.
    await one(tx, 'SELECT id FROM outlets WHERE id=$1 FOR UPDATE', [data.outletId]);
    const current = await preview(tx, actor, data, true);
    ensure(current.valid && current.previewToken === previewToken, 'COUNT_SHEET_CHANGED', 'The file or counts changed. Download a fresh sheet and preview again; nothing was imported.', 409);
    return recordStockCountsTransaction(tx, actor, { ...data, counts: current.rows.map(({ ingredientId, quantityMilli, version }) => ({ ingredientId, quantityMilli, version })) });
  });
}
