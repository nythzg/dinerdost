"use client";
import {useState} from 'react';
import {flushSync} from 'react-dom';
import {Form,type Field} from '@/components/ui';
import type {Row} from '@/lib/client';
import {useDesk} from '../workspace/context';
/** Keep reward validation visible with the fields that need correction. */
export function RewardEntry({fields,save,submit,successMessage,onSuccess}:{fields:Field[];save:(values:Row)=>Promise<unknown>;submit:string;successMessage?:string;onSuccess?:(result:unknown,values:Row)=>void}){
 const {close,notify}=useDesk(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <Form fields={fields} submit={submit} busy={busy} onSubmit={async values=>{
  if(busy)return;setBusy(true);setError('');
  // Finish the form's focus restoration before the external success dialog takes focus.
  try{const result=await save(values);if(onSuccess){flushSync(close);onSuccess(result,values)}else{close();notify(successMessage??'Saved.')}}
  catch(issue){setError((issue as Error).message)}
  finally{setBusy(false)}
 }}>{error&&<p className="error" role="alert">{error}</p>}</Form>;
}
