"use client";
import { T } from "@/lib/staff-language";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  isManager,
  can,
  defaultFloorPlanSize,
  floorPlanFixtures,
  fitFloorObject,
  resizeFloorObject,
  snapFloorGate,
  rotateFloorPoint,
  objectInArea,
  floorOutline,
  nextCopiedTableLabel,
  nextTableName,
  placeFloorTable,
  type FloorPlanKind as Kind,
  type FloorPlanObject as PlanObject,
  type FloorPlanSize,
  type FloorPoint,
  objectInFloor,
  floorEllipse,
  ellipseOutline,
} from "@dinerdost/core";
import { Empty, Icon } from "@/components/ui";
import { type Row } from "@/lib/client";
import { useDesk } from "../workspace/context";
import { OutlineEditor } from "./outline-editor";
import { ExploreHeader } from "./explore-header";
import {useRenameTable} from "./rename-table";
import {floorViewKey,parseFloorView,moveFloorSelection} from "./floor-editor-state";

const starterFixtures = [
  { kind: "RECEPTION", label: "Reception", x: 30, y: 20 },
  { kind: "WASHROOM", label: "Washroom", x: 990, y: 20 },
  { kind: "ENTRY", label: "Entry", x: 30, y: 710 },
  { kind: "STAIRS", label: "Staircase", x: 990, y: 710 },
] as const;
const fixtureIcons = {
  RECEPTION: "outlets",
  WASHROOM: "customers",
  ENTRY: "logout",
  STAIRS: "stairs",
  TABLE: "floor",
  EXIT: "logout",
  SMOKING_ROOM: "cup",
  LIQUOR_ROOM: "inventory",
  PRIVATE_ROOM: "outlets",
  WALL: "floor",
  KITCHEN: "kitchen",
};
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
    [deletedTables, setDeletedTables] = useState<
      { tableId: string; version: number }[]
    >([]),
    [draftArea, setDraftArea] = useState<FloorPlanSize | null>(null),
    [clipboard, setClipboard] = useState<PlanObject | null>(null);
  const [selection,setSelection]=useState<string[]>([]),[touchSelect,setTouchSelect]=useState(false);
  const setSelected=(id:string)=>{selectPrimary(id);setSelection(id?[id]:[])};
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
  const syncRenamedTable=(tableId:string,label:string)=>{history.current=history.current.map(snapshot=>({...snapshot,objects:snapshot.objects.map(o=>o.tableId===tableId?{...o,label}:o)}));};
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
    if (lockRef.current) return;
    const element = surface.current;
    if (!element) return;
    const next = Math.max(
      0.05,
      Math.min(
        1,
        (element.clientWidth - 64) / area.width,
        (element.clientHeight - 64) / area.height,
      ),
    );
    manualZoom.current = false;
    setZoom(next);
    setPan({
      x: (element.clientWidth - area.width * next) / 2,
      y: (element.clientHeight - area.height * next) / 2,
    });
  };
  fitRef.current=fitView;
  const zoomTo = (next: number, point?: { x: number; y: number }) => {
    if (cameraLocked) return;
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
    setZoom(next);
  };
  const wheel = useRef<(event: WheelEvent) => void>(() => {});
  wheel.current = (event) => {
    event.preventDefault();
    if (cameraLocked) return;
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
    direction: string;
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
  const handleOutset=current?Math.max(0,11/zoom-Math.min(current.width,current.height)/2):0;
  const isGate=(object:PlanObject)=>object.kind==='ENTRY'||object.kind==='EXIT';
  const move = (object: PlanObject, x: number, y: number) =>
    isGate(object)?snapFloorGate({...object,x,y},area,outline)??object:fitFloorObject({ ...object, x, y }, area);
  const update = (id: string, change: Partial<PlanObject>) =>
    setDraft(
      (previous) =>
        previous?.map((object) => {
          if(object.id!==id)return object;
          const next={...object,...change};
          return isGate(next)&&['x','y','width','height','rotation'].some(key=>key in change)?snapFloorGate(next,area,outline)??object:next;
        }) ?? null,
    );
  const startArrange = () => {
    baseVersion.current = saved?.version ?? 0;
    setDraft(visible.map((object) => ({ ...object })));
    setSelected("");
    setDraftArea({ ...area });
    setDraftOutline(saved?.outline ?? null);
    setBoundaryStyle(saved?.boundary_style ?? "STROKE");
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
    const placed = fitFloorObject(object, area);
    setDraft((previous) => [...previous!, placed]);
    setSelected(placed.id);
    setClipboard({ ...placed });
  };
  const resizeArea = () =>
    form(
      "Resize floor area",
      [
        {
          name: "width",
          label: "Area width",
          type: "number",
          value: area.width,
          min: 400,
          max: 5000,
        },
        {
          name: "height",
          label: "Area height",
          type: "number",
          value: area.height,
          min: 300,
          max: 5000,
        },
      ],
      async (values) => {
        const next = {
          width: Number(values.width),
          height: Number(values.height),
        };
        setDraftArea(next);
        setDraftOutline((previous) => {
          const ellipse = previous ? floorEllipse(previous) : null;
          return ellipse
            ? ellipseOutline({
                x: (ellipse.x * next.width) / area.width,
                y: (ellipse.y * next.height) / area.height,
                width: (ellipse.width * next.width) / area.width,
                height: (ellipse.height * next.height) / area.height,
              })
            : (previous?.map((p) => ({
                x: Math.round((p.x * next.width) / area.width),
                y: Math.round((p.y * next.height) / area.height),
              })) ?? null);
        });
        setDraft((previous) =>
          previous!.map((object) => fitFloorObject(object, next)),
        );
        manualZoom.current = false;
        close();
      },
      "Apply size",
    );
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
    if(active.ids.length>1)setDraft(moveFloorSelection(active.objects,active.ids,dx,dy,area,outline));
    else{const target=move(object,active.x+dx,active.y+dy);update(object.id,{x:target.x,y:target.y});}return true;
  };
  const displayOutline = outline ?? floorOutline("Rectangle", area);
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
      const placed=placeFloorTable({id:crypto.randomUUID(),kind:'TABLE',label:String(values.label).trim(),newTable:{seats:Number(values.seats)},x:0,y:0,width:120,height:90},area,outline,draft.map(o=>['RECEPTION','WASHROOM','STAIRS','ENTRY','EXIT'].includes(o.kind)?{...o,kind:'WALL' as const}:o));
      if(!placed)throw new Error('There is no free space on this floor. Resize the area or move an object first.');
      manualZoom.current=true;setDraft(previous=>[...previous!,placed]);setSelected(placed.id);
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
                  onClick={() => {
                    setDraft(null);
                    setDraftArea(null);
                    setSelected("");
                  }}
                >
                  <T>{"Cancel"}</T>
                </button>
                <button
                  className="button primary"
                  disabled={
                    busy ||
                    draft.some(
                      (object) =>
                        !objectInArea(object, area) ||
                        (!!outline && !objectInFloor(object, outline)),
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
                      outline,
                      ...area,
                    })
                      .then(() => {
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
                const initial=fitFloorObject({
                      id,
                      kind: fixture,
                      label: item.label,
                      x: 500,
                      y: 350,
                      width: item.width,
                      height: item.height,
                    },area);
                const placed=isGate(initial)?snapFloorGate(initial,area,outline):initial;
                if(!placed){notify('There is no usable space along this floor boundary for the gate.');return;}
                manualZoom.current=true;setDraft(previous=>[...previous!,placed]);
                setSelected(id);
              }}
            >
              <Icon name="plus" />
              <T>{fixture==='TABLE'?'Add table':'Add fixture'}</T>
            </button>
            <button className="button" onClick={resizeArea}>
              <T>{"Resize area"}</T>
            </button>
            <button
              className="button"
              onClick={() =>
                modal(
                  "Floor outline",
                  <OutlineEditor
                    area={area}
                    initial={outline}
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
            <small>
              Ctrl+Z / Ctrl+Shift+Z · Ctrl+C / Ctrl+V · {area.width} × {area.height}
            </small>
          </div>
        )}
        {draft &&
          outline &&
          draft.some((object) => !objectInFloor(object, outline)) && (
            <p className="error" role="alert">
              Move highlighted objects inside the floor outline before saving.
            </p>
          )}
      </ExploreHeader>
      <div
        className="panel floor-plan-scroll"
        ref={surface}
        tabIndex={0}
        aria-label="Floor canvas viewport"
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
          setZoom(next);
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

                background: outline ? "#e2e5dc" : undefined,
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
                    <polygon
                      points={displayOutline
                        .map((p) => p.x + "," + p.y)
                        .join(" ")}
                      fill="url(#floor-mapping-dots)"
                      stroke={
                        shownBoundary === "WALLS"
                          ? "#53664a"
                          : outline
                            ? "#819574"
                            : "none"
                      }
                      strokeWidth={shownBoundary === "WALLS" ? 18 : 3}
                    />
                  )}
                  <rect
                    className="floor-layout-bounds"
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
                  <button
                    key={object.id}
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
                      (outline && !objectInFloor(object, outline)
                        ? " outside-outline"
                        : "")
                    }
                    aria-label={
                      (object.kind === "TABLE"
                        ? "Table " + (table?.label ?? object.label)
                        : object.label) +
                      (object.kind === "TABLE"
                        ? occupied
                          ? " occupied"
                          : " available"
                        : "")
                    }
                    aria-pressed={draft?selection.includes(object.id):undefined}
                    title={(table||copySource||object.newTable)?(table?.label??object.label)+' · '+(table??copySource??object.newTable)!.seats+' seats · '+((copySource||object.newTable)?'New table · save to create':occupied?'Occupied':reserved?'Reserved':'Available'):object.label}
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
                        if(selection.length>1&&selection.includes(object.id))setDraft(moveFloorSelection(draft,selection,offset[0],offset[1],area,outline));
                        else{const target=move(object,object.x+offset[0],object.y+offset[1]);update(object.id,{x:target.x,y:target.y})}
                      }
                    }}
                  >
                    {table || copySource || object.newTable ? (
                      <>
                        <span className="plan-table-name">
                          {table?.label ?? object.label}
                        </span>

                      </>
                    ) : (
                      <>
                        {isGate(object)?<span className="plan-gate-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 20V4h16M4 4a16 16 0 0 1 16 16H4"/><path d={object.kind==='ENTRY'?'M8 12h9m-3-3 3 3-3 3':'M17 12H8m3-3-3 3 3 3'}/></svg></span>:<Icon name={fixtureIcons[object.kind]} />}
                        <strong>{object.label}</strong>
                      </>
                    )}
                  </button>
                );
              })}
              {draft &&
                current && selection.length<=1 &&
                ["se", "e", "s"].map((direction) => (
                  <button
                    key={direction}
                    className={"plan-resize-handle handle-" + direction}
                    data-resize-direction={direction}
                    aria-label={
                      "Resize " +
                      current.label +
                      " " +
                      { se: "corner", e: "width", s: "height" }[direction]
                    }
                    style={{
                      left: rotateFloorPoint(current, {
                        x:
                          current.x +
                          current.width -
                          (direction === "s" ? current.width / 2 : 0) + (direction!=='s'?handleOutset:0),
                        y:
                          current.y +
                          current.height -
                          (direction === "e" ? current.height / 2 : 0) + (direction!=='e'?handleOutset:0),
                      }).x,
                      top: rotateFloorPoint(current, {
                        x:
                          current.x +
                          current.width -
                          (direction === "s" ? current.width / 2 : 0) + (direction!=='s'?handleOutset:0),
                        y:
                          current.y +
                          current.height -
                          (direction === "e" ? current.height / 2 : 0) + (direction!=='e'?handleOutset:0),
                      }).y,
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
                        direction:exactKnob?.dataset.resizeDirection??direction,
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
                      const width =
                          drag.object.width +
                          (drag.direction !== "s"
                            ? dx * Math.cos(angle) + dy * Math.sin(angle)
                            : 0),
                        height =
                          drag.object.height +
                          (drag.direction !== "e"
                            ? -dx * Math.sin(angle) + dy * Math.cos(angle)
                            : 0);
                      update(current.id,resizeFloorObject(drag.object,area,drag.direction as 'se'|'e'|'s',width-drag.object.width,height-drag.object.height));
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
                        update(current.id,resizeFloorObject(current,area,direction as 'se'|'e'|'s',direction!=='s'?delta[0]:0,direction!=='e'?delta[1]:0));
                      }
                    }}
                  >
                    <span style={{width:13/zoom,height:13/zoom,borderWidth:2/zoom}} />
                  </button>
                ))}
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
          <div className="inline-actions">
            <button
              className="button"
              aria-label="Rotate selected counterclockwise"
              onClick={() =>
                update(
                  current.id,
                  fitFloorObject(
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
                  fitFloorObject(
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
