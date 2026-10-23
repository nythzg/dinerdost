import type {Metadata} from 'next';
import {SuperadminPanel} from '@/features/superadmin/superadmin-panel';
export const metadata:Metadata={title:'Superadmin'};
export default function Page(){return <SuperadminPanel/>}
