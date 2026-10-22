import { z } from "zod";
import type { Database } from "@dinerdost/database";
import {
  ensure,
  requireOutlet,
  requirePermission,
  type Actor,
} from "@dinerdost/core";
import { audit, command, expectedVersion, num, one } from "./shared";
import { placeTableOnFloor } from "./table-placement";

export async function updateTableCapacity(
  db: Database,
  actor: Actor,
  key: string,
  input: unknown,
) {
  requirePermission(actor, "settings");
  const data = z
    .object({
      tableId: z.uuid(),
      version: z.number().int().positive(),
      seats: z.number().int().min(1).max(100),
      floor: z.string().trim().min(1).max(80).optional(),
    })
    .strict()
    .parse(input);
  return command(db, actor, key, "TABLE_CAPACITY_UPDATED", data, async (tx) => {
    const context = await one(
      tx,
      "SELECT outlet_id FROM dining_tables WHERE id=$1",
      [data.tableId],
    );
    requireOutlet(actor, context.outlet_id);
    await one(tx, "SELECT id FROM outlets WHERE id=$1 FOR UPDATE", [
      context.outlet_id,
    ]);
    const table = await one(
      tx,
      "SELECT * FROM dining_tables WHERE id=$1 AND retired_at IS NULL FOR UPDATE",
      [data.tableId],
    );
    requireOutlet(actor, table.outlet_id);
    expectedVersion(table.version, data.version);
    const floor = data.floor ?? table.floor;
    if (floor !== table.floor)
      ensure(
        (
          await tx.query(
            "SELECT floor FROM floor_plans WHERE outlet_id=$1 AND floor=$2 UNION SELECT floor FROM dining_tables WHERE outlet_id=$1 AND floor=$2",
            [table.outlet_id, floor],
          )
        ).rows.length,
        "FLOOR_NOT_FOUND",
        "Add this floor in Floor plan first.",
        409,
      );
    const occupied = await one(
      tx,
      "SELECT coalesce(sum(guests),0) AS guests FROM table_sessions WHERE table_id=$1 AND status<>'CLOSED'",
      [table.id],
    );
    const reserved = await one(
      tx,
      "SELECT coalesce(max(guests),0) AS guests FROM table_reservations WHERE table_id=$1 AND state='HELD' AND ends_at>now()",
      [table.id],
    );
    ensure(
      data.seats >= Math.max(num(occupied.guests), num(reserved.guests)),
      "CAPACITY_IN_USE",
      "Capacity cannot be lower than current guests or a confirmed reservation.",
      409,
    );
    await tx.query(
      "UPDATE dining_tables SET seats=$2,floor=$3,version=version+1 WHERE id=$1",
      [table.id, data.seats, floor],
    );
    if (floor !== table.floor)
      await tx.query(
        "UPDATE floor_plans SET objects=coalesce((SELECT jsonb_agg(object) FROM jsonb_array_elements(objects) object WHERE object->>'tableId' IS DISTINCT FROM $2),'[]'::jsonb),version=version+1,updated_at=now() WHERE outlet_id=$1 AND floor=$3 AND EXISTS(SELECT 1 FROM jsonb_array_elements(objects) object WHERE object->>'tableId'=$2)",
        [table.outlet_id, table.id, table.floor],
      );
    if (floor !== table.floor)
      await placeTableOnFloor(tx, actor, {
        id: table.id,
        outletId: table.outlet_id,
        floor,
        label: table.label,
      });
    await audit(tx, actor, {
      action: "TABLE_CAPACITY_UPDATED",
      entityType: "TABLE",
      entityId: table.id,
      outletId: table.outlet_id,
      oldState: { seats: table.seats, floor: table.floor },
      newState: { seats: data.seats, floor },
      reason: "Owner updated physical table settings",
    });
    return {
      id: table.id,
      seats: data.seats,
      floor,
      version: num(table.version) + 1,
    };
  });
}

export async function renameTable(db:Database,actor:Actor,key:string,input:unknown){
 requirePermission(actor,'settings');
 ensure(!actor.application||actor.application==='MASTER','APPLICATION_FORBIDDEN','Rename tables in the web workspace.',403);
 const data=z.object({tableId:z.uuid(),version:z.number().int().positive(),label:z.string().trim().min(1).max(30)}).strict().parse(input);
 return command(db,actor,key,'TABLE_RENAMED',data,async tx=>{
  const context=await one(tx,'SELECT outlet_id FROM dining_tables WHERE id=$1',[data.tableId]);requireOutlet(actor,context.outlet_id);
  await one(tx,'SELECT id FROM outlets WHERE id=$1 FOR UPDATE',[context.outlet_id]);
  const table=await one(tx,'SELECT * FROM dining_tables WHERE id=$1 AND retired_at IS NULL FOR UPDATE',[data.tableId]);expectedVersion(table.version,data.version);
  const collision=(await tx.query('SELECT label,floor,retired_at FROM dining_tables WHERE outlet_id=$1 AND id<>$2 AND lower(label)=lower($3)',[table.outlet_id,table.id,data.label])).rows[0];
  ensure(!collision,'TABLE_LABEL_TAKEN',collision?'Table “'+collision.label+'” already exists on '+collision.floor+'. Find it in Tables or choose a different name.':'Another table already uses this name.',409);
  await tx.query('UPDATE dining_tables SET label=$2,version=version+1 WHERE id=$1',[table.id,data.label]);
  const plans=(await tx.query<{floor:string;version:number}>("UPDATE floor_plans SET objects=(SELECT jsonb_agg(CASE WHEN object->>'tableId'=$2 THEN jsonb_set(object,'{label}',to_jsonb($3::text)) ELSE object END ORDER BY ordinal) FROM jsonb_array_elements(objects) WITH ORDINALITY AS e(object,ordinal)),version=version+1,updated_at=now() WHERE outlet_id=$1 AND EXISTS(SELECT 1 FROM jsonb_array_elements(objects) object WHERE object->>'tableId'=$2) RETURNING floor,version",[table.outlet_id,table.id,data.label])).rows;
  await audit(tx,actor,{action:'TABLE_RENAMED',entityType:'TABLE',entityId:table.id,outletId:table.outlet_id,oldState:{label:table.label},newState:{label:data.label},reason:'Owner renamed the physical table'});
  return {id:table.id,label:data.label,version:num(table.version)+1,plans};
 });
}
