import {platformFeatureFlags} from './platform-features';
import {restaurantFeatureEnabled,restaurantActionFeature,restaurantPlanModules,platformFeatures} from '@dinerdost/core';
import type {Database,Sql} from '@dinerdost/database';
import {ensure,type Actor} from '@dinerdost/core';
export async function platformPolicy(tx:Sql,lock=false){
 // An older local database remains usable until the verified additive migration.
 if(!(await tx.query<{present:string|null}>("SELECT to_regclass('public.platform_tenant_policies') AS present")).rows[0].present)return null;
 if(lock)return (await tx.query<{policy:Record<string,any>|null}>('SELECT platform_lock_own_policy() AS policy')).rows[0].policy;
 return (await tx.query<Record<string,any>>('SELECT * FROM platform_tenant_policies')).rows[0]??null;
}
const actionModules:[RegExp,string][]=[[/INVENTORY|STOCK|INGREDIENT|RECIPE|PRODUCTION|MATERIAL|EXPIRY|WASTE/,'inventory'],[/PURCHASE|VENDOR|PROCUREMENT|SUPPLIER/,'procurement'],[/LOYALTY|ENTITLEMENT|COUPON|REWARD/,'loyalty'],[/CUSTOMER_PROFILE|CUSTOMER_SAVED/,'crm'],[/RESERVATION/,'reservations'],[/EXPENSE|PAYROLL|SALARY/,'finance']];
export async function guardPlatformCommand(tx:Sql,actor:{role:string;application?:string},action:string,input:any){
 if(actor.role==='SYSTEM'||(actor.role==='CUSTOMER'&&!actor.application)||(actor.application&&actor.application!=='MASTER'))return;
 const flags=await platformFeatureFlags(tx),recordKind=action==='RECORD_DECISION'?(await tx.query('SELECT kind FROM records WHERE id=$1',[input?.recordId])).rows[0]?.kind:undefined,feature=restaurantActionFeature(recordKind?'RECORD_SAVED':action,recordKind?{kind:recordKind}:input);
 for(const key of [...(feature?[feature]:[]),...((actor as {webFeatures?:string[]}).webFeatures??[])])ensure(restaurantFeatureEnabled(flags,key),'FEATURE_DISABLED','This feature is disabled by platform administration.',403);
 const policy=await platformPolicy(tx,true);if(!policy)return;
 ensure(policy.status==='ACTIVE','TENANT_PAUSED','This restaurant is paused. Historical records remain available; contact Diner Dost support.',403);
 const recordModule:Record<string,string>={vendors:'procurement',purchases:'procurement',expenses:'finance',reservations:'reservations',campaigns:'crm'};
 const decisionKind=action==='RECORD_DECISION'?(await tx.query<{kind:string}>('SELECT kind FROM records WHERE id=$1',[input?.recordId])).rows[0]?.kind:null;
 const module=(action==='RECORD_SAVED'?recordModule[input?.kind]:decisionKind?recordModule[decisionKind]:null)??actionModules.find(([pattern])=>pattern.test(action))?.[1]??(action==='ORDER_ROUND_CREATED'||action==='CUSTOMER_D2C_ORDER_SUBMITTED'?'pos':action==='CUSTOMER_ORDER_SUBMITTED'?'qr':null);
 if(module&&Array.isArray(policy.features))ensure(policy.features.includes(module),'PLAN_FEATURE_UNAVAILABLE','This web module is not included in the assigned plan.',403);
 if((action==='EMPLOYEE_CREATED'||action==='STAFF_INVITED')&&policy.staff_limit){
  const row=(await tx.query<{count:string}>("SELECT (SELECT count(*) FROM employees WHERE active)+(SELECT count(*) FROM staff_invitations WHERE state='PENDING' AND expires_at>now()) AS count")).rows[0];ensure(Number(row.count)<policy.staff_limit,'PLAN_STAFF_LIMIT','The assigned staff seat limit has been reached.',409);
 }
 if(['EMPLOYEE_ACCESS_CHANGED','EMPLOYEE_ROLE_CHANGED'].includes(action)&&input?.active===true&&policy.staff_limit){const employee=(await tx.query<{active:boolean}>('SELECT active FROM employees WHERE id=$1',[input.employeeId])).rows[0];if(employee&&!employee.active){const count=Number((await tx.query<{count:string}>("SELECT (SELECT count(*) FROM employees WHERE active)+(SELECT count(*) FROM staff_invitations WHERE state='PENDING' AND expires_at>now()) AS count")).rows[0].count);ensure(count<policy.staff_limit,'PLAN_STAFF_LIMIT','The assigned staff seat limit has been reached.',409);}}
 if(action==='OUTLET_SAVED'&&!input?.id&&policy.outlet_limit){const count=Number((await tx.query<{count:string}>('SELECT count(*) AS count FROM outlets')).rows[0].count);ensure(count<policy.outlet_limit,'PLAN_OUTLET_LIMIT','The assigned outlet limit has been reached.',409);}

}
export async function platformWebAccess(db:Database,actor:Actor){
 if(actor.application&&actor.application!=='MASTER')return;
 const policy=await db.transaction(actor.restroId,tx=>platformPolicy(tx));ensure(policy?.status!=='TERMINATED','TENANT_TERMINATED','This restaurant account has been terminated. Contact Diner Dost support.',403);
}
export async function platformPublicAccess(db:Database,target:{tableKey?:string;slug?:string},module?:string){
 const query=target.tableKey?'SELECT restro_id FROM dining_tables WHERE public_key=$1':'SELECT restro_id FROM storefronts WHERE slug=$1';
 const row=(await db.query<{restro_id:string}>(query,[target.tableKey??target.slug])).rows[0];if(!row)return;
 const policy=await db.transaction(row.restro_id,tx=>platformPolicy(tx));ensure(!policy||policy.status==='ACTIVE','RESTAURANT_UNAVAILABLE','This restaurant is not currently accepting web requests.',403);
 const flags=await db.transaction(row.restro_id,tx=>platformFeatureFlags(tx));
 if(module)ensure(restaurantFeatureEnabled(flags,target.slug?'storefront':'qr'),'FEATURE_DISABLED','This ordering feature is unavailable.',403);
 if(module&&policy&&Array.isArray(policy.features))ensure(policy.features.includes(module),'PLAN_FEATURE_UNAVAILABLE','This web ordering feature is unavailable.',403);
}

