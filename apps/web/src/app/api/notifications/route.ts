import { NextRequest } from "next/server";
import { notificationInbox, readNotifications } from "@dinerdost/services";
import { body, context, csrf, failure, response } from "@/lib/server";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const { db, actor } = await context();
    const query = request.nextUrl.searchParams;
    return response(
      await notificationInbox(db, actor, {
        outletId: query.get("outlet"),
        ...(query.has("before") ? { before: Number(query.get("before")) } : {}),
      }),
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    await csrf(request);
    const { db, actor } = await context();
    return response(await readNotifications(db, actor, await body(request)));
  } catch (error) {
    return failure(error);
  }
}
