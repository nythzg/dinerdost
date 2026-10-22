import "server-only";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getDatabase } from "@dinerdost/database";
import { DomainError, ensure } from "@dinerdost/core";
import {
  authenticate,
  SESSION_COOKIE,
  translateError,
} from "@dinerdost/services";
export async function context() {
  const db = await getDatabase();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return { db, actor: await authenticate(db, token) };
}
export function csrf(request: NextRequest) {
  const origin = request.headers.get("origin");
  ensure(
    origin === new URL(request.url).origin ||
      (!!process.env.APP_ORIGIN && origin === process.env.APP_ORIGIN),
    "INVALID_ORIGIN",
    "Refresh this page before trying again.",
    403,
  );
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
