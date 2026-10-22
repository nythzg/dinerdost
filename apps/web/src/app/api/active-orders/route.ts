import {NextRequest} from 'next/server';
import {z} from 'zod';
import {activeOrderList} from '@dinerdost/services';
import {context,failure,response} from '@/lib/server';
export const runtime='nodejs';
export async function GET(request:NextRequest){try{const {db,actor}=await context();return response(await activeOrderList(db,actor,z.uuid().parse(request.nextUrl.searchParams.get('outletId')),request.nextUrl.searchParams.get('page')??0))}catch(error){return failure(error)}}