export async function assertPlatformNewOrder(tx:Sql,web:boolean){
 if(!web)return;const policy=await platformPolicy(tx,true);if(!policy?.order_limit)return;
 const count=Number((await tx.query<{count:string}>("SELECT count(*) AS count FROM orders WHERE created_at>=date_trunc('month',now())")).rows[0].count);
 ensure(count<policy.order_limit,'PLAN_ORDER_LIMIT','The monthly web order limit has been reached.',409);
}
export async function assertPlatformInviteAcceptance(tx:Sql,web:boolean){
 if(!web)return;const policy=await platformPolicy(tx,true);if(!policy)return;
 ensure(policy.status==='ACTIVE','TENANT_PAUSED','This restaurant is paused. Contact the owner.',403);
 if(policy.staff_limit){const count=Number((await tx.query<{count:string}>("SELECT (SELECT count(*) FROM employees WHERE active)+(SELECT count(*) FROM staff_invitations WHERE state='PENDING' AND expires_at>now()) AS count")).rows[0].count);ensure(count<=policy.staff_limit,'PLAN_STAFF_LIMIT','The assigned staff seat limit has been reached.',409);}
}

export async function assertPlatformFeature(db:Database,actor:Actor,feature:string){
 if(actor.application&&actor.application!=='MASTER')return;
 const {policy,flags}=await db.transaction(actor.restroId,async tx=>({policy:await platformPolicy(tx),flags:await platformFeatureFlags(tx)}));
 ensure(restaurantFeatureEnabled(flags,feature),'FEATURE_DISABLED','This feature is disabled by platform administration.',403);
 const module=restaurantPlanModules[feature]??feature;
 if(policy&&Array.isArray(policy.features)&&platformFeatures.includes(module as typeof platformFeatures[number]))ensure(policy.features.includes(module),'PLAN_FEATURE_UNAVAILABLE','This web module is not included in the assigned plan.',403);
}
