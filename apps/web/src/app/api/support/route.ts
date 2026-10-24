import {NextRequest} from 'next/server';
import {z} from 'zod';
import {readRestaurantSupport,sendRestaurantSupport} from '@dinerdost/services';
import {body,context,csrf,failure,response} from '@/lib/server';
import {supportStream,notifySupportChanged} from '@/lib/support-live';
export const maxDuration=60;
export const runtime='nodejs';
export async function GET(request:NextRequest){try{const {db,actor}=await context({platform:true});const read=()=>readRestaurantSupport(db,actor,request.nextUrl.searchParams.get('id')??undefined);return request.nextUrl.searchParams.get('live')==='1'?await supportStream(request,read):response(await read());}catch(error){return failure(error)}}
export async function POST(request:NextRequest){try{await csrf(request);const {db,actor}=await context({platform:true});const result=await sendRestaurantSupport(db,actor,z.uuid().parse(request.headers.get('idempotency-key')),await body(request));notifySupportChanged();return response(result);}catch(error){return failure(error)}}
