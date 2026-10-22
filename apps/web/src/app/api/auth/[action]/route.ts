import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { getDatabase } from "@dinerdost/database";
import { login, logout, signup, SESSION_COOKIE } from "@dinerdost/services";
import { DomainError } from "@dinerdost/core";
import { body, csrf, failure, response, setSession } from "@/lib/server";
export const runtime = "nodejs";
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    csrf(request);
    const db = await getDatabase();
    const { action } = await params;
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
    if (action === "logout") {
      await logout(db, (await cookies()).get(SESSION_COOKIE)?.value);
      const reply = response({ ok: true });
      reply.cookies.delete(SESSION_COOKIE);
      return reply;
    }
    const data = await body(request);
    const result =
      action === "signup"
        ? await signup(db, data, ip)
        : action === "login"
          ? await login(db, data, ip)
          : null;
    if (!result) throw new DomainError("NOT_FOUND", "Unknown action.", 404);
    const reply = response({ ok: true });
    setSession(reply, result.token);
    return reply;
  } catch (error) {
    return failure(error);
  }
}
