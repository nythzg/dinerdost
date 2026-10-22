import { z } from "zod";
import { randomBytes } from "node:crypto";
import type { Database } from "@dinerdost/database";
import {
  ensure,
  isManager,
  requireOutlet,
  requirePermission,
  type Actor,
  floorPlanKinds,
  floorObjectAllowed,
  floorAllowsOutside,
  floorObjectsOverlap,
  floorCoordinateLimit,
  validFloorOutline,
  objectInArea,
  diningTableGroups,
} from "@dinerdost/core";
import {
  audit,
  command,
  expectedVersion,
  id,
  json,
  one,
  type Row,
} from "./shared";
import { removeTableInTransaction } from "./table-removal";
import { expireIdleTables } from "./table-activity";

const planObject = z
  .object({
    id: z.string().min(1).max(80),
    kind: z.enum(floorPlanKinds),
    label: z.string().trim().min(1).max(60),
    tableId: z.uuid().optional(),
    copyOfTableId: z.uuid().optional(),
    newTable: z.object({seats:z.number().int().min(1).max(100)}).strict().optional(),
    allowOutside: z.boolean().optional(),
    x: z.number().min(-floorCoordinateLimit).max(floorCoordinateLimit),
    y: z.number().min(-floorCoordinateLimit).max(floorCoordinateLimit),
    width: z.number().min(10).max(2000),
    height: z.number().min(10).max(2000),
    rotation: z.number().int().min(0).max(345).multipleOf(15).optional(),
  })
  .strict()
  .refine(
    (object) =>
      ["WALL","FENCE"].includes(object.kind) || (object.width >= 60 && object.height >= 50),
    "Rooms and tables need at least 60 × 50 units.",
  )
  .refine(
    (object) =>
      object.kind === "TABLE"
        ? Number(!!object.tableId) + Number(!!object.copyOfTableId) + Number(!!object.newTable) === 1
        : !object.tableId && !object.copyOfTableId && !object.newTable,
    "Only tables can reference a dining table.",
  ).refine(object=>object.allowOutside===undefined||object.kind==='TABLE',"Only tables have an outside-floor option.");

