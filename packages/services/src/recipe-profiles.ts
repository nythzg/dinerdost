import {z} from 'zod';
import type {Database,Sql} from '@dinerdost/database';
import {ensure,requireOutlet,requirePermission,integer,type Actor} from '@dinerdost/core';
import {audit,command,expectedVersion,id,json,num,one,type Row} from './shared';
import {actorStream,requireInventoryStream,requireTicketStream} from './operational-access';

const channels=z.enum(['ALL','DINE_IN','TAKEAWAY','DELIVERY']);
export const currentRecipeLinks=`SELECT restro_id,item_id,ingredient_id,quantity_milli,'Base recipe'::text AS choice FROM recipes
 UNION ALL SELECT p.restro_id,p.item_id,(n->>'id')::uuid,(n->>'quantityMilli')::bigint,p.kind||' '||p.option_id||' / '||p.channel
 FROM web_recipe_profiles p CROSS JOIN LATERAL jsonb_array_elements(p.ingredients) n WHERE p.active`;
const ingredients=z.array(z.object({id:z.uuid(),quantityMilli:z.number().int().positive().max(10000000)}).strict()).min(1).max(100);
const profileInput=z.object({itemId:z.uuid(),kind:z.enum(['RECIPE','ADDON','PACKAGING']),optionId:z.string().regex(/^[a-z0-9_-]{0,40}$/).default(''),channel:channels.default('ALL'),version:z.number().int().min(0),active:z.boolean().default(true),ingredients}).strict();
function web(actor:Actor){ensure(!actor.application||actor.application==='MASTER','APPLICATION_FORBIDDEN','Use recipe choices in the web workspace.',403)}
export async function recipeProfiles(db:Database,actor:Actor,itemId:string){
 web(actor);requirePermission(actor,actorStream(actor)==='BAR'?'menu':'inventory');z.uuid().parse(itemId);
 return db.transaction(actor.restroId,async tx=>{const item=await one(tx,'SELECT * FROM menu_items WHERE id=$1',[itemId]);requireOutlet(actor,item.outlet_id);requireTicketStream(actor,item.production_stream);return {item,profiles:(await tx.query('SELECT * FROM web_recipe_profiles WHERE item_id=$1 ORDER BY kind,option_id,channel',[itemId])).rows}});
}
export async function saveRecipeProfile(db:Database,actor:Actor,key:string,input:unknown){
 web(actor);requirePermission(actor,actorStream(actor)==='BAR'?'menu':'settings');const data=profileInput.parse(input);
 ensure(new Set(data.ingredients.map(i=>i.id)).size===data.ingredients.length,'DUPLICATE_INGREDIENT','Choose each stock item once.');
 return command(db,actor,key,'RECIPE_PROFILE_SAVED',data,async tx=>{
  const item=await one(tx,'SELECT * FROM menu_items WHERE id=$1 FOR UPDATE',[data.itemId]);requireOutlet(actor,item.outlet_id);requireTicketStream(actor,item.production_stream);
  ensure(!item.ready_food_batch_id&&item.unit!=='peg','RECIPE_PROFILE_UNSUPPORTED','Prepared listings and liquor pegs retain their existing stock recipe.',409);
  ensure(data.kind!=='PACKAGING'||!data.optionId,'INVALID_OPTION','Packaging uses the channel, without a size or add-on selector.');
  ensure(data.kind!=='ADDON'||!!data.optionId,'INVALID_OPTION','Select an existing add-on.');
  if(data.optionId)ensure((data.kind==='ADDON'?item.modifiers:item.variants).some((o:Row)=>o.id===data.optionId),'INVALID_OPTION','Select an existing size or add-on.');
  const previous=(await tx.query('SELECT * FROM web_recipe_profiles WHERE item_id=$1 AND kind=$2 AND option_id=$3 AND channel=$4',[item.id,data.kind,data.optionId,data.channel])).rows[0];
  if(previous)expectedVersion(previous.version,data.version);else ensure(data.version===0,'VERSION_CONFLICT','Refresh recipe choices before saving.',409);
  const snapshot=[];
  for(const line of data.ingredients){const stock=await one(tx,'SELECT id,name,unit,category,production_stream FROM ingredients WHERE id=$1 AND outlet_id=$2 AND retired_at IS NULL FOR SHARE',[line.id,item.outlet_id]);requireInventoryStream(actor,stock.category,stock.production_stream);snapshot.push({...line,name:stock.name,unit:stock.unit})}
  const profileId=previous?.id??id();
  if(previous)await tx.query('UPDATE web_recipe_profiles SET ingredients=$2::jsonb,active=$3,version=version+1,updated_at=now() WHERE id=$1',[profileId,json(snapshot),data.active]);
  else await tx.query('INSERT INTO web_recipe_profiles(id,restro_id,outlet_id,item_id,kind,option_id,channel,ingredients,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)',[profileId,actor.restroId,item.outlet_id,item.id,data.kind,data.optionId,data.channel,json(snapshot),data.active]);
  await audit(tx,actor,{action:'RECIPE_PROFILE_SAVED',entityType:'MENU_ITEM',entityId:item.id,outletId:item.outlet_id,oldState:previous??null,newState:{...data,id:profileId,ingredients:snapshot}});
  return one(tx,'SELECT * FROM web_recipe_profiles WHERE id=$1',[profileId]);
 });
}

