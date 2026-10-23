import 'server-only';
import type {Database} from '@dinerdost/database';
import {getDatabase} from '@dinerdost/database';
import {localPlatformMaintenance,recordPlatformHttpSample} from '@dinerdost/services';
import type {NextRequest} from 'next/server';
type Runtime={running:boolean;timer:ReturnType<typeof setInterval>};
declare global{var ddPlatformRuntimes:WeakMap<Database,Runtime>|undefined}
const runtimes=globalThis.ddPlatformRuntimes??=new WeakMap<Database,Runtime>();
export function startLocalPlatformRuntime(db:Database){
 if(process.env.NODE_ENV!=='development'||process.env.VERCEL||runtimes.has(db))return;
 const state={running:false,timer:undefined as unknown as ReturnType<typeof setInterval>};
 const tick=async()=>{if(state.running)return;state.running=true;try{await localPlatformMaintenance(db)}catch(error){console.error('Local platform processing failed',{code:(error as any)?.code??'LOCAL_PROCESSING_FAILED'})}finally{state.running=false}};
 state.timer=setInterval(()=>void tick(),60000);state.timer.unref?.();runtimes.set(db,state);
}
export function observePlatformRoute(route:string,handler:(request:NextRequest)=>Promise<Response>){return async(request:NextRequest)=>{const start=Date.now(),reply=await handler(request);try{const db=await getDatabase();await recordPlatformHttpSample(db,route,reply.status,Date.now()-start);startLocalPlatformRuntime(db)}catch(error){console.error('Local telemetry unavailable',{code:(error as any)?.code??'TELEMETRY_UNAVAILABLE'})}return reply};}
