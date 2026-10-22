import {z} from "zod";
import type {Database} from "@dinerdost/database";
import {can,ensure,requireOutlet,type Actor} from "@dinerdost/core";
import {command} from "./shared";
export async function dismissAlert(db:Database,actor:Actor,key:string,input:unknown){
 const data=z.object({outletId:z.uuid(),kind:z.enum(['STOCK','OVERVIEW']),stateKey:z.string().min(1).max(200)}).strict().parse(input);
 requireOutlet(actor,data.outletId);
 ensure(data.kind==='STOCK'?can(actor,'inventory'):can(actor,'reports')||can(actor,'payments'),"FORBIDDEN","This alert is unavailable to your role.",403);
 return command(db,actor,key,'ALERT_DISMISSED',data,async tx=>{await tx.query("INSERT INTO ui_alert_dismissals(restro_id,employee_id,outlet_id,kind,state_key) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",[actor.restroId,actor.employeeId,data.outletId,data.kind,data.stateKey]);return {ok:true}});
}
