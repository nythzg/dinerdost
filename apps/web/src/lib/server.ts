import "server-only";
import {isIP} from 'node:net';
import { cookies, headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getDatabase } from "@dinerdost/database";
import { DomainError, ensure } from "@dinerdost/core";
import {startLocalCalculatorRetention} from './calculator-retention';
import {
  platformOwnerView,platformOwnerReadDatabase,platformOwnerEditDatabase,PLATFORM_OWNER_VIEW_COOKIE,
  authenticate,
  authenticatePlatform,
  PLATFORM_SESSION_COOKIE,
  platformWebAccess,
  SESSION_COOKIE,
  translateError,
} from "@dinerdost/services";
export async function context(options:{platform?:boolean}={}) {
  const db = await getDatabase();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const grant=(await cookies()).get(PLATFORM_OWNER_VIEW_COOKIE)?.value;
  if(grant){const platform=await platformContext(),view=await platformOwnerView(db,platform.actor,grant);return {db:view.actor.supportView?.mode==='EDIT'?platformOwnerEditDatabase(db,platform.actor,grant,view.actor.restroId):platformOwnerReadDatabase(db,view.actor.restroId),actor:view.actor};}
  const actor=await authenticate(db, token);
  if(!options.platform)await platformWebAccess(db,actor);
  startLocalCalculatorRetention(db);
  return { db, actor };
}
export async function platformContext(){const db=await getDatabase(),jar=await cookies(),token=jar.get(PLATFORM_SESSION_COOKIE)?.value;const actor=token?await authenticatePlatform(db,token):await authenticate(db,jar.get(SESSION_COOKIE)?.value);actor.ip=(await headers()).get('x-forwarded-for')?.split(',')[0].trim()??'local';return {db,actor};}
export async function csrf(request: NextRequest) {
  const origin = request.headers.get("origin");
  const local = new URL(request.url);
  const lanHost = process.env.NODE_ENV === 'development' ? process.env.DD_LAN_HOST : undefined;
  if(lanHost && isIP(lanHost) === 4)local.hostname = lanHost;
  ensure(
    origin === new URL(request.url).origin ||
      (!!process.env.APP_ORIGIN && origin === process.env.APP_ORIGIN) ||
      (!!lanHost && isIP(lanHost) === 4 && origin === local.origin),
    "INVALID_ORIGIN",
    "Refresh this page before trying again.",
    403,
  );
  const grant=request.cookies.get(PLATFORM_OWNER_VIEW_COOKIE)?.value;
  if(grant&&request.nextUrl.pathname!=='/api/superadmin/support-view'){
    const {db,actor}=await platformContext(),view=await platformOwnerView(db,actor,grant);
    ensure(view.actor.supportView?.mode==='EDIT','SUPPORT_READ_ONLY','This is a read-only owner view. Exit it before changing data.',403);
    ensure(/^\/(api\/(commands|calculator|inventory-tools|uploads|notifications|push)(\/|$)|v2\/(orders|sessions)(\/|$))/.test(request.nextUrl.pathname),'SUPPORT_ROUTE_FORBIDDEN','Exit owner support before using account, platform or customer-session actions.',403);
  }
}
export async function body(request: NextRequest) {
  ensure(
    Number(request.headers.get("content-length") ?? 0) <= 65536,
    "BODY_TOO_LARGE",
    "The request is too large.",
    413,
  );
  const raw = await request.text();
  ensure(
    raw.length <= 65536,
    "BODY_TOO_LARGE",
    "The request is too large.",
    413,
  );
  try {
    return JSON.parse(raw);
  } catch {
    throw new DomainError(
      "INVALID_JSON",
      "The request is not valid JSON.",
      400,
    );
  }
}
export function response(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export function failure(error: unknown) {
  if (error instanceof ZodError)
    return response(
      {
        error: {
          code: "INVALID_INPUT",
          message: error.issues[0]?.message ?? "Check the entered details.",
          field: error.issues[0]?.path.join("."),
        },
      },
      422,
    );
  const issue = translateError(error);
  if (issue.status >= 500)
    console.error("Diner Dost request failed", {
      code: issue.code,
      message: (error as Error)?.message,
    });
  return response(
    { error: { code: issue.code, message: issue.message } },
    issue.status,
  );
}
export function setSession(reply: NextResponse, token: string) {
  reply.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 43200,
  });
}
