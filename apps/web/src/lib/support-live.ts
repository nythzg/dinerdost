import 'server-only';
import type {NextRequest} from 'next/server';

const registry=globalThis as typeof globalThis&{dinerdostSupportListeners?:Set<()=>void>};
const listeners=registry.dinerdostSupportListeners??=new Set<()=>void>();
export function notifySupportChanged(){for(const listener of listeners)listener()}

export async function supportStream(request:NextRequest,read:()=>Promise<unknown>){
 const initial=JSON.stringify(await read());
 let dispose=()=>{};
 const stream=new ReadableStream<Uint8Array>({
  start(controller){
   const encoder=new TextEncoder();let closed=false,reading=false,pending=false,last=initial;
   const write=(value:string)=>{if(!closed)controller.enqueue(encoder.encode(value))};
   const finish=(close=true)=>{if(closed)return;closed=true;listeners.delete(refresh);clearInterval(heartbeat);clearTimeout(expiry);request.signal.removeEventListener('abort',abort);if(close)controller.close()};
   const abort=()=>finish();
   async function refresh(){
    if(closed)return;if(reading){pending=true;return}reading=true;
    try{do{pending=false;const value=JSON.stringify(await read());if(value!==last){write('data: '+value+'\n\n');last=value}}while(pending&&!closed)}
    catch{write('event: support-error\ndata: {}\n\n');finish()}
    finally{reading=false}
   }
   // shortcut: immediate pushes share one worker; the authorized heartbeat catches other workers until shared pub/sub is configured.
   const heartbeat=setInterval(()=>{write(': keep-alive\n\n');void refresh()},15000);
   const expiry=setTimeout(()=>finish(),55000);
   dispose=()=>finish(false);listeners.add(refresh);request.signal.addEventListener('abort',abort,{once:true});
   write('retry: 1000\ndata: '+initial+'\n\n');void refresh();if(request.signal.aborted)finish();
  },
  cancel(){dispose()},
 });
 return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-store, no-transform','X-Accel-Buffering':'no'}});
}
