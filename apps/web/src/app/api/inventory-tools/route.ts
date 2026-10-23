import {NextRequest} from 'next/server';
import {z} from 'zod';
import {ingredientPlan,ingredientExpiryImpact,orderIngredientReport,outletExpiryReport} from '@dinerdost/services';
import {context,csrf,body,failure,response} from '@/lib/server';
export const runtime='nodejs';
export async function POST(request:NextRequest){try{await csrf(request);const {db,actor}=await context();return response(await ingredientPlan(db,actor,await body(request)))}catch(error){return failure(error)}}
export async function GET(request:NextRequest){try{const {db,actor}=await context(),query=request.nextUrl.searchParams;if(query.get('kind')==='order')return response(await orderIngredientReport(db,actor,z.uuid().parse(query.get('orderId'))));if(query.get('kind')==='expiry-outlet')return response(await outletExpiryReport(db,actor,z.uuid().parse(query.get('outletId'))));return response(await ingredientExpiryImpact(db,actor,{outletId:query.get('outletId'),ingredientId:query.get('ingredientId')}))}catch(error){return failure(error)}}
