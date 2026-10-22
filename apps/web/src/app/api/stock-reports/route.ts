import { NextRequest } from "next/server";
import { wasteReport, stockUsageReport } from "@dinerdost/services";
import { context, response, failure } from "@/lib/server";
export async function GET(request: NextRequest) {
  try {
    const { db, actor } = await context();
    const params = new URLSearchParams(request.nextUrl.searchParams);
    const usage = params.get("view") === "usage";
    params.delete("view");
    return response(
      await (usage ? stockUsageReport : wasteReport)(
        db,
        actor,
        Object.fromEntries(params),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
