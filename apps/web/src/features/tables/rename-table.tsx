"use client";
import {useDesk} from '../workspace/context';
import type {Row} from '@/lib/client';
import {useState} from 'react';
import {Form} from '@/components/ui';
function RenameTableForm({table,changed}:{table:Row;changed?:(result:Row)=>void}){
 const {run,close}=useDesk(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <Form fields={[{name:'label',label:'Table name',value:table.label}]} busy={busy} submit="Rename table" before={error?<p className="error" role="alert">{error}</p>:undefined} onSubmit={async values=>{
  setBusy(true);setError('');
  try{const result=await run('renameTable',{tableId:table.id,version:table.version,label:values.label});changed?.(result);close()}
  catch(issue){setError((issue as Error).message)}
  finally{setBusy(false)}
 }}/>;
}
export function useRenameTable(){
 const {modal}=useDesk();
 return (table:Row,changed?:(result:Row)=>void)=>modal('Rename '+table.label,<RenameTableForm table={table} changed={changed}/>);
}
