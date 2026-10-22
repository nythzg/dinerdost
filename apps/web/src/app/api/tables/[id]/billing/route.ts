import { getTableBills } from "@dinerdost/services";
import { context, failure, response } from "@/lib/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db, actor } = await context();
    return response(
      await getTableBills(
        db,
        actor,
        (await params).id,
        new URL(request.url).searchParams.get("merged") === "1",
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
