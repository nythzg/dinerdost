import { z } from "zod";
import type { Database } from "@dinerdost/database";
import { requireOutlet, requirePermission, type Actor } from "@dinerdost/core";
import { audit, command, expectedVersion, json, one } from "./shared";

export const receiptSettingsSchema = z
  .object({
    logoId: z.uuid().nullable().default(null),
    phone: z
      .string()
      .trim()
      .max(30)
      .regex(/^[+\d ()-]*$/)
      .default(""),
    fssai: z.string().trim().max(32).default(""),
    email: z.union([z.literal(""), z.email()]).default(""),
    footer: z.string().trim().max(400).default("Thank You, Visit Again!!!"),
    deliveryText: z.string().trim().max(160).default(""),
  })
  .strict();

export async function saveReceiptSettings(
  db: Database,
  actor: Actor,
  key: string,
  input: unknown,
) {
  requirePermission(actor, "settings");
  const data = z
    .object({
      outletId: z.uuid(),
      version: z.number().int(),
      settings: receiptSettingsSchema,
    })
    .strict()
    .parse(input);
  requireOutlet(actor, data.outletId);
  return command(db, actor, key, "RECEIPT_SETTINGS_SAVED", data, async (tx) => {
    const before = await one(
      tx,
      "SELECT version,receipt_settings FROM outlets WHERE id=$1 FOR UPDATE",
      [data.outletId],
    );
    expectedVersion(before.version, data.version);
    if (data.settings.logoId)
      await one(
        tx,
        "SELECT id FROM uploaded_assets WHERE id=$1 AND outlet_id=$2 AND purpose='RECEIPT_LOGO'",
        [data.settings.logoId, data.outletId],
        "Choose a bill logo uploaded to this outlet.",
      );
    await tx.query(
      "UPDATE outlets SET receipt_settings=$2::jsonb,version=version+1 WHERE id=$1",
      [data.outletId, json(data.settings)],
    );
    await audit(tx, actor, {
      action: "RECEIPT_SETTINGS_SAVED",
      entityType: "OUTLET",
      entityId: data.outletId,
      outletId: data.outletId,
      oldState: before.receipt_settings,
      newState: data.settings,
    });
    return { ok: true };
  });
}
