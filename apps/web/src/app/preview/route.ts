import { randomBytes, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@dinerdost/database";
import {
  signup,
  workspace,
  openSession,
  createRound,
  decideRound,
} from "@dinerdost/services";
import { failure, setSession } from "@/lib/server";

type Preview = { token: string; customerKey: string };
declare global {
  var dinerDostLocalPreview: Promise<Preview> | undefined;
}

async function createPreview(): Promise<Preview> {
  const db = await getDatabase();
  const nonce = randomUUID();
  const account = await signup(
    db,
    {
      name: "Preview Owner",
      email: "preview-" + nonce + "@example.test",
      password: randomBytes(32).toString("base64url"),
      restaurant: "Diner Dost Café",
      outlet: "Indiranagar",
      qrEnabled: true,
      demo: true,
      taxBps: 500,
    },
    "local-ui-preview-" + nonce,
  );
  const data = await workspace(db, account.actor);
  const sessions: string[] = [];
  for (let i = 0; i < 3; i++) {
    const session = await openSession(db, account.actor, randomUUID(), {
      tableId: data.tables[i].id,
      guests: i + 2,
    });
    sessions.push(session.id);
  }
  for (let i = 0; i < 6; i++) {
    const order = await createRound(db, account.actor, randomUUID(), {
      outletId: data.outletId,
      ...(i < 3
        ? { sessionId: sessions[i], type: "DINE_IN" }
        : { type: "TAKEAWAY" }),
      items: [
        { itemId: data.menu[i % data.menu.length].id, quantity: (i % 2) + 1 },
      ],
    });
    if (i < 2)
      await decideRound(
        db,
        account.actor,
        randomUUID(),
        order.id,
        order.rounds[0].id,
        { version: order.rounds[0].version, decision: "ACCEPT" },
      );
  }
  return { token: account.token, customerKey: data.tables[3].public_key };
}

export async function GET(request: NextRequest) {
  // Explicit local review storage only. Production and connected databases never
  // expose a demo sign-in route, even when the URL or Host header is supplied.
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.VERCEL ||
    process.env.DATABASE_URL ||
    process.env.LOCAL_DATABASE_PATH !== ".data/ui-refresh" ||
    !["localhost", "127.0.0.1"].includes(request.nextUrl.hostname)
  ) {
    return new NextResponse(null, { status: 404 });
  }
  try {
    globalThis.dinerDostLocalPreview ??= createPreview();
    const preview = await globalThis.dinerDostLocalPreview;
    const target =
      request.nextUrl.searchParams.get("customer") === "1"
        ? "/q/" + preview.customerKey
        : "/app/overview";
    const reply = NextResponse.redirect(new URL(target, request.url));
    reply.headers.set("Cache-Control", "no-store");
    setSession(reply, preview.token);
    return reply;
  } catch (error) {
    globalThis.dinerDostLocalPreview = undefined;
    return failure(error);
  }
}
