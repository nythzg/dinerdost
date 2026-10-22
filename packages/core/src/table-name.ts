/** Suggest a new serial name without renaming or reusing any existing identity. */
export function nextTableName(names:string[]):string {
 const groups=new Map<string,{prefix:string;width:number;max:number;count:number}>();
 for(const name of names){const match=/^(.*?)(\d+)$/.exec(name.trim());if(!match)continue;const value=Number(match[2]);if(!Number.isSafeInteger(value))continue;const key=match[1].toLowerCase(),group=groups.get(key)??{prefix:match[1],width:1,max:0,count:0};group.width=Math.max(group.width,match[2].length);group.max=Math.max(group.max,value);group.count++;groups.set(key,group);}
 const group=[...groups.values()].sort((a,b)=>b.count-a.count||a.prefix.localeCompare(b.prefix))[0]??{prefix:'T',width:2,max:0,count:0};
 const used=new Set(names.map(name=>name.toLowerCase()));let n=group.max+1;
 for(;;n++){const suffix=String(n).padStart(group.width,'0'),candidate=group.prefix.slice(0,Math.max(0,30-suffix.length))+suffix;if(!used.has(candidate.toLowerCase()))return candidate;}
}
