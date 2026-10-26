import { NextRequest } from 'next/server';
import { z } from 'zod';
import { DomainError, ensure } from '@dinerdost/core';
import { stockCountSheet, previewStockCountImport, importStockCountSheet } from '@dinerdost/services';
import { context, csrf, failure, response } from '@/lib/server';
export const runtime = 'nodejs';

// Only this CSV endpoint accepts larger JSON. Keep other command payload limits unchanged.
async function sheetBody(request: NextRequest) {
  const limit = 2 * 1024 * 1024;
  ensure(Number(request.headers.get('content-length') ?? 0) <= limit, 'BODY_TOO_LARGE', 'The count sheet request is too large.', 413);
  const reader = request.body?.getReader();
  ensure(reader, 'INVALID_JSON', 'Select a count sheet first.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      ensure(length <= limit, 'BODY_TOO_LARGE', 'The count sheet request is too large.', 413);
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new DomainError('INVALID_JSON', 'The count sheet request is not valid JSON.', 400); }
}
export async function GET(request: NextRequest) {
  try {
    const { db, actor } = await context();
    return response(await stockCountSheet(db, actor, Object.fromEntries(request.nextUrl.searchParams)));
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    await csrf(request);
    const { db, actor } = await context();
    actor.ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim();
    actor.deviceId = request.headers.get('x-device-id')?.slice(0, 80);
    const data = z.object({ action: z.enum(['preview', 'import']), input: z.unknown() }).strict().parse(await sheetBody(request));
    if (data.action === 'preview') return response(await previewStockCountImport(db, actor, data.input));
    const key = z.uuid().parse(request.headers.get('idempotency-key'));
    return response(await importStockCountSheet(db, actor, key, data.input));
  } catch (error) { return failure(error); }
}
