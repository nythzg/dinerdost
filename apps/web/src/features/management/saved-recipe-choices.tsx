"use client";
import {DataTable} from '@/components/ui';
import {label,type Row} from '@/lib/client';
export function SavedRecipeChoices({items}:{items:Row[]}){
 const saved=items.filter(i=>i.recipe_snapshot);
 if(!saved.length)return null;
 return <><h3>Saved recipe choices</h3>{saved.map(item=><section key={item.id}><h4>{item.name} · {label(item.recipe_snapshot.channel)}</h4>{!item.recipe_snapshot.baseConfigured&&<p className="muted">Base recipe not configured. Complete food cost is unknown.</p>}<DataTable headers={['Component','Ingredient','Per sell unit']} rows={item.recipe_snapshot.components.map((line:Row)=>[label(line.kind),line.name,Number(line.quantityMilli)/1000+' '+line.unit])} empty="No ingredients configured for this saved line."/></section>)}</>;
}
