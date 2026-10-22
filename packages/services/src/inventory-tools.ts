import {z} from 'zod';
import type {Database} from '@dinerdost/database';
import {ensure,requireOutlet,requirePermission,isManager,wholeUnit,type Actor} from '@dinerdost/core';
import {one,num,scopedOrder,type Row} from './shared';
import {actorStream,requireInventoryStream} from './operational-access';
import {resolveRecipe,currentRecipeLinks} from './recipe-profiles';
function web(actor:Actor){ensure(!actor.application||actor.application==='MASTER','APPLICATION_FORBIDDEN','Use the web workspace for this tool.',403)}
export async function ingredientPlan(db:Database,actor:Actor,input:unknown){
 web(actor);requirePermission(actor,'inventory');
 const data=z.object({outletId:z.uuid(),items:z.array(z.object({itemId:z.uuid(),quantityMilli:z.number().int().positive().max(1000000000),variant:z.string().optional(),modifiers:z.array(z.string()).max(10).default([]),channel:z.enum(['DINE_IN','TAKEAWAY','DELIVERY']).default('DINE_IN')}).strict()).min(1).max(100)}).strict().parse(input);requireOutlet(actor,data.outletId);
 ensure(new Set(data.items.map(item=>JSON.stringify([item.itemId,item.variant??'',item.channel,[...item.modifiers].sort()]))).size===data.items.length,'DUPLICATE_ITEM','Choose each dish and recipe choice once.');
 return db.transaction(actor.restroId,async tx=>{
  await one(tx,'SELECT id FROM outlets WHERE id=$1',[data.outletId]);
  const selected:Row[]=[],missing:Row[]=[],totals=new Map<string,bigint>();
  for(const line of data.items){
   const item=await one(tx,'SELECT * FROM menu_items WHERE id=$1 AND outlet_id=$2 AND active FOR SHARE',[line.itemId,data.outletId]);
   requireInventoryStream(actor,item.production_stream==='BAR'?'LIQUOR':'GENERAL',item.production_stream);
   ensure(!wholeUnit(item.unit)||line.quantityMilli%1000===0,'WHOLE_QUANTITY_REQUIRED','Plan a whole number of portions, pieces or pegs.');
   ensure(!item.ready_food_batch_id,'READY_BATCH_ITEM','Choose the original dish recipe to plan new preparation.');
   ensure(!line.variant||item.variants.some((v:Row)=>v.id===line.variant),'INVALID_VARIANT','Select an existing size.');
   ensure(new Set(line.modifiers).size===line.modifiers.length&&line.modifiers.every(m=>item.modifiers.some((v:Row)=>v.id===m)),'INVALID_MODIFIER','Select each existing add-on once.');
   const recipe=await resolveRecipe(tx,item,line.variant,line.modifiers,line.channel,false);
   const current={id:item.id,name:item.name,unit:item.unit,quantityMilli:line.quantityMilli,variant:line.variant??null,channel:line.channel,modifiers:line.modifiers};selected.push(current);
   const retired=(await tx.query('SELECT id FROM ingredients WHERE outlet_id=$1 AND retired_at IS NOT NULL',[data.outletId])).rows;
   if(!recipe.baseConfigured||recipe.needs.some(ingredient=>retired.some(r=>r.id===ingredient.id))){missing.push(current);continue}
   for(const ingredient of recipe.needs)totals.set(ingredient.id,(totals.get(ingredient.id)??0n)+BigInt(ingredient.quantityMilli)*BigInt(line.quantityMilli));
  }
  const ingredients:Row[]=[];
  for(const [ingredientId,amount] of totals){
   const item=await one(tx,`SELECT i.id,i.name,i.unit,coalesce(sum(b.on_hand-b.reserved) FILTER(WHERE (b.expires_at>now()) OR (b.expires_at IS NULL AND (b.expires_on IS NULL OR b.expires_on>=current_date))),0) AS available
    FROM ingredients i LEFT JOIN stock_batches b ON b.ingredient_id=i.id AND b.restro_id=i.restro_id AND b.outlet_id=$2 WHERE i.id=$1 AND i.outlet_id=$2 GROUP BY i.id`,[ingredientId,data.outletId]);
   const required=Number((amount+999n)/1000n);ensure(Number.isSafeInteger(required),'QUANTITY_TOO_LARGE','Reduce the planned quantity.');
   ingredients.push({...item,required,available:num(item.available),shortfall:Math.max(0,required-num(item.available))});
  }
  ingredients.sort((a,b)=>a.name.localeCompare(b.name));
  return {items:selected,ingredients,missing,complete:missing.length===0,basis:'Current saved size/channel recipes, configured add-ons/packaging and usable unreserved stock. Missing base recipes remain unknown. Planning does not reserve stock or create a purchase.'};
 });
}
export async function ingredientExpiryImpact(db:Database,actor:Actor,input:unknown){
 web(actor);requirePermission(actor,'inventory');const data=z.object({outletId:z.uuid(),ingredientId:z.uuid()}).strict().parse(input);requireOutlet(actor,data.outletId);
 return db.transaction(actor.restroId,async tx=>{
  const ingredient=await one(tx,'SELECT id,name,unit,production_stream FROM ingredients WHERE id=$1 AND outlet_id=$2',[data.ingredientId,data.outletId]);requireInventoryStream(actor,ingredient.production_stream==='BAR'?'LIQUOR':'GENERAL',ingredient.production_stream);
  const batches=(await tx.query(`SELECT id,batch_number,on_hand,reserved,expires_at,expires_on,CASE WHEN expires_at<=now() OR (expires_at IS NULL AND expires_on<current_date) THEN 'EXPIRED' WHEN expires_at IS NULL AND expires_on IS NULL THEN 'UNKNOWN' WHEN expires_at IS NULL THEN 'DATE_ONLY' ELSE 'RECORDED' END AS expiry_status FROM stock_batches WHERE ingredient_id=$1 AND outlet_id=$2 AND on_hand>0 ORDER BY expires_at NULLS LAST,expires_on NULLS LAST,id`,[ingredient.id,data.outletId])).rows;
  const dishes=(await tx.query(`SELECT m.id,m.name,m.unit,r.quantity_milli,r.choice FROM (${currentRecipeLinks}) r JOIN menu_items m ON m.id=r.item_id AND m.restro_id=r.restro_id WHERE r.ingredient_id=$1 AND m.outlet_id=$2 AND m.active AND ($3::text IS NULL OR m.production_stream=$3) ORDER BY m.name,m.id,r.choice`,[ingredient.id,data.outletId,actorStream(actor)])).rows;
  return {ingredient,batches,dishes,basis:'Current recipe links. Affected dishes are not automatically unavailable if another usable batch exists.'};
 });
}
export async function orderIngredientReport(db:Database,actor:Actor,orderId:string){
 web(actor);requirePermission(actor,'reports');ensure(isManager(actor)||actor.role==='ACCOUNTANT','FORBIDDEN','Financial reports require owner, manager or accountant access.',403);z.uuid().parse(orderId);
 return db.transaction(actor.restroId,async tx=>{
  const order=await scopedOrder(tx,actor,orderId);
  const items=(await tx.query('SELECT i.id,i.name,i.quantity_milli,i.unit_snapshot,i.recipe_snapshot,i.round_id,r.round_number,c.cost FROM order_items i JOIN order_rounds r ON r.id=i.round_id AND r.restro_id=i.restro_id LEFT JOIN order_item_costs c ON c.order_item_id=i.id AND c.restro_id=i.restro_id WHERE r.order_id=$1 ORDER BY r.round_number,i.id',[order.id])).rows;
  const needs=(await tx.query('SELECT n.order_item_id,n.round_id,n.ingredient_id,n.quantity_milli,i.name,i.unit FROM round_ingredient_needs n JOIN order_rounds r ON r.id=n.round_id AND r.restro_id=n.restro_id JOIN ingredients i ON i.id=n.ingredient_id AND i.restro_id=n.restro_id WHERE r.order_id=$1 ORDER BY n.round_id,i.name,n.order_item_id',[order.id])).rows;
  const consumption=(await tx.query(`SELECT m.round_id,m.ingredient_id,i.name,i.unit,-sum(m.delta_milli) AS quantity,sum(m.cost) AS cost FROM stock_movements m JOIN order_rounds r ON r.id=m.round_id AND r.restro_id=m.restro_id JOIN ingredients i ON i.id=m.ingredient_id AND i.restro_id=m.restro_id WHERE r.order_id=$1 AND m.kind='RECIPE_CONSUMPTION' GROUP BY m.round_id,m.ingredient_id,i.name,i.unit ORDER BY m.round_id,i.name`,[order.id])).rows;
  return {order:{id:order.id,number:order.number,status:order.status},items,needs,consumption,basis:'Saved order ingredient needs, recorded consumption movements and item costs. Missing historical snapshots/costs remain unknown; current recipes are not used to reconstruct them.'};
 });
}
export async function outletExpiryReport(db:Database,actor:Actor,outletId:string){
 web(actor);requirePermission(actor,'inventory');z.uuid().parse(outletId);requireOutlet(actor,outletId);
 return db.transaction(actor.restroId,async tx=>{
  await one(tx,'SELECT id FROM outlets WHERE id=$1',[outletId]);const stream=actorStream(actor);
  const batches=(await tx.query(`SELECT b.id,b.ingredient_id,i.name,i.unit,b.batch_number,b.on_hand,b.reserved,b.expires_at,b.expires_on,
   CASE WHEN b.expires_at<=now() OR (b.expires_at IS NULL AND b.expires_on<current_date) THEN 'EXPIRED' WHEN b.expires_at IS NULL AND b.expires_on IS NULL THEN 'UNKNOWN' WHEN b.expires_at IS NULL THEN 'DATE_ONLY' ELSE 'RECORDED' END AS expiry_status,
   coalesce(d.dishes,'[]'::jsonb) AS dishes
   FROM stock_batches b JOIN ingredients i ON i.id=b.ingredient_id AND i.restro_id=b.restro_id
   LEFT JOIN LATERAL(SELECT jsonb_agg(jsonb_build_object('id',d.id,'name',d.name) ORDER BY d.name,d.id) AS dishes FROM (SELECT DISTINCT m.id,m.name FROM (${currentRecipeLinks}) r JOIN menu_items m ON m.id=r.item_id AND m.restro_id=r.restro_id WHERE r.ingredient_id=i.id AND m.outlet_id=$1 AND m.active AND ($2::text IS NULL OR m.production_stream=$2)) d) d ON true
   WHERE b.outlet_id=$1 AND b.on_hand>0 AND ($2::text IS NULL OR i.production_stream=$2) ORDER BY b.expires_at NULLS LAST,b.expires_on NULLS LAST,i.name,b.id`,[outletId,stream])).rows;
  const processed=(await tx.query(`SELECT m.id,m.created_at,m.ingredient_id,i.name,i.unit,b.batch_number,-m.delta_milli AS quantity,m.cost,b.expires_at,b.expires_on FROM stock_movements m JOIN ingredients i ON i.id=m.ingredient_id AND i.restro_id=m.restro_id JOIN stock_batches b ON b.id=m.batch_id AND b.restro_id=m.restro_id WHERE m.outlet_id=$1 AND m.kind='WASTAGE' AND m.reason='Automatic expiry write-off' AND ($2::text IS NULL OR i.production_stream=$2) ORDER BY m.created_at DESC,m.id DESC`,[outletId,stream])).rows;
  return {batches,processed,basis:'Complete authorized outlet batch rows and recorded automatic-expiry write-offs. Refresh uses the existing exactly-once expiry sweep; unknown deadlines are never invented. Affected dishes may still have another usable batch.'};
 });
}
