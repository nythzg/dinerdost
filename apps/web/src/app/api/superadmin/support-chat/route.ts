import {NextRequest} from 'next/server';
import {z} from 'zod';
import {readPlatformSupportChat,readPlatformSupportNotifications,managePlatformSupportChat} from '@dinerdost/services';
import {body,platformContext,csrf,failure,response} from '@/lib/server';
import {supportStream,notifySupportChanged} from '@/lib/support-live';
export const maxDuration=60;
export const runtime='nodejs';
export async function GET(request:NextRequest){try{const {db,actor}=await platformContext(),q=request.nextUrl.searchParams;const read=()=>q.get('notifications')==='1'?readPlatformSupportNotifications(db,actor):readPlatformSupportChat(db,actor,q.get('id')??undefined,{search:q.get('search')??'',status:q.get('status')??'ALL',queue:q.get('queue')??'ALL',assignment:q.get('assignment')??'ALL',offset:Number(q.get('offset')??0)});return q.get('live')==='1'?await supportStream(request,read):response(await read());}catch(error){return failure(error)}}
export async function POST(request:NextRequest){try{await csrf(request);const {db,actor}=await platformContext();const result=await managePlatformSupportChat(db,actor,z.uuid().parse(request.headers.get('idempotency-key')),await body(request));notifySupportChanged();return response(result);}catch(error){return failure(error)}}
