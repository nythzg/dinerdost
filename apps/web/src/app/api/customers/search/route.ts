import { NextRequest } from "next/server";
import { searchCustomers } from "@dinerdost/services";
import { context, failure, response } from "@/lib/server";
export async function GET(request: NextRequest) {
  try { const { db, actor } = await context(); return response(await searchCustomers(db, actor, { outletId: request.nextUrl.searchParams.get("outlet"), query: request.nextUrl.searchParams.get("q") })); }
  catch (error) { return failure(error); }
}
