import { NextRequest } from "next/server";
import { listCustomers } from "@dinerdost/services";
import { context, failure, response } from "@/lib/server";
export async function GET(request: NextRequest) {
  try {
    const { db, actor } = await context();
    return response(await listCustomers(db, actor, {outletId:request.nextUrl.searchParams.get("outlet"),query:request.nextUrl.searchParams.get("q") ?? "",page:request.nextUrl.searchParams.get("page") ?? 0}));
  } catch (error) {return failure(error)}
}
