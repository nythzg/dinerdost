import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, type NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@dinerdost/database";
import {
  guestCatalog,
  platformPublicAccess,
  connectGuest,
  limitGuestRequest,
  pairGuest,
  guestSubmit,
  guestService,
  guestActivity,
} from "@dinerdost/services";
import { body, csrf, failure, response } from "@/lib/server";
const guestCookie = "dd_visit",
  deviceCookie = "dd_device";
function rememberDevice(reply: NextResponse, device?: string) {
  if (device)
    reply.cookies.set(deviceCookie, device, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 365 * 86400,
    });
  return reply;
}
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  let device: string | undefined;
  try {
    const store = await cookies();
    device = store.get(deviceCookie)?.value;
    return rememberDevice(
      response(
        await guestCatalog(
          await getDatabase(),
          (await params).key,
          store.get(guestCookie)?.value ?? store.get("dd_guest")?.value,
          device,
          true,
        ),
      ),
      device,
    );
  } catch (error) {
    return rememberDevice(failure(error), device);
  }
}
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    csrf(request);
    const { key } = await params;
    const db = await getDatabase(),
      store = await cookies();
    const data = z
      .object({
        action: z.enum(["connect", "pair", "activity", "order", "service"]),
        input: z.unknown(),
      })
      .strict()
      .parse(await body(request));
    const device =
      store.get(deviceCookie)?.value ?? randomBytes(32).toString("base64url");
    if (data.action === "connect" || data.action === "pair") {
      await platformPublicAccess(db,{tableKey:key},'qr');
      const ip =
        request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
      const result =
        data.action === "connect"
          ? await connectGuest(
              db,
              key,
              device,
              ip,
              store.get(guestCookie)?.value ?? store.get("dd_guest")?.value,
            )
          : await pairGuest(db, key, data.input, device, ip);
      const reply = response({ ok: true });
      for (const [name, value] of [
        [guestCookie, result.token],
        [deviceCookie, device],
      ])
        reply.cookies.set(name, value, {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: name === guestCookie ? "/api/guest/" + key : "/",
          maxAge: name === deviceCookie ? 365 * 86400 : 7200,
        });
      return reply;
    }
    const requestKey = z.uuid().parse(request.headers.get("idempotency-key"));
    // Public table links are shareable. Limit requests and keep every order pending.
    await limitGuestRequest(db, key, device);
    const visit = store.get(guestCookie)?.value ?? store.get("dd_guest")?.value;
    if (data.action === "activity")
      return response(await guestActivity(db, key, visit, device));
    return response(
      await (data.action === "order"
        ? guestSubmit(
            db,
            key,
            store.get(guestCookie)?.value ?? store.get("dd_guest")?.value,
            device,
            requestKey,
            data.input,
            true,
          )
        : guestService(
            db,
            key,
            store.get(guestCookie)?.value ?? store.get("dd_guest")?.value,
            device,
            requestKey,
            data.input,
            true,
          )),
    );
  } catch (error) {
    return failure(error);
  }
}
