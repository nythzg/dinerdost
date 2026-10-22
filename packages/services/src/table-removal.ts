import { z } from "zod";
import type { Database, Sql } from "@dinerdost/database";
import {
  ensure,
  requireOutlet,
  requirePermission,
  type Actor,
} from "@dinerdost/core";
import { audit, command, expectedVersion, one } from "./shared";

export async function removeTableInTransaction(
  tx: Sql,
  actor: Actor,
  tableId: string,
  version: number,
) {
  requirePermission(actor, "settings");
  const table = await one(
    tx,
    "SELECT * FROM dining_tables WHERE id=$1 AND retired_at IS NULL FOR UPDATE",
    [tableId],
  );
  requireOutlet(actor, table.outlet_id);
  expectedVersion(table.version, version);
  ensure(
    !(
      await tx.query(
        "SELECT id FROM table_sessions WHERE table_id=$1 AND status<>'CLOSED' LIMIT 1",
        [tableId],
      )
    ).rows.length,
    "TABLE_IN_USE",
    "Close active table sessions before deleting this table.",
    409,
  );
  ensure(
    !(
      await tx.query(
        "SELECT id FROM table_reservations WHERE table_id=$1 AND state IN ('HELD','SEATED') AND ends_at>now() LIMIT 1",
        [tableId],
      )
    ).rows.length,
    "TABLE_RESERVED",
    "Cancel or move this table’s reservation before deleting it.",
    409,
  );
  await tx.query(
    "UPDATE dining_tables SET retired_at=now(),version=version+1 WHERE id=$1",
    [tableId],
  );
  await tx.query(
    "UPDATE public_grants SET revoked_at=now() WHERE table_id=$1 AND revoked_at IS NULL",
    [tableId],
  );
  await tx.query(
    "UPDATE service_requests SET state='REJECTED',rejection_reason='Table removed by owner' WHERE table_id=$1 AND session_id IS NULL AND state IN ('OPEN','ACCEPTED','ESCALATED')",
    [tableId],
  );
  await tx.query(
    "UPDATE floor_plans SET objects=coalesce((SELECT jsonb_agg(object) FROM jsonb_array_elements(objects) object WHERE object->>'tableId' IS DISTINCT FROM $2),'[]'::jsonb),version=version+1,updated_at=now() WHERE outlet_id=$1 AND EXISTS(SELECT 1 FROM jsonb_array_elements(objects) object WHERE object->>'tableId'=$2)",
    [table.outlet_id, tableId],
  );
  await audit(tx, actor, {
    action: "TABLE_REMOVED",
    entityType: "TABLE",
    entityId: tableId,
    outletId: table.outlet_id,
    oldState: { label: table.label, floor: table.floor, seats: table.seats },
    newState: { retired: true },
    reason: "Owner removed table; historical sessions and bills retained",
  });
}

export async function removeTable(
  db: Database,
  actor: Actor,
  key: string,
  input: unknown,
) {
  requirePermission(actor, "settings");
  const data = z
    .object({ tableId: z.uuid(), version: z.number().int().positive() })
    .strict()
    .parse(input);
  return command(db, actor, key, "TABLE_REMOVED", data, async (tx) => {
    const table = await one(
      tx,
      "SELECT outlet_id FROM dining_tables WHERE id=$1",
      [data.tableId],
    );
    requireOutlet(actor, table.outlet_id);
    await one(tx, "SELECT id FROM outlets WHERE id=$1 FOR UPDATE", [
      table.outlet_id,
    ]);
    await removeTableInTransaction(tx, actor, data.tableId, data.version);
    return { ok: true };
  });
}
