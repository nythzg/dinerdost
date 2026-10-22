import {readFileSync,writeFileSync} from 'node:fs';
const file='apps/web/src/features/tables/floor-plan.tsx';let s=readFileSync(file,'utf8').replaceAll('\r\n','\n');
s=s.replace('  fitFloorObject,','  fitFloorObject,\n  resizeFloorObject,');
const from=s.indexOf('                      update(\n                        current.id,\n                        fitFloorObject(',s.indexOf('onPointerMove={(event) => {',s.indexOf('className={"plan-resize-handle')));
const to=s.indexOf('\n                    }}',from);
if(from<0||to<0)throw new Error('Pointer resize edit missing');
s=s.slice(0,from)+`                      update(current.id,resizeFloorObject(drag.object,area,drag.direction as 'se'|'e'|'s',width-drag.object.width,height-drag.object.height));`+s.slice(to);
const keyStart=s.indexOf('                        update(',s.indexOf('onKeyDown={(event)',s.indexOf('className={"plan-resize-handle'))),keyEnd=s.indexOf('\n                      }',keyStart);
if(keyStart<0||keyEnd<0)throw new Error('Key resize edit missing');
s=s.slice(0,keyStart)+`                        update(current.id,resizeFloorObject(current,area,direction as 'se'|'e'|'s',direction!=='s'?delta[0]:0,direction!=='e'?delta[1]:0));`+s.slice(keyEnd);
s=s.replace('                    tabIndex={draft || table ? 0 : -1}',`                    title={(table||copySource)?(table?.label??object.label)+' · '+(table??copySource)!.seats+' seats · '+(copySource?'New table · save to create':occupied?'Occupied':reserved?'Reserved':'Available'):object.label}
                    tabIndex={draft || table ? 0 : -1}`);
const extraStart=s.indexOf('                        <small>{(table ?? copySource)!.seats} seats</small>'),extraEnd=s.indexOf('\n                      </>',extraStart);
if(extraStart<0||extraEnd<0)throw new Error('Label cleanup edit missing');s=s.slice(0,extraStart)+s.slice(extraEnd);
writeFileSync(file,s);
for(const p of ['package.json','apps/web/package.json']){const v=JSON.parse(readFileSync(p,'utf8'));v.version='0.4.25';writeFileSync(p,JSON.stringify(v,null,2)+'\n')}
const lock=JSON.parse(readFileSync('package-lock.json','utf8'));lock.version='0.4.25';lock.packages[''].version='0.4.25';lock.packages['apps/web'].version='0.4.25';writeFileSync('package-lock.json',JSON.stringify(lock,null,2)+'\n');
console.log('Floor geometry and label controls updated.');
