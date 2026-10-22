import type {Sql} from '@dinerdost/database';

/** Use a tenant-scoped transaction for account requests; local maintenance uses its own transaction. */
export async function expireCalculatorData(tx:Sql,employeeId?:string){
 const parameters=employeeId?[employeeId]:[];
 await tx.query(`DELETE FROM calculator_history WHERE created_at < now()-interval '168 hours'${employeeId?' AND employee_id=$1':''}`,parameters);
 // Keep the retry key/fingerprint so an expired request cannot create another entry.
 // Remove the copied personal content too, including previously manually deleted entries.
 await tx.query(`UPDATE idempotency_keys k SET response=jsonb_build_object('id',k.response->>'id','expired',true)
  WHERE k.response ? 'expression' AND k.response ? 'result'
  ${employeeId?'AND k.actor_id=$1':''}
  AND CASE WHEN EXISTS(SELECT 1 FROM audit_events a WHERE a.restro_id=k.restro_id AND a.actor_id=k.actor_id
   AND a.action='CALCULATOR_SAVED' AND a.entity_type='calculator' AND a.entity_id=k.response->>'id')
   THEN (k.response->>'created_at')::timestamptz < now()-interval '168 hours' ELSE false END`,parameters);
}
