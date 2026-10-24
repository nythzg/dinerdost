import {observePlatformRoute} from '@/lib/platform-local-runtime';
import {NextRequest} from 'next/server';
import {z} from 'zod';
import {platformContext,body,csrf,failure,response} from '@/lib/server';
import * as service from '@dinerdost/services';
export const runtime='nodejs';
async function handleGET(request:NextRequest){try{
 const {db,actor}=await platformContext();
 const query=Object.fromEntries(request.nextUrl.searchParams);
 const view=z.enum(['snapshot','directory','restaurant']).parse(query.view??'snapshot');
 if(view==='restaurant')return response(await service.platformRestaurantData(db,actor,{tenantId:query.tenantId,...(query.outletId?{outletId:query.outletId}:{})}));
 if(view==='directory')return response(await service.platformRestaurantDirectory(db,actor,{dataset:query.dataset??'all',search:query.search??'',page:query.page??1}));
 return response(await service.platformSnapshot(db,actor,query.dataset??'all'));
}catch(error){return failure(error)}}
async function handlePOST(request:NextRequest){try{await csrf(request);const {db,actor}=await platformContext();actor.ip=request.headers.get('x-forwarded-for')?.split(',')[0].trim()??'local';const data=z.object({action:z.enum(['saveFeatureControls','saveRecord','saveTenant','createTenant','saveMember','startSupport','endSupport','redeemPromo','verifyAudit']),input:z.unknown()}).strict().parse(await body(request));const key=z.uuid().parse(request.headers.get('idempotency-key'));const handlers={saveFeatureControls:service.savePlatformFeatureControls,saveRecord:service.savePlatformRecord,saveTenant:service.savePlatformTenant,createTenant:service.createPlatformTenant,saveMember:service.savePlatformMember,startSupport:service.createPlatformSupportView,endSupport:service.endPlatformSupportView,redeemPromo:service.redeemPlatformPromo};return response(data.action==='verifyAudit'?await service.verifyPlatformAudit(db,actor):await handlers[data.action](db,actor,key,data.input));}catch(error){return failure(error)}}

export const GET=observePlatformRoute('/api/superadmin',handleGET);

export const POST=observePlatformRoute('/api/superadmin',handlePOST);
