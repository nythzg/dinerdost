import {z} from 'zod';
import type {Database} from '@dinerdost/database';
import {ensure,requireOutlet,requirePermission,integer,type Actor} from '@dinerdost/core';
import {audit,command,expectedVersion,id,json,num,one,type Row} from './shared';
import {actorStream,requireInventoryStream} from './operational-access';
import {consumedStockValue,remainingStockValue} from './stock-valuation';
import {expireInventory,receiptExpiry} from './stock-expiry';

const quantity=z.number().int().positive().max(1000000000);
const recipeInput=z.object({id:z.uuid().optional(),outletId:z.uuid(),version:z.number().int().min(0),name:z.string().trim().min(2).max(120),unit:z.enum(['kg','L','unit']),stream:z.enum(['FOOD','BAR']).optional(),yieldMilli:quantity,ingredients:z.array(z.object({id:z.uuid(),quantityMilli:quantity}).strict()).min(1).max(100)}).strict();
function web(actor:Actor){ensure(!actor.application||actor.application==='MASTER','APPLICATION_FORBIDDEN','Use production in the web workspace.',403)}
function whole(unit:string,n:number){ensure(unit!=='unit'||n%1000===0,'WHOLE_QUANTITY_REQUIRED','Enter a whole number of output units.')}
export async function productionWorkspace(db:Database,actor:Actor,outletId:string){
 web(actor);requirePermission(actor,'inventory');requireOutlet(actor,outletId);z.uuid().parse(outletId);
 return db.transaction(actor.restroId,async tx=>{await one(tx,'SELECT id FROM outlets WHERE id=$1',[outletId]);const stream=actorStream(actor);return {
  recipes:(await tx.query('SELECT p.*,i.name,i.unit,i.production_stream FROM web_production_recipes p JOIN ingredients i ON i.id=p.ingredient_id AND i.restro_id=p.restro_id WHERE p.outlet_id=$1 AND i.retired_at IS NULL AND ($2::text IS NULL OR i.production_stream=$2) ORDER BY i.name',[outletId,stream])).rows,
  batches:(await tx.query('SELECT p.*,i.name,i.unit,coalesce(b.on_hand,0) AS on_hand,coalesce(b.reserved,0) AS reserved,b.expires_at FROM web_production_batches p JOIN ingredients i ON i.id=p.ingredient_id AND i.restro_id=p.restro_id LEFT JOIN stock_batches b ON b.id=p.output_batch_id AND b.restro_id=p.restro_id WHERE p.outlet_id=$1 AND ($2::text IS NULL OR i.production_stream=$2) ORDER BY p.created_at DESC,p.id DESC',[outletId,stream])).rows,
  basis:'FIFO input costs transfer to measured output once. Yield loss is included in output cost. Zero-output batches record input wastage once; no output stock is created.'
 }});
}
export async function saveProductionRecipe(db:Database,actor:Actor,key:string,input:unknown){
 web(actor);requirePermission(actor,actorStream(actor)==='BAR'?'menu':'settings');const data=recipeInput.parse(input);requireOutlet(actor,data.outletId);whole(data.unit,data.yieldMilli);
 ensure(new Set(data.ingredients.map(i=>i.id)).size===data.ingredients.length,'DUPLICATE_INGREDIENT','Choose each input material once.');
 return command(db,actor,key,'PRODUCTION_RECIPE_SAVED',data,async tx=>{
  await one(tx,'SELECT id FROM outlets WHERE id=$1 FOR UPDATE',[data.outletId]);const outputId=data.id??id();let output:Row,previous:Row|null=null;
  if(data.id){output=await one(tx,'SELECT * FROM ingredients WHERE id=$1 AND outlet_id=$2 AND semi_finished AND retired_at IS NULL FOR UPDATE',[outputId,data.outletId]);requireInventoryStream(actor,output.category,output.production_stream);previous=await one(tx,'SELECT * FROM web_production_recipes WHERE ingredient_id=$1 FOR UPDATE',[outputId]);expectedVersion(previous.version,data.version);ensure(output.unit===data.unit&&output.name===data.name,'MATERIAL_IDENTITY_LOCKED','Keep the saved output name and base unit. Create a separate material for a different identity.',409)}
  else{ensure(data.version===0,'VERSION_CONFLICT','Refresh production recipes.',409);const stream=data.stream??actorStream(actor)??'FOOD';requireInventoryStream(actor,'GENERAL',stream);output={id:outputId,name:data.name,unit:data.unit,production_stream:stream};await tx.query("INSERT INTO ingredients(id,restro_id,outlet_id,name,unit,production_stream,semi_finished) VALUES($1,$2,$3,$4,$5,$6,true)",[outputId,actor.restroId,data.outletId,data.name,data.unit,stream])}
  const saved:Row[]=[];
  for(const line of data.ingredients){ensure(line.id!==outputId,'RECIPE_CYCLE','A production recipe cannot consume its own output.',409);const stock=await one(tx,'SELECT * FROM ingredients WHERE id=$1 AND outlet_id=$2 AND retired_at IS NULL FOR SHARE',[line.id,data.outletId]);requireInventoryStream(actor,stock.category,stock.production_stream);ensure(stock.production_stream===output.production_stream,'STREAM_FORBIDDEN','Production inputs and output must use the same food/bar stream.',403);saved.push({...line,name:stock.name,unit:stock.unit})}
  const graph=(await tx.query<Row>('SELECT ingredient_id,ingredients FROM web_production_recipes WHERE outlet_id=$1',[data.outletId])).rows;
  const reaches=(node:string,seen:Set<string>):boolean=>{if(node===outputId)return true;if(seen.has(node))return false;seen.add(node);return (graph.find(r=>r.ingredient_id===node)?.ingredients??[]).some((line:Row)=>reaches(line.id,seen))};
  ensure(!saved.some(line=>reaches(line.id,new Set())),'RECIPE_CYCLE','This recipe would create a production cycle.',409);
  if(previous)await tx.query('UPDATE web_production_recipes SET yield_milli=$2,ingredients=$3::jsonb,version=version+1,updated_at=now() WHERE ingredient_id=$1',[outputId,data.yieldMilli,json(saved)]);
  else await tx.query('INSERT INTO web_production_recipes(ingredient_id,restro_id,outlet_id,yield_milli,ingredients) VALUES($1,$2,$3,$4,$5::jsonb)',[outputId,actor.restroId,data.outletId,data.yieldMilli,json(saved)]);
  await audit(tx,actor,{action:'PRODUCTION_RECIPE_SAVED',entityType:'INGREDIENT',entityId:outputId,outletId:data.outletId,oldState:previous,newState:{...data,id:outputId,ingredients:saved}});return {id:outputId};
 });
}

