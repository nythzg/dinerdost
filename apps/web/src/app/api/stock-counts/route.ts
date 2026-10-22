import { NextRequest } from "next/server";
import { stockCountReport } from "@dinerdost/services";
import { context, response, failure } from "@/lib/server";
export async function GET(request: NextRequest) {
  try {
    const { db, actor } = await context();
    return response(
      await stockCountReport(
        db,
        actor,
        Object.fromEntries(request.nextUrl.searchParams),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
