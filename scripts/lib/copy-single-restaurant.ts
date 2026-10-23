import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Database,Sql} from '@dinerdost/database';

type Row=Record<string,any>;
const identifier=(name:string)=>{if(!/^[a-z_][a-z_0-9]*$/.test(name))throw new Error('Unexpected SQL identifier');return '"'+name+'"'};
const fingerprint=(rows:Row[])=>createHash('sha256').update(rows.map(row=>JSON.stringify(row,(_,value)=>typeof value==='bigint'?String(value):value)).sort().join('\n')).digest('hex');
const tables=async(tx:Sql)=>(await tx.query<{table_name:string}>("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).rows.map(row=>row.table_name);

/** Operator-only logical copy into a new, migrated, empty local database. Never deletes source rows. */
export async function copySingleRestaurant(source:Database,destination:Database,input:{tenantId:string;platformEmail:string}){
 const tenantId=z.uuid().parse(input.tenantId),platformEmail=z.email().parse(input.platformEmail);
 const snapshot=await source.transaction(null,async tx=>{
  await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
  const restaurant=(await tx.query<Row>('SELECT * FROM restaurants WHERE id=$1',[tenantId])).rows[0];
  if(!restaurant)throw new Error('The explicitly selected restaurant was not found.');
  const admin=(await tx.query<Row>("SELECT u.id FROM users u JOIN platform_members m ON m.user_id=u.id WHERE lower(u.email)=lower($1) AND NOT u.disabled AND m.enabled AND m.role='SUPERADMIN'",[platformEmail])).rows[0];
  if(!admin)throw new Error('The explicitly selected enabled superadmin was not found.');
  const names=await tables(tx),rows=new Map<string,Row[]>();
  const columns=(await tx.query<{table_name:string;column_name:string;udt_name:string}>('SELECT table_name,column_name,udt_name FROM information_schema.columns WHERE table_schema=\'public\' ORDER BY table_name,ordinal_position')).rows;
  for(const name of names){
   if(columns.some(c=>c.table_name===name&&c.column_name==='restro_id'))rows.set(name,(await tx.query<Row>('SELECT * FROM '+identifier(name)+' WHERE restro_id=$1',[tenantId])).rows);
  }
  rows.set('restaurants',[restaurant]);
  rows.set('platform_records',(await tx.query<Row>('SELECT * FROM platform_records WHERE tenant_id IS NULL OR tenant_id=$1',[tenantId])).rows);
  // Keep the immutable global audit chain intact, even when it records earlier removed registrations.
  for(const name of ['platform_audit','platform_audit_head','rate_limits'])rows.set(name,(await tx.query<Row>('SELECT * FROM '+identifier(name))).rows);
  for(const name of ['platform_members','platform_sessions','platform_enrolments','platform_requests'])rows.set(name,(await tx.query<Row>('SELECT * FROM '+identifier(name)+' WHERE user_id=$1',[admin.id])).rows);
  const employees=rows.get('employees')??[];
  rows.set('auth_sessions',(await tx.query<Row>('SELECT * FROM auth_sessions WHERE employee_id=ANY($1::uuid[])',[employees.map(e=>e.id)])).rows);
  const userIds=new Set<string>([admin.id,...employees.map(e=>e.user_id)]);
  const userReferences=(await tx.query<{table_name:string;column_name:string}>(`SELECT t.relname AS table_name,a.attname AS column_name FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_class r ON r.oid=c.confrelid CROSS JOIN LATERAL unnest(c.conkey) k(attnum) JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.attnum WHERE c.contype='f' AND r.relname='users' AND t.relnamespace='public'::regnamespace`)).rows;
  for(const ref of userReferences)for(const row of rows.get(ref.table_name)??[])if(row[ref.column_name])userIds.add(row[ref.column_name]);
  rows.set('users',(await tx.query<Row>('SELECT * FROM users WHERE id=ANY($1::uuid[])',[[...userIds]])).rows);
  const sourceMigrations=(await tx.query<{name:string}>('SELECT name FROM schema_migrations ORDER BY name')).rows;
  for(const name of names)if(name!=='schema_migrations'&&!rows.has(name))throw new Error('Unclassified source table: '+name);
  const sequences=(await tx.query<{table_name:string;column_name:string;sequence:string}>(`SELECT c.relname AS table_name,a.attname AS column_name,pg_get_serial_sequence(quote_ident(c.relname),a.attname) AS sequence FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid WHERE c.relnamespace='public'::regnamespace AND a.attnum>0 AND NOT a.attisdropped AND (a.attidentity<>'' OR pg_get_expr((SELECT adbin FROM pg_attrdef WHERE adrelid=c.oid AND adnum=a.attnum),c.oid) LIKE 'nextval%')`)).rows;
  const sequenceValues:Row[]=[];
  for(const sequence of sequences){const parts=sequence.sequence.split('.');if(parts.length!==2||parts[0]!=='public')throw new Error('Unexpected sequence');const state=(await tx.query<Row>('SELECT last_value,is_called FROM public.'+identifier(parts[1]))).rows[0];sequenceValues.push({...sequence,...state});}
  return {restaurant,rows,columns,names,sourceMigrations,sequenceValues};
 });
 return destination.transaction(null,async tx=>{
  const destinationNames=await tables(tx);
  if(JSON.stringify(destinationNames)!==JSON.stringify(snapshot.names))throw new Error('Source and destination schemas differ.');
  const migrations=(await tx.query<{name:string}>('SELECT name FROM schema_migrations ORDER BY name')).rows;
  if(JSON.stringify(migrations)!==JSON.stringify(snapshot.sourceMigrations))throw new Error('Migration versions differ.');
  for(const name of destinationNames){
   if(['schema_migrations','platform_audit_head'].includes(name))continue;
   if(Number((await tx.query<Row>('SELECT count(*) AS count FROM '+identifier(name))).rows[0].count)!==0)throw new Error('Destination must be empty: '+name);
  }
  const head=(await tx.query<Row>('SELECT * FROM platform_audit_head')).rows[0];
  if(!head||Number(head.sequence)!==0||head.hash!=='')throw new Error('Destination audit head is not pristine.');
  const foreignKeys=(await tx.query<Row>(`SELECT t.relname AS table_name,c.conname,c.condeferrable,c.condeferred FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid WHERE c.contype='f' AND t.relnamespace='public'::regnamespace ORDER BY t.relname,c.conname`)).rows;
  const triggers=(await tx.query<Row>(`SELECT c.relname AS table_name,t.tgname,t.tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal AND c.relnamespace='public'::regnamespace ORDER BY c.relname,t.tgname`)).rows;
  // A logical restore must not replay KOT gates or other business side effects for historical rows.
  // This destination has no app server; every trigger is restored before this transaction commits.
  for(const trigger of triggers)await tx.query('ALTER TABLE '+identifier(trigger.table_name)+' DISABLE TRIGGER '+identifier(trigger.tgname));
  // Only the new empty destination is altered. Deferred checks permit existing cyclic references.
  for(const fk of foreignKeys)await tx.query('ALTER TABLE '+identifier(fk.table_name)+' ALTER CONSTRAINT '+identifier(fk.conname)+' DEFERRABLE INITIALLY DEFERRED');
  await tx.query('SET CONSTRAINTS ALL DEFERRED');
  for(const [name,rows] of snapshot.rows){
   if(name==='platform_audit_head'){
    if(rows.length!==1)throw new Error('Invalid source audit head');
    await tx.query('UPDATE platform_audit_head SET sequence=$1,hash=$2 WHERE singleton=true',[rows[0].sequence,rows[0].hash]);continue;
   }
   const columns=snapshot.columns.filter(c=>c.table_name===name);
   for(let start=0;start<rows.length;start+=50){
    const params:unknown[]=[];
    const values=rows.slice(start,start+50).map(row=>'('+columns.map(column=>{const value=row[column.column_name];params.push(value!==null&&['json','jsonb'].includes(column.udt_name)?JSON.stringify(value):value);return '$'+params.length}).join(',')+')');
    await tx.query('INSERT INTO '+identifier(name)+' ('+columns.map(c=>identifier(c.column_name)).join(',')+') VALUES '+values.join(','),params);
   }
  }
  await tx.query('SET CONSTRAINTS ALL IMMEDIATE');
  for(const trigger of triggers)await tx.query('ALTER TABLE '+identifier(trigger.table_name)+' '+({O:'ENABLE TRIGGER',D:'DISABLE TRIGGER',R:'ENABLE REPLICA TRIGGER',A:'ENABLE ALWAYS TRIGGER'}[trigger.tgenabled as 'O'])+' '+identifier(trigger.tgname));
  for(const fk of foreignKeys)await tx.query('ALTER TABLE '+identifier(fk.table_name)+' ALTER CONSTRAINT '+identifier(fk.conname)+(fk.condeferrable?' DEFERRABLE INITIALLY '+(fk.condeferred?'DEFERRED':'IMMEDIATE'):' NOT DEFERRABLE INITIALLY IMMEDIATE'));
  for(const seq of snapshot.sequenceValues)await tx.query('SELECT setval($1::regclass,$2,$3)',[seq.sequence,seq.last_value,seq.is_called]);
  let retainedRows=0;
  const retainedCounts:Record<string,number>={};
  for(const [name,expected] of snapshot.rows){
   const actual=(await tx.query<Row>('SELECT * FROM '+identifier(name))).rows;
   if(fingerprint(actual)!==fingerprint(expected))throw new Error('Copied row fingerprint mismatch: '+name);
   retainedRows+=actual.length;retainedCounts[name]=actual.length;
  }
  return {restaurantId:snapshot.restaurant.id,restaurantName:snapshot.restaurant.name,restaurants:1,retainedTables:snapshot.rows.size,retainedRows,retainedCounts,originalRowsModified:0,foreignKeysValidated:true,retainedFingerprintsEqual:true};
 });
}
