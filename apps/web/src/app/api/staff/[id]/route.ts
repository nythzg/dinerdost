import { readStaffDetails } from "@dinerdost/services";
import { context, failure, response } from "@/lib/server";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db, actor } = await context();
    return response(await readStaffDetails(db, actor, (await params).id));
  } catch (error) {
    return failure(error);
  }
}
