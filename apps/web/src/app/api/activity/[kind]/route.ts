import { NextRequest } from "next/server";
import { listActivity } from "@dinerdost/services";
import { context, failure, response } from "@/lib/server";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ kind: string }> },
) {
  try {
    const { db, actor } = await context();
    return response(
      await listActivity(db, actor, {
        ...Object.fromEntries(request.nextUrl.searchParams),
        kind: (await params).kind,
      }),
    );
  } catch (error) {
    return failure(error);
  }
}
