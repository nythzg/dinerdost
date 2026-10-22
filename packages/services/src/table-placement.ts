import type { Sql } from "@dinerdost/database";
import { ensure, placeFloorTable, type Actor } from "@dinerdost/core";
import { audit, type Row } from "./shared";

export async function placeTableOnFloor(
  tx: Sql,
  actor: Actor,
  table: { id: string; outletId: string; floor: string; label: string },
) {
  const plan = (
    await tx.query<Row>(
      "SELECT * FROM floor_plans WHERE outlet_id=$1 AND floor=$2 FOR UPDATE",
      [table.outletId, table.floor],
    )
  ).rows[0];
  if (!plan) return;
  const objects = plan.objects;
  if (objects.some((o: Row) => o.tableId === table.id)) return;
  ensure(
    objects.length < 250,
    "FLOOR_FULL",
    "This floor has 250 objects. Arrange it or choose another floor.",
    409,
  );
  const placed = placeFloorTable(
    {
      id: "table-" + table.id,
      kind: "TABLE",
      tableId: table.id,
      label: table.label,
      x: 0,
      y: 0,
      width: 120,
      height: 90,
    },
    { width: Number(plan.width), height: Number(plan.height) },
    plan.outline,
    objects,
    Number(plan.boundary_roundness??0),
  );
  ensure(
    placed,
    "FLOOR_FULL",
    "Make room in Explore or choose another floor before adding this table.",
    409,
  );
  await tx.query(
    "UPDATE floor_plans SET objects=$2::jsonb,version=version+1,updated_at=now() WHERE id=$1",
    [plan.id, JSON.stringify([...objects, placed])],
  );
  await audit(tx, actor, {
    action: "FLOOR_TABLE_PLACED",
    entityType: "FLOOR_PLAN",
    entityId: plan.id,
    outletId: table.outletId,
    newState: { tableId: table.id, floor: table.floor, object: placed },
  });
}
