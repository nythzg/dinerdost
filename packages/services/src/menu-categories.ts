import { z } from "zod";
import type { Database, Sql } from "@dinerdost/database";
import {
  ensure,
  requireOutlet,
  requirePermission,
  type Actor,
} from "@dinerdost/core";
import { audit, command, expectedVersion, id, one, type Row } from "./shared";

export async function ensureMenuCategory(
  tx: Sql,
  restroId: string,
  outletId: string,
  name: string,
) {
  await tx.query(
    "INSERT INTO menu_categories(id,restro_id,outlet_id,name) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
    [id(), restroId, outletId, name],
  );
  return one(
    tx,
    "SELECT * FROM menu_categories WHERE outlet_id=$1 AND lower(name)=lower($2) FOR SHARE",
    [outletId, name],
  );
}
export async function changeMenuCategory(
  db: Database,
  actor: Actor,
  key: string,
  input: unknown,
) {
  requirePermission(actor, "menu");
  const data = z
    .object({
      outletId: z.uuid(),
      id: z.uuid().optional(),
      version: z.number().int().optional(),
      mode: z.enum(["SAVE", "DELETE"]).default("SAVE"),
      name: z.string().trim().min(1).max(80).optional(),
      menuCourse: z.enum(['starter','main','freshener','dessert']).optional(),
      moveTo: z.uuid().optional(),
    })
    .strict()
    .parse(input);
  requireOutlet(actor, data.outletId);
  return command(db, actor, key, "MENU_CATEGORY_CHANGED", data, async (tx) => {
    // The outlet lock serializes category moves, deletions and dish assignments.
    await one(tx, "SELECT id FROM outlets WHERE id=$1 FOR UPDATE", [
      data.outletId,
    ]);
    const categoryId = data.id ?? id();
    const before: Row | null = data.id
      ? await one(
          tx,
          "SELECT * FROM menu_categories WHERE id=$1 AND outlet_id=$2 FOR UPDATE",
          [data.id, data.outletId],
        )
      : null;
    if (before) expectedVersion(before.version, data.version ?? 0);
    if (data.mode === "DELETE") {
      ensure(before, "CATEGORY_REQUIRED", "Choose a category to delete.");
      const used = (
        await tx.query(
          "SELECT id FROM menu_items WHERE outlet_id=$1 AND lower(category)=lower($2)",
          [data.outletId, before.name],
        )
      ).rows;
      if (used.length) {
        ensure(
          data.moveTo && data.moveTo !== data.id,
          "CATEGORY_IN_USE",
          "Choose another category for the dishes before deleting this category.",
        );
        const target = await one(
          tx,
          "SELECT name FROM menu_categories WHERE id=$1 AND outlet_id=$2",
          [data.moveTo, data.outletId],
        );
        await tx.query(
          "UPDATE menu_items SET category=$3,version=version+1 WHERE outlet_id=$1 AND lower(category)=lower($2)",
          [data.outletId, before.name, target.name],
        );
      }
      await tx.query("DELETE FROM menu_categories WHERE id=$1", [before.id]);
    } else {
      ensure(data.name, "NAME_REQUIRED", "Enter a category name.");
      const duplicate = (
        await tx.query(
          "SELECT id FROM menu_categories WHERE outlet_id=$1 AND lower(name)=lower($2) AND ($3::uuid IS NULL OR id<>$3)",
          [data.outletId, data.name, data.id ?? null],
        )
      ).rows;
      ensure(
        !duplicate.length,
        "CATEGORY_EXISTS",
        "This category already exists.",
        409,
      );
      if (before) {
        await tx.query(
          "UPDATE menu_categories SET name=$2,menu_course=$3,version=version+1 WHERE id=$1",
          [before.id, data.name, data.menuCourse ?? before.menu_course],
        );
        if(before.name!==data.name)await tx.query(
          "UPDATE menu_items SET category=$3,version=version+1 WHERE outlet_id=$1 AND lower(category)=lower($2)",
          [data.outletId, before.name, data.name],
        );
      } else
        await tx.query(
          "INSERT INTO menu_categories(id,restro_id,outlet_id,name,menu_course) VALUES($1,$2,$3,$4,$5)",
          [categoryId, actor.restroId, data.outletId, data.name, data.menuCourse ?? null],
        );
    }
    await audit(tx, actor, {
      action:
        data.mode === "DELETE"
          ? "MENU_CATEGORY_DELETED"
          : "MENU_CATEGORY_SAVED",
      entityType: "MENU_CATEGORY",
      outletId: data.outletId,
      entityId: categoryId,
      oldState: before,
      newState: data,
    });
    return { ok: true };
  });
}
