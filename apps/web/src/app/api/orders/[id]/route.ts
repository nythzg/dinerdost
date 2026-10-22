import { getOrder } from "@dinerdost/services";
import { z } from "zod";
import { context, failure, response } from "@/lib/server";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db, actor } = await context();
    return response(
      await getOrder(db, actor, z.uuid().parse((await params).id)),
    );
  } catch (error) {
    return failure(error);
  }
}
