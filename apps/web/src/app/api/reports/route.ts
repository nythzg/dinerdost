import { NextRequest } from "next/server";
import { financialReport } from "@dinerdost/services";
import { context, failure, response } from "@/lib/server";
export async function GET(request: NextRequest) {
  try {
    const { db, actor } = await context(), query = request.nextUrl.searchParams;
    return response(await financialReport(db, actor, { outletId: query.get("outlet") || undefined, from: query.get("from"), to: query.get("to") }));
  } catch (error) { return failure(error); }
}
