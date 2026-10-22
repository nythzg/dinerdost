import {readFileSync,writeFileSync} from 'node:fs';
function edit(path,changes){let text=readFileSync(path,'utf8');for(const [before,after] of changes){if(!text.includes(before))throw Error('Missing target in '+path+': '+before.slice(0,60));text=text.replace(before,after);}writeFileSync(path,text);}
edit('apps/web/src/features/tables/rename-table.tsx',[[',maxLength:30','']]);
edit('apps/web/src/features/workspace/service-pages.tsx',[
 ['  diningTableGroups,','  diningTableGroups,\n  nextTableName,'],
 ['  const addTable = () =>','  const suggestedTableName=nextTableName((data.tables??[]).map((table:Row)=>table.label));\n  const addTable = () =>'],
 ['{ name: "label", label: "Table name", placeholder: "T13" }','{ name: "label", label: "Table name", value:suggestedTableName,required:false,preserveBlank:true,help:"Suggested serial name. Change it to use your own name." }'],
 ['(v) => run("table", { ...v, outletId: data.outletId })','(v) => run("table", { ...v,label:v.label===suggestedTableName?"":v.label, outletId: data.outletId })'],
 ['? <Icon name="payments" />','? <Icon name="split" />'],
 ['{item.ready_food_batch_id && <small>{Number(item.ready_quantity)/1000} {item.unit} · Use by {date(item.ready_use_by)}</small>}',''],
 ]);
edit('apps/web/src/features/tables/floor-plan.tsx',[
 ['  nextCopiedTableLabel,','  nextCopiedTableLabel,\n  nextTableName,'],
 ['import { ExploreHeader } from "./explore-header";','import { ExploreHeader } from "./explore-header";\nimport {useRenameTable} from "./rename-table";'],
 ['export function FloorPlan() {','export function FloorPlan() {\n  const renameTable=useRenameTable();'],
 ['  const floors = [','  const suggestedTableName=nextTableName((data.tables??[]).map((table:Row)=>table.label));\n  const floors = ['],
 ['{ name: "label", label: "Table name" }','{ name: "label", label: "Table name",value:suggestedTableName,required:false,preserveBlank:true,help:"Suggested serial name. Change it to use your own name." }'],
 ['(v) => run("table", { ...v, outletId: data.outletId, floor })','(v) => run("table", { ...v,label:v.label===suggestedTableName?"":v.label, outletId: data.outletId, floor })'],
 ['          {current.kind !== "TABLE" && (','          {current.kind === "TABLE" && can(data.actor,"settings") && <button className="button" onClick={()=>{const table=tables.find(t=>t.id===current.tableId);if(table)renameTable(table,result=>{const plan=result.plans.find((p:Row)=>p.floor===floor);if(plan)baseVersion.current=plan.version;update(current.id,{label:result.label});});else form("Rename copied table",[{name:"label",label:"Table name",value:current.label}],values=>{update(current.id,{label:String(values.label).trim()});},"Rename table");}}>Rename table</button>}\n          {current.kind !== "TABLE" && ('],
 ]);
edit('apps/web/src/features/guest/guest-page.tsx',[
 ['<span className="ready-food-tag">Ready to serve</span><small>{Number(m.ready_quantity)/1000} {m.unit} · Use by {date(m.ready_use_by)}</small>','<span className="ready-food-tag">Ready to serve</span>'],
 ['{m.description && <p>{m.description}</p>}','{m.description && !m.ready_to_serve && <p>{m.description}</p>}'],
 ]);
edit('apps/web/src/features/storefront/storefront-page.tsx',[[ '<span className="ready-food-tag">Ready to serve</span><small>{Number(item.ready_quantity)/1000} {item.unit} · Use by {date(item.ready_use_by)}</small>','<span className="ready-food-tag">Ready to serve</span>']]);
edit('apps/web/src/styles/review-046.css',[
 ['.ready-food-tag{display:inline-flex;background:#eaf1e6;color:#193f30;','.ready-food-tag{display:inline-flex;background:#193f30;color:#fff;'],
 ['.guest-shell .guest-menu article.is-added .ready-food-tag{background:#eaf1e6;color:#193f30}','.guest-shell .guest-menu article.is-added .ready-food-tag{background:#102d22;color:#fff;border:1px solid #91aa82}'],
 ]);
