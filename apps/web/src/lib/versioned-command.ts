import { NextRequest } from "next/server";
import { z } from "zod";
import { POST as execute } from "@/app/api/commands/route";
import { body, csrf, failure } from "./server";

export async function versionedCommand(request: NextRequest,
  build: (input: Record<string, unknown>) => { action: string; orderId?: string; roundId?: string; id?: string; input: unknown }) {
  try {
    await csrf(request);
    const input = z.record(z.string(), z.unknown()).parse(await body(request));
    const headers = new Headers(request.headers); headers.delete("content-length");
    return execute(new NextRequest(new URL("/api/commands", request.url), { method: "POST", headers, body: JSON.stringify(build(input)) }));
  } catch (error) { return failure(error); }
}
