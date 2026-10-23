import {observePlatformRoute} from '@/lib/platform-local-runtime';
import {NextRequest} from 'next/server';
import {enterpriseBrands,enterpriseReport} from '@dinerdost/services';
import {context,response,failure} from '@/lib/server';
async function handleGET(request:NextRequest){try{const {db,actor}=await context(),q=request.nextUrl.searchParams;return response(q.has('brandId')?await enterpriseReport(db,actor,{brandId:q.get('brandId'),from:q.get('from'),to:q.get('to')}):await enterpriseBrands(db,actor));}catch(error){return failure(error)}}

export const GET=observePlatformRoute('/api/enterprise',handleGET);
