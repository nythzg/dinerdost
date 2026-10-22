import { NextRequest } from 'next/server';
import { webReplacementSource } from '@dinerdost/services';
import { context, failure, response } from '@/lib/server';
export const runtime='nodejs';
export async function GET(request:NextRequest){try{const {db,actor}=await context();return response(await webReplacementSource(db,actor,request.nextUrl.searchParams.get('orderId')??''))}catch(error){return failure(error)}}