edit('apps/web/src/features/workspace/workspace-tools.tsx',[
 ['import Link from \'next/link\';','import Link from \'next/link\';\nimport {usePathname} from \'next/navigation\';'],
 [' const {data}=useDesk();',' const {data}=useDesk();\n const pathname=usePathname();\n const [summaryPosition,setSummaryPosition]=useState<{left:number;width:number}|null>(null);\n useEffect(()=>{let anchor:Element|null=null;const measure=()=>{if(!anchor)return;const rect=anchor.getBoundingClientRect(),width=Math.min(rect.width,window.innerWidth-24),left=Math.max(12,Math.min(rect.left,window.innerWidth-width-12));setSummaryPosition(old=>old&&old.left===left&&old.width===width?old:{left,width});};const size=new ResizeObserver(measure);const find=()=>{const next=document.querySelector(".total-panel");if(next===anchor)return;if(anchor)size.unobserve(anchor);anchor=next;if(anchor){size.observe(anchor);measure()}else setSummaryPosition(null);};const mutation=new MutationObserver(find);mutation.observe(document.querySelector(".main-content")??document.body,{childList:true,subtree:true});find();window.addEventListener("resize",measure);window.addEventListener("scroll",measure,true);return()=>{mutation.disconnect();size.disconnect();window.removeEventListener("resize",measure);window.removeEventListener("scroll",measure,true);};},[pathname]);'],
 ['return <div className="workspace-docks">','return <div className={"workspace-docks"+(summaryPosition?" summary-aligned":"")} style={summaryPosition?{left:summaryPosition.left,width:summaryPosition.width,right:"auto"}:undefined}>'],
 ]);
edit('apps/web/src/styles/workspace-tools.css',[
 [' .workspace-dock-trigger{',' .workspace-docks.summary-aligned{padding:8px;background:#fff;border:1px solid var(--line);border-radius:12px;box-sizing:border-box}.workspace-docks.summary-aligned>div{flex:1;min-width:0}.workspace-docks.summary-aligned .workspace-dock-trigger{width:100%;justify-content:center}\n .floor-plan-view .floor-plan-inspector{margin-bottom:76px}.floor-plan-inspector .inline-actions{flex-wrap:wrap}\n .orders-panel tr:has(.vip-order-marker) .button:not(.primary):not(.order-menu-trigger),.overview-grid tr:has(.vip-order-marker) .button:not(.primary):not(.order-menu-trigger),#ready-orders tr:has(.vip-order-marker) .button:not(.primary):not(.order-menu-trigger){background:#fff!important;color:#193f30!important}\n .workspace-dock-trigger{'],
 ]);
edit('apps/web/src/features/orders/selected-round-actions.tsx',[
 ['import { businessLocalToISO, can, type PaymentMethod }','import { can, type PaymentMethod }'],
 ['[useBy, setUseBy] = useState(""),','[hours, setHours] = useState(""),[minutes,setMinutes]=useState(""),'],
 ['...(reallocate ? { useBy: businessLocalToISO(useBy) } : {}),','...(reallocate ? { useBy: new Date(Date.now()+(Number(hours)*60+Number(minutes))*60000).toISOString() } : {}),'],
 ['          Prepared food use-by (India time)\n          <input\n            type="datetime-local" aria-label="Prepared food use-by (India time)"\n            required\n            value={useBy}\n            disabled={busy}\n            onChange={(e) => setUseBy(e.target.value)}\n          />','          Prepared food timer\n          <span className="prepared-duration"><label>Hours<input type="number" aria-label="Prepared food hours" min="0" max="8760" step="1" required value={hours} disabled={busy} onChange={event=>setHours(event.target.value)}/></label><b aria-hidden="true">:</b><label>Minutes<input type="number" aria-label="Prepared food minutes" min="0" max="59" step="1" required value={minutes} disabled={busy} onChange={event=>setMinutes(event.target.value)}/></label></span>'],
 ['Enter the actual approved use-by time. Reallocation cannot extend an','Countdown starts when saved. Enter the approved remaining time. Reallocation cannot extend an'],
 ['disabled={busy}>','disabled={busy || (reallocate && Number(hours)*60+Number(minutes)<=0)}>'],
 ]);
edit('tests/browser/material-setup.spec.ts',[
 ["await expect(badge).toHaveCSS('color','rgb(25, 63, 48)');await expect(badge).toHaveCSS('background-color','rgb(234, 241, 230)');","await expect(badge).toHaveCSS('color','rgb(255, 255, 255)');await expect(badge).toHaveCSS('background-color','rgb(16, 45, 34)');"],
 ["await expect(card).toContainText('Use by');","await expect(card).not.toContainText('Use by');await expect(card).not.toContainText('Prepared portions available now');"],
 ]);
edit('tests/browser/priority-qr-updates.spec.ts',[["await expect(row).toContainText('VIP');await page.screenshot", "await expect(row).toContainText('VIP');await expect(row.getByRole('button',{name:'Open order '+o.number,exact:true})).toHaveCSS('color','rgb(25, 63, 48)');await page.screenshot"]]);
