import {NextRequest} from 'next/server';
import {productionWorkspace} from '@dinerdost/services';
import {context,failure,response} from '@/lib/server';
export const runtime='nodejs';
export async function GET(request:NextRequest){try{const {db,actor}=await context();return response(await productionWorkspace(db,actor,request.nextUrl.searchParams.get('outletId')??''))}catch(error){return failure(error)}}
