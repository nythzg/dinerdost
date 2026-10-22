import 'server-only';
import type {Database} from '@dinerdost/database';
import {expireCalculatorData} from '@dinerdost/services';

declare global {var dinerdostCalculatorRetention:NodeJS.Timeout|undefined}
export function startLocalCalculatorRetention(db:Database){
 // Local server maintenance only: never start a background writer against a cloud database.
 if(process.env.DATABASE_URL||process.env.VERCEL||process.env.NODE_ENV==='production'||globalThis.dinerdostCalculatorRetention)return;
 let running=false;
 const sweep=async()=>{
  if(running)return;running=true;
  try{await db.transaction(null,tx=>expireCalculatorData(tx))}
  catch{console.error('Local calculator history cleanup failed; it will retry in one minute.')}
  finally{running=false}
 };
 globalThis.dinerdostCalculatorRetention=setInterval(()=>void sweep(),60000);
 globalThis.dinerdostCalculatorRetention.unref();
 void sweep();
}
