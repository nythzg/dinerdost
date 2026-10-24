import type {Metadata} from 'next';
import {WorkingPreviewEntry} from '@/features/design-preview/working-preview-entry';

export const metadata:Metadata={title:'Interface design preview',robots:{index:false,follow:false}};

export default async function Page({searchParams}:{searchParams:Promise<{workspace?:string}>}){
 const {workspace}=await searchParams;
 return <WorkingPreviewEntry destination={workspace==='platform'?'/superadmin':workspace==='customer'?'/app/qr':'/app/overview'}/>;
}
