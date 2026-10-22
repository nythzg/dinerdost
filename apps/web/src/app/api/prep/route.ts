import { NextRequest } from "next/server";
import { prepPlan } from "@dinerdost/services";
import { context, failure, response } from "@/lib/server";
export async function GET(request: NextRequest) {
  try {
    const { db, actor } = await context(), query = request.nextUrl.searchParams;
    return response(await prepPlan(db, actor, { outletId: query.get("outlet"), date: query.get("date") || undefined }));
  } catch (error) { return failure(error); }
}
