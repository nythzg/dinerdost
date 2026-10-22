import { NextRequest } from "next/server";
import { dishReport } from "@dinerdost/services";
import { context, response, failure } from "@/lib/server";
export async function GET(request: NextRequest) {
  try {
    const { db, actor } = await context();
    const q = request.nextUrl.searchParams;
    return response(
      await dishReport(db, actor, {
        ...Object.fromEntries(q),
        outletId: q.get("outletId") || undefined,
      }),
    );
  } catch (error) {
    return failure(error);
  }
}
