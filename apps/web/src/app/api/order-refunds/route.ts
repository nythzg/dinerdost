import {NextRequest} from 'next/server';
import {pendingWebRefunds,webRefunds} from '@dinerdost/services';
import {context,failure,response} from '@/lib/server';
export const runtime='nodejs';
export async function GET(request:NextRequest){try{const {db,actor}=await context(),q=request.nextUrl.searchParams;return response(q.get('kind')==='pending'?await pendingWebRefunds(db,actor,q.get('outletId')??''):await webRefunds(db,actor,q.get('orderId')??''))}catch(error){return failure(error)}}
