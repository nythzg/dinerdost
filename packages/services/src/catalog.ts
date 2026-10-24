import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Database, Sql } from "@dinerdost/database";
import {
  ensure,
  isManager,
  requireOutlet,
  requirePermission,
  nextTableName,
  type Actor,
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
import { passwordHash, stepUp } from "./auth";
import { ensureMenuCategory } from "./menu-categories";
import { placeTableOnFloor } from "./table-placement";
import { staffDetailsSchema, writeStaffDetails } from "./assets";
import {
  actorStream,
  requireInventoryStream,
  requireTicketStream,
} from "./operational-access";

const option = z
  .object({
    id: z.string().regex(/^[a-z0-9_-]{1,40}$/),
    name: z.string().trim().min(1).max(80),
    price: z.number().int().min(0).max(10000000),
  })
  .strict();
const recipeIngredients = z
  .array(
    z
      .object({
        id: z.uuid(),
        quantityMilli: z.number().int().min(1).max(10000000),
      })
      .strict(),
  )
  .max(100);
export const menuSchema = z
  .object({
    id: z.uuid().optional(),
    version: z.number().int().optional(),
    outletId: z.uuid(),
    name: z.string().trim().min(2).max(120),
    category: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).default(""),
    imageUrl: z
      .string()
      .trim()
      .max(2048)
      .refine((value) => {
        if (
          !value ||
          /^\/images\/menu\/samples\/[a-z-]+\.webp$/.test(value) ||
          /^\/api\/menu-images\/[0-9a-f-]{36}$/.test(value)
        )
          return true;
        try {
          const url = new URL(value);
          return (
            url.protocol === "https:" &&
            !url.username &&
            !url.password &&
            !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/i.test(
              url.hostname,
            ) &&
            !url.hostname.endsWith(".local")
          );
        } catch {
          return false;
        }
      }, "Use a public HTTPS image URL.")
      .optional(),
    price: z.number().int().min(0).max(1000000000),
    guestBestChoice: z.boolean().optional(),
    compareAtPrice: z.number().int().min(1).max(1000000000).nullable().optional(),
    taxBps: z.number().int().min(0).max(10000),
    unit: z.enum(["portion", "piece", "kg", "L", "peg"]).default("portion"),
    pegMl: z.number().int().min(1).max(1000).nullable().default(null),
    liquorIngredientId: z.uuid().nullable().default(null),
    station: z.string().trim().min(1).max(80),
    active: z.boolean().default(true),
    variants: z.array(option).max(20).default([]),
    modifiers: z.array(option).max(30).default([]),
    stream: z.enum(["FOOD", "BAR"]).optional(),
    recipe: recipeIngredients.optional(),
  })
  .strict();
