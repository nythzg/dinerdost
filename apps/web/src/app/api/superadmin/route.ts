import {NextRequest} from 'next/server';
import {z} from 'zod';
import {platformContext,body,csrf,failure,response} from '@/lib/server';
import * as service from '@dinerdost/services';
export const runtime='nodejs';
export async function GET(){try{const {db,actor}=await platformContext();return response(await service.platformSnapshot(db,actor));}catch(error){return failure(error)}}
export async function POST(request:NextRequest){try{csrf(request);const {db,actor}=await platformContext();actor.ip=request.headers.get('x-forwarded-for')?.split(',')[0].trim()??'local';const data=z.object({action:z.enum(['saveRecord','saveTenant','createTenant','saveMember','startSupport','endSupport','bulkQr','redeemPromo','verifyAudit']),input:z.unknown()}).strict().parse(await body(request));const key=z.uuid().parse(request.headers.get('idempotency-key'));const handlers={saveRecord:service.savePlatformRecord,saveTenant:service.savePlatformTenant,createTenant:service.createPlatformTenant,saveMember:service.savePlatformMember,startSupport:service.createPlatformSupportView,endSupport:service.endPlatformSupportView,bulkQr:service.bulkPlatformQr,redeemPromo:service.redeemPlatformPromo};return response(data.action==='verifyAudit'?await service.verifyPlatformAudit(db,actor):await handlers[data.action](db,actor,key,data.input));}catch(error){return failure(error)}}
