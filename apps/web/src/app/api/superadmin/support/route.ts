import {NextRequest} from 'next/server';
import {context,failure,response} from '@/lib/server';
import {readPlatformSupportView} from '@dinerdost/services';
export async function GET(request:NextRequest){try{const {db,actor}=await context({platform:true});return response(await readPlatformSupportView(db,actor,request.nextUrl.searchParams.get('id')??''));}catch(error){return failure(error)}}