export async function saveMenu(
  db: Database,
  actor: Actor,
  key: string,
  input: unknown,
) {
  const barEditor =
    actorStream(actor) === "BAR" &&
    (actor.role === "BARTENDER" || isManager(actor));
  requirePermission(actor, barEditor ? "menu" : "settings");
  const data = menuSchema.parse(input);
  requireOutlet(actor, data.outletId);
  ensure(
    new Set(data.variants.map((v) => v.id)).size === data.variants.length &&
      new Set(data.modifiers.map((v) => v.id)).size === data.modifiers.length,
    "DUPLICATE_OPTION",
    "Option identifiers must be unique.",
  );
  return command(db, actor, key, "MENU_SAVED", data, async (tx) => {
    await one(tx, "SELECT id FROM outlets WHERE id=$1 FOR UPDATE", [
      data.outletId,
    ]);
    const category = await ensureMenuCategory(
      tx,
      actor.restroId,
      data.outletId,
      data.category,
    );
    data.category = category.name;
    const previous: Row | null = data.id
      ? await one(
          tx,
          "SELECT * FROM menu_items WHERE id=$1 AND outlet_id=$2 FOR UPDATE",
          [data.id, data.outletId],
        )
      : null;
    ensure(!previous?.ready_food_batch_id,"PREPARED_MENU_READ_ONLY","Prepared-food listings retain the cancelled dish snapshot and cannot be edited as a new recipe.",409);
    const compareAtPrice=data.compareAtPrice===undefined?(previous?.compare_at_price??null):data.compareAtPrice;
    ensure(compareAtPrice===null||Number(compareAtPrice)>data.price,"MENU_OFFER_PRICE","The regular base price must be greater than the selling price. Clear it to remove the offer.");
    const itemId = data.id ?? id();
    const stream =
      data.unit === "peg"
        ? "BAR"
        : (data.stream ??
          previous?.production_stream ??
          (data.station.toLowerCase() === "bar" ? "BAR" : "FOOD"));
    requireTicketStream(actor, stream);
    if (actor.role !== "OWNER") {
      const tax = data.id
        ? await one(
            tx,
            "SELECT tax_bps FROM menu_items WHERE id=$1 AND outlet_id=$2",
            [data.id, data.outletId],
          )
        : await one(tx, "SELECT tax_bps FROM outlets WHERE id=$1", [
            data.outletId,
          ]);
      ensure(
        data.taxBps === tax.tax_bps,
        "OWNER_TAX_ONLY",
        "Only the owner can change tax rates.",
        403,
      );
    }
    if (data.unit === "peg")
      ensure(
        data.pegMl && data.liquorIngredientId,
        "PEG_CONFIGURATION",
        "Choose the liquor stock and peg size.",
      );
    if (data.id) {
      expectedVersion(previous!.version, data.version ?? 0);
      requireTicketStream(actor, previous!.production_stream);
      await tx.query(
        "UPDATE menu_items SET name=$2,category=$3,description=$4,price=$5,tax_bps=$6,unit=$7,station=$8,active=$9,variants=$10::jsonb,modifiers=$11::jsonb,peg_ml=$12,liquor_ingredient_id=$13,compare_at_price=$14,version=version+1 WHERE id=$1",
        [
          itemId,
          data.name,
          data.category,
          data.description,
          data.price,
          data.taxBps,
          data.unit,
          data.station,
          data.active,
          json(data.variants),
          json(data.modifiers),
          data.unit === "peg" ? data.pegMl : null,
          data.unit === "peg" ? data.liquorIngredientId : null,
          compareAtPrice,
        ],
      );
    } else
      await tx.query(
        "INSERT INTO menu_items(id,restro_id,outlet_id,name,category,description,price,tax_bps,unit,station,active,variants,modifiers,peg_ml,liquor_ingredient_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,$15)",
        [
          itemId,
          actor.restroId,
          data.outletId,
          data.name,
          data.category,
          data.description,
          data.price,
          data.taxBps,
          data.unit,
          data.station,
          data.active,
          json(data.variants),
          json(data.modifiers),
          data.unit === "peg" ? data.pegMl : null,
          data.unit === "peg" ? data.liquorIngredientId : null,
        ],
      );
    if (data.unit === "peg") {
      ensure(
        data.pegMl && data.liquorIngredientId,
        "PEG_CONFIGURATION",
        "Choose the liquor stock and peg size.",
      );
      await one(
        tx,
        "SELECT id FROM ingredients WHERE id=$1 AND outlet_id=$2 AND category='LIQUOR' AND unit='L' AND retired_at IS NULL FOR SHARE",
        [data.liquorIngredientId, data.outletId],
        "Choose liquor stock from this outlet.",
      );
      const waiting = (
        await tx.query(
          "SELECT r.id FROM order_rounds r JOIN order_items i ON i.round_id=r.id AND i.restro_id=r.restro_id WHERE i.item_id=$1 AND r.status='ACCEPTED' AND r.kot_status='HELD' LIMIT 1",
          [itemId],
        )
      ).rows;
      ensure(
        !waiting.length,
        "ACTIVE_RESERVATIONS",
        "Finish pending kitchen authorizations before changing this peg recipe.",
        409,
      );
      if (
        previous?.liquor_ingredient_id &&
        previous.liquor_ingredient_id !== data.liquorIngredientId
      )
        await tx.query(
          "DELETE FROM recipes WHERE item_id=$1 AND ingredient_id=$2",
          [itemId, previous.liquor_ingredient_id],
        );
      await tx.query(
        "INSERT INTO recipes(restro_id,item_id,ingredient_id,quantity_milli) VALUES($1,$2,$3,$4) ON CONFLICT(item_id,ingredient_id) DO UPDATE SET quantity_milli=$4",
        [actor.restroId, itemId, data.liquorIngredientId, data.pegMl],
      );
    }
    const imageUrl = data.imageUrl ?? previous?.image_url ?? "";
    if (imageUrl.startsWith("/api/menu-images/"))
      await one(
        tx,
        "SELECT id FROM uploaded_assets WHERE id=$1 AND purpose='MENU' AND outlet_id=$2",
        [imageUrl.split("/").at(-1), data.outletId],
        "Choose a menu photo from this outlet.",
      );
    await tx.query(
      "UPDATE menu_items SET production_stream=$2,image_url=$3,image_is_sample=$4,guest_best_choice=$5,compare_at_price=$6 WHERE id=$1",
      [itemId, stream, imageUrl, imageUrl.startsWith("/images/menu/samples/"),data.guestBestChoice??previous?.guest_best_choice??false,compareAtPrice],
    );
    if (data.recipe !== undefined) {
      ensure(
        data.unit !== "peg",
        "PEG_CONFIGURATION",
        "Liquor recipes use the selected stock and peg size.",
      );
      const before = (
        await tx.query(
          "SELECT ingredient_id,quantity_milli FROM recipes WHERE item_id=$1 ORDER BY ingredient_id",
          [itemId],
        )
      ).rows;
      const normalized = [...data.recipe].sort((a, b) =>
        a.id.localeCompare(b.id),
      );
      if (
        before.length !== normalized.length ||
        before.some(
          (r, i) =>
            r.ingredient_id !== normalized[i].id ||
            Number(r.quantity_milli) !== normalized[i].quantityMilli,
        )
      )
        await replaceRecipe(
          tx,
          actor,
          { id: itemId, outlet_id: data.outletId, production_stream: stream },
          data.recipe,
        );
    }
    await audit(tx, actor, {
      action: "MENU_SAVED",
      entityType: "MENU_ITEM",
      entityId: itemId,
      outletId: data.outletId,
      oldState: previous,
      newState: data,
    });
    return { id: itemId };
  });
}
export async function saveTable(
  db: Database,
  actor: Actor,
  key: string,
  input: unknown,
  webFlow = false,
) {
  requirePermission(actor, "settings");
  const data = z
    .object({
      outletId: z.uuid(),
      label: z.string().trim().max(30).default(''),
      seats: z.number().int().min(1).max(100),
      floor: z.string().trim().min(1).max(80),
    })
    .strict()
    .parse(input);
  requireOutlet(actor, data.outletId);
  ensure(data.label || (webFlow && (!actor.application || actor.application==='MASTER')),'TABLE_NAME_REQUIRED','Enter a table name.');
  return command(db, actor, key, "TABLE_CREATED", data, async (tx) => {
    await one(tx, "SELECT id FROM outlets WHERE id=$1 FOR UPDATE", [
      data.outletId,
    ]);
    const tableId = id();
    const label=data.label || nextTableName((await tx.query('SELECT label FROM dining_tables WHERE outlet_id=$1',[data.outletId])).rows.map(row=>String(row.label)));
    await tx.query(
      "INSERT INTO dining_tables(id,restro_id,outlet_id,label,seats,floor,public_key) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        tableId,
        actor.restroId,
        data.outletId,
        label,
        data.seats,
        data.floor,
        randomBytes(20).toString("hex"),
      ],
    );
    await audit(tx, actor, {
      action: "TABLE_CREATED",
      entityType: "TABLE",
      entityId: tableId,
      outletId: data.outletId,
      newState: {...data,label},
    });
    await placeTableOnFloor(tx, actor, { id: tableId, ...data,label });
    return { id: tableId,label };
  });
}
export async function saveOutlet(
  db: Database,
  actor: Actor,
  key: string,
  input: unknown,
) {
  requirePermission(actor, "settings");
  const data = z
    .object({
      id: z.uuid().optional(),
      version: z.number().int().optional(),
      name: z.string().trim().min(2).max(150),
      code: z.string().regex(/^[A-Z0-9]{2,12}$/),
      address: z.string().trim().max(500).default(""),
      gstin: z
        .string()
        .regex(/^([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])?$/)
        .default(""),
      qrEnabled: z.boolean(),
      qrPaymentMode: z.enum(["ORDER_ONLY", "PAYMENT"]).optional(),
      paymentPolicy: z.enum(["PREPAID", "POSTPAID"]).default("PREPAID"),
      taxBps: z.number().int().min(0).max(10000),
      earnBps: z.number().int().min(0).max(10000).default(200),
      kotPrintMode: z.enum(["OFF", "MANUAL", "AUTO"]).optional(),
    })
    .strict()
    .parse(input);
  return command(db, actor, key, "OUTLET_SAVED", data, async (tx) => {
    const outletId = data.id ?? id();
    let before = null;
    if (data.id) {
      before = await one(tx, "SELECT * FROM outlets WHERE id=$1 FOR UPDATE", [
        data.id,
      ]);
      expectedVersion(before.version, data.version ?? 0);
      ensure(
        before.tax_components === null || data.taxBps === before.tax_bps,
        "SAVED_TAX_POLICY",
        "Change named taxes in POS Tax settings.",
      );
      await tx.query(
        "UPDATE outlets SET name=$2,code=$3,address=$4,gstin=$5,qr_enabled=$6,payment_policy=$7,tax_bps=$8,earn_bps=$9,kot_print_mode=coalesce($10,kot_print_mode),qr_payment_mode=coalesce($11,qr_payment_mode),version=version+1 WHERE id=$1",
        [
          outletId,
          data.name,
          data.code,
          data.address,
          data.gstin,
          data.qrEnabled,
          data.paymentPolicy,
          data.taxBps,
          data.earnBps,
          data.kotPrintMode ?? null,
          data.qrPaymentMode ?? null,
        ],
      );
      if (!data.qrEnabled)
        await tx.query(
          "UPDATE public_grants SET revoked_at=now() WHERE outlet_id=$1 AND revoked_at IS NULL",
          [outletId],
        );
    } else
      await tx.query(
        "INSERT INTO outlets(id,restro_id,name,code,address,gstin,qr_enabled,payment_policy,tax_bps,earn_bps,kot_print_mode,qr_payment_mode) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
        [
          outletId,
          actor.restroId,
          data.name,
          data.code,
          data.address,
          data.gstin,
          data.qrEnabled,
          data.paymentPolicy,
          data.taxBps,
          data.earnBps,
          data.kotPrintMode ?? "OFF",
          data.qrPaymentMode ?? "ORDER_ONLY",
        ],
      );
    await audit(tx, actor, {
      action: "OUTLET_SAVED",
      entityType: "OUTLET",
      entityId: outletId,
      outletId,
      oldState: before,
      newState: data,
    });
    return { id: outletId };
  });
}
export async function addEmployee(
  db: Database,
  actor: Actor,
  key: string,
  input: unknown,
) {
  requirePermission(actor, "team");
  const data = z
    .object({
      name: z.string().trim().min(2).max(120),
      email: z.email().toLowerCase(),
      password: z.string().min(12).max(128),
      role: z.enum([
        "MANAGER",
        "CASHIER",
        "WAITER",
        "KITCHEN",
        "BARTENDER",
        "ACCOUNTANT",
      ]),
      outletIds: z.array(z.uuid()).min(1).max(100),
      salary: z.number().int().min(0).max(100000000).default(0),
      details: staffDetailsSchema.optional(),
    })
    .strict()
    .parse(input);
  const encoded = await passwordHash(data.password);
  return command(
    db,
    actor,
    key,
    "EMPLOYEE_CREATED",
    { ...data, password: undefined },
    async (tx) => {
      const assigned = (
        await tx.query("SELECT id FROM outlets WHERE id=ANY($1::uuid[])", [
          data.outletIds,
        ])
      ).rows;
      ensure(
        assigned.length === new Set(data.outletIds).size,
        "OUTLET_FORBIDDEN",
        "One of these outlets is unavailable.",
        403,
      );
      const userId = id(),
        employeeId = id();
      await tx.query("RESET ROLE");
      await tx.query(
        "INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)",
        [userId, data.email, data.name, encoded],
      );
      await tx.query("SET LOCAL ROLE dinerdost_app");
      await tx.query(
        "INSERT INTO employees(id,restro_id,user_id,name,role,outlet_ids,base_salary) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [
          employeeId,
          actor.restroId,
          userId,
          data.name,
          data.role,
          data.outletIds,
          data.salary,
        ],
      );
      if (data.details)
        await writeStaffDetails(tx, actor, employeeId, data.details);
      await audit(tx, actor, {
        action: "EMPLOYEE_CREATED",
        entityType: "EMPLOYEE",
        entityId: employeeId,
        newState: {
          name: data.name,
          role: data.role,
          outletIds: data.outletIds,
        },
      });
      return { id: employeeId };
    },
  );
}
export async function employeeAccess(
  db: Database,
  actor: Actor,
  key: string,
  employeeId: string,
  input: unknown,
) {
  requirePermission(actor, "team");
  const data = z
    .object({ active: z.boolean(), password: z.string() })
    .strict()
    .parse(input);
  await stepUp(db, actor, data.password);
  ensure(
    employeeId !== actor.employeeId,
    "OWNER_LOCKOUT",
    "You cannot revoke your own access.",
  );
  return command(
    db,
    actor,
    key,
    "EMPLOYEE_ACCESS_CHANGED",
    { employeeId, active: data.active },
    async (tx) => {
      const employee = await one(
        tx,
        "SELECT * FROM employees WHERE id=$1 AND role<>'OWNER' FOR UPDATE",
        [employeeId],
      );
      await tx.query(
        "UPDATE employees SET active=$2,version=version+1 WHERE id=$1",
        [employeeId, data.active],
      );
      await audit(tx, actor, {
        action: "EMPLOYEE_ACCESS_CHANGED",
        entityType: "EMPLOYEE",
        entityId: employeeId,
        oldState: { active: employee.active },
        newState: { active: data.active },
      });
      return { ok: true };
    },
  );
}
export async function saveRecipe(
  db: Database,
  actor: Actor,
  key: string,
  input: unknown,
) {
  requirePermission(actor, actorStream(actor) === "BAR" ? "menu" : "settings");
  const data = z
    .object({
      itemId: z.uuid(),
      ingredients: recipeIngredients,
    })
    .strict()
    .parse(input);
  return command(db, actor, key, "RECIPE_SAVED", data, async (tx) => {
    const item = await one(
      tx,
      "SELECT * FROM menu_items WHERE id=$1 FOR UPDATE",
      [data.itemId],
    );
    await replaceRecipe(tx, actor, item, data.ingredients);
    return { ok: true };
  });
}
async function replaceRecipe(
  tx: Sql,
  actor: Actor,
  item: Row,
  ingredients: z.infer<typeof recipeIngredients>,
) {
  requireTicketStream(actor, item.production_stream);
  requireOutlet(actor, item.outlet_id);
  ensure(!item.ready_food_batch_id,"PREPARED_MENU_READ_ONLY","Prepared food retains its original ingredient consumption and cannot receive a second raw recipe.",409);
  ensure(
    new Set(ingredients.map((i) => i.id)).size === ingredients.length,
    "DUPLICATE_INGREDIENT",
    "Choose each stock item once.",
  );
  const pending = (
    await tx.query(
      "SELECT r.id FROM order_rounds r JOIN order_items i ON i.round_id=r.id AND i.restro_id=r.restro_id WHERE i.item_id=$1 AND r.status='ACCEPTED' AND r.kot_status='HELD' LIMIT 1",
      [item.id],
    )
  ).rows;
  ensure(
    !pending.length,
    "ACTIVE_RESERVATIONS",
    "Finish pending kitchen authorizations before changing this recipe.",
    409,
  );
  await tx.query("DELETE FROM recipes WHERE item_id=$1", [item.id]);
  for (const ingredient of ingredients) {
    const stock = await one(
      tx,
      "SELECT id,category,production_stream FROM ingredients WHERE id=$1 AND outlet_id=$2 AND retired_at IS NULL FOR SHARE",
      [ingredient.id, item.outlet_id],
    );
    requireInventoryStream(actor, stock.category, stock.production_stream);
    await tx.query(
      "INSERT INTO recipes(restro_id,item_id,ingredient_id,quantity_milli) VALUES($1,$2,$3,$4)",
      [actor.restroId, item.id, ingredient.id, ingredient.quantityMilli],
    );
  }
  await audit(tx, actor, {
    action: "RECIPE_SAVED",
    entityType: "MENU_ITEM",
    entityId: item.id,
    outletId: item.outlet_id,
    newState: { itemId: item.id, ingredients },
  });
}
