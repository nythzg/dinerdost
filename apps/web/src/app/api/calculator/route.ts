import {NextRequest} from 'next/server';
import {z} from 'zod';
import {calculatorHistory,calculatorAction} from '@dinerdost/services';
import {body,context,csrf,failure,response} from '@/lib/server';
export const runtime='nodejs';
export async function GET(request:NextRequest){try{const {db,actor}=await context();return response(await calculatorHistory(db,actor,request.nextUrl.searchParams.get('page')??0))}catch(error){return failure(error)}}
export async function POST(request:NextRequest){try{await csrf(request);const {db,actor}=await context();const key=z.uuid().parse(request.headers.get('idempotency-key'));return response(await calculatorAction(db,actor,key,await body(request)))}catch(error){return failure(error)}}