/** Resolve only staff-entered quantities. Order snapshots remain independent of later edits. */
export async function resolveRecipe(tx:Sql,item:Row,variantId:string|undefined,modifierIds:string[],channel:string,validateIngredients=true){
 z.enum(['DINE_IN','TAKEAWAY','DELIVERY']).parse(channel);
 const profiles=item.unit==='peg'?[]:(await tx.query<Row>('SELECT * FROM web_recipe_profiles WHERE item_id=$1 AND active AND channel IN ($2,\'ALL\')',[item.id,channel])).rows;
 const find=(kind:string,optionId:string)=>profiles.find(p=>p.kind===kind&&p.option_id===optionId&&p.channel===channel)??profiles.find(p=>p.kind===kind&&p.option_id===optionId&&p.channel==='ALL');
 // Explicit size+channel, size, channel-default, then existing base recipe.
 const main=(variantId?find('RECIPE',variantId):undefined)??find('RECIPE','');
 const base=main?main.ingredients:(await tx.query('SELECT r.ingredient_id AS id,r.quantity_milli AS "quantityMilli",i.name,i.unit FROM recipes r JOIN ingredients i ON i.id=r.ingredient_id AND i.restro_id=r.restro_id WHERE r.item_id=$1 ORDER BY r.ingredient_id',[item.id])).rows;
 const components:Row[]=base.map((r:Row)=>({...r,quantityMilli:num(r.quantityMilli),kind:'RECIPE',profileId:main?.id??null,profileVersion:main?.version??null}));
 for(const modifierId of modifierIds){const addon=find('ADDON',modifierId);if(addon)for(const line of addon.ingredients)components.push({...line,kind:'ADDON',optionId:modifierId,profileId:addon.id,profileVersion:addon.version})}
 const packaging=find('PACKAGING','');if(packaging)for(const line of packaging.ingredients)components.push({...line,kind:'PACKAGING',profileId:packaging.id,profileVersion:packaging.version});
 const totals=new Map<string,number>();
 for(const line of components){if(validateIngredients)await one(tx,'SELECT id FROM ingredients WHERE id=$1 AND outlet_id=$2 AND retired_at IS NULL',[line.id,item.outlet_id]);totals.set(line.id,integer((totals.get(line.id)??0)+num(line.quantityMilli),'Recipe quantity'))}
 return {version:1,channel,variantId:variantId??null,modifierIds,baseConfigured:base.length>0,components,needs:[...totals].sort(([a],[b])=>a.localeCompare(b)).map(([id,quantityMilli])=>({id,quantityMilli})),basis:'Saved size/channel recipe plus configured add-ons and packaging. Unconfigured options do not invent ingredient quantities.'};
}
