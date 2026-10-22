import { readPrivateAsset } from "@dinerdost/services";
import { context, failure } from "@/lib/server";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { db, actor } = await context(),
      file = await readPrivateAsset(db, actor, (await params).id);
    return new Response(new Uint8Array(file.content), {
      headers: {
        "Content-Type": file.mime,
        "Cache-Control": "private,no-store",
        "Content-Disposition":
          file.mime === "application/pdf"
            ? 'attachment; filename="staff-document.pdf"'
            : "inline",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
