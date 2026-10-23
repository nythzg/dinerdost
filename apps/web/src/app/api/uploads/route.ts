import { NextRequest } from "next/server";
import sharp from "sharp";
import { ensure, requirePermission, requireOutlet } from "@dinerdost/core";
import { storeAsset } from "@dinerdost/services";
import { context, csrf, failure, response } from "@/lib/server";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    await csrf(request);
    const { db, actor } = await context();
    const purpose = request.nextUrl.searchParams.get("purpose") ?? "MENU";
    ensure(
      ["MENU", "STAFF_PHOTO", "STAFF_DOCUMENT", "RECEIPT_LOGO"].includes(purpose),
      "INVALID_FILE",
      "Choose a supported upload type.",
    );
    requirePermission(actor, ["MENU", "RECEIPT_LOGO"].includes(purpose) ? "settings" : "team");
    requireOutlet(actor, request.nextUrl.searchParams.get("outlet") ?? "");
    ensure(
      Number(request.headers.get("content-length") ?? 0) <= 3600000,
      "FILE_TOO_LARGE",
      "Use a file under 3.5 MB.",
      413,
    );
    const reader = request.body?.getReader();
    ensure(reader, "INVALID_FILE", "Choose a file.");
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 3500000) {
        await reader.cancel();
        ensure(false, "FILE_TOO_LARGE", "Use a file under 3.5 MB.", 413);
      }
      chunks.push(part.value);
    }
    const raw = Buffer.concat(chunks);
    let content: Buffer, mime: string;
    if (
      purpose === "STAFF_DOCUMENT" &&
      raw.subarray(0, 5).toString() === "%PDF-"
    ) {
      ensure(
        raw.length <= 2000000,
        "FILE_TOO_LARGE",
        "Use a PDF under 2 MB.",
        413,
      );
      content = raw;
      mime = "application/pdf";
    } else {
      ensure(
        raw.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ||
          raw
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
          (raw.subarray(0, 4).toString() === "RIFF" &&
            raw.subarray(8, 12).toString() === "WEBP"),
        "INVALID_FILE",
        "Use a JPG, PNG or WebP photo.",
      );
      try {
        content = await sharp(raw, {
          limitInputPixels: 20000000,
          animated: false,
        })
          .rotate()
          .resize(
            purpose === "STAFF_DOCUMENT" ? 1600 : 800,
            purpose === "STAFF_DOCUMENT" ? 1600 : 800,
            { fit: "inside", withoutEnlargement: true },
          )
          .webp({ quality: 80 })
          .toBuffer();
      } catch {
        ensure(false, "INVALID_FILE", "This picture could not be read.");
      }
      mime = "image/webp";
    }
    return response(
      await storeAsset(
        db,
        actor,
        request.nextUrl.searchParams.get("outlet") ?? "",
        purpose,
        content!,
        mime!,
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
