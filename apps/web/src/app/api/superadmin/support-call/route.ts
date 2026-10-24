import {NextRequest} from 'next/server';
import {z} from 'zod';
import {readSupportCall,changeSupportCall} from '@dinerdost/services';
import {body,platformContext,csrf,failure,response} from '@/lib/server';
import {notifySupportChanged} from '@/lib/support-live';
export const runtime='nodejs';
export async function GET(request:NextRequest){try{const {db,actor}=await platformContext();return response(await readSupportCall(db,actor,z.uuid().parse(request.nextUrl.searchParams.get('id')),true));}catch(error){return failure(error)}}
export async function POST(request:NextRequest){try{await csrf(request);const {db,actor}=await platformContext();const result=await changeSupportCall(db,actor,z.uuid().parse(request.headers.get('idempotency-key')),await body(request),true);notifySupportChanged();return response(result);}catch(error){return failure(error)}}
