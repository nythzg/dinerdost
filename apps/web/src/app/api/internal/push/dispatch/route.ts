import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { getDatabase } from "@dinerdost/database";
import { dispatchPush, firebaseSender } from "@dinerdost/services";
import { ensure } from "@dinerdost/core";
import { failure, response } from "@/lib/server";
export const runtime = "nodejs";
export const maxDuration = 60;
async function dispatch(request: NextRequest) {
  try {
    const expected = process.env.CRON_SECRET;
    const supplied = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    ensure(expected && Buffer.byteLength(supplied) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected)), "UNAUTHENTICATED", "Worker authentication required.", 401);
    const send = firebaseSender();
    ensure(send, "PUSH_SETUP_REQUIRED", "Configure Firebase sender access before starting the worker.", 503);
    return response(await dispatchPush(await getDatabase(), send, 10));
  } catch (error) { return failure(error); }
}
export const GET = dispatch;
export const POST = dispatch;
