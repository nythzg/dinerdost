import {observePlatformRoute} from '@/lib/platform-local-runtime';
import {NextRequest} from 'next/server';
import {z} from 'zod';
import * as s from '@dinerdost/services';
import {platformContext,body,csrf,failure,response} from '@/lib/server';
export const runtime='nodejs';
const handlers={saveConfiguration:s.savePlatformConfiguration,applyTemplates:s.applyPlatformTemplates,tagMenu:s.tagPlatformMenu,brandAccess:s.savePlatformBrandAccess,branding:s.savePlatformBranding,qr:s.changePlatformQr,caseDetails:s.savePlatformCase,task:s.decidePlatformTask,billingProfile:s.savePlatformBillingProfile,subscriptionAutomation:s.configurePlatformSubscription,saasPayment:s.recordPlatformSaasPayment,saasCredit:s.creditPlatformSaasInvoice,settlement:s.recordPlatformSettlement,activateFee:s.activatePlatformFee,maintenance:s.runPlatformMaintenance};
async function handleGET(request:NextRequest){try{const {db,actor}=await platformContext(),q=request.nextUrl.searchParams,view=z.enum(['operations','analytics','telemetry']).parse(q.get('view')??'operations');return response(view==='analytics'?await s.platformAnalytics(db,actor,{from:q.get('from'),to:q.get('to')}):view==='telemetry'?await s.platformTelemetry(db,actor):await s.readPlatformOperations(db,actor,{section:q.get('section')??'overview'}));}catch(error){return failure(error)}}
async function handlePOST(request:NextRequest){try{csrf(request);const {db,actor}=await platformContext();actor.ip=request.headers.get('x-forwarded-for')?.split(',')[0].trim()??'local';const data=z.object({action:z.enum(Object.keys(handlers) as [keyof typeof handlers,...(keyof typeof handlers)[]]),input:z.unknown()}).strict().parse(await body(request));return response(await handlers[data.action](db,actor,z.uuid().parse(request.headers.get('idempotency-key')),data.input));}catch(error){return failure(error)}}

export const GET=observePlatformRoute('/api/superadmin/operations',handleGET);

export const POST=observePlatformRoute('/api/superadmin/operations',handlePOST);