export async function produceBatch(db:Database,actor:Actor,key:string,input:unknown){
 web(actor);requirePermission(actor,'inventory');const data=z.object({ingredientId:z.uuid(),recipeVersion:z.number().int().positive(),plannedMilli:quantity,actualMilli:z.number().int().min(0).max(1000000000),batchNumber:z.string().trim().min(1).max(80),expiresAt:z.iso.datetime().nullable().default(null),reason:z.string().trim().min(5).max(500),confirmed:z.literal(true)}).strict().parse(input);
 return command(db,actor,key,'PRODUCTION_BATCH_RECORDED',data,async tx=>{
  const output=await one(tx,'SELECT * FROM ingredients WHERE id=$1 AND retired_at IS NULL AND semi_finished FOR SHARE',[data.ingredientId]);requireOutlet(actor,output.outlet_id);requireInventoryStream(actor,output.category,output.production_stream);whole(output.unit,data.plannedMilli);whole(output.unit,data.actualMilli);
  const recipe=await one(tx,'SELECT * FROM web_production_recipes WHERE ingredient_id=$1 FOR UPDATE',[output.id]);expectedVersion(recipe.version,data.recipeVersion);
  const expiry=data.actualMilli>0?receiptExpiry(data.expiresAt,null,true):{expiresAt:null,expiresOn:null};
  ensure(!(await tx.query('SELECT id FROM stock_batches WHERE ingredient_id=$1 AND batch_number=$2 UNION ALL SELECT id FROM web_production_batches WHERE ingredient_id=$1 AND batch_number=$2',[output.id,data.batchNumber])).rows.length,'DUPLICATE_BATCH','Use a unique output batch number.',409);
  await expireInventory(tx,actor.restroId,output.outlet_id);const allocations:Row[]=[],needs:Row[]=[];let totalCost=0;
  for(const line of [...recipe.ingredients].sort((a:Row,b:Row)=>a.id.localeCompare(b.id))){
   const stock=await one(tx,'SELECT * FROM ingredients WHERE id=$1 AND outlet_id=$2 AND retired_at IS NULL FOR SHARE',[line.id,output.outlet_id]);requireInventoryStream(actor,stock.category,stock.production_stream);ensure(stock.production_stream===output.production_stream,'STREAM_FORBIDDEN','Production inputs must retain the output stream.',403);
   const scaled=(BigInt(String(line.quantityMilli))*BigInt(data.plannedMilli)+BigInt(String(recipe.yield_milli))-1n)/BigInt(String(recipe.yield_milli));
   let remaining=integer(Number(scaled),'Input quantity');ensure(remaining<=1000000000,'QUANTITY_TOO_LARGE','Reduce the planned production quantity.');needs.push({...line,quantityMilli:remaining});
   const batches=(await tx.query<Row>('SELECT * FROM stock_batches WHERE ingredient_id=$1 AND outlet_id=$2 AND on_hand>reserved AND ((expires_at>now()) OR (expires_at IS NULL AND (expires_on IS NULL OR expires_on>=current_date))) ORDER BY received_at,id FOR UPDATE',[stock.id,output.outlet_id])).rows;
   for(const batch of batches){const amount=Math.min(remaining,num(batch.on_hand)-num(batch.reserved));if(amount<=0)continue;const beforeValue=remainingStockValue(batch),cost=consumedStockValue({...batch,remaining_value:beforeValue},amount);totalCost=integer(totalCost+cost,'Production cost');await tx.query('UPDATE stock_batches SET on_hand=on_hand-$2,remaining_value=$3 WHERE id=$1',[batch.id,amount,beforeValue-cost]);allocations.push({ingredientId:stock.id,name:stock.name,unit:stock.unit,batchId:batch.id,batchNumber:batch.batch_number,quantityMilli:amount,cost});remaining-=amount;if(!remaining)break}
   ensure(remaining===0,'OUT_OF_STOCK','Not enough usable unreserved input stock. No production was recorded.',409);
  }
  const productionId=id(),batchId=data.actualMilli>0?id():null,snapshot={output:{id:output.id,name:output.name,unit:output.unit},batchNumber:data.batchNumber,recipeVersion:data.recipeVersion,referenceYieldMilli:num(recipe.yield_milli),plannedMilli:data.plannedMilli,actualMilli:data.actualMilli,yieldDifferenceMilli:data.actualMilli-data.plannedMilli,needs,allocations,cost:totalCost,expiresAt:data.actualMilli?data.expiresAt:null,reason:data.reason,actor:actor.name};
  if(batchId){const referenceCost=integer(Number((BigInt(totalCost)*1000n+BigInt(data.actualMilli)/2n)/BigInt(data.actualMilli)),'Output unit cost');await tx.query('INSERT INTO stock_batches(id,restro_id,outlet_id,ingredient_id,batch_number,on_hand,unit_cost,remaining_value,expires_at,expires_on) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[batchId,actor.restroId,output.outlet_id,output.id,data.batchNumber,data.actualMilli,referenceCost,totalCost,expiry.expiresAt,expiry.expiresOn])}
  await tx.query('INSERT INTO web_production_batches(id,restro_id,outlet_id,ingredient_id,output_batch_id,batch_number,planned_milli,actual_milli,cost,snapshot,reason,recorded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12)',[productionId,actor.restroId,output.outlet_id,output.id,batchId,data.batchNumber,data.plannedMilli,data.actualMilli,totalCost,json(snapshot),data.reason,actor.employeeId]);
  for(const line of allocations)await tx.query("INSERT INTO stock_movements(id,restro_id,outlet_id,ingredient_id,batch_id,kind,delta_milli,cost,reason,actor_id,production_batch_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",[id(),actor.restroId,output.outlet_id,line.ingredientId,line.batchId,data.actualMilli?'PRODUCTION_CONSUMPTION':'WASTAGE',-line.quantityMilli,line.cost,data.reason,actor.employeeId,productionId]);
  if(batchId)await tx.query("INSERT INTO stock_movements(id,restro_id,outlet_id,ingredient_id,batch_id,kind,delta_milli,cost,reason,actor_id,production_batch_id) VALUES($1,$2,$3,$4,$5,'PRODUCTION_OUTPUT',$6,$7,$8,$9,$10)",[id(),actor.restroId,output.outlet_id,output.id,batchId,data.actualMilli,totalCost,data.reason,actor.employeeId,productionId]);
  await audit(tx,actor,{action:'PRODUCTION_BATCH_RECORDED',entityType:'PRODUCTION_BATCH',entityId:productionId,outletId:output.outlet_id,newState:snapshot,reason:data.reason});return one(tx,'SELECT * FROM web_production_batches WHERE id=$1',[productionId]);
 });
}
