import { z } from "zod";
import type { Database, Sql } from "@dinerdost/database";
import {
  can,
  ensure,
  requireOutlet,
  requirePermission,
  type Actor,
} from "@dinerdost/core";
import { audit, id, one, rateLimit, type Row } from "./shared";
export const staffDetailsSchema = z
  .object({
    phone: z
      .string()
      .trim()
      .regex(/^$|^(?:\+91)?[6-9]\d{9}$/),
    address: z.string().trim().max(500),
    pincode: z.string().regex(/^$|^[1-9]\d{5}$/),
    photoId: z.uuid().nullable(),
    documentId: z.uuid().nullable(),
    documentType: z.enum(["", "AADHAAR", "PAN", "VOTER_ID", "DRIVING_LICENCE"]),
  })
  .strict();
export async function writeStaffDetails(
  tx: Sql,
  actor: Actor,
  employeeId: string,
  input: unknown,
) {
  requirePermission(actor, "team");
  const data = staffDetailsSchema.parse(input);
  ensure(
    !!data.documentId === !!data.documentType,
    "DOCUMENT_TYPE",
    "Choose the document type with its file.",
  );
  for (const [asset, purpose] of [
    [data.photoId, "STAFF_PHOTO"],
    [data.documentId, "STAFF_DOCUMENT"],
  ])
    if (asset)
      await one(
        tx,
        "SELECT id FROM uploaded_assets WHERE id=$1 AND purpose=$2",
        [asset, purpose],
        "Choose a staff file uploaded to this restaurant.",
      );
  await tx.query(
    "INSERT INTO employee_details(employee_id,restro_id,phone,address,pincode,photo_id,document_id,document_type) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(employee_id) DO UPDATE SET phone=$3,address=$4,pincode=$5,photo_id=$6,document_id=$7,document_type=$8",
    [
      employeeId,
      actor.restroId,
      data.phone,
      data.address,
      data.pincode,
      data.photoId,
      data.documentId,
      data.documentType,
    ],
  );
}
export async function readStaffDetails(
  db: Database,
  actor: Actor,
  employeeId: string,
) {
  requirePermission(actor, "team");
  z.uuid().parse(employeeId);
  return db.transaction(actor.restroId, async (tx) => {
    const member = await one(
      tx,
      "SELECT id,name,version,base_salary FROM employees WHERE id=$1",
      [employeeId],
    );
    const details = (
      await tx.query(
        "SELECT phone,address,pincode,photo_id,document_id,document_type FROM employee_details WHERE employee_id=$1",
        [employeeId],
      )
    ).rows[0];
    return { ...member, ...details };
  });
}
export async function storeAsset(
  db: Database,
  actor: Actor,
  outletId: string,
  purpose: string,
  content: Buffer,
  mime: string,
) {
  z.uuid().parse(outletId);
  z.enum(["MENU", "STAFF_PHOTO", "STAFF_DOCUMENT", "RECEIPT_LOGO"]).parse(purpose);
  requireOutlet(actor, outletId);
  requirePermission(actor, ["MENU", "RECEIPT_LOGO"].includes(purpose) ? "settings" : "team");
  ensure(
    content.length > 0 &&
      content.length <= (purpose === "STAFF_DOCUMENT" ? 2000000 : 300000),
    "FILE_TOO_LARGE",
    "Choose a smaller file.",
    413,
  );
  ensure(
    mime === "image/webp" ||
      (purpose === "STAFF_DOCUMENT" && mime === "application/pdf"),
    "INVALID_FILE",
    "Use a photo or PDF document.",
  );
  await rateLimit(db, `upload:${actor.restroId}:${actor.employeeId}`, 30, 3600);
  return db.transaction(actor.restroId, async (tx) => {
    await tx.query("SELECT id FROM outlets ORDER BY id FOR UPDATE");
    const usage = await one(
      tx,
      "SELECT coalesce(sum(octet_length(content)),0) AS bytes FROM uploaded_assets",
    );
    ensure(
      Number(usage.bytes) + content.length <= 100000000,
      "STORAGE_LIMIT",
      "Restaurant file storage is full. Contact support.",
      409,
    );
    const assetId = id();
    await tx.query(
      "INSERT INTO uploaded_assets(id,restro_id,outlet_id,purpose,content,mime,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        assetId,
        actor.restroId,
        outletId,
        purpose,
        content,
        mime,
        actor.employeeId,
      ],
    );
    await audit(tx, actor, {
      action: "FILE_UPLOADED",
      entityType: "ASSET",
      entityId: assetId,
      outletId,
      newState: { purpose, mime, size: content.length },
      reason:
        ["MENU", "RECEIPT_LOGO"].includes(purpose)
          ? (purpose === "MENU" ? "Menu picture uploaded" : "Bill logo uploaded")
          : "Private staff file uploaded",
    });
    return {
      id: assetId,
      url:
        (purpose === "MENU" ? "/api/menu-images/" : purpose === "RECEIPT_LOGO" ? "/api/receipt-images/" : "/api/staff-files/") +
        assetId,
    };
  });
}
export async function readPrivateAsset(
  db: Database,
  actor: Actor,
  assetId: string,
) {
  requirePermission(actor, "team");
  z.uuid().parse(assetId);
  return db.transaction(actor.restroId, (tx) =>
    one(
      tx,
      "SELECT content,mime FROM uploaded_assets WHERE id=$1 AND purpose IN ('STAFF_PHOTO','STAFF_DOCUMENT')",
      [assetId],
    ),
  );
}
export async function readMenuAsset(db: Database, assetId: string) {
  z.uuid().parse(assetId);
  return one(
    db,
    "SELECT a.content,a.mime FROM uploaded_assets a WHERE a.id=$1 AND a.purpose='MENU' AND EXISTS(SELECT 1 FROM menu_items m WHERE m.restro_id=a.restro_id AND m.image_url='/api/menu-images/'||a.id::text)",
    [assetId],
  );
}
export async function readReceiptAsset(db: Database, actor: Actor, assetId: string) {
  ensure(can(actor, "bill") || can(actor, "finance"), "FORBIDDEN", "Your role cannot view bill logos.", 403);
  z.uuid().parse(assetId);
  return db.transaction(actor.restroId, async tx => {
    const asset = await one(tx, "SELECT content,mime,outlet_id FROM uploaded_assets WHERE id=$1 AND purpose='RECEIPT_LOGO'", [assetId]);
    requireOutlet(actor, asset.outlet_id);
    return asset;
  });
}
