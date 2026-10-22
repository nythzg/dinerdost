import {z} from 'zod';
import type {Database} from '@dinerdost/database';
import {ensure,requireOutlet,requirePermission,type Actor} from '@dinerdost/core';
import {audit,command,expectedVersion,id,one} from './shared';
import {requireInventoryStream} from './operational-access';
export async function saveMaterialSetup(db:Database,actor:Actor,key:string,input:unknown){
 requirePermission(actor,'inventory');ensure(!actor.application||actor.application==='MASTER','APPLICATION_FORBIDDEN','Configure buying packs in the web workspace.',403);
 const data=z.object({ingredientId:z.uuid(),version:z.number().int().positive(),category:z.string().trim().max(80),code:z.string().trim().max(40),hsn:z.string().trim().max(20),measuredYieldBps:z.number().int().min(1).max(10000).nullable(),packs:z.array(z.object({id:z.uuid().optional(),name:z.string().trim().min(1).max(60),factorMilli:z.number().int().positive().max(1000000000)}).strict()).max(20)}).strict().parse(input);
 ensure(new Set(data.packs.map(pack=>pack.name.toLowerCase())).size===data.packs.length,'DUPLICATE_PACK','Use a different name for each buying pack.');
 const ids=data.packs.flatMap(pack=>pack.id?[pack.id]:[]);ensure(new Set(ids).size===ids.length,'DUPLICATE_PACK','Choose each buying pack once.');
 return command(db,actor,key,'MATERIAL_SETUP_SAVED',data,async tx=>{
  const item=await one(tx,'SELECT * FROM ingredients WHERE id=$1 AND retired_at IS NULL FOR UPDATE',[data.ingredientId]);requireOutlet(actor,item.outlet_id);requireInventoryStream(actor,item.category,item.production_stream);expectedVersion(item.version,data.version);
  if(data.code)ensure(!(await tx.query('SELECT id FROM ingredients WHERE outlet_id=$1 AND lower(material_code)=lower($2) AND retired_at IS NULL AND id<>$3',[item.outlet_id,data.code,item.id])).rows.length,'MATERIAL_CODE_EXISTS','This material code is already used in this outlet.',409);
  const previous=(await tx.query('SELECT * FROM ingredient_purchase_packs WHERE ingredient_id=$1 ORDER BY id FOR UPDATE',[item.id])).rows;
  for(const pack of data.packs.filter(pack=>pack.id))ensure(previous.some(saved=>saved.id===pack.id),'PACK_NOT_FOUND','Buying pack unavailable for this ingredient.',404);
  // Deactivate first so renaming or swapping names is atomic. Existing receipt snapshots are independent.
  await tx.query('UPDATE ingredient_purchase_packs SET active=false WHERE ingredient_id=$1',[item.id]);
  const savedPacks=[];
  for(const pack of data.packs){const packId=pack.id??id();if(pack.id)await tx.query('UPDATE ingredient_purchase_packs SET name=$2,factor_milli=$3,version=version+1,active=true WHERE id=$1',[packId,pack.name,pack.factorMilli]);else await tx.query('INSERT INTO ingredient_purchase_packs(id,restro_id,outlet_id,ingredient_id,name,factor_milli) VALUES($1,$2,$3,$4,$5,$6)',[packId,actor.restroId,item.outlet_id,item.id,pack.name,pack.factorMilli]);savedPacks.push({id:packId,name:pack.name,factorMilli:pack.factorMilli})}
  await tx.query('UPDATE ingredients SET material_category=$2,material_code=$3,hsn_code=$4,measured_yield_bps=$5,version=version+1 WHERE id=$1',[item.id,data.category,data.code,data.hsn,data.measuredYieldBps]);
  await audit(tx,actor,{action:'MATERIAL_SETUP_SAVED',entityType:'INGREDIENT',entityId:item.id,outletId:item.outlet_id,oldState:{category:item.material_category,code:item.material_code,hsn:item.hsn_code,measuredYieldBps:item.measured_yield_bps,packs:previous},newState:{...data,packs:savedPacks},reason:'Material details and buying packs configured; stock units, balances and historical receipts unchanged'});return {id:item.id,packs:savedPacks};
 });
}
