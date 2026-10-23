import {NextRequest} from 'next/server';
import {z} from 'zod';
import {getWebBillSettings} from '@dinerdost/services';
import {context,failure,response} from '@/lib/server';
export const runtime='nodejs';
export async function GET(request:NextRequest){
 try{const {db,actor}=await context(),outletId=z.uuid().parse(request.nextUrl.searchParams.get('outletId'));return response(await getWebBillSettings(db,actor,outletId));}catch(error){return failure(error);}
}