export async function saveFloorPlan(
  db: Database,
  actor: Actor,
  key: string,
  input: unknown,
) {
  requirePermission(actor, "sessions");
  ensure(
    isManager(actor),
    "FORBIDDEN",
    "Only the owner or manager can arrange the floor plan.",
    403,
  );
  const data = z
    .object({
      outletId: z.uuid(),
      floor: z.string().trim().min(1).max(80),
      version: z.number().int().min(0),
      width: z.number().int().min(400).max(5000).optional(),
      height: z.number().int().min(300).max(5000).optional(),
      outline: z
        .array(
          z
            .object({
              x: z.number().int().min(0).max(5000),
              y: z.number().int().min(0).max(5000),
            })
            .strict(),
        )
        .min(3)
        .max(24)
        .nullable()
        .optional(),
      objects: z.array(planObject).max(250),
      boundaryStyle: z.enum(["STROKE", "WALLS"]).optional(),
      boundaryRoundness: z.number().int().min(0).max(500).optional(),
      deletedTables: z
        .array(
          z
            .object({ tableId: z.uuid(), version: z.number().int().positive() })
            .strict(),
        )
        .max(250)
        .default([]),
    })
    .strict()
    .parse(input);
  requireOutlet(actor, data.outletId);
  ensure(
    new Set(data.objects.map((object) => object.id)).size ===
      data.objects.length,
    "DUPLICATE_OBJECT",
    "Each floor-plan object must be unique.",
  );
  const tableIds = data.objects.flatMap((object) =>
    object.tableId ? [object.tableId] : [],
  );
  if (data.objects.some((object) => object.copyOfTableId || object.newTable))
    requirePermission(actor, "settings");
  ensure(
    new Set(tableIds).size === tableIds.length,
    "DUPLICATE_TABLE",
    "Place each table once.",
  );
  return command(db, actor, key, "FLOOR_PLAN_SAVED", data, async (tx) => {
    await one(tx, "SELECT id FROM outlets WHERE id=$1 FOR UPDATE", [
      data.outletId,
    ]);
    const sourceIds = [
      ...new Set([
        ...tableIds,
        ...data.objects.flatMap((object) =>
          object.copyOfTableId ? [object.copyOfTableId] : [],
        ),
      ]),
    ];
    const tables = (
      await tx.query(
        "SELECT * FROM dining_tables WHERE outlet_id=$1 AND floor=$2 AND retired_at IS NULL AND id=ANY($3::uuid[])",
        [data.outletId, data.floor, sourceIds],
      )
    ).rows;
    ensure(
      tables.length === sourceIds.length,
      "INVALID_TABLE",
      "Use tables belonging to this outlet and floor.",
    );
    const before = (
      await tx.query<Row>(
        "SELECT * FROM floor_plans WHERE outlet_id=$1 AND floor=$2 FOR UPDATE",
        [data.outletId, data.floor],
      )
    ).rows[0];
    expectedVersion(before?.version ?? 0, data.version);
    const objects = data.objects.map((object) => ({
      ...object,
      ...(object.kind==='TABLE'&&object.allowOutside===undefined&&before?.objects.find((old:Row)=>old.id===object.id)?.allowOutside===true?{allowOutside:true}:{}),
      rotation:
        object.rotation ??
        before?.objects.find((old: Row) => old.id === object.id)?.rotation ??
        0,
    }));
    const boundaryRoundness=data.boundaryRoundness??before?.boundary_roundness??0;
    const boundaryStyle =
      data.boundaryStyle ?? before?.boundary_style ?? "STROKE";
    ensure(
      new Set(data.deletedTables.map((t) => t.tableId)).size ===
        data.deletedTables.length,
      "DUPLICATE_TABLE",
      "Delete each table once.",
    );
    for (const removed of data.deletedTables) {
      const table = await one(
        tx,
        "SELECT outlet_id,floor FROM dining_tables WHERE id=$1",
        [removed.tableId],
      );
      ensure(
        table.outlet_id === data.outletId &&
          table.floor === data.floor &&
          !sourceIds.includes(removed.tableId),
        "INVALID_TABLE",
        "Delete only a table from this floor, after removing its placements and copies.",
      );
      await removeTableInTransaction(
        tx,
        actor,
        removed.tableId,
        removed.version,
      );
    }
    // Older clients omit dimensions; keep the saved area instead of resetting it.
    const width = data.width ?? before?.width ?? 1200;
    const height = data.height ?? before?.height ?? 800;
    const outline =
      data.outline === undefined ? (before?.outline ?? null) : data.outline;
    ensure(
      !outline || validFloorOutline(outline, { width, height }),
      "INVALID_FLOOR_OUTLINE",
      "Use a closed outline without crossing edges, inside the floor area (minimum 30,000 square units).",
    );
    ensure(
      objects.every((object) => floorAllowsOutside(object)||objectInArea(object, { width, height })),
      "OUTSIDE_FLOOR_PLAN",
      "Keep fixtures inside the floor plan, or enable Allow outside floor for an outdoor table.",
    );
    ensure(
      objects.every((object) => floorObjectAllowed(object,{width,height},outline,boundaryRoundness)),
      "OUTSIDE_FLOOR_OUTLINE",
      "Move highlighted objects inside the floor outline before saving.",
    );
    ensure(!objects.some((object,i)=>objects.slice(i+1).some(other=>floorObjectsOverlap(object,other))),"OVERLAPPING_FIXTURES","Separate overlapping fixtures and tables before saving.");
    const usedLabels = (
      await tx.query(
        "SELECT label FROM dining_tables WHERE outlet_id=$1 AND retired_at IS NULL",
        [data.outletId],
      )
    ).rows.map((row) => row.label);
    for (const object of objects) {
      if (!object.copyOfTableId && !object.newTable) continue;
      const source = object.copyOfTableId ? tables.find((table) => table.id === object.copyOfTableId)! : undefined;
      const seats=source?.seats ?? object.newTable!.seats;
      ensure(
        object.label.length <= 30 && !usedLabels.some(label=>String(label).toLowerCase()===object.label.toLowerCase()),
        "TABLE_LABEL_TAKEN",
        "Choose a unique table label of at most 30 characters.",
        409,
      );
      const tableId = id();
      await tx.query(
        "INSERT INTO dining_tables(id,restro_id,outlet_id,label,seats,floor,public_key) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          tableId,
          actor.restroId,
          data.outletId,
          object.label,
          seats,
          data.floor,
          randomBytes(20).toString("hex"),
        ],
      );
      await audit(tx, actor, {
        action: "TABLE_CREATED",
        entityType: "TABLE",
        entityId: tableId,
        outletId: data.outletId,
        newState: {
          label: object.label,
          seats,
          floor: data.floor,
          ...(source ? {copiedFrom:source.id} : {createdFrom:'FLOOR_PLAN'}),
        },
      });
      usedLabels.push(object.label);
      delete object.copyOfTableId;
      delete object.newTable;
      object.tableId = tableId;
    }
    const planId = before?.id ?? id();
    await tx.query(
      "INSERT INTO floor_plans(id,restro_id,outlet_id,floor,objects,width,height,outline,boundary_style,boundary_roundness) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8::jsonb,$9,$10) ON CONFLICT(outlet_id,floor) DO UPDATE SET objects=EXCLUDED.objects,width=EXCLUDED.width,height=EXCLUDED.height,outline=EXCLUDED.outline,boundary_style=EXCLUDED.boundary_style,boundary_roundness=EXCLUDED.boundary_roundness,version=floor_plans.version+1,updated_at=now()",
      [
        planId,
        actor.restroId,
        data.outletId,
        data.floor,
        json(objects),
        width,
        height,
        outline ? json(outline) : null,
        boundaryStyle,
        boundaryRoundness,
      ],
    );
    await audit(tx, actor, {
      action: "FLOOR_PLAN_SAVED",
      entityType: "FLOOR_PLAN",
      entityId: planId,
      outletId: data.outletId,
      oldState: {
        objects: before?.objects ?? [],
        width: before?.width ?? 1200,
        height: before?.height ?? 800,
        outline: before?.outline,
        boundaryRoundness:before?.boundary_roundness??0,
      },
      newState: {
        objects,
        width,
        height,
        outline,
        boundaryStyle,
        boundaryRoundness,
        removedTables: data.deletedTables.map((t) => t.tableId),
      },
    });
    return { id: planId };
  });
}

