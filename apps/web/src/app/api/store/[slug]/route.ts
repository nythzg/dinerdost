import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { z } from "zod";
import { getDatabase } from "@dinerdost/database";
import * as service from "@dinerdost/services";
import { body, csrf, failure, response } from "@/lib/server";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params, jar = await cookies();
    return response(await service.storefrontCatalog(await getDatabase(), slug, jar.get("dd_store")?.value, jar.get("dd_device")?.value));
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    await csrf(request);
    const { slug } = await params, jar = await cookies(), db = await getDatabase();
    const data = z.object({ action: z.enum(["connect", "reserve", "cancelReservation", "order"]), input: z.unknown() }).strict().parse(await body(request));
    const device = jar.get("dd_device")?.value ?? randomBytes(32).toString("base64url");
    const token = jar.get("dd_store")?.value;
    if (data.action === "connect") {
      await service.platformPublicAccess(db,{slug},'pos');
      const result = await service.connectStorefront(db, slug, device, request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local", token);
      const reply = response({ ok: true });
      for (const [name, value] of [["dd_store", result.token], ["dd_device", device]]) reply.cookies.set(name, value, {
        httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
        path: name === "dd_store" ? "/api/store/" + slug : "/", maxAge: name === "dd_store" ? 7200 : 365 * 86400,
      });
      return reply;
    }
    const key = z.uuid().parse(request.headers.get("idempotency-key"));
    const operation = data.action === "reserve" ? service.reserveStorefrontTable : data.action === "cancelReservation" ? service.cancelStorefrontReservation : service.submitStorefrontOrder;
    return response(await operation(db, slug, token, device, key, data.input));
  } catch (error) { return failure(error); }
}
