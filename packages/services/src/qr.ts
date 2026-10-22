import { z } from "zod";
import type { Database } from "@dinerdost/database";
import { ensure, isManager, requireOutlet, type Actor } from "@dinerdost/core";
import { audit, command, expectedVersion, one } from "./shared";

export async function setQrPolicy(
  db: Database,
  actor: Actor,
  key: string,
  input: unknown,
) {
  ensure(
    isManager(actor),
    "FORBIDDEN",
    "Only an owner or manager can change QR controls.",
    403,
  );
  const data = z
    .object({
      outletId: z.uuid(),
      version: z.number().int(),
      enabled: z.boolean(),
      autoActivate: z.boolean().optional(),
    })
    .strict()
    .parse(input);
  requireOutlet(actor, data.outletId);
  return command(db, actor, key, "CUSTOMER_QR_CHANGED", data, async (tx) => {
    const before = await one(
      tx,
      "SELECT qr_enabled,qr_auto_activate,version FROM outlets WHERE id=$1 FOR UPDATE",
      [data.outletId],
    );
    expectedVersion(before.version, data.version);
    await tx.query(
      "UPDATE outlets SET qr_enabled=$2,qr_auto_activate=$3,version=version+1 WHERE id=$1",
      [
        data.outletId,
        data.enabled,
        data.autoActivate ?? before.qr_auto_activate,
      ],
    );
    if (!data.enabled)
      await tx.query(
        "UPDATE public_grants SET revoked_at=now() WHERE outlet_id=$1 AND revoked_at IS NULL",
        [data.outletId],
      );
    await audit(tx, actor, {
      action: "CUSTOMER_QR_CHANGED",
      entityType: "OUTLET",
      entityId: data.outletId,
      outletId: data.outletId,
      oldState: before,
      newState: {
        enabled: data.enabled,
        autoActivate: data.autoActivate ?? before.qr_auto_activate,
      },
    });
    return { ok: true };
  });
}
