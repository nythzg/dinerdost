import { NextRequest } from "next/server";
import { pushEvent, registerPushDevice, unregisterPushDevice } from "@dinerdost/services";
import { body, context, csrf, failure, response } from "@/lib/server";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    csrf(request);
    const { db, actor } = await context();
    const { action, ...input } = await body(request);
    const result = action === "register" ? await registerPushDevice(db, actor, input)
      : action === "unregister" ? await unregisterPushDevice(db, actor, input)
      : action === "event" ? await pushEvent(db, actor, input) : null;
    return result ? response(result) : response({ error: { code: "INVALID_ACTION", message: "Choose a background alert operation." } }, 422);
  } catch (error) { return failure(error); }
}
