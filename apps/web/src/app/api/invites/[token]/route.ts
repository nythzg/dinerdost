import { NextRequest } from "next/server";
import { getDatabase } from "@dinerdost/database";
import {
  acceptStaffInvitation,
  inspectStaffInvitation,
} from "@dinerdost/services";
import { body, csrf, failure, response, setSession } from "@/lib/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const reply = response(
      await inspectStaffInvitation(await getDatabase(), (await params).token),
    );
    reply.headers.set("Referrer-Policy", "no-referrer");
    return reply;
  } catch (error) {
    return failure(error);
  }
}
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    await csrf(request);
    const result = await acceptStaffInvitation(
      await getDatabase(),
      (await params).token,
      await body(request),
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local",
    );
    const reply = response({ ok: true });
    setSession(reply, result.token);
    return reply;
  } catch (error) {
    return failure(error);
  }
}
