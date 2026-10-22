import {NextRequest} from 'next/server';
import {serviceBoard} from '@dinerdost/services';
import {context,failure,response} from '@/lib/server';
export const runtime='nodejs';
export async function GET(request:NextRequest){try{const {db,actor}=await context(),q=request.nextUrl.searchParams;return response(await serviceBoard(db,actor,{outletId:q.get('outletId'),...(q.get('date')?{date:q.get('date')} :{}),...(q.get('shiftId')?{shiftId:q.get('shiftId')}: {})}));}catch(error){return failure(error)}}
