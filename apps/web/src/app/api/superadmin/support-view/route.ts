import {NextRequest} from 'next/server';
import {z} from 'zod';
import {PLATFORM_OWNER_VIEW_COOKIE,platformOwnerView,endPlatformSupportView} from '@dinerdost/services';
import {platformContext,body,csrf,failure,response} from '@/lib/server';
export async function POST(request:NextRequest){try{csrf(request);const data=z.object({action:z.enum(['start','end']),id:z.uuid().optional()}).strict().parse(await body(request));
 if(data.action==='end'){const grant=request.cookies.get(PLATFORM_OWNER_VIEW_COOKIE)?.value;if(grant){try{const {db,actor}=await platformContext();await endPlatformSupportView(db,actor,crypto.randomUUID(),{id:grant,reason:'Administrator exited owner workspace'});}catch(error){if(!['UNAUTHENTICATED','PLATFORM_FORBIDDEN','SUPPORT_UNAVAILABLE'].includes((error as any)?.code))throw error;}}const reply=response({ok:true});reply.cookies.set(PLATFORM_OWNER_VIEW_COOKIE,'',{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:0});return reply;}
 const {db,actor}=await platformContext(),id=z.uuid().parse(data.id),view=await platformOwnerView(db,actor,id),reply=response({ok:true,url:'/app/overview',expiresAt:view.expiresAt});reply.cookies.set(PLATFORM_OWNER_VIEW_COOKIE,id,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/',maxAge:Math.max(1,Math.floor((Date.parse(view.expiresAt)-Date.now())/1000))});return reply;
 }catch(error){return failure(error)}}
