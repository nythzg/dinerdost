"use client";
import {FixtureLabels,FixtureSymbol,useFixtureLayout} from "./fixture-details";
import { T } from "@/lib/staff-language";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  isManager,
  can,
  defaultFloorPlanSize,
  floorPlanFixtures,
  fitFloorObject,
  rotateFloorPoint,
  floorOutline,
  nextCopiedTableLabel,
  nextTableName,
  placeFloorTable,
  type FloorPlanKind as Kind,
  type FloorPlanObject as PlanObject,
  type FloorPlanSize,
  type FloorResizeDirection,
  type FloorPoint,
  floorEllipse,
  floorObjectCorners,
  floorFixtureLabel,
  floorAllowsOutside,
  floorObjectAllowed,
  floorObjectsOverlap,
  fitFloorPlacement,
  placeFloorFixture,
  roundedFloorBoundary,
  constrainFloorChange,
} from "@dinerdost/core";
import { Empty, Icon } from "@/components/ui";
import { type Row } from "@/lib/client";
import { useDesk } from "../workspace/context";
import { OutlineEditor } from "./outline-editor";
import { ExploreHeader } from "./explore-header";
import {useRenameTable} from "./rename-table";
import {floorViewKey,parseFloorView,resizeFloorArea,type FloorAreaDraft} from "./floor-editor-state";

import {defaultSnapSettings,snapFloorMove,snapFloorResize,snapFloorArea,snapFloorPlacement,type SnapGuide} from './floor-snapping';
import {SnappingControls,SnapGuides} from './snapping-controls';

