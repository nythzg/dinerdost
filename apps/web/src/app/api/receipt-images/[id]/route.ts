import { readReceiptAsset } from "@dinerdost/services";
import { context, failure } from "@/lib/server";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db, actor } = await context();
    const asset = await readReceiptAsset(db, actor, (await params).id);
    return new Response(new Uint8Array(asset.content), {
      headers: {
        "Content-Type": asset.mime,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
