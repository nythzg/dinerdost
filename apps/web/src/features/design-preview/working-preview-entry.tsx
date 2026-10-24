"use client";
import {useEffect} from 'react';
import {useRouter} from 'next/navigation';
import {useDesignPreview} from './preview-appearance';

export function WorkingPreviewEntry({destination}:{destination:string}){
 const router=useRouter(),{setEnabled}=useDesignPreview();
 useEffect(()=>{setEnabled(true);router.replace(destination)},[setEnabled,router,destination]);
 return <main className="loading-page"><h1>Opening your working preview</h1><p>Your existing sign-in, data and permissions apply. Changes save normally.</p><a className="button primary" href={destination}>Continue to workspace</a></main>;
}
