import type {Sql} from '@dinerdost/database';
import {ensure} from '@dinerdost/core';
import {z} from 'zod';
import {one,json,type Row} from './shared';

export const setupSelection=z.object({taxId:z.uuid().nullable().default(null),taxonomyIds:z.array(z.uuid()).max(100).default([]),roleIds:z.array(z.uuid()).max(20).default([])}).strict();
export async function applyPlatformSetup(tx:Sql,tenantId:string,outletId:string,selection:z.infer<typeof setupSelection>){
 const ids=[...selection.taxonomyIds,...selection.roleIds,...(selection.taxId?[selection.taxId]:[])];
 const records=ids.length?(await tx.query<Row>('SELECT * FROM platform_records WHERE id=ANY($1::uuid[]) AND NOT archived',[ids])).rows:[];
 ensure(records.length===new Set(ids).size,'TEMPLATE_UNAVAILABLE','Every selected template must exist and be active.');
 const get=(id:string,kind:string)=>{const record=records.find(r=>r.id===id&&r.kind===kind);ensure(record,'INVALID_TEMPLATE','The selected record is not the expected template type.');return record};
 const tags=selection.taxonomyIds.map(id=>{const r=get(id,'TAXONOMY');return {id:r.id,name:r.name,type:r.data.type,description:r.data.description??''}});
 const roles=selection.roleIds.map(id=>{const r=get(id,'ROLE_TEMPLATE');return {id:r.id,name:r.name,role:r.data.role,notes:r.data.notes??''}});
 if(!roles.length)for(const role of ['MANAGER','CASHIER','WAITER','KITCHEN'])roles.push({id:'builtin-'+role,name:role==='KITCHEN'?'Chef':role[0]+role.slice(1).toLowerCase(),role,notes:'Standard existing restaurant role; core permissions are unchanged.'});
 if(selection.taxId){const tax=get(selection.taxId,'TAX_TEMPLATE'),bps=Math.round(Number(tax.data.rate)*100);ensure(Number.isSafeInteger(bps)&&bps>=0&&bps<=10000,'INVALID_TAX','Supply a valid tax rate.');await tx.query('UPDATE outlets SET tax_bps=$3,tax_components=$4::jsonb,version=version+1 WHERE restro_id=$1 AND id=$2',[tenantId,outletId,bps,json([{name:tax.data.taxName,rateBps:bps}])]);}
 await tx.query(`INSERT INTO platform_tenant_setup(restro_id,taxonomies,role_templates) VALUES($1,$2::jsonb,$3::jsonb) ON CONFLICT(restro_id) DO UPDATE SET taxonomies=excluded.taxonomies,role_templates=excluded.role_templates,version=platform_tenant_setup.version+1`,[tenantId,json(tags),json(roles)]);
 return {tags,roles};
}
export async function applyOnboardingDefault(tx:Sql,tenantId:string,outletId:string){
 if(!(await tx.query("SELECT to_regclass('public.platform_operational_config') AS present")).rows[0]?.present)return;
 const record=(await tx.query<Row>("SELECT data FROM platform_operational_config WHERE key='onboarding'")).rows[0];
 await applyPlatformSetup(tx,tenantId,outletId,setupSelection.parse(record?.data??{}));
}
