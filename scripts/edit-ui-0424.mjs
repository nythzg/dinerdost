import {readFileSync,writeFileSync} from 'node:fs';
const replace=(path,from,to)=>{let s=readFileSync(path,'utf8');if(!s.includes(from))throw new Error('Missing edit in '+path);writeFileSync(path,s.replace(from,to))};
for(const p of ['package.json','apps/web/package.json']){const v=JSON.parse(readFileSync(p,'utf8'));v.version='0.4.24';writeFileSync(p,JSON.stringify(v,null,2)+'\n')}
const lock=JSON.parse(readFileSync('package-lock.json','utf8'));lock.version='0.4.24';lock.packages[''].version='0.4.24';lock.packages['apps/web'].version='0.4.24';writeFileSync('package-lock.json',JSON.stringify(lock,null,2)+'\n');
replace('apps/web/src/features/workspace/service-pages.tsx',
 '  const suggestedTableName=nextTableName',
 `  groups.sort((a,b)=>{const serial=(name:string)=>/^\\d+$/.test(name);return Number(serial(b.table.label))-Number(serial(a.table.label))||a.table.label.localeCompare(b.table.label,undefined,{numeric:true,sensitivity:'base'})});
  const suggestedTableName=nextTableName`);
replace('packages/services/src/table-capacity.ts',
 `  ensure(!(await tx.query('SELECT id FROM dining_tables WHERE outlet_id=$1 AND id<>$2 AND lower(label)=lower($3)',[table.outlet_id,table.id,data.label])).rows.length,'TABLE_LABEL_TAKEN','Another table already uses this name.',409);`,
 `  const collision=(await tx.query('SELECT label,floor,retired_at FROM dining_tables WHERE outlet_id=$1 AND id<>$2 AND lower(label)=lower($3)',[table.outlet_id,table.id,data.label])).rows[0];
  ensure(!collision,'TABLE_LABEL_TAKEN',collision?'Table “'+collision.label+'” already exists on '+collision.floor+'. Find it in Tables or choose a different name.':'Another table already uses this name.',409);`);
const service='apps/web/src/features/workspace/service-board.tsx';replace(service,'"use client";','"use client";\nimport {confirmAction} from "@/lib/confirm-action";');
replace(service,`if(serving||!rounds.length||!window.confirm('Confirm all selected food has actually been served.'))return;setServing(true);setMessage('');let done=0;try{`,
 `if(serving||!rounds.length)return;setServing(true);setMessage('');let done=0;try{if(!await confirmAction('Confirm all selected food has actually been served.','Serve selected'))return;`);
const tools='apps/web/src/features/workspace/workspace-tools.tsx';replace(tools,'"use client";','"use client";\nimport {confirmAction} from "@/lib/confirm-action";');
replace(tools,`if(window.confirm('Delete this calculation from your history?'))void mutate({action:'delete',id:entry.id})`,
 `void confirmAction('Delete this calculation from your history?','Delete calculation').then(confirmed=>{if(confirmed)void mutate({action:'delete',id:entry.id})})`);
for(const p of ['tests/browser/priority-qr-updates.spec.ts','tests/browser/workspace-tools.spec.ts']){
 let s=readFileSync(p,'utf8');s=s.replace(/page\.once\('dialog',dialog=>dialog\.accept\(\)\);await entry\.getByRole\('button',\{name:'Delete',exact:true\}\)\.click\(\);/g,`await entry.getByRole('button',{name:'Delete',exact:true}).click();await page.getByRole('dialog',{name:'Please confirm',exact:true}).getByRole('button',{name:'Delete calculation',exact:true}).click();`);
 s=s.replace(/page\.getByRole\('dialog'\)\.getByRole\('button',\{name:'(Pin VIP order|Unpin order)',exact:true\}\)/g,`page.getByRole('menu').getByRole('menuitem',{name:'$1',exact:true})`);writeFileSync(p,s);
}
const browser='tests/browser/service-board.spec.ts';replace(browser,`page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Serve selected (2)',exact:true}).click();`, `await page.getByRole('button',{name:'Serve selected (2)',exact:true}).click();await page.getByRole('dialog',{name:'Please confirm',exact:true}).getByRole('button',{name:'Cancel',exact:true}).click();`);
replace(browser,`page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Serve selected (2)',exact:true}).click();`, `await page.getByRole('button',{name:'Serve selected (2)',exact:true}).click();await page.getByRole('dialog',{name:'Please confirm',exact:true}).getByRole('button',{name:'Serve selected',exact:true}).click();`);
replace('tests/browser/prepared-food.spec.ts',`await expect(page.locator(".storefront-menu article").first()).toContainText("Ready to serve");`, `await expect(page.locator(".storefront-menu article").first()).toBeVisible();await expect(page.getByText("Ready to serve",{exact:true})).toHaveCount(0);`);
console.log('0.4.24 focused UI/customer menu changes prepared.');
