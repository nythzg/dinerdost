import './platform-data-qa-fixture';
import {readFile,writeFile} from 'node:fs/promises';
import {createEmbeddedDatabase} from '@dinerdost/database';
import {copySingleRestaurant} from './lib/copy-single-restaurant';

const fixture=JSON.parse(await readFile('../work/platform-browser-fixture.json','utf8'));
if(!/^\.data\/platform-qa-\d+$/.test(fixture.path))throw new Error('Isolated QA source required.');
const path='.data/single-restaurant-qa-'+Date.now(),source=await createEmbeddedDatabase(fixture.path),destination=await createEmbeddedDatabase(path);
try{
 await destination.migrate();
 const report=await copySingleRestaurant(source,destination,{tenantId:fixture.tenantId,platformEmail:fixture.admin});
 await writeFile('../work/single-restaurant-browser-fixture.json',JSON.stringify({...fixture,path,sourcePath:fixture.path,report}));
 console.log('Isolated single-restaurant QA copy verified.');
}finally{await source.close();await destination.close()}
