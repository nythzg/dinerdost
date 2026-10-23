import {z} from 'zod';
import type {Database,Sql} from '@dinerdost/database';
import {id,json,one,num,type Row} from './shared';
import {appendPlatformAudit,platformMutation,requirePlatformMember,assertPlatformScope,type PlatformActor} from './platform-console';
import {processPlatformBilling} from './platform-billing';
import {platformAnalyticsRead} from './platform-analytics';

async function perform(tx:Sql,actor:{userId:string;name:string}){
 const today=String((await one(tx,"SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date::text AS day")).day);
 const billing=await processPlatformBilling(tx,actor,today);let riskTasks=0,escalations=0;
 const risk=(await tx.query<Row>("SELECT data FROM platform_operational_config WHERE key='risk'")).rows[0]?.data;
 if(risk?.enabled&&risk.createTasks){const from=new Date(Date.parse(today+'T00:00:00Z')-13*86400000).toISOString().slice(0,10),report=await platformAnalyticsRead(tx,null,{from,to:today});
  const week=String((await one(tx,"SELECT date_trunc('week',now() AT TIME ZONE 'Asia/Kolkata')::date::text AS day")).day);
  for(const row of report.risk.filter(r=>r.atRisk)){
   const key='risk:'+row.id+':'+week,taskId=id(),payload={restaurantName:row.name,score:row.score,currentOrders:row.current_orders,previousOrders:row.previous_orders,inactiveDays:row.inactiveDays,basis:row.basis};
   const added=await tx.query("INSERT INTO platform_tasks(id,restro_id,source_key,kind,data) VALUES($1,$2,$3,'ADOPTION',$4::jsonb) ON CONFLICT(source_key) DO NOTHING RETURNING id",[taskId,row.id,key,json(payload)]);riskTasks+=added.rows.length;
   if(added.rows.length)await appendPlatformAudit(tx,actor,'PLATFORM_ADOPTION_TASK_CREATED',row.id,'Explicitly enabled observed-usage rule',null,{id:taskId,...payload});
  }
 }
 const desk=(await tx.query<Row>("SELECT data FROM platform_operational_config WHERE key='serviceDesk'")).rows[0]?.data;
 if(desk){const tickets=(await tx.query<Row>("SELECT r.id,r.tenant_id,r.created_at FROM platform_records r WHERE r.kind='TICKET' AND NOT r.archived AND r.data->>'status'<>'RESOLVED' AND r.tenant_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM platform_case_details c WHERE c.ticket_id=r.id)")).rows;for(const ticket of tickets)await tx.query("INSERT INTO platform_case_details(ticket_id,restro_id,data,due_at) VALUES($1,$2,'{}',$3::timestamptz+($4||' hours')::interval) ON CONFLICT DO NOTHING",[ticket.id,ticket.tenant_id,ticket.created_at,String(desk.escalateAfterHours)]);}
 const overdue=(await tx.query<Row>("SELECT c.*,r.data AS ticket_data FROM platform_case_details c JOIN platform_records r ON r.id=c.ticket_id WHERE c.due_at<now() AND c.escalated_at IS NULL AND NOT r.archived AND r.data->>'status'<>'RESOLVED' ORDER BY c.ticket_id FOR UPDATE OF c,r")).rows;
 for(const c of overdue){await tx.query('UPDATE platform_case_details SET escalated_at=now(),version=version+1 WHERE ticket_id=$1',[c.ticket_id]);await tx.query("UPDATE platform_records SET data=data||'{\"priority\":\"URGENT\"}'::jsonb,version=version+1,updated_at=now() WHERE id=$1",[c.ticket_id]);await tx.query("INSERT INTO platform_tasks(id,restro_id,source_key,kind,data) VALUES($1,$2,$3,'ESCALATION',$4::jsonb) ON CONFLICT(source_key) DO NOTHING",[id(),c.restro_id,'escalation:'+c.ticket_id,json({ticketId:c.ticket_id,dueAt:c.due_at})]);escalations++;await appendPlatformAudit(tx,actor,'PLATFORM_TICKET_ESCALATED',c.restro_id??c.ticket_id,'Configured support deadline exceeded',null,{ticketId:c.ticket_id});}
 const start=Date.now();await tx.query('SELECT 1');const latency=Date.now()-start;
 const stats=await one(tx,'SELECT (SELECT count(*) FROM pg_stat_activity WHERE datname=current_database()) AS connections,pg_database_size(current_database()) AS bytes');
 const observations=(await tx.query('SELECT xact_commit,xact_rollback,blks_read,blks_hit,deadlocks,temp_bytes FROM pg_stat_database WHERE datname=current_database()')).rows[0]??{};
 await tx.query('INSERT INTO platform_db_samples(id,latency_ms,connections,database_bytes,observations) VALUES($1,$2,$3,$4,$5::jsonb)',[id(),latency,stats.connections,stats.bytes,json(observations)]);
 await tx.query("DELETE FROM platform_http_samples WHERE created_at<now()-interval '7 days'");await tx.query("DELETE FROM platform_db_samples WHERE created_at<now()-interval '7 days'");
 const result={...billing,riskTasks,escalations,day:today,externalMessagesSent:0,providerTransfersInitiated:0};
 await tx.query("INSERT INTO platform_maintenance_runs(id,state,summary) VALUES($1,'SUCCESS',$2::jsonb)",[id(),json(result)]);return result;
}
export async function runPlatformMaintenance(db:Database,actor:PlatformActor,key:string,input:unknown){const data=z.object({reason:z.string().trim().min(5).max(500)}).strict().parse(input);return platformMutation(db,actor,key,'overview','PLATFORM_MAINTENANCE_RUN',data,data.reason,async tx=>{const admin=await requirePlatformMember(tx,actor);assertPlatformScope(admin);const result=await perform(tx,actor);await appendPlatformAudit(tx,actor,'PLATFORM_MAINTENANCE_RUN','local',data.reason,null,result);return result;});}
export async function localPlatformMaintenance(db:Database){return db.transaction(null,async tx=>{
 const exists=(await tx.query("SELECT to_regclass('public.platform_operational_config') AS present")).rows[0]?.present;if(!exists||!(await tx.query("SELECT name FROM schema_migrations WHERE name='060_platform_fee_corrections.sql'")).rows.length)return {skipped:true};
 await one(tx,'SELECT * FROM platform_audit_head WHERE singleton=true FOR UPDATE');
 const user=(await tx.query<Row>("SELECT u.id,u.name FROM platform_members m JOIN users u ON u.id=m.user_id WHERE m.role='SUPERADMIN' AND m.enabled AND NOT u.disabled ORDER BY u.id LIMIT 1")).rows[0];if(!user)return {skipped:true};
 return perform(tx,{userId:user.id,name:'Local system · '+user.name});
});}
export async function recordPlatformHttpSample(db:Database,route:string,status:number,latency:number){
 z.enum(['/api/superadmin','/api/superadmin/operations','/api/workspace','/api/commands','/api/enterprise']).parse(route);
 if((await db.query("SELECT to_regclass('public.platform_http_samples') AS present")).rows[0]?.present)await db.query('INSERT INTO platform_http_samples(id,route,status,latency_ms) VALUES($1,$2,$3,$4)',[id(),route,status,Math.max(0,Math.round(latency))]);
}
export async function platformTelemetry(db:Database,actor:PlatformActor){return db.transaction(null,async tx=>{
 const admin=await requirePlatformMember(tx,actor,'overview');assertPlatformScope(admin);
 const routes=(await tx.query(`SELECT route,count(*) AS requests,count(*) FILTER(WHERE status>=400) AS errors,count(*) FILTER(WHERE status>=500) AS server_errors,round(avg(latency_ms)) AS average_ms,percentile_cont(.95) WITHIN GROUP(ORDER BY latency_ms) AS p95_ms FROM platform_http_samples WHERE created_at>=now()-interval '1 hour' GROUP BY route ORDER BY route`)).rows;
 return {routes,database:(await tx.query('SELECT * FROM platform_db_samples ORDER BY created_at DESC LIMIT 60')).rows,queue:(await tx.query('SELECT state,count(*) AS count,max(attempts) AS maximum_attempts FROM outbox GROUP BY state ORDER BY state')).rows,maintenance:(await tx.query('SELECT * FROM platform_maintenance_runs ORDER BY created_at DESC LIMIT 20')).rows,providerWebhooks:'DEFERRED',sampleRetentionDays:7};
});}
