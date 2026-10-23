import {existsSync} from 'node:fs';
import {writeFile} from 'node:fs/promises';
import {basename,isAbsolute,relative,resolve} from 'node:path';
import {createEmbeddedDatabase} from '@dinerdost/database';
import {copySingleRestaurant} from './lib/copy-single-restaurant';

const root=resolve('.data');
function localPath(value:string|undefined,pattern:RegExp){
 if(!value)throw new Error('Explicit local source and new destination paths are required.');
 const path=resolve(value),part=relative(root,path);
 if(!part||part.startsWith('..')||isAbsolute(part)||!pattern.test(basename(path)))throw new Error('Only dedicated ignored local database paths are accepted.');
 return path;
}
const sourcePath=localPath(process.env.DD_SINGLE_SOURCE,/^original-before-single-restaurant-\d{8}-\d{6}$/);
const destinationPath=localPath(process.env.DD_SINGLE_TARGET,/^single-restaurant-\d{8}-\d{6}$/);
if(!existsSync(sourcePath)||existsSync(destinationPath))throw new Error('Source backup must exist and destination must never have existed.');
if(!process.env.DD_KEEP_RESTAURANT_ID||!process.env.DD_KEEP_PLATFORM_EMAIL)throw new Error('Explicit restaurant ID and existing superadmin email are required.');
const source=await createEmbeddedDatabase(sourcePath),destination=await createEmbeddedDatabase(destinationPath);
try{
 await destination.migrate();
 const report=await copySingleRestaurant(source,destination,{tenantId:process.env.DD_KEEP_RESTAURANT_ID,platformEmail:process.env.DD_KEEP_PLATFORM_EMAIL});
 await writeFile(resolve('.data/single-restaurant-report.json'),JSON.stringify({...report,sourcePath,destinationPath,createdAt:new Date().toISOString()},null,2));
 console.log(JSON.stringify({restaurant:report.restaurantName,restaurants:report.restaurants,retainedRows:report.retainedRows,retainedFingerprintsEqual:report.retainedFingerprintsEqual,foreignKeysValidated:report.foreignKeysValidated,originalRowsModified:report.originalRowsModified}));
}finally{await source.close();await destination.close()}