export async function saveFloor(
  db: Database,
  actor: Actor,
  key: string,
  input: unknown,
) {
  requirePermission(actor, "sessions");
  ensure(
    isManager(actor),
    "FORBIDDEN",
    "Only the owner or manager can manage floors.",
    403,
  );
  const data = z
    .object({
      outletId: z.uuid(),
      name: z
        .string()
        .trim()
        .min(1)
        .max(80)
        .refine(
          (name) => name.toLowerCase() !== "all floors",
          "Choose a different floor name.",
        ),
      previousName: z.string().trim().min(1).max(80).optional(),
      version: z.number().int().min(0).default(0),
    })
    .strict()
    .parse(input);
  requireOutlet(actor, data.outletId);
  return command(db, actor, key, "FLOOR_SAVED", data, async (tx) => {
    await one(tx, "SELECT id FROM outlets WHERE id=$1 FOR UPDATE", [
      data.outletId,
    ]);
    const before = data.previousName
      ? (
          await tx.query<Row>(
            "SELECT * FROM floor_plans WHERE outlet_id=$1 AND floor=$2 FOR UPDATE",
            [data.outletId, data.previousName],
          )
        ).rows[0]
      : undefined;
    const oldTables = data.previousName
      ? (
          await tx.query(
            "SELECT id FROM dining_tables WHERE outlet_id=$1 AND floor=$2 ORDER BY id FOR UPDATE",
            [data.outletId, data.previousName],
          )
        ).rows
      : [];
    ensure(
      !data.previousName || before || oldTables.length,
      "NOT_FOUND",
      "This floor no longer exists.",
      404,
    );
    expectedVersion(before?.version ?? 0, data.version);
    const conflicts = (
      await tx.query(
        "SELECT floor FROM floor_plans WHERE outlet_id=$1 AND lower(floor)=lower($2) UNION SELECT floor FROM dining_tables WHERE outlet_id=$1 AND lower(floor)=lower($2)",
        [data.outletId, data.name],
      )
    ).rows;
    ensure(
      !conflicts.some((row) => row.floor !== data.previousName),
      "FLOOR_NAME_TAKEN",
      "A floor with this name already exists.",
      409,
    );
    const planId = before?.id ?? id();
    if (before)
      await tx.query(
        "UPDATE floor_plans SET floor=$2,version=version+1,updated_at=now() WHERE id=$1",
        [planId, data.name],
      );
    else
      await tx.query(
        "INSERT INTO floor_plans(id,restro_id,outlet_id,floor,objects) VALUES($1,$2,$3,$4,'[]'::jsonb)",
        [planId, actor.restroId, data.outletId, data.name],
      );
    if (data.previousName)
      await tx.query(
        "UPDATE dining_tables SET floor=$3,version=version+1 WHERE outlet_id=$1 AND floor=$2",
        [data.outletId, data.previousName, data.name],
      );
    await audit(tx, actor, {
      action: "FLOOR_SAVED",
      entityType: "FLOOR_PLAN",
      entityId: planId,
      outletId: data.outletId,
      oldState: { floor: data.previousName },
      newState: { floor: data.name, tableIds: oldTables.map((t) => t.id) },
    });
    return { id: planId, floor: data.name };
  });
}

