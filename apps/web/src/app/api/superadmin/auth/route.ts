import {cookies} from 'next/headers';
import {NextRequest} from 'next/server';
import {z} from 'zod';
import {getDatabase} from '@dinerdost/database';
import {inspectPlatformEnrolment,completePlatformEnrolment,loginPlatform,logoutPlatform,logout,SESSION_COOKIE,PLATFORM_SESSION_COOKIE} from '@dinerdost/services';
import {body,csrf,failure,response} from '@/lib/server';
export const runtime='nodejs';
export async function POST(request:NextRequest){try{await csrf(request);const db=await getDatabase(),data=z.object({action:z.enum(['inspect','complete','login','logout']),input:z.unknown().optional()}).strict().parse(await body(request)),ip=request.headers.get('x-forwarded-for')?.split(',')[0].trim()??'local';if(data.action==='inspect'){const input=z.object({token:z.string()}).strict().parse(data.input);return response(await inspectPlatformEnrolment(db,input.token));}if(data.action==='logout'){const jar=await cookies(),platform=jar.get(PLATFORM_SESSION_COOKIE)?.value;await logoutPlatform(db,platform);const reply=response({ok:true});reply.cookies.delete(PLATFORM_SESSION_COOKIE);if(!platform){await logout(db,jar.get(SESSION_COOKIE)?.value);reply.cookies.delete(SESSION_COOKIE)}return reply;}const result=data.action==='complete'?await completePlatformEnrolment(db,data.input,ip):await loginPlatform(db,data.input,ip);const reply=response({ok:true});reply.cookies.set(PLATFORM_SESSION_COOKIE,result.token,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:43200});return reply;}catch(error){return failure(error)}}
