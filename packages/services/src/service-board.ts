import {z} from 'zod';
import type {Database} from '@dinerdost/database';
import {businessDate,businessLocalToISO,can,ensure,requireOutlet,requirePermission,type Actor} from '@dinerdost/core';
import {num,one,type Row} from './shared';

export async function serviceBoard(db:Database,actor:Actor,input:unknown){
 requirePermission(actor,'sessions');ensure(!actor.application||actor.application==='MASTER','APPLICATION_FORBIDDEN','Use Service in the web workspace.',403);
 const data=z.object({outletId:z.uuid(),date:z.iso.date().default(businessDate()),shiftId:z.uuid().optional()}).strict().parse(input);requireOutlet(actor,data.outletId);
 return db.transaction(actor.restroId,async tx=>{
  await one(tx,'SELECT id FROM outlets WHERE id=$1',[data.outletId]);
  const shifts=(await tx.query<Row>('SELECT id,name,starts_local,ends_local FROM employee_shifts WHERE outlet_id=$1 AND active ORDER BY starts_local,name',[data.outletId])).rows;
  const shift=data.shiftId?shifts.find(s=>s.id===data.shiftId):null;ensure(!data.shiftId||shift,'SHIFT_UNAVAILABLE','Choose an active shift in this outlet.',409);
  const startTime=shift?String(shift.starts_local).slice(0,5):'00:00',endTime=shift?String(shift.ends_local).slice(0,5):'00:00';let endDate=data.date;
  if(!shift||endTime<=startTime){const next=new Date(data.date+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+1);endDate=next.toISOString().slice(0,10);}
  const start=businessLocalToISO(data.date+'T'+startTime),end=businessLocalToISO(endDate+'T'+endTime),all=actor.role!=='WAITER';
  const scope=[data.outletId,all,actor.employeeId,start,end];
  const requests=(await tx.query<Row>(`SELECT r.*,t.label AS table_label,coalesce(r.completed_at,resolved.at) AS resolved_at FROM service_requests r
   LEFT JOIN table_sessions s ON s.id=r.session_id AND s.restro_id=r.restro_id
   JOIN dining_tables t ON t.id=coalesce(s.table_id,r.table_id) AND t.restro_id=r.restro_id
   LEFT JOIN LATERAL(SELECT max(a.occurred_at) AS at FROM audit_events a WHERE r.completed_at IS NULL AND r.state='REJECTED' AND a.restro_id=r.restro_id AND a.entity_type='SERVICE_REQUEST' AND a.entity_id=r.id::text AND a.action IN ('SERVICE_COMPLETED','SERVICE_REJECTED')) resolved ON true
   WHERE r.outlet_id=$1 AND ($2 OR s.owner_employee_id=$3 OR (s.id IS NULL AND (r.owner_id IS NULL OR r.owner_id=$3)))
   AND (r.state IN ('OPEN','ACCEPTED','ESCALATED') OR (coalesce(r.completed_at,resolved.at)>=$4 AND coalesce(r.completed_at,resolved.at)<$5))
   ORDER BY CASE WHEN r.state IN ('OPEN','ACCEPTED','ESCALATED') THEN 0 ELSE 1 END,r.created_at DESC`,scope)).rows;
  let ready:Row[]=[],served=0;
  if(can(actor,'orders')){
   ready=(await tx.query<Row>(`SELECT r.id,r.id AS round_id,r.order_id,r.version AS round_version,r.round_number,r.kot_status AS round_kot_status,coalesce($2 OR s.owner_employee_id=$3,false) AS can_serve,o.number,t.label AS table_label,s.owner_employee_id,coalesce(p.pinned,false) AS pinned,k.stations AS station,k.ready_at
    FROM order_rounds r JOIN orders o ON o.id=r.order_id AND o.restro_id=r.restro_id
    LEFT JOIN table_sessions s ON s.id=o.session_id AND s.restro_id=o.restro_id LEFT JOIN dining_tables t ON t.id=s.table_id AND t.restro_id=s.restro_id LEFT JOIN order_pins p ON p.order_id=o.id AND p.restro_id=o.restro_id
    JOIN LATERAL(SELECT string_agg(DISTINCT station,', ' ORDER BY station) AS stations,max(updated_at) AS ready_at,bool_and(status='READY') AS all_ready,count(*) AS count FROM kot_tickets WHERE round_id=r.id AND restro_id=r.restro_id) k ON k.count>0 AND k.all_ready
    WHERE o.outlet_id=$1 AND r.status='ACCEPTED' AND r.kot_status='READY' AND o.status NOT IN ('SETTLED','VOIDED','REJECTED')
    ORDER BY coalesce(p.pinned,false) DESC,k.ready_at,r.id`,scope.slice(0,3))).rows;
   const row=await one(tx,`SELECT count(*) AS count FROM order_rounds r JOIN orders o ON o.id=r.order_id AND o.restro_id=r.restro_id LEFT JOIN table_sessions s ON s.id=o.session_id AND s.restro_id=o.restro_id
    JOIN LATERAL(SELECT max(updated_at) AS served_at FROM kot_tickets WHERE round_id=r.id AND restro_id=r.restro_id AND status='SERVED') k ON true
    WHERE o.outlet_id=$1 AND ($2 OR s.owner_employee_id=$3) AND r.status='ACCEPTED' AND r.kot_status='SERVED' AND k.served_at>=$4 AND k.served_at<$5`,scope);served=num(row.count);
  }
  const serveRequests=ready.filter(r=>r.can_serve).length;
  const tableRequests=requests.filter(r=>['OPEN','ACCEPTED','ESCALATED'].includes(r.state)).length,completed=requests.length-tableRequests+served,awaiting=tableRequests+serveRequests;
  return {outletId:data.outletId,date:data.date,shiftId:data.shiftId??null,start,end,shifts,ready,requests,counts:{Total:awaiting+completed,'Table requests':tableRequests,'Serve requests':serveRequests,Completed:completed,Awaiting:awaiting}};
 });
}
