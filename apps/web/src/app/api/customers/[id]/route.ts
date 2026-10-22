import { NextRequest } from "next/server";
import { customerProfile } from "@dinerdost/services";
import { context, failure, response } from "@/lib/server";
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const { db, actor } = await context(); return response(await customerProfile(db, actor, (await params).id, request.nextUrl.searchParams.get("outlet") ?? "")); }
  catch (error) { return failure(error); }
}
