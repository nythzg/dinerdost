import { NextRequest } from "next/server";
import { listRecords } from "@dinerdost/services";
import { z } from "zod";
import { context, failure, response } from "@/lib/server";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ kind: string }> },
) {
  try {
    const { db, actor } = await context();
    return response(
      await listRecords(
        db,
        actor,
        (await params).kind,
        z.uuid().parse(request.nextUrl.searchParams.get("outlet")),
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
