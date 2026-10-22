import {readFile,writeFile} from 'node:fs/promises';
const path='apps/web/src/features/tables/floor-plan.tsx';let s=await readFile(path,'utf8');
function replace(a,b){if(!s.includes(a))throw new Error('Missing anchor: '+a.slice(0,100));s=s.replace(a,b)}
replace('import {useRenameTable} from "./rename-table";','import {useRenameTable} from "./rename-table";\nimport {floorViewKey,parseFloorView,moveFloorSelection} from "./floor-editor-state";');
replace('const [chosenFloor, setFloor] = useState("");',`const [chosenFloor, chooseFloor] = useState("");
  const floorPreference=floorViewKey(data.actor.employeeId,data.outletId);
  const setFloor=(value:string)=>{chooseFloor(value);try{localStorage.setItem(floorPreference,value)}catch{}};
  useEffect(()=>{try{const stored=localStorage.getItem(floorPreference);chooseFloor(stored&&floors.includes(stored)?stored:floors[0]??'')}catch{chooseFloor(floors[0]??'')}},[floorPreference,JSON.stringify(floors)]);`);
replace('[selected, setSelected] = useState(""),','[selected, selectPrimary] = useState(""),');
replace('  const [draftOutline, setDraftOutline]',`  const [selection,setSelection]=useState<string[]>([]),[touchSelect,setTouchSelect]=useState(false);
  const setSelected=(id:string)=>{selectPrimary(id);setSelection(id?[id]:[])};
  const toggleSelection=(id:string)=>{setSelection(previous=>previous.includes(id)?previous.filter(x=>x!==id):[...previous,id]);selectPrimary(id)};
  const [draftOutline, setDraftOutline]`);
replace('  const manualZoom = useRef(false);',`  const manualZoom = useRef(false);
  const lockRef=useRef(false);lockRef.current=cameraLocked;
  const [hydratedView,setHydratedView]=useState('');
  const viewKey=floorViewKey(data.actor.employeeId,data.outletId,floor??'');
  const fitRef=useRef<()=>void>(()=>{});
  type Snapshot={objects:PlanObject[];area:FloorPlanSize;outline:FloorPoint[]|null;boundary:string;deleted:{tableId:string;version:number}[]};
  const history=useRef<Snapshot[]>([]),historyPosition=useRef(-1),historySkip=useRef(false),historyGesture=useRef(false);
  const [historyRevision,reviseHistory]=useState(0);
  const finishGesture=()=>{historyGesture.current=false;reviseHistory(n=>n+1)};
  useEffect(()=>{
    if(!draft){history.current=[];historyPosition.current=-1;historySkip.current=false;historyGesture.current=false;return}
    if(historySkip.current){historySkip.current=false;return}
    if(historyGesture.current)return;
    const next:Snapshot={objects:draft,area,outline,boundary:boundaryStyle,deleted:deletedTables};
    if(JSON.stringify(history.current[historyPosition.current])===JSON.stringify(next))return;
    history.current=[...history.current.slice(0,historyPosition.current+1),structuredClone(next)].slice(-81);historyPosition.current=history.current.length-1;
    reviseHistory(n=>n+1);
  },[draft,draftArea,draftOutline,boundaryStyle,deletedTables,historyRevision]);
  const restoreHistory=(delta:number)=>{
    const position=historyPosition.current+delta,snapshot=history.current[position];if(!draft||!snapshot||historyGesture.current)return;
    historyPosition.current=position;historySkip.current=true;setDraft(structuredClone(snapshot.objects));setDraftArea({...snapshot.area});setDraftOutline(structuredClone(snapshot.outline));setBoundaryStyle(snapshot.boundary);setDeletedTables(structuredClone(snapshot.deleted));setSelected('');reviseHistory(n=>n+1);
  };
  const syncRenamedTable=(tableId:string,label:string)=>{history.current=history.current.map(snapshot=>({...snapshot,objects:snapshot.objects.map(o=>o.tableId===tableId?{...o,label}:o)}));};`);
replace('    if (cameraLocked) return;\n    const element = surface.current;','    if (lockRef.current) return;\n    const element = surface.current;');
replace('  const zoomTo =','  fitRef.current=fitView;\n  const zoomTo =');
const start=s.indexOf('  useEffect(() => {\n    const element = surface.current;'),end=s.indexOf('  const drag = useRef<{',start);
if(start<0||end<0)throw new Error('Camera effect');
s=s.slice(0,start)+`  useEffect(() => {
    const element=surface.current;if(!element)return;
    let restored=null;try{restored=parseFloorView(localStorage.getItem(viewKey))}catch{}
    if(restored){const x=restored.pan.x,y=restored.pan.y,z=restored.zoom;
      // Recover a completely lost layout after an external area change.
      if(x+area.width*z<12||y+area.height*z<12||x>element.clientWidth-12||y>element.clientHeight-12)restored=null;
    }
    manualZoom.current=restored?.manual??true;lockRef.current=restored?.locked??false;setCameraLocked(lockRef.current);
    setZoom(restored?.zoom??1);setPan(restored?.pan??{x:Math.max(24,(element.clientWidth-area.width)/2),y:24});
    touchPoints.current.clear();pinch.current=null;setHydratedView(viewKey);
  },[viewKey]);
  useEffect(()=>{if(hydratedView!==viewKey)return;try{localStorage.setItem(viewKey,JSON.stringify({zoom,pan,locked:cameraLocked,manual:manualZoom.current}))}catch{}},[viewKey,hydratedView,zoom,pan,cameraLocked]);
  useEffect(()=>{
    const element=surface.current;if(!element)return;
    const observer=new ResizeObserver(()=>{if(!manualZoom.current&&!lockRef.current)fitRef.current()});observer.observe(element);
    const handle=(event:WheelEvent)=>wheel.current(event);element.addEventListener('wheel',handle,{passive:false});
    return()=>{observer.disconnect();element.removeEventListener('wheel',handle)};
  },[floor]);
`+s.slice(end);
replace('    startY: number;\n  } | null>(null);\n  const resizing', '    startY: number;\n    objects: PlanObject[];\n    ids:string[];\n  } | null>(null);\n  const resizing');
replace('    setSelected(object.id);\n    event.currentTarget.setPointerCapture(event.pointerId);',`    if(event.ctrlKey||event.metaKey||touchSelect){toggleSelection(object.id);event.preventDefault();return;}
    const ids=selection.includes(object.id)?selection:[object.id];
    if(!selection.includes(object.id))setSelected(object.id);else selectPrimary(object.id);
    historyGesture.current=true;
    event.currentTarget.setPointerCapture(event.pointerId);`);
