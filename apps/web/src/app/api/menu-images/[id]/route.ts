import { getDatabase } from "@dinerdost/database";
import { readMenuAsset } from "@dinerdost/services";
import { failure } from "@/lib/server";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const file = await readMenuAsset(await getDatabase(), (await params).id);
    return new Response(new Uint8Array(file.content), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public,max-age=86400",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
