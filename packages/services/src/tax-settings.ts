import { z } from "zod";
import type { Database } from "@dinerdost/database";
import {
  ensure,
  requireOutlet,
  requirePermission,
  type Actor,
} from "@dinerdost/core";
import { audit, command, expectedVersion, json, one } from "./shared";

export async function saveTaxSettings(
  db: Database,
  actor: Actor,
  key: string,
  input: unknown,
) {
  requirePermission(actor, "settings");
  ensure(
    actor.role === "OWNER",
    "FORBIDDEN",
    "Only the owner can configure taxes.",
    403,
  );
  const data = z
    .object({
      outletId: z.uuid(),
      version: z.number().int().positive(),
      taxes: z
        .array(
          z
            .object({
              name: z.string().trim().min(1).max(40),
              rateBps: z.number().int().min(0).max(10000),
            })
            .strict(),
        )
        .max(10),
    })
    .strict()
    .parse(input);
  requireOutlet(actor, data.outletId);
  ensure(
    new Set(data.taxes.map((tax) => tax.name.toLowerCase())).size ===
      data.taxes.length,
    "DUPLICATE_TAX",
    "Give each tax a different name.",
  );
  const rate = data.taxes.reduce((total, tax) => total + tax.rateBps, 0);
  ensure(rate <= 10000, "TAX_LIMIT", "Combined tax cannot exceed 100%.");
  return command(db, actor, key, "TAX_SETTINGS_SAVED", data, async (tx) => {
    const before = await one(
      tx,
      "SELECT * FROM outlets WHERE id=$1 FOR UPDATE",
      [data.outletId],
    );
    expectedVersion(before.version, data.version);
    await tx.query(
      "UPDATE outlets SET tax_components=$2::jsonb,tax_bps=$3,version=version+1 WHERE id=$1",
      [data.outletId, json(data.taxes), rate],
    );
    await audit(tx, actor, {
      action: "TAX_SETTINGS_SAVED",
      entityType: "OUTLET",
      entityId: data.outletId,
      outletId: data.outletId,
      oldState: { taxes: before.tax_components, rateBps: before.tax_bps },
      newState: { taxes: data.taxes, rateBps: rate },
      reason: "Owner saved taxes for future orders",
    });
    return { id: data.outletId, taxes: data.taxes, rateBps: rate };
  });
}