replace('      id: object.id,\n      x: object.x,','      id: object.id,\n      objects:structuredClone(draft),ids,\n      x: object.x,');
replace('    const target=move(object,active.x+(event.clientX-active.startX)/zoom,active.y+(event.clientY-active.startY)/zoom);\n    update(object.id,{x:target.x,y:target.y});return true;',`    const dx=(event.clientX-active.startX)/zoom,dy=(event.clientY-active.startY)/zoom;
    if(active.ids.length>1)setDraft(moveFloorSelection(active.objects,active.ids,dx,dy,area,outline));
    else{const target=move(object,active.x+dx,active.y+dy);update(object.id,{x:target.x,y:target.y});}return true;`);
replace('        if (event.key.toLowerCase() === "c" && current)',`        if(event.key.toLowerCase()==='z'){event.preventDefault();restoreHistory(event.shiftKey?1:-1);return;}
        if (event.key.toLowerCase() === "c" && current)`);
replace('              setCameraLocked(value => !value);','              lockRef.current=!cameraLocked;setCameraLocked(lockRef.current);');
replace('            <small>\n              Ctrl+C / Ctrl+V',`            <button className="button" disabled={historyPosition.current<=0} onClick={()=>restoreHistory(-1)} aria-label="Undo layout change">Undo</button>
            <button className="button" disabled={historyPosition.current>=history.current.length-1} onClick={()=>restoreHistory(1)} aria-label="Redo layout change">Redo</button>
            <button className="button" aria-pressed={touchSelect} onClick={()=>setTouchSelect(value=>!value)}>Select multiple</button>
            {selection.length>1&&<span role="status">{selection.length} selected · drag together</span>}
            <small>
              Ctrl+Z / Ctrl+Shift+Z · Ctrl+C / Ctrl+V`);
replace('(draft && selected === object.id ? " is-selected" : "")','(draft && selection.includes(object.id) ? " is-selected" : "")');
replace('                    title={(table||copySource', '                    aria-pressed={draft?selection.includes(object.id):undefined}\n                    title={(table||copySource');
const pstart=s.indexOf('                    onPointerMove={(event) => {\n                      if (!drag.current'),pend=s.indexOf('                    onKeyDown={(event) => {',pstart);
if(pstart<0||pend<0)throw new Error('Object events');
s=s.slice(0,pstart)+`                    onPointerMove={event=>{continueDrag(event,object)}}
                    onPointerUp={()=>{drag.current=null;finishGesture()}}
                    onPointerCancel={()=>{drag.current=null;finishGesture()}}
                    onClick={event=>{if(!draft){if(table)openTable(table);return}manualZoom.current=true;if(event.detail===0){if(event.ctrlKey||event.metaKey||touchSelect)toggleSelection(object.id);else setSelected(object.id)}}}
`+s.slice(pend);
replace('                        const target = move(\n                          object,\n                          object.x + offset[0],\n                          object.y + offset[1],\n                        );\n                        update(object.id, { x: target.x, y: target.y });',`                        if(selection.length>1&&selection.includes(object.id))setDraft(moveFloorSelection(draft,selection,offset[0],offset[1],area,outline));
                        else{const target=move(object,object.x+offset[0],object.y+offset[1]);update(object.id,{x:target.x,y:target.y})}`);
replace('                current &&\n                ["se", "e", "s"]','                current && selection.length<=1 &&\n                ["se", "e", "s"]');
replace('                      resizing.current = {\n                        object:', '                      historyGesture.current=true;\n                      resizing.current = {\n                        object:');
// These callbacks clear both drag types (the body event callbacks above are separate).
s=s.replaceAll('                      resizing.current = null;\n                      drag.current = null;','                      resizing.current = null;\n                      drag.current = null;finishGesture();');
replace('if(plan)baseVersion.current=plan.version;update(current.id,{label:result.label});','if(plan)baseVersion.current=plan.version;syncRenamedTable(table.id,result.label);update(current.id,{label:result.label});');
// A cancelled single-finger edit before a pinch must restore the whole group.
replace('            if (drag.current)\n              update(drag.current.id, { x: drag.current.x, y: drag.current.y });','            if (drag.current)setDraft(drag.current.objects);');
replace('            panDrag.current = null;\n            setSelected(touchStartSelection.current);','            panDrag.current = null;finishGesture();\n            setSelected(touchStartSelection.current);');
await writeFile(path,s);console.log('Floor draft history, selection and scoped view preferences added.');
