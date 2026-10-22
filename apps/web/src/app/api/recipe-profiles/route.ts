import {NextRequest} from 'next/server';
import {recipeProfiles} from '@dinerdost/services';
import {context,failure,response} from '@/lib/server';
export const runtime='nodejs';
export async function GET(request:NextRequest){try{const {db,actor}=await context();return response(await recipeProfiles(db,actor,request.nextUrl.searchParams.get('itemId')??''))}catch(error){return failure(error)}}
