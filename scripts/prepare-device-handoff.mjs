import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,copyFile,writeFile} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {createHash} from 'node:crypto';
const root=process.cwd(),stamp=process.argv[2];
assert.match(stamp??'',/^\d{8}-\d{6}$/,'Supply a unique YYYYMMDD-HHMMSS package stamp.');
const output=resolve(root,'../handoff','DinerDost-'+stamp),target=resolve(output,'dinerdost');
await mkdir(output,{recursive:true});assert(!(await readdir(output)).length,'Choose an empty/new handoff directory.');await mkdir(target);
const release=JSON.parse(await readFile(resolve(root,'docs/RELEASE.json'),'utf8'));assert.equal(release.productionVersion,'0.4.30');assert.deepEqual(release.latestReviewQueue.pendingImplementationIds,['Q89']);
const sourceFiles=[];
const excludedDirectories=new Set(['node_modules','.git','.vercel','.data','.gradle','.kotlin','.cxx','build','test-results','playwright-report','tmp']);
function skip(name){return name.startsWith('.next')||name.startsWith('.env')&&name!=='.env.example'||/\.(?:tsbuildinfo|apk|aab|jks|keystore|p12|pem|key|sqlite|db|dump)$/i.test(name)||['next-env.d.ts','local.properties','google-services.json','auth.json','credentials.json','.DS_Store'].includes(name)}
async function walk(rel){for(const entry of await readdir(resolve(root,rel),{withFileTypes:true})){if(entry.isSymbolicLink())continue;const p=rel+'/'+entry.name;if(skip(entry.name))continue;if(entry.isDirectory()){if(!excludedDirectories.has(entry.name))await walk(p)}else if(entry.isFile())sourceFiles.push(p)}}
for(const p of ['AGENTS.md','HANDOFF.md','CONTINUE_IN_CODEX.txt','README.md','.env.example','.gitignore','.vercelignore','package.json','package-lock.json','tsconfig.json','playwright.config.ts','vercel.json'])sourceFiles.push(p);
for(const p of ['apps','packages','docs','tests','scripts'])await walk(p);
const verificationNames=await readdir(resolve(root,'verification'));
for(const name of verificationNames){if(/^(?:production-04(?:27|28|29|30)-acceptance|production-migration-04(?:28|29|30)|release-04(?:27|28|29|30)-plan|discord-monitor-latest)\.json$/.test(name)||/^(?:web-0430-(?:backend|backend-full|typecheck-final|build|browser)|hosted-0430-refunds|production-0430-browser)\.log$/.test(name)||name==='client-answers-20261022-0931.txt'||/^web-refund(?:s|-document)-0430-\d+\.png$/.test(name))sourceFiles.push('verification/'+name)}
for(const name of ['review.json','catalog.json','transcripts.json','report-acceptance.json'])sourceFiles.push('verification/petpooja-playlist-20261022/'+name);
for(const name of ['DinerDost_Petpooja_Inventory_Gap_Review.html','DinerDost_Petpooja_66_Video_Inventory_Gap_Review.pdf'])sourceFiles.push('output/pdf/'+name);
const secrets=new Set();
try{for(const line of (await readFile(resolve(root,'.env.production.local'),'utf8')).split(/\r?\n/)){const m=line.match(/^([A-Za-z0-9_]+)=(.*)$/);if(!m||!/DATABASE|POSTGRES|PGPASSWORD|TOKEN|SECRET|PRIVATE_KEY|OPENAI_API_KEY/.test(m[1]))continue;let value=m[2].trim();if(/^".*"$/.test(value)){try{value=JSON.parse(value)}catch{value=value.slice(1,-1)}}else value=value.replace(/^'|'$/g,'');if(value.length>=12)secrets.add(value)}}catch{}
function secretValues(v,key=''){if(Array.isArray(v))v.forEach(x=>secretValues(x,key));else if(v&&typeof v==='object')for(const [k,x] of Object.entries(v))secretValues(x,k);else if(typeof v==='string'&&/(?:password|token|secret|privateKey)$/i.test(key)&&v.length>=12)secrets.add(v)}
for(const name of verificationNames.filter(n=>/^\.qa.*\.json$/.test(n))){try{secretValues(JSON.parse(await readFile(resolve(root,'verification',name),'utf8')))}catch{}}
const hashes=[],secretHits=[];
for(const rel of [...new Set(sourceFiles)].sort()){
 const src=resolve(root,rel);assert(src.startsWith(root+sep),'Source escapes project');const bytes=await readFile(src);
 if(/\.(?:[cm]?[jt]sx?|json|md|txt|log|html|css|sql|ya?ml|toml|xml|properties|kts|kt|ps1|sh|example)$/.test(rel)||rel==='.env.example'){
  const text=bytes.toString('utf8');if([...secrets].some(secret=>text.includes(secret))||/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)||/\b(?:sk-proj-|ghp_|github_pat_)[A-Za-z0-9_-]{24,}/.test(text)||/postgres(?:ql)?:\/\/[^\s:]+:[^\s@]+@/.test(text))secretHits.push(rel);
 }
 const dst=resolve(target,rel);await mkdir(dirname(dst),{recursive:true});await copyFile(src,dst);hashes.push({path:rel,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
assert.deepEqual(secretHits,[],'Potential secrets found in selected files; inspect filenames without printing values.');
const manifest={preparedAt:new Date().toISOString(),sourceVersion:release.productionVersion,sourceDeployment:release.deploymentId,latestClientPending:['Q89'],unanswered:['Q111','Q114'],petpooja:release.petpoojaImplementation,sourceFiles:hashes.length,totalBytes:hashes.reduce((n,f)=>n+f.size,0),excluded:['real env/account/QA credentials','.vercel project binding','databases and dumps','dependencies/build caches','Android generated builds/SDK paths/keys/Firebase config','unrelated global Codex memories and raw session state'],knownCredentialScanPassed:true,files:hashes};
await writeFile(resolve(target,'HANDOFF_MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n');
await writeFile(resolve(output,'PACKAGE_READY.json'),JSON.stringify({directory:output,project:target,version:release.productionVersion,files:hashes.length,bytes:manifest.totalBytes,secretScanPassed:true},null,2)+'\n');
console.log(JSON.stringify({directory:output,project:target,files:hashes.length,bytes:manifest.totalBytes,secretScanPassed:true}));
