/** Local operator provisioning. Never reads credentials from command-line arguments. */
import {resolve,relative,isAbsolute} from 'node:path';
import {stat} from 'node:fs/promises';
import {createEmbeddedDatabase} from '@dinerdost/database';
import {bootstrapPlatformAdmin} from '@dinerdost/services';
const path=process.env.DD_PLATFORM_LOCAL_DATABASE,email=process.env.DD_PLATFORM_BOOTSTRAP_EMAIL;
if(!path||!email)throw new Error('Set DD_PLATFORM_LOCAL_DATABASE and DD_PLATFORM_BOOTSTRAP_EMAIL for an existing local account. Stop the local server and back up the database first.');
const resolved=resolve(path);
// Provisioning is intentionally limited to an existing .data directory of this repository.
const root=resolve('.data'),inside=relative(root,resolved);if(!inside||inside.startsWith('..')||isAbsolute(inside))throw new Error('Database must be an existing directory under this repository .data.');
if(!(await stat(resolved)).isDirectory())throw new Error('Choose an existing local database directory.');const db=await createEmbeddedDatabase(resolved);try{await db.migrate();const result=await bootstrapPlatformAdmin(db,email);console.log(result.existing?'Platform admin already provisioned.':'Explicit platform admin provisioned.')}finally{await db.close()}
