import { ensure } from '@dinerdost/core';

export const COUNT_SHEET_LIMIT = 1000;
export const COUNT_SHEET_BYTES = 1024 * 1024;
export const countSheetHeaders = ['Outlet ID', 'Business date', 'Phase', 'Ingredient ID', 'Item', 'Unit', 'Version', 'Recorded count', 'Count'];

export function sheetText(value: string) {
  return /^[\s\u0000-\u001f]*[=+@-]/.test(value) || /^[\t\r\n]/.test(value) ? "'" + value : value;
}
export function countSheetCsv(rows: (string | number)[][]) {
  return [countSheetHeaders, ...rows].map(row => row.map(value => '"' + (typeof value === 'number' ? String(value) : sheetText(value)).replaceAll('"', '""') + '"').join(',')).join('\r\n');
}

// RFC4180-style CSV. Unlike split(','), quoted names/newlines/doubled quotes round-trip.
// Strict framing prevents silently shifting the identity/unit/version columns.
export function readCountSheetCsv(source: string) {
  ensure(Buffer.byteLength(source, 'utf8') <= COUNT_SHEET_BYTES, 'SHEET_TOO_LARGE', 'The CSV must be no larger than 1 MiB.');
  const text = source.replace(/^\uFEFF/, ''), rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false, closed = false;
  const endCell = () => { row.push(cell); cell = ''; closed = false; };
  const endRow = () => {
    endCell();
    if (row.some(value => value.trim() !== '')) rows.push(row);
    row = [];
    ensure(rows.length <= COUNT_SHEET_LIMIT + 1, 'SHEET_TOO_MANY_ROWS', 'A sheet supports at most 1,000 items. Narrow the search and download separate sheets.');
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; closed = true; }
      } else cell += char;
    } else if (char === ',') endCell();
    else if (char === '\r' || char === '\n') { if (char === '\r' && text[i + 1] === '\n') i++; endRow(); }
    else if (char === '"' && !cell && !closed) quoted = true;
    else {
      ensure(!closed && char !== '"', 'SHEET_CSV_INVALID', 'Malformed CSV: check the quotes and column separators.');
      cell += char;
    }
  }
  ensure(!quoted, 'SHEET_CSV_INVALID', 'Malformed CSV: a quoted cell is unfinished.');
  if (cell || row.length || closed) endRow();
  ensure(rows.length > 0 && rows[0].length === countSheetHeaders.length && rows[0].every((value, i) => value === countSheetHeaders[i]), 'SHEET_HEADERS', 'Use the downloaded count sheet with its original column headers.');
  return rows.slice(1);
}
