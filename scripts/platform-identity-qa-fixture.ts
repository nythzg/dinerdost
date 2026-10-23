import {resolve} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {createEmbeddedDatabase} from '@dinerdost/database';
import * as s from '@dinerdost/services';
const path='.data/platform-identity-qa-'+Date.now(),password=randomBytes(24).toString('base64url'),db=await createEmbeddedDatabase(resolve(path));try{await db.migrate();const owner='identity-browser-owner-'+Date.now()+'@example.test';await s.signup(db,{name:'Identity QA owner',email:owner,password,restaurant:'Identity QA tenant',outlet:'Main',qrEnabled:false,demo:false},'identity-qa-owner');const email='identity-browser-admin-'+Date.now()+'@example.test',invite=await s.inviteInitialPlatformIdentity(db,email);await writeFile(resolve('../work/platform-identity-browser-fixture.json'),JSON.stringify({path,password,email,owner,token:invite.token}));console.log('Isolated platform identity fixture prepared.')}finally{await db.close()}
