import { z } from "zod";
import type { Database } from "@dinerdost/database";
import {
  ensure,
  requirePermission,
  requireOutlet,
  roundRatio,
  businessDate,
  type Actor,
} from "@dinerdost/core";
import { audit, command, id, num, one, expectedVersion } from "./shared";
import { actorStream, requireInventoryStream } from "./operational-access";
import { receiptExpiry } from "./stock-expiry";
import { consumedStockValue } from "./stock-valuation";
export async function updateIngredient(
  db: Database,
  actor: Actor,
  key: string,
  input: unknown,
) {
  requirePermission(actor, "inventory");
  const data = z
    .object({
      id: z.uuid(),
      version: z.number().int().positive(),
      name: z.string().trim().min(2).max(120),
      unit: z.enum(["kg", "L", "unit"]),
      reorderMilli: z.number().int().min(0).max(1000000000),
      purchaseRate: z
        .number()
        .int()
        .min(0)
        .max(100000000)
        .nullable()
        .optional(),
    })
    .strict()
    .parse(input);
  return command(db, actor, key, "INGREDIENT_UPDATED", data, async (tx) => {
    const previous = await one(
      tx,
      "SELECT * FROM ingredients WHERE id=$1 AND retired_at IS NULL FOR UPDATE",
      [data.id],
    );
    requireOutlet(actor, previous.outlet_id);
    requireInventoryStream(
      actor,
      previous.category,
      previous.production_stream,
    );
    expectedVersion(previous.version, data.version);
    ensure(
      previous.category !== "LIQUOR" || data.unit === "L",
      "LIQUOR_UNIT",
      "Liquor stock must stay in litres.",
    );
    if (data.unit !== previous.unit) {
      const used = await tx.query(
        "SELECT 1 FROM stock_batches WHERE ingredient_id=$1 UNION ALL SELECT 1 FROM stock_movements WHERE ingredient_id=$1 UNION ALL SELECT 1 FROM recipes WHERE ingredient_id=$1 UNION ALL SELECT 1 FROM menu_items WHERE liquor_ingredient_id=$1 UNION ALL SELECT 1 FROM ingredient_purchase_packs WHERE ingredient_id=$1 LIMIT 1",
        [data.id],
      );
      ensure(
        !used.rows.length,
        "UNIT_IN_USE",
        "Unit cannot change after stock or recipe records exist. Keep the unit or add a separate ingredient.",
        409,
      );
    }
    await tx.query(
      "UPDATE ingredients SET name=$2,unit=$3,reorder_milli=$4,purchase_rate=$5,version=version+1 WHERE id=$1",
      [
        data.id,
        data.name,
        data.unit,
        data.reorderMilli,
        data.purchaseRate === undefined
          ? previous.purchase_rate
          : data.purchaseRate,
      ],
    );
    await audit(tx, actor, {
      action: "INGREDIENT_UPDATED",
      entityType: "INGREDIENT",
      entityId: data.id,
      outletId: previous.outlet_id,
      oldState: {
        name: previous.name,
        unit: previous.unit,
        reorderMilli: Number(previous.reorder_milli),
        purchaseRate: previous.purchase_rate,
      },
      newState: {
        name: data.name,
        unit: data.unit,
        reorderMilli: data.reorderMilli,
        purchaseRate:
          data.purchaseRate === undefined
            ? previous.purchase_rate
            : data.purchaseRate,
      },
      reason: "Inventory item details updated",
    });
    return { id: data.id };
  });
}
export async function addIngredient(
  db: Database,
  actor: Actor,
  key: string,
  input: unknown,
) {
  requirePermission(actor, "inventory");
  const data = z
    .object({
      outletId: z.uuid(),
      name: z.string().trim().min(2).max(120),
      unit: z.enum(["kg", "L", "unit"]),
      category: z.enum(["GENERAL", "LIQUOR"]).default("GENERAL"),
      reorderMilli: z.number().int().min(0).max(1000000000).default(0),
      purchaseRate: z
        .number()
        .int()
        .min(0)
        .max(100000000)
        .nullable()
        .default(null),
      stream: z.enum(["FOOD", "BAR"]).optional(),
    })
    .strict()
    .parse(input);
  requireOutlet(actor, data.outletId);
  const stream =
    data.category === "LIQUOR"
      ? "BAR"
      : (data.stream ?? actorStream(actor) ?? "FOOD");
  requireInventoryStream(actor, data.category, stream);
  ensure(
    data.category !== "LIQUOR" || data.unit === "L",
    "LIQUOR_UNIT",
    "Track liquor stock in litres.",
  );
  return command(db, actor, key, "INGREDIENT_CREATED", data, async (tx) => {
    const ingredientId = id();
    await tx.query(
      "INSERT INTO ingredients(id,restro_id,outlet_id,name,unit,reorder_milli,category,production_stream,purchase_rate) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        ingredientId,
        actor.restroId,
        data.outletId,
        data.name,
        data.unit,
        data.reorderMilli,
        data.category,
        stream,
        data.purchaseRate,
      ],
    );
    await audit(tx, actor, {
      action: "INGREDIENT_CREATED",
      entityType: "INGREDIENT",
      entityId: ingredientId,
      outletId: data.outletId,
      newState: data,
    });
    return { id: ingredientId };
  });
}
export async function receiveStock(
  db: Database,
  actor: Actor,
  key: string,
  input: unknown,
  webFlow = false,
) {
  requirePermission(actor, "inventory");
  const receiptFields={
      ingredientId: z.uuid(),
      batchNumber: z.string().trim().min(1).max(80),
      expiresOn: z.iso.date().nullable().default(null),
      expiresAt: z.iso.datetime().nullable().optional(),
      reference: z.string().trim().min(3).max(120),
  };
  const data=z.union([
    z.object({...receiptFields,quantityMilli:z.number().int().min(1).max(1000000000),unitCost:z.number().int().min(0).max(100000000)}).strict(),
    z.object({...receiptFields,packId:z.uuid(),packVersion:z.number().int().positive(),packQuantityMilli:z.number().int().positive().max(1000000000),packCost:z.number().int().min(0).max(100000000)}).strict()
  ]).parse(input);
  return command(db, actor, key, "STOCK_RECEIVED", data, async (tx) => {
    const ingredient = await one(
      tx,
      "SELECT * FROM ingredients WHERE id=$1 AND retired_at IS NULL FOR SHARE",
      [data.ingredientId],
    );
    requireOutlet(actor, ingredient.outlet_id);
    requireInventoryStream(
      actor,
      ingredient.category,
      ingredient.production_stream,
    );
    const expiry = receiptExpiry(data.expiresAt, data.expiresOn, webFlow);
    let quantity:number,unitCost:number,cost:number,packSnapshot:Record<string,unknown>|null=null;
    if('packId' in data){
      ensure(webFlow&&(!actor.application||actor.application==='MASTER'),'APPLICATION_FORBIDDEN','Receive buying packs in the web workspace.',403);
      const pack=await one(tx,'SELECT * FROM ingredient_purchase_packs WHERE id=$1 AND ingredient_id=$2 AND outlet_id=$3 AND active FOR SHARE',[data.packId,ingredient.id,ingredient.outlet_id],'Buying pack unavailable for this ingredient.');expectedVersion(pack.version,data.packVersion);
      const converted=BigInt(String(pack.factor_milli))*BigInt(data.packQuantityMilli);
      ensure(converted%1000n===0n,'PACK_PRECISION','This quantity converts to less than the supported 0.001 base unit. Adjust the pack quantity.');
      const base=converted/1000n;ensure(base>0n&&base<=1000000000n,'QUANTITY_TOO_LARGE','The converted base quantity is outside the stock limit.');quantity=Number(base);
      cost=Number((BigInt(data.packQuantityMilli)*BigInt(data.packCost)+500n)/1000n);ensure(Number.isSafeInteger(cost),'AMOUNT_OVERFLOW','Receipt cost is too large.');
      unitCost=Number((BigInt(cost)*1000n+base/2n)/base);ensure(unitCost<=100000000,'AMOUNT_OVERFLOW','Cost per base unit exceeds the stock rate limit.');
      packSnapshot={id:pack.id,version:pack.version,name:pack.name,factorMilli:Number(pack.factor_milli),packQuantityMilli:data.packQuantityMilli,packPrice:data.packCost,baseUnit:ingredient.unit,baseQuantityMilli:quantity,totalCost:cost};
    }else{quantity=data.quantityMilli;unitCost=data.unitCost;cost=roundRatio(quantity*unitCost,1000)}
    const batchId = id();
    await tx.query(
      "INSERT INTO stock_batches(id,restro_id,outlet_id,ingredient_id,batch_number,on_hand,unit_cost,expires_on,receipt_reference,expires_at,remaining_value,purchase_pack_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)",
      [
        batchId,
        actor.restroId,
        ingredient.outlet_id,
        ingredient.id,
        data.batchNumber,
        quantity,
        unitCost,
        expiry.expiresOn,
        data.reference,
        expiry.expiresAt,
        packSnapshot?cost:null,
        packSnapshot?JSON.stringify(packSnapshot):null,
      ],
    );
    await tx.query(
      "INSERT INTO stock_movements(id,restro_id,outlet_id,ingredient_id,batch_id,kind,delta_milli,cost,reason,actor_id) VALUES($1,$2,$3,$4,$5,'RECEIPT',$6,$7,$8,$9)",
      [
        id(),
        actor.restroId,
        ingredient.outlet_id,
        ingredient.id,
        batchId,
        quantity,
        cost,
        data.reference,
        actor.employeeId,
      ],
    );
    await audit(tx, actor, {
      action: "GRN_STOCK_RECEIVED",
      entityType: "STOCK_BATCH",
      entityId: batchId,
      outletId: ingredient.outlet_id,
      newState: packSnapshot?{...data,convertedQuantityMilli:quantity,baseUnitCost:unitCost,packSnapshot}:data,
      impact: cost,
      reason: data.reference,
    });
    return { id: batchId };
  });
}
export async function wasteStock(
  db: Database,
  actor: Actor,
  key: string,
  input: unknown,
) {
  requirePermission(actor, "inventory");
  const data = z
    .object({
      batchId: z.uuid(),
      quantityMilli: z.number().int().positive().max(1000000000),
      reason: z.string().trim().min(5).max(500),
    })
    .strict()
    .parse(input);
  return command(db, actor, key, "STOCK_WASTED", data, async (tx) => {
    const batch = await one(
      tx,
      "SELECT * FROM stock_batches WHERE id=$1 FOR UPDATE",
      [data.batchId],
    );
    requireOutlet(actor, batch.outlet_id);
    const ingredient = await one(
      tx,
      "SELECT category,production_stream FROM ingredients WHERE id=$1",
      [batch.ingredient_id],
    );
    requireInventoryStream(
      actor,
      ingredient.category,
      ingredient.production_stream,
    );
    ensure(
      num(batch.on_hand) - num(batch.reserved) >= data.quantityMilli,
      "INSUFFICIENT_STOCK",
      "Only unreserved stock can be written off.",
      409,
    );
    const cost = consumedStockValue(batch, data.quantityMilli);
    await tx.query(
      "UPDATE stock_batches SET on_hand=on_hand-$2,remaining_value=CASE WHEN remaining_value IS NULL THEN NULL ELSE remaining_value-$3 END WHERE id=$1",
      [batch.id, data.quantityMilli, cost],
    );
    await tx.query(
      "INSERT INTO stock_movements(id,restro_id,outlet_id,ingredient_id,batch_id,kind,delta_milli,cost,reason,actor_id) VALUES($1,$2,$3,$4,$5,'WASTAGE',$6,$7,$8,$9)",
      [
        id(),
        actor.restroId,
        batch.outlet_id,
        batch.ingredient_id,
        batch.id,
        -data.quantityMilli,
        cost,
        data.reason,
        actor.employeeId,
      ],
    );
    await audit(tx, actor, {
      action: "WASTAGE_RECORDED",
      entityType: "STOCK_BATCH",
      entityId: batch.id,
      outletId: batch.outlet_id,
      newState: data,
      impact: -cost,
      reason: data.reason,
      risk: "WARNING",
    });
    return { ok: true };
  });
}