const resizeDirections:FloorResizeDirection[]=['nw','n','ne','w','e','sw','s','se'];
const resizeLabels:Record<FloorResizeDirection,string>={nw:'top left corner',n:'top edge',ne:'top right corner',w:'left edge',e:'width',sw:'bottom left corner',s:'height',se:'corner'};
const resizeVectors:Record<FloorResizeDirection,[number,number]>={nw:[-1,-1],n:[0,-1],ne:[1,-1],w:[-1,0],e:[1,0],sw:[-1,1],s:[0,1],se:[1,1]};
const starterFixtures = [
  { kind: "RECEPTION", label: "Reception", x: 30, y: 20 },
  { kind: "WASHROOM", label: "Washroom", x: 990, y: 20 },
  { kind: "ENTRY", label: "Entry/Exit", x: 30, y: 710 },
  { kind: "STAIRS", label: "Staircase", x: 990, y: 710 },
] as const;
function starterTables(tables: Row[]): PlanObject[] {
  const columns = 6,
    cellWidth = 180,
    cellHeight = 150;
  return tables.map((table, index) => ({
    id: "table-" + table.id,
    kind: "TABLE",
    tableId: table.id,
    label: table.label,
    x: Math.round(60 + (index % columns) * cellWidth),
    y: Math.round(130 + Math.floor(index / columns) * cellHeight),
    width: 150,
    height: 110,
  }));
}
export function FloorPlan() {
  const renameTable=useRenameTable();
  const desk = useDesk(),
    { data, run, busy, form, go, notify, close, modal } = desk;
  const suggestedTableName=nextTableName((data.tables??[]).map((table:Row)=>table.label));
  const floors = [
    ...new Set<string>([
      ...(data.tables ?? []).map((table: Row) => table.floor),
      ...(data.floorPlans ?? []).map((plan: Row) => plan.floor),
    ]),
  ];
  const [chosenFloor, chooseFloor] = useState("");
  const floorPreference=floorViewKey(data.actor.employeeId,data.outletId);
  const setFloor=(value:string)=>{chooseFloor(value);try{localStorage.setItem(floorPreference,value)}catch{}};
  useEffect(()=>{try{const stored=localStorage.getItem(floorPreference);chooseFloor(stored&&floors.includes(stored)?stored:floors[0]??'')}catch{chooseFloor(floors[0]??'')}},[floorPreference,JSON.stringify(floors)]);
  const floor = floors.includes(chosenFloor) ? chosenFloor : floors[0];
  const tables: Row[] = (data.tables ?? []).filter(
    (table: Row) => table.floor === floor,
  );
  const saved = (data.floorPlans ?? []).find(
    (plan: Row) => plan.floor === floor,
  );
  const [draft, setDraft] = useState<PlanObject[] | null>(null),
    [selected, selectPrimary] = useState(""),
    [fixture, setFixture] = useState<Kind>("RECEPTION"),
    [zoom, setZoom] = useState(1),
    [cameraLocked, setCameraLocked] = useState(false),
    [pan, setPan] = useState({ x: 0, y: 0 }),
    [boundaryStyle, setBoundaryStyle] = useState("STROKE"),
    [boundaryRoundness,setBoundaryRoundness]=useState(0),
    [deletedTables, setDeletedTables] = useState<
      { tableId: string; version: number }[]
    >([]),
    [draftArea, setDraftArea] = useState<FloorPlanSize | null>(null),
    [resizingArea,setResizingArea]=useState(false),
    [areaOrigin,setAreaOrigin]=useState({x:0,y:0}),
    [clipboard, setClipboard] = useState<PlanObject | null>(null);
  const [snapSettings,setSnapSettings]=useState({...defaultSnapSettings});
  const [snapGuides,setSnapGuides]=useState<SnapGuide[]>([]);
  const [selection,setSelection]=useState<string[]>([]),[touchSelect,setTouchSelect]=useState(false);
  const setSelected=(id:string)=>{if(id)setResizingArea(false);selectPrimary(id);setSelection(id?[id]:[])};
  const toggleSelection=(id:string)=>{const next=selection.includes(id)?selection.filter(x=>x!==id):[...selection,id];setSelection(next);selectPrimary(next.at(-1)??'')};
  const [draftOutline, setDraftOutline] = useState<FloorPoint[] | null>(null);
  const outline: FloorPoint[] | null = draft
    ? draftOutline
    : (saved?.outline ?? null);
  const area =
    draftArea ??
    (saved
      ? { width: saved.width, height: saved.height }
      : {
          ...defaultFloorPlanSize,
          height: Math.max(
            defaultFloorPlanSize.height,
            Math.ceil(tables.length / 6) * 150 + 180,
          ),
        });
  const baseVersion = useRef(0);
  const surface = useRef<HTMLDivElement>(null);
  const manualZoom = useRef(false);
  const lockRef=useRef(false);lockRef.current=cameraLocked;
  const [hydratedView,setHydratedView]=useState('');
  const viewKey=floorViewKey(data.actor.employeeId,data.outletId,floor??'');
  const fitRef=useRef<()=>void>(()=>{});
  type Snapshot={objects:PlanObject[];area:FloorPlanSize;outline:FloorPoint[]|null;boundary:string;roundness:number;origin:{x:number;y:number};deleted:{tableId:string;version:number}[]};
  const history=useRef<Snapshot[]>([]),historyPosition=useRef(-1),historySkip=useRef(false),historyGesture=useRef(false);
  const [historyRevision,reviseHistory]=useState(0);
  const finishGesture=()=>{setSnapGuides([]);historyGesture.current=false;reviseHistory(n=>n+1)};
  useEffect(()=>{
    if(!draft){history.current=[];historyPosition.current=-1;historySkip.current=false;historyGesture.current=false;return}
    if(historySkip.current){historySkip.current=false;return}
    if(historyGesture.current)return;
    const next:Snapshot={objects:draft,area,outline,boundary:boundaryStyle,roundness:boundaryRoundness,origin:areaOrigin,deleted:deletedTables};
    if(JSON.stringify(history.current[historyPosition.current])===JSON.stringify(next))return;
    history.current=[...history.current.slice(0,historyPosition.current+1),structuredClone(next)].slice(-81);historyPosition.current=history.current.length-1;
    reviseHistory(n=>n+1);
  },[draft,draftArea,draftOutline,boundaryStyle,boundaryRoundness,areaOrigin,deletedTables,historyRevision]);
  const restoreHistory=(delta:number)=>{
    const position=historyPosition.current+delta,snapshot=history.current[position];if(!draft||!snapshot||historyGesture.current)return;
    setPan(p=>({x:p.x+(snapshot.origin.x-areaOrigin.x)*zoom,y:p.y+(snapshot.origin.y-areaOrigin.y)*zoom}));setAreaOrigin({...snapshot.origin});
    historyPosition.current=position;historySkip.current=true;setDraft(structuredClone(snapshot.objects));setDraftArea({...snapshot.area});setDraftOutline(structuredClone(snapshot.outline));setBoundaryStyle(snapshot.boundary);setBoundaryRoundness(snapshot.roundness);setDeletedTables(structuredClone(snapshot.deleted));setSelected('');reviseHistory(n=>n+1);
  };
  const syncRenamedTable=(tableId:string,label:string)=>{history.current=history.current.map(snapshot=>({...snapshot,objects:snapshot.objects.map(o=>o.tableId===tableId?{...o,label}:o)}));};
  const areaDrag=useRef<{layout:FloorAreaDraft;origin:{x:number;y:number};pan:{x:number;y:number};zoom:number;pointerId:number;direction:FloorResizeDirection;start:{x:number;y:number}}|null>(null);
  const panMoved = useRef(false);
  const touchPoints = useRef(new Map<number, { x: number; y: number }>());
  const touchStartSelection = useRef("");
  const pinch = useRef<{
    distance: number;
    zoom: number;
    pan: { x: number; y: number };
    center: { x: number; y: number };
  } | null>(null);
  const panDrag = useRef<{
    x: number;
    y: number;
    startX: number;
    startY: number;
  } | null>(null);
  const fitView = () => {
    if (lockRef.current || areaDrag.current) return;
    const element = surface.current;
    if (!element) return;
    const points=[{x:0,y:0},{x:area.width,y:area.height},...(draft??saved?.objects??[]).filter(floorAllowsOutside).flatMap(floorObjectCorners)];
    const minX=Math.min(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y)),width=Math.max(...points.map(p=>p.x))-minX,height=Math.max(...points.map(p=>p.y))-minY;
    const next=Math.max(.05,Math.min(1,(element.clientWidth-64)/width,(element.clientHeight-64)/height));
    manualZoom.current=false;setZoom(next);setPan({x:(element.clientWidth-width*next)/2-minX*next,y:(element.clientHeight-height*next)/2-minY*next});
  };
  fitRef.current=fitView;
  useEffect(()=>{if(!resizingArea)return;const frame=requestAnimationFrame(()=>fitRef.current());return()=>cancelAnimationFrame(frame)},[resizingArea]);
  const zoomTo = (next: number, point?: { x: number; y: number }) => {
    if (cameraLocked || areaDrag.current) return;
    const element = surface.current;
    if (!element) return;
    next = Math.max(0.05, Math.min(4, next));
    const center = point ?? {
      x: element.clientWidth / 2,
      y: element.clientHeight / 2,
    };
    manualZoom.current = true;
    setPan({
      x: center.x - ((center.x - pan.x) * next) / zoom,
      y: center.y - ((center.y - pan.y) * next) / zoom,
    });
    setSnapGuides([]);setZoom(next);
  };
  const wheel = useRef<(event: WheelEvent) => void>(() => {});
  wheel.current = (event) => {
    event.preventDefault();
    if (cameraLocked || areaDrag.current) return;
    const rect = surface.current!.getBoundingClientRect();
    if (event.ctrlKey || event.metaKey)
      zoomTo(zoom * Math.exp(-event.deltaY * 0.002), {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    else {
      manualZoom.current = true;
      setPan((p) => ({ x: p.x - event.deltaX, y: p.y - event.deltaY }));
    }
  };
  useEffect(() => {
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
  const drag = useRef<{
    id: string;
    x: number;
    y: number;
    startX: number;
    startY: number;
    objects: PlanObject[];
    ids:string[];
  } | null>(null);
  const resizing = useRef<{
    object: PlanObject;
    x: number;
    y: number;
    direction: FloorResizeDirection;
  } | null>(null);
  const template = starterTables(tables);
  const persisted: PlanObject[] = saved
    ? saved.objects.filter(
        (object: PlanObject) =>
          object.kind !== "TABLE" ||
          tables.some((table) => table.id === object.tableId),
      )
    : starterFixtures.map((item) => ({
        ...item,
        id: "fixture-" + item.kind.toLowerCase(),
        width: 180,
        height: 70,
      }));
  const fallback = [...persisted];
  for (const object of template) {
    if (fallback.some((placed) => placed.tableId === object.tableId)) continue;
    const placed = saved
      ? placeFloorTable(object, area, outline, fallback)
      : fitFloorObject(object, area);
    if (placed) fallback.push(placed);
  }
  const visible: PlanObject[] = draft ?? fallback;
  const current = visible.find((object) => object.id === selected);
  const fixtureObjects=visible.map(object=>({...object,label:tables.find(table=>table.id===object.tableId)?.label??object.label}));
  const fixtureLayout=useFixtureLayout(fixtureObjects,zoom,draft&&current?[current]:[]);
  const handleOutset=current?Math.max(0,11/zoom-Math.min(current.width,current.height)/2):0;
  const roundness=draft?boundaryRoundness:Number(saved?.boundary_roundness??0);
  const snapConfig={...snapSettings,zoomFactor:zoom};
  const snapPlaced=(object:PlanObject)=>snapFloorPlacement(object,draft??[],area,outline,roundness,snapConfig);
  const moveSelection=(objects:PlanObject[],ids:string[],dx:number,dy:number,bypass=false,keyboard=false)=>{
    const next=snapFloorMove(objects,ids,dx,dy,area,outline,roundness,keyboard?{...snapConfig,zoomFactor:Math.max(1,zoom)}:snapConfig,bypass);setDraft(next.objects);setSnapGuides(next.guides);
  };
  const resizeObject=(object:PlanObject,direction:FloorResizeDirection,dw:number,dh:number,bypass=false,keyboard=false)=>{
    const next=snapFloorResize(object,direction,dw,dh,draft??[],area,outline,roundness,keyboard?{...snapConfig,zoomFactor:Math.max(1,zoom)}:snapConfig,bypass);update(object.id,next.object);setSnapGuides(next.guides);
  };
  const resizeArea=(layout:FloorAreaDraft,direction:FloorResizeDirection,dx:number,dy:number,origin:{x:number;y:number},viewPan:{x:number;y:number},viewZoom:number,bypass=false,keyboard=false)=>{
    const next=snapFloorArea(layout,direction,dx,dy,roundness,{...snapSettings,zoomFactor:keyboard?Math.max(1,viewZoom):viewZoom},bypass);applyAreaChange(next.change,origin,viewPan,viewZoom);setSnapGuides(next.guides);
  };

  const conflicts=new Set(visible.flatMap((o,i)=>visible.slice(i+1).filter(other=>floorObjectsOverlap(o,other)).flatMap(other=>[o.id,other.id])));

  const update = (id: string, change: Partial<PlanObject>) =>
    setDraft(
      (previous) =>
        previous?.map((object) => {
          if(object.id!==id)return object;
          const next={...object,...change};
          return ['x','y','width','height','rotation','allowOutside'].some(key=>key in change)?constrainFloorChange(object,next,previous!.filter(o=>o.id!==id),area,outline,roundness):next;
        }) ?? null,
    );
  const startArrange = () => {
    setSnapGuides([]);
    baseVersion.current = saved?.version ?? 0;
    setDraft(visible.map((object) => ({ ...object,kind:object.kind==='EXIT'?'ENTRY':object.kind,label:floorFixtureLabel(object) })));
    setAreaOrigin({x:0,y:0});setResizingArea(false);
    setSelected("");
    setDraftArea({ ...area });
    setDraftOutline(saved?.outline ?? null);
    setBoundaryStyle(saved?.boundary_style ?? "STROKE");
    setBoundaryRoundness(Number(saved?.boundary_roundness??0));
    setDeletedTables([]);
  };
  const copy = () => {
    if (!draft || !current) return;
    setClipboard({ ...current });
    notify("Copied.");
  };
  const paste = () => {
    if (!draft || !clipboard) return;
    if (draft.length >= 250) {
      notify("This floor plan has reached 250 objects.");
      return;
    }
    const object = {
      ...clipboard,
      kind:clipboard.kind==='EXIT'?'ENTRY' as const:clipboard.kind,
      id: crypto.randomUUID(),
      x: clipboard.x + 30,
      y: clipboard.y + 30,
    };
    if (object.kind === "TABLE") {
      if (!can(data.actor.role, "settings")) {
        notify("Only the owner can create a copied table.");
        return;
      }
      const sourceId = object.copyOfTableId ?? object.tableId;
      if (!object.newTable && !tables.some((table) => table.id === sourceId)) {
        notify("Copy a table from this floor.");
        return;
      }
      if(!object.newTable)object.copyOfTableId = sourceId;
      delete object.tableId;
      object.label = nextCopiedTableLabel(clipboard.label, [
        ...data.tables.map((table: Row) => table.label),
        ...draft.map((object) => object.label),
      ]);
    }
    const placed = placeFloorFixture(object,area,outline,draft,roundness);
    if(!placed){notify("There is no free space for this copy. Move an object or enlarge the floor first.");return;}
    const snapped=snapPlaced(placed);
    setDraft((previous) => [...previous!, snapped]);
    setSelected(snapped.id);
    setClipboard({ ...snapped });
  };
  const applyAreaChange=(change:ReturnType<typeof resizeFloorArea>,origin:{x:number;y:number},viewPan:{x:number;y:number},viewZoom:number)=>{
    setDraft(change.objects);setDraftArea(change.area);setDraftOutline(change.outline);
    setAreaOrigin({x:origin.x+change.offset.x,y:origin.y+change.offset.y});
    setPan({x:viewPan.x+change.offset.x*viewZoom,y:viewPan.y+change.offset.y*viewZoom});
  };
  const startAreaResize=(event:PointerEvent<HTMLButtonElement>,direction:FloorResizeDirection)=>{
    event.preventDefault();event.stopPropagation();if(!draft||areaDrag.current)return;
    // Thin floors can have overlapping touch targets; honor the visible knob under the pointer.
    const exact=Array.from(event.currentTarget.closest('.floor-plan-canvas')!.querySelectorAll<HTMLButtonElement>('[data-area-resize-direction]')).find(handle=>{
      const rect=handle.querySelector('span')!.getBoundingClientRect();
      return event.clientX>=rect.left&&event.clientX<=rect.right&&event.clientY>=rect.top&&event.clientY<=rect.bottom;
    });
    (exact??event.currentTarget).focus({preventScroll:true});
    manualZoom.current=true;historyGesture.current=true;panMoved.current=false;
    areaDrag.current={layout:{area:{...area},outline:structuredClone(outline),objects:structuredClone(draft)},origin:{...areaOrigin},pan:{...pan},zoom,pointerId:event.pointerId,direction:(exact?.dataset.areaResizeDirection as FloorResizeDirection|undefined)??direction,start:{x:event.clientX,y:event.clientY}};
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const abortAreaDrag=()=>{
    const active=areaDrag.current;if(active)applyAreaChange({...active.layout,offset:{x:0,y:0}},active.origin,active.pan,active.zoom);
    areaDrag.current=null;finishGesture();
  };
  const cancelArrange=()=>{
    setPan(p=>({x:p.x-areaOrigin.x*zoom,y:p.y-areaOrigin.y*zoom}));setAreaOrigin({x:0,y:0});setResizingArea(false);areaDrag.current=null;
    setSnapGuides([]);setDraft(null);setDraftArea(null);setSelected('');
  };
  const openTable = (table: Row) => {
    if (table.is_occupied) {
      if (
        !data.sessions.some((session: Row) => session.table_id === table.id)
      ) {
        notify("This table is assigned to another staff member.");
        return;
      }
      go("/app/table-billing/" + table.id);
      return;
    }
    const booking = (data.reservations ?? []).find(
      (entry: Row) =>
        entry.table_id === table.id &&
        entry.state === "HELD" &&
        new Date(entry.starts_at).getTime() <= Date.now() + 15 * 60000,
    );
    form(
      "Open " + table.label,
      [
        {
          name: "guests",
          label: "Guests",
          type: "number",
          min: 1,
          max: table.seats,
          value: booking?.guests ?? Math.min(2, table.seats),
        },
      ],
      async (values) => {
        const session = await run("openSession", {
          tableId: table.id,
          guests: values.guests,
          ...(booking ? { reservationId: booking.id } : {}),
        });
        go("/app/pos?session=" + session.id);
      },
      "Open table",
    );
  };
  const pointerDown = (
    event: PointerEvent<HTMLButtonElement>,
    object: PlanObject,
  ) => {
    if (!draft) return;
    setResizingArea(false);
    manualZoom.current = true;
    if(event.ctrlKey||event.metaKey||touchSelect){toggleSelection(object.id);event.preventDefault();return;}
    const ids=selection.includes(object.id)?selection:[object.id];
    if(!selection.includes(object.id))setSelected(object.id);else selectPrimary(object.id);
    historyGesture.current=true;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      id: object.id,
      objects:structuredClone(draft),ids,
      x: object.x,
      y: object.y,
      startX: event.clientX,
      startY: event.clientY,
    };
  };
  const removeSelected = () => {
    if (!draft || !current) return;
    if (current.tableId) {
      if (!can(data.actor, "settings")) {
        notify("Only the owner can delete a table.");
        return;
      }
      const table = tables.find((t) => t.id === current.tableId)!;
      if (
        table.is_occupied ||
        (data.reservations ?? []).some(
          (r: Row) =>
            r.table_id === table.id &&
            ["HELD", "SEATED"].includes(r.state) &&
            new Date(r.ends_at).getTime() > Date.now(),
        )
      ) {
        notify(
          "Close sessions and move reservations before deleting this table.",
        );
        return;
      }
      if (draft.some((o) => o.copyOfTableId === table.id)) {
        notify("Remove this table’s unsaved copies first.");
        return;
      }
      setDeletedTables((previous) => [
        ...previous,
        { tableId: table.id, version: table.version },
      ]);
    }
    setDraft((previous) => previous!.filter((o) => o.id !== current.id));
    setSelected("");
  };
  const continueDrag=(event:PointerEvent<HTMLButtonElement>,object:PlanObject)=>{
    const active=drag.current;if(!active||active.id!==object.id)return false;
    const dx=(event.clientX-active.startX)/zoom,dy=(event.clientY-active.startY)/zoom;
    moveSelection(active.objects,active.ids,dx,dy,event.altKey);return true;
  };
  const displayOutline = outline ?? floorOutline("Rectangle", area);
  const boundaryGeometry=roundedFloorBoundary(displayOutline,roundness);
  const shownBoundary = draft
    ? boundaryStyle
    : (saved?.boundary_style ?? "STROKE");
  const manageFloor = (rename = false) =>
    form(
      rename ? "Rename floor" : "Add floor",
      [
        {
          name: "name",
          label: "Floor name",
          value: rename ? floor : "",
          placeholder: "Rooftop, Garden, First floor…",
        },
      ],
      async (values) => {
        const result = await run("floor", {
          outletId: data.outletId,
          name: values.name,
          ...(rename
            ? { previousName: floor, version: saved?.version ?? 0 }
            : {}),
        });
        setFloor(result.floor);
        close();
        notify(rename ? "Floor renamed." : "Floor added.");
      },
      rename ? "Rename floor" : "Add floor",
    );
  const addDraftTable=()=>{
    if(!draft||!can(data.actor,'settings')){notify('Only the owner can add a table.');return;}
    form('Add table to layout',[
      {name:'label',label:'Table name',value:nextTableName([...data.tables.map((t:Row)=>t.label),...draft.map(o=>o.label)]),help:'Save layout to create this table.'},
      {name:'seats',label:'Seats',type:'number',min:1,max:100,value:4}
    ],async values=>{
      if(draft.length>=250)throw new Error('This floor plan has reached 250 objects.');
      const placed=placeFloorTable({id:crypto.randomUUID(),kind:'TABLE',label:String(values.label).trim(),newTable:{seats:Number(values.seats)},x:0,y:0,width:120,height:90},area,outline,draft,roundness);
      if(!placed)throw new Error('There is no free space on this floor. Resize the area or move an object first.');
      manualZoom.current=true;setDraft(previous=>[...previous!,snapPlaced(placed)]);setSelected(placed.id);
    },'Place table');
  };
  const floorControls = (
    <>
      {isManager(data.actor) && !draft && (
        <>
          <button className="button" onClick={() => manageFloor()}>
            <Icon name="plus" />
            <T>{"Add floor"}</T>
          </button>
          {floor && can(data.actor, "settings") && (
            <button
              className="button"
              onClick={() =>
                form(
                  "Add table",
                  [
                    { name: "label", label: "Table name",value:suggestedTableName,required:false,preserveBlank:true,help:"Suggested serial name. Change it to use your own name." },
                    {
                      name: "seats",
                      label: "Seats",
                      type: "number",
                      min: 1,
                      max: 100,
                      value: 4,
                    },
                  ],
                  (v) => run("table", { ...v,label:v.label===suggestedTableName?"":v.label, outletId: data.outletId, floor }),
                  "Add table",
                )
              }
            >
              <Icon name="plus" />
              <T>{"Add table"}</T>
            </button>
          )}
          {floor && (
            <button
              className="icon-button"
              aria-label="Rename floor"
              title="Rename floor"
              onClick={() => manageFloor(true)}
            >
              <Icon name="edit" />
            </button>
          )}
        </>
      )}
    </>
  );
  if (!floors.length)
    return <Empty action={floorControls}>Add your first floor.</Empty>;
  return (
    <section
      className="floor-plan-page"
      onKeyDownCapture={(event) => {
        if (!draft || !(event.ctrlKey || event.metaKey) || event.altKey) return;
        const target = event.target as HTMLElement;
        if (target.closest("input,textarea,select,[contenteditable=true]"))
          return;
        if(event.key.toLowerCase()==='z'){event.preventDefault();restoreHistory(event.shiftKey?1:-1);return;}
        if (event.key.toLowerCase() === "c" && current) {
          event.preventDefault();
          copy();
        }
        if (event.key.toLowerCase() === "v" && clipboard) {
          event.preventDefault();
          paste();
        }
      }}
    >
      <ExploreHeader
        key={data.actor.employeeId + String(!!draft)}
        account={data.actor.employeeId}
        arranging={!!draft}
      >
        <div className="toolbar floor-plan-toolbar">
          <select
            aria-label="Floor plan floor"
            value={floor}
            disabled={!!draft}
            onChange={(event) => {
              setFloor(event.target.value);
              setSelected("");
            }}
          >
            {floors.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
          {floorControls}
          <div className="floor-plan-legend">
            <span>
              <i />
              <T>{"Available"}</T>
            </span>
            <span>
              <i className="occupied" />
              <T>{"Occupied"}</T>
            </span>
          </div>
          <div className="floor-plan-zoom">
            <button
              className="icon-button"
              aria-label="Zoom out floor plan"
              disabled={cameraLocked || zoom <= 0.05}
              onClick={() => {
                zoomTo(zoom / 1.2);
              }}
            >
              <Icon name="minus" />
            </button>
            <button
              className="text-button"
              aria-label="Fit floor to view"
              disabled={cameraLocked}
              onClick={fitView}
            >
              {Math.round(zoom * 100)}% · Fit
            </button>
            <button
              className="icon-button"
              aria-label="Zoom in floor plan"
              disabled={cameraLocked || zoom >= 4}
              onClick={() => {
                zoomTo(zoom * 1.2);
              }}
            >
              <Icon name="plus" />
            </button>
            <button className="icon-button" aria-label={cameraLocked ? "Unlock floor view" : "Lock floor view"} title={cameraLocked ? "Unlock floor view" : "Lock floor view"} aria-pressed={cameraLocked} onClick={() => {
              manualZoom.current = true;
              panDrag.current = null;
              touchPoints.current.clear();
              pinch.current = null;
              lockRef.current=!cameraLocked;setCameraLocked(lockRef.current);
            }}><Icon name={cameraLocked ? "lock" : "unlock"}/></button>
          </div>
          {isManager(data.actor) &&
            (draft ? (
              <div className="inline-actions">
                <button
                  className="button"
                  onClick={cancelArrange}
                >
                  <T>{"Cancel"}</T>
                </button>
                <button
                  className="button primary"
                  disabled={
                    busy ||
                    draft.some(
                      (object) =>
                        !floorObjectAllowed(object,area,outline,roundness)||conflicts.has(object.id),
                    )
                  }
                  onClick={() =>
                    void run("floorPlan", {
                      outletId: data.outletId,
                      floor,
                      version: baseVersion.current,
                      objects: draft,
                      deletedTables,
                      boundaryStyle,
                      boundaryRoundness,
                      outline,
                      ...area,
                    })
                      .then(() => {
                        setResizingArea(false);setAreaOrigin({x:0,y:0});
                        setDraft(null);
                        setDraftArea(null);
                        setSelected("");
                        notify("Floor plan saved.");
                      })
                      .catch(() => {})
                  }
                >
                  <T>{"Save layout"}</T>
                </button>
              </div>
            ) : (
              <button className="button primary" onClick={startArrange}>
                <T>{"Arrange"}</T>
              </button>
            ))}
        </div>
        {draft && (
          <div className="floor-plan-edit-tools">
            <select
              aria-label="Fixture type"
              value={fixture}
              onChange={(event) =>
                setFixture(event.target.value as Kind)
              }
            >
              <option value="TABLE" disabled={!can(data.actor,'settings')}>Table</option>
              {floorPlanFixtures.map((item) => (
                <option key={item.kind} value={item.kind}>
                  {item.label}
                </option>
              ))}
            </select>
            <button
              className="button"
              onClick={() => {
                if(fixture==='TABLE'){addDraftTable();return;}
                if (draft.length >= 250) {
                  notify("This floor plan has reached 250 objects.");
                  return;
                }
                const item = floorPlanFixtures.find(
                  (item) => item.kind === fixture,
                )!;
                const id = crypto.randomUUID();
                const initial=fitFloorPlacement({
                      id,
                      kind: fixture,
                      label: item.label,
                      x: 500,
                      y: 350,
                      width: item.width,
                      height: item.height,
                    },area);
                const placed=placeFloorFixture(initial,area,outline,draft,roundness);
                if(!placed){notify('There is no free space for this fixture. Move an object or enlarge the floor first.');return;}
                manualZoom.current=true;setDraft(previous=>[...previous!,snapPlaced(placed)]);
                setSelected(id);
              }}
            >
              <Icon name="plus" />
              <T>{fixture==='TABLE'?'Add table':'Add fixture'}</T>
            </button>
            <button className={"button"+(resizingArea?" primary":"")} aria-label="Resize area" aria-pressed={resizingArea} onClick={()=>{setSelected('');manualZoom.current=true;setResizingArea(value=>!value)}}>
              <T>{resizingArea?"Done resizing":"Resize area"}</T>
            </button>
            <button
              className="button"
              onClick={() =>
                modal(
                  "Floor outline",
                  <OutlineEditor
                    area={area}
                    initial={outline}
                    objects={draft??[]}
                    snapSettings={snapSettings}
                    apply={(points) => {
                      setDraftOutline(points);
                      close();
                    }}
                  />,
                )
              }
            >
              <T>{"Floor outline"}</T>
            </button>
            <select
              aria-label="Boundary style"
              value={boundaryStyle}
              onChange={(e) => setBoundaryStyle(e.target.value)}
            >
              <option value="STROKE">
                <T>{"Clean stroke"}</T>
              </option>
              <option value="WALLS">
                <T>{"Walls"}</T>
              </option>
            </select>
            <SnappingControls value={snapSettings} change={setSnapSettings}/>
            <label className="floor-roundness-control">Boundary roundness
              <input aria-label="Boundary roundness" type="number" min="0" max="500" step="5" value={boundaryRoundness} disabled={!!floorEllipse(displayOutline)} onChange={e=>setBoundaryRoundness(Math.max(0,Math.min(500,Math.round(Number(e.target.value)||0))))}/>
            </label>
            <button className="button" disabled={!current} onClick={copy}>
              <T>{"Copy"}</T>
            </button>
            <button className="button" disabled={!clipboard} onClick={paste}>
              <T>{"Paste"}</T>
            </button>
            <button className="button" disabled={historyPosition.current<=0} onClick={()=>restoreHistory(-1)} aria-label="Undo layout change">Undo</button>
            <button className="button" disabled={historyPosition.current>=history.current.length-1} onClick={()=>restoreHistory(1)} aria-label="Redo layout change">Redo</button>
            <button className="button" aria-pressed={touchSelect} onClick={()=>setTouchSelect(value=>!value)}>Select multiple</button>
            {selection.length>1&&<span role="status">{selection.length} selected · drag together</span>}
            {resizingArea&&<span className="floor-area-resize-hint" role="status">Drag a floor edge or corner. Furniture stays in place.</span>}
            <small>
              Ctrl+Z / Ctrl+Shift+Z · Ctrl+C / Ctrl+V · {area.width} × {area.height}
            </small>
          </div>
        )}
        {draft &&
          draft.some((object) => !floorObjectAllowed(object,area,outline,roundness)) && (
            <p className="error" role="alert">
              Move highlighted fixtures inside the boundary, or enable Allow outside floor for a table.
            </p>
          )}
      {draft&&conflicts.size>0&&<p className="error" role="alert">Separate overlapping fixtures and tables before saving. Label boxes may overlap.</p>}
      </ExploreHeader>
      <div
        className="panel floor-plan-scroll"
        ref={surface}
        tabIndex={0}
        aria-label="Floor canvas viewport"
        onKeyUp={()=>setSnapGuides([])}
        onPointerDownCapture={(event) => {
          if (cameraLocked || event.pointerType !== "touch") return;
          touchPoints.current.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY,
          });
          if (touchPoints.current.size === 1)
            touchStartSelection.current = selected;
          if (touchPoints.current.size < 2) return;
          if (touchPoints.current.size === 2) {
            const [a, b] = [...touchPoints.current.values()],
              rect = event.currentTarget.getBoundingClientRect();
            pinch.current = {
              distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
              zoom,
              pan,
              center: {
                x: (a.x + b.x) / 2 - rect.left,
                y: (a.y + b.y) / 2 - rect.top,
              },
            };
            if (drag.current)setDraft(drag.current.objects);
            if (resizing.current)
              update(resizing.current.object.id, resizing.current.object);
            drag.current = null;
            resizing.current = null;
            areaDrag.current=null;
            panDrag.current = null;finishGesture();
            setSelected(touchStartSelection.current);
          }
          panMoved.current = true;
          for (const pointer of touchPoints.current.keys())
            event.currentTarget.setPointerCapture(pointer);
          event.preventDefault();
          event.stopPropagation();
        }}
        onPointerMoveCapture={(event) => {
          if (
            cameraLocked || event.pointerType !== "touch" ||
            !touchPoints.current.has(event.pointerId)
          )
            return;
          touchPoints.current.set(event.pointerId, {
            x: event.clientX,
            y: event.clientY,
          });
          if (!pinch.current) return;
          event.preventDefault();
          event.stopPropagation();
          if (touchPoints.current.size < 2) return;
          const [a, b] = [...touchPoints.current.values()],
            start = pinch.current,
            rect = event.currentTarget.getBoundingClientRect();
          const next = Math.max(
            0.05,
            Math.min(
              4,
              (start.zoom * Math.hypot(b.x - a.x, b.y - a.y)) / start.distance,
            ),
          );
          manualZoom.current = true;
          setSnapGuides([]);setZoom(next);
          setPan({
            x:
              (a.x + b.x) / 2 -
              rect.left -
              ((start.center.x - start.pan.x) / start.zoom) * next,
            y:
              (a.y + b.y) / 2 -
              rect.top -
              ((start.center.y - start.pan.y) / start.zoom) * next,
          });
        }}
        onPointerUpCapture={(event) => {
          touchPoints.current.delete(event.pointerId);
          if (!pinch.current) return;
          event.stopPropagation();
          panDrag.current = null;
          if (!touchPoints.current.size) pinch.current = null;
        }}
        onPointerCancelCapture={(event) => {
          touchPoints.current.delete(event.pointerId);
          if (!touchPoints.current.size) pinch.current = null;
          panDrag.current = null;
        }}
        onPointerDown={(event) => {
          if (cameraLocked) return;
          if (
            draft &&
            event.button !== 1 &&
            (event.target as HTMLElement).closest(
              ".plan-object,.plan-resize-handle",
            )
          )
            return;
          panMoved.current = false;
          if (!(event.target as HTMLElement).closest(".plan-object"))
            event.preventDefault();
          if (draft) setSelected("");
          panDrag.current = {
            x: pan.x,
            y: pan.y,
            startX: event.clientX,
            startY: event.clientY,
          };
          if (!(event.target as HTMLElement).closest(".plan-object"))
            event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (cameraLocked) return;
          const drag = panDrag.current;
          if (drag) {
            if (
              !panMoved.current &&
              Math.hypot(
                event.clientX - drag.startX,
                event.clientY - drag.startY,
              ) < 5
            )
              return;
            panMoved.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            manualZoom.current = true;
            setPan({
              x: drag.x + event.clientX - drag.startX,
              y: drag.y + event.clientY - drag.startY,
            });
          }
        }}
        onPointerUp={() => {
          panDrag.current = null;
        }}
        onPointerCancel={() => {
          panDrag.current = null;
        }}
        onClickCapture={(event) => {
          if (panMoved.current) {
            event.preventDefault();
            event.stopPropagation();
            panMoved.current = false;
          }
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (cameraLocked) {
            if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home"].includes(event.key)) event.preventDefault();
            return;
          }
          const offset = {
            ArrowLeft: [40, 0],
            ArrowRight: [-40, 0],
            ArrowUp: [0, 40],
            ArrowDown: [0, -40],
          }[event.key];
          if (offset) {
            event.preventDefault();
            manualZoom.current = true;
            setPan((p) => ({ x: p.x + offset[0], y: p.y + offset[1] }));
          }
          if (event.key === "Home") {
            event.preventDefault();
            fitView();
          }
        }}
      >
        <div className="floor-plan-window">
          <div className="floor-name-tag" aria-label="Floor name tag">
            {floor}
          </div>
          <div
            className="floor-camera"
            style={{
              width: area.width,
              height: area.height,
              transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`,
            }}
          >
            <div
              className={"floor-plan-canvas " + (draft ? "is-editing" : "")}
              aria-label={floor + " seating plan"}
              onPointerDown={(event) => {
                if (draft && event.target === event.currentTarget)
                  setSelected("");
              }}
              style={{
                width: area.width,
                height: area.height,

                background: "transparent",
              }}
            >
              {displayOutline && (
                <svg
                  className="floor-outline-boundary"
                  viewBox={`0 0 ${area.width} ${area.height}`}
                  aria-label="Floor boundary"
                >
                  <defs><pattern id="floor-mapping-dots" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="#fff"/><rect className="floor-background-tint" width="20" height="20" fill="#eaf1e6" fillOpacity="0.25"/><circle cx="2" cy="2" r="1" fill="#8b9f83" fillOpacity="0.45"/></pattern></defs>
                  {floorEllipse(displayOutline) ? (
                    (() => {
                      const oval = floorEllipse(displayOutline)!;
                      return (
                        <ellipse
                          cx={oval.x + oval.width / 2}
                          cy={oval.y + oval.height / 2}
                          rx={oval.width / 2}
                          ry={oval.height / 2}
                          fill="url(#floor-mapping-dots)"
                          stroke={
                            shownBoundary === "WALLS" ? "#53664a" : "#819574"
                          }
                          strokeWidth={shownBoundary === "WALLS" ? 18 : 3}
                        />
                      );
                    })()
                  ) : (
                    <path className="floor-boundary-shape" d={boundaryGeometry.path}
                      fill="url(#floor-mapping-dots)"
                      stroke={
                        shownBoundary === "WALLS"
                          ? "#53664a"
                          : "#819574"
                      }
                      strokeWidth={shownBoundary === "WALLS" ? 18 : 3}
                    />
                  )}
                  <rect
                    className="floor-layout-bounds"
                    style={{display:roundness>0?"none":undefined}}
                    aria-label="Floor layout bounding box"
                    x="1"
                    y="1"
                    width={area.width - 2}
                    height={area.height - 2}
                    fill="none"
                    stroke="#819574"
                    strokeWidth="1.5"
                    strokeDasharray="1 7"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              )}
              {visible.map((object) => {
                const table = tables.find(
                  (table) => table.id === object.tableId,
                );
                const copySource = tables.find(
                  (table) => table.id === object.copyOfTableId,
                );
                const occupied = !!table?.is_occupied;
                const reserved =
                  table &&
                  (data.reservations ?? []).some(
                    (booking: Row) =>
                      booking.table_id === table.id &&
                      booking.state === "HELD" &&
                      new Date(booking.starts_at).getTime() <= Date.now(),
                  );
                return (
                  <button key={object.id}
                    data-plan-object-id={object.id}
                    type="button"
                    className={
                      "plan-object " +
                      (object.width < 130 || object.height < 90
                        ? " compact-object "
                        : "") +
                      (object.kind === "TABLE"
                        ? "plan-table"
                        : "plan-fixture") +
                      (occupied ? " occupied" : "") +
                      (reserved ? " reserved" : "") +
                      (draft && selection.includes(object.id) ? " is-selected" : "") +
                      " plan-kind-" +
                      object.kind.toLowerCase() +
                      (!floorObjectAllowed(object,area,outline,roundness)||conflicts.has(object.id)
                        ? " outside-outline"
                        : "")
                    }
                    aria-label={
                      (object.kind === "TABLE"
                        ? "Table " + (table?.label ?? object.label)
                        : floorFixtureLabel(object)) +
                      (object.kind === "TABLE"
                        ? occupied
                          ? " occupied"
                          : " available"
                        : "")
                    }
                    aria-pressed={draft?selection.includes(object.id):undefined}
                    title={(table||copySource||object.newTable)?(table?.label??object.label)+' · '+(table??copySource??object.newTable)!.seats+' seats · '+((copySource||object.newTable)?'New table · save to create':occupied?'Occupied':reserved?'Reserved':'Available'):floorFixtureLabel(object)}
                    tabIndex={draft || table ? 0 : -1}
                    style={{
                      left: object.x,
                      top: object.y,
                      width: object.width,
                      height: object.height,
                      transform: `rotate(${object.rotation ?? 0}deg)`,
                      zIndex:
                        draft && selected === object.id
                          ? 5
                          : object.kind === "TABLE"
                            ? 3
                            : [
                                  "SMOKING_ROOM",
                                  "LIQUOR_ROOM",
                                  "PRIVATE_ROOM",
                                  "KITCHEN",
                                ].includes(object.kind)
                              ? 1
                              : 2,
                    }}
                    onPointerDown={(event) => pointerDown(event, object)}
                    onPointerMove={event=>{continueDrag(event,object)}}
                    onPointerUp={()=>{drag.current=null;finishGesture()}}
                    onPointerCancel={()=>{drag.current=null;finishGesture()}}
                    onClick={event=>{if(!draft){if(table)openTable(table);return}manualZoom.current=true;if(event.detail===0){if(event.ctrlKey||event.metaKey||touchSelect)toggleSelection(object.id);else setSelected(object.id)}}}
                    onKeyDown={(event) => {
                      if (!draft) return;
                      const offset = {
                        ArrowLeft: [-10, 0],
                        ArrowRight: [10, 0],
                        ArrowUp: [0, -10],
                        ArrowDown: [0, 10],
                      }[event.key];
                      if (offset) {
                        event.preventDefault();
                        moveSelection(draft,selection.includes(object.id)?selection:[object.id],offset[0],offset[1],event.altKey,true);
                      }
                    }}
                  >
                    {object.kind!=='TABLE'&&<FixtureSymbol object={object} zoom={zoom} offset={fixtureLayout.positions.get(object.id)?.iconOffset}/>}
                  </button>
                );
              })}
              <FixtureLabels objects={fixtureObjects} occupiedIds={visible.filter(object=>tables.some(table=>table.id===object.tableId&&table.is_occupied)).map(object=>object.id)} zoom={zoom} layout={fixtureLayout}/>
              <SnapGuides guides={snapGuides} view={{x:-pan.x/zoom,y:-pan.y/zoom,width:(surface.current?.clientWidth??area.width)/zoom,height:(surface.current?.clientHeight??area.height)/zoom}}/>
              {draft&&resizingArea&&<>
                <svg className="floor-area-resize-frame" aria-hidden="true" style={{width:area.width,height:area.height}}><rect x="0" y="0" width={area.width} height={area.height} fill="none" stroke="#285b45" strokeWidth="2" strokeDasharray="6 4" vectorEffect="non-scaling-stroke"/></svg>
                {resizeDirections.map(direction=>{const [hx,hy]=resizeVectors[direction];return <button key={direction} type="button" className="plan-resize-handle floor-area-resize-handle" aria-label={'Resize floor '+{nw:'top left corner',n:'top edge',ne:'top right corner',w:'left edge',e:'right edge',sw:'bottom left corner',s:'bottom edge',se:'bottom right corner'}[direction]} data-area-resize-direction={direction}
                  style={{left:(hx+1)*area.width/2,top:(hy+1)*area.height/2,width:32/zoom,height:32/zoom,cursor:hx&&hy?(hx===hy?'nwse-resize':'nesw-resize'):hx?'ew-resize':'ns-resize'}}
                  onPointerDown={event=>startAreaResize(event,direction)}
                  onPointerMove={event=>{const active=areaDrag.current;if(!active||active.pointerId!==event.pointerId)return;event.stopPropagation();resizeArea(active.layout,active.direction,(event.clientX-active.start.x)/active.zoom,(event.clientY-active.start.y)/active.zoom,active.origin,active.pan,active.zoom,event.altKey)}}
                  onPointerUp={event=>{if(areaDrag.current?.pointerId!==event.pointerId)return;areaDrag.current=null;finishGesture()}}
                  onPointerCancel={event=>{if(areaDrag.current?.pointerId===event.pointerId)abortAreaDrag()}}
                  onLostPointerCapture={event=>{if(areaDrag.current?.pointerId===event.pointerId){areaDrag.current=null;finishGesture()}}}
                  onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();abortAreaDrag();setResizingArea(false);return;}const delta={ArrowLeft:[-10,0],ArrowRight:[10,0],ArrowUp:[0,-10],ArrowDown:[0,10]}[event.key];if(!delta)return;event.preventDefault();event.stopPropagation();manualZoom.current=true;resizeArea({area,outline,objects:draft},direction,delta[0],delta[1],areaOrigin,pan,zoom,event.altKey,true)}}
                ><span style={{width:13/zoom,height:13/zoom,borderWidth:2/zoom}}/></button>})}
              </>}
              {draft &&
                current && selection.length<=1 &&
                resizeDirections.map((direction) => {
                  const [hx,hy]=resizeVectors[direction];
                  const handle=rotateFloorPoint(current,{x:current.x+current.width/2+hx*(current.width/2+handleOutset),y:current.y+current.height/2+hy*(current.height/2+handleOutset)});
                  const cursorAngle=Math.atan2(hy,hx)+(current.rotation??0)*Math.PI/180;
                  const cursor=['ew-resize','nwse-resize','ns-resize','nesw-resize'][((Math.round(cursorAngle/(Math.PI/4))%4)+4)%4];
                  return (
                  <button
                    key={direction}
                    className={"plan-resize-handle handle-" + direction}
                    data-resize-direction={direction}
                    aria-label={
                      "Resize " +
                      current.label +
                      " " +
                      resizeLabels[direction]
                    }
                    style={{
                      left: handle.x,
                      top: handle.y,
                      cursor,
                      width: 32 / zoom,
                      height: 32 / zoom,
                    }}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      manualZoom.current = true;
                      const stage=event.currentTarget.closest('.floor-plan-canvas')!.getBoundingClientRect();
                      const point=rotateFloorPoint(current,{x:(event.clientX-stage.left)/zoom,y:(event.clientY-stage.top)/zoom},true);
                      const exactKnob=Array.from(event.currentTarget.closest('.floor-plan-canvas')!.querySelectorAll<HTMLButtonElement>('.plan-resize-handle')).find(handle=>{const r=handle.querySelector('span')!.getBoundingClientRect();return event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom});
                      const inside=point.x>=current.x&&point.x<=current.x+current.width&&point.y>=current.y&&point.y<=current.y+current.height;
                      if(inside&&!exactKnob){pointerDown(event,current);return;}
                      historyGesture.current=true;
                      resizing.current = {
                        object: { ...current },
                        x: event.clientX,
                        y: event.clientY,
                        direction:(exactKnob?.dataset.resizeDirection as FloorResizeDirection|undefined)??direction,
                      };
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={(event) => {
                      if(continueDrag(event,current))return;
                      const drag = resizing.current;
                      if (!drag) return;
                      const angle =
                          ((drag.object.rotation ?? 0) * Math.PI) / 180,
                        dx = (event.clientX - drag.x) / zoom,
                        dy = (event.clientY - drag.y) / zoom;
                      const [horizontal,vertical]=resizeVectors[drag.direction];
                      const deltaWidth=horizontal*(dx*Math.cos(angle)+dy*Math.sin(angle));
                      const deltaHeight=vertical*(-dx*Math.sin(angle)+dy*Math.cos(angle));
                      resizeObject(drag.object,drag.direction,deltaWidth,deltaHeight,event.altKey);
                    }}
                    onPointerUp={() => {
                      resizing.current = null;
                      drag.current = null;finishGesture();
                    }}
                    onPointerCancel={() => {
                      resizing.current = null;
                      drag.current = null;finishGesture();
                    }}
                    onKeyDown={(event) => {
                      const delta = {
                        ArrowLeft: [-10, 0],
                        ArrowRight: [10, 0],
                        ArrowUp: [0, -10],
                        ArrowDown: [0, 10],
                      }[event.key];
                      if (delta) {
                        event.preventDefault();
                        event.stopPropagation();
                        resizeObject(current,direction,hx*delta[0],hy*delta[1],event.altKey,true);
                      }
                    }}
                  >
                    <span style={{width:13/zoom,height:13/zoom,borderWidth:2/zoom}} />
                  </button>
                );})}
            </div>
          </div>
        </div>
      </div>
      {draft && current && (
        <div className="panel floor-plan-inspector">
          <strong>
            {current.kind === "TABLE"
              ? (tables.find((table) => table.id === current.tableId)?.label ??
                current.label)
              : current.label}
          </strong>
          {current.kind === "TABLE" && can(data.actor,"settings") && <button className="button" onClick={()=>{const table=tables.find(t=>t.id===current.tableId);if(table)renameTable(table,result=>{const plan=result.plans.find((p:Row)=>p.floor===floor);if(plan)baseVersion.current=plan.version;syncRenamedTable(table.id,result.label);update(current.id,{label:result.label});});else form("Rename copied table",[{name:"label",label:"Table name",value:current.label}],async values=>{update(current.id,{label:String(values.label).trim()});},"Rename table");}}>Rename table</button>}
          {current.kind !== "TABLE" && (
            <label>
              <T>{"Label"}</T>
              <input
                aria-label="Fixture label"
                value={current.label}
                maxLength={60}
                onChange={(event) =>
                  update(current.id, { label: event.target.value })
                }
              />
            </label>
          )}
          {current.kind==='TABLE'&&<label className="check-row"><input type="checkbox" aria-label="Allow outside floor" checked={!!current.allowOutside} onChange={e=>{
            const next={...current,allowOutside:e.target.checked};if(!floorObjectAllowed(next,area,outline,roundness)){notify('Move this table inside the floor before turning this option off.');return;}update(current.id,{allowOutside:e.target.checked});
          }}/>Allow outside floor</label>}
          <div className="inline-actions">
            <button
              className="button"
              aria-label="Rotate selected counterclockwise"
              onClick={() =>
                update(
                  current.id,
                  fitFloorPlacement(
                    {
                      ...current,
                      rotation: ((current.rotation ?? 0) + 345) % 360,
                    },
                    area,
                  ),
                )
              }
            >
              −15°
            </button>
            <span aria-label="Selected rotation">{current.rotation ?? 0}°</span>
            <button
              className="button"
              aria-label="Rotate selected clockwise"
              onClick={() =>
                update(
                  current.id,
                  fitFloorPlacement(
                    {
                      ...current,
                      rotation: ((current.rotation ?? 0) + 15) % 360,
                    },
                    area,
                  ),
                )
              }
            >
              +15°
            </button>
            <button
              className="button danger-text"
              disabled={!!current.tableId && !can(data.actor, "settings")}
              onClick={removeSelected}
            >
              <Icon name="trash" />
              <T>{"Delete selected"}</T>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