export async function getTableBills(
  db: Database,
  actor: Actor,
  tableId: string,
  includeMerged = false,
) {
  requirePermission(actor, "bill");
  z.uuid().parse(tableId);
  return db.transaction(actor.restroId, async (tx) => {
    const table = await one(
      tx,
      "SELECT id,label,outlet_id FROM dining_tables WHERE id=$1",
      [tableId],
    );
    requireOutlet(actor, table.outlet_id);
    await expireIdleTables(
      tx,
      actor.restroId,
      table.outlet_id,
      includeMerged ? undefined : table.id,
    );
    const authorized = (
      await tx.query<
        Row & { id: string; table_id: string; parent_id: string | null }
      >(
        "SELECT s.id,s.label,s.guests,s.owner_employee_id,s.table_id,s.parent_id,t.label AS table_label FROM table_sessions s JOIN dining_tables t ON t.id=s.table_id AND t.restro_id=s.restro_id WHERE s.outlet_id=$1 AND s.status<>'CLOSED' AND ($2 OR s.owner_employee_id=$3) ORDER BY s.opened_at",
        [table.outlet_id, actor.role !== "WAITER", actor.employeeId],
      )
    ).rows;
    const tables = includeMerged
      ? (
          await tx.query<Row & { id: string; label: string }>(
            "SELECT id,label FROM dining_tables WHERE outlet_id=$1 AND retired_at IS NULL ORDER BY label",
            [table.outlet_id],
          )
        ).rows
      : [table as Row & { id: string; label: string }];
    const group = diningTableGroups(tables, authorized).find((g) =>
      g.members.some((t) => t.id === tableId),
    );
    const members = group?.members ?? [table];
    const sessions = authorized.filter((s) =>
      members.some((t) => t.id === s.table_id),
    );
    const orders = (
      await tx.query(
        "SELECT o.id,o.number,o.status,o.session_id FROM orders o WHERE o.session_id=ANY($1::uuid[]) ORDER BY CASE WHEN o.status NOT IN ('SETTLED','VOIDED','REJECTED') THEN 0 ELSE 1 END,o.created_at DESC",
        [sessions.map((session) => session.id)],
      )
    ).rows;
    return {
      table,
      sessions,
      orders,
      members,
      groupLabel: group?.label ?? table.label,
    };
  });
}
