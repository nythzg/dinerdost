export const floorPlanKinds = [
  "TABLE",
  "RECEPTION",
  "WASHROOM",
  "ENTRY",
  "EXIT",
  "STAIRS",
  "SMOKING_ROOM",
  "LIQUOR_ROOM",
  "PRIVATE_ROOM",
  "WALL",
  "KITCHEN",
] as const;
export type FloorPlanKind = (typeof floorPlanKinds)[number];
export type FloorPlanSize = { width: number; height: number };
export type FloorPlanObject = FloorPlanSize & {
  id: string;
  kind: FloorPlanKind;
  label: string;
  tableId?: string;
  copyOfTableId?: string;
  newTable?: {seats:number};
  x: number;
  y: number;
  rotation?: number;
};
export const defaultFloorPlanSize = { width: 1200, height: 800 };
export const floorPlanFixtures = [
  { kind: "RECEPTION", label: "Reception", width: 180, height: 70 },
  { kind: "WASHROOM", label: "Washroom", width: 180, height: 70 },
  { kind: "ENTRY", label: "Entry", width: 150, height: 60 },
  { kind: "EXIT", label: "Exit", width: 150, height: 60 },
  { kind: "STAIRS", label: "Staircase", width: 180, height: 70 },
  { kind: "SMOKING_ROOM", label: "Smoking room", width: 260, height: 180 },
  { kind: "LIQUOR_ROOM", label: "Liquor room", width: 260, height: 180 },
  { kind: "PRIVATE_ROOM", label: "Private room", width: 260, height: 180 },
  { kind: "WALL", label: "Wall", width: 300, height: 20 },
  { kind: "KITCHEN", label: "Kitchen", width: 300, height: 220 },
] as const;

export function rotateFloorPoint(
  object: FloorPlanObject,
  point: { x: number; y: number },
  inverse = false,
) {
  const angle = (((object.rotation ?? 0) * Math.PI) / 180) * (inverse ? -1 : 1),
    cx = object.x + object.width / 2,
    cy = object.y + object.height / 2;
  return {
    x: cx + (point.x - cx) * Math.cos(angle) - (point.y - cy) * Math.sin(angle),
    y: cy + (point.x - cx) * Math.sin(angle) + (point.y - cy) * Math.cos(angle),
  };
}
export function floorObjectCorners(object: FloorPlanObject) {
  return [
    { x: object.x, y: object.y },
    { x: object.x + object.width, y: object.y },
    { x: object.x + object.width, y: object.y + object.height },
    { x: object.x, y: object.y + object.height },
  ].map((p) => rotateFloorPoint(object, p));
}
export function objectInArea(object: FloorPlanObject, area: FloorPlanSize) {
  return floorObjectCorners(object).every(
    (p) =>
      p.x >= -0.00001 &&
      p.y >= -0.00001 &&
      p.x <= area.width + 0.00001 &&
      p.y <= area.height + 0.00001,
  );
}
export function fitFloorObject(
  object: FloorPlanObject,
  area: FloorPlanSize,
): FloorPlanObject {
  const wall = object.kind === "WALL",
    minWidth = wall ? 10 : 60,
    minHeight = wall ? 10 : 50;
  let width = Math.max(
      minWidth,
      Math.min(2000, Math.round(object.width)),
    ),
    height = Math.max(
      minHeight,
      Math.min(2000, Math.round(object.height)),
    );
  const angle = ((object.rotation ?? 0) * Math.PI) / 180,
    c = Math.abs(Math.cos(angle)),
    sn = Math.abs(Math.sin(angle));
  const shrink = Math.min(
    1,
    area.width / (width * c + height * sn),
    area.height / (width * sn + height * c),
  );
  width = Math.max(minWidth, Math.floor(width * shrink));
  height = Math.max(minHeight, Math.floor(height * shrink));
  const dx = (width * c + height * sn - width) / 2,
    dy = (width * sn + height * c - height) / 2;
  return {
    ...object,
    width,
    height,
    x: Math.max(dx,Math.min(area.width-width-dx,Math.round(object.x/10)*10)),
    y: Math.max(dy,Math.min(area.height-height-dy,Math.round(object.y/10)*10)),
  };
}

/** Resize in local axes while holding the opposite world-space corner/edge still. */
export function resizeFloorObject(object:FloorPlanObject,area:FloorPlanSize,direction:'se'|'e'|'s',deltaWidth:number,deltaHeight:number):FloorPlanObject{
 const minWidth=object.kind==='WALL'?10:60,minHeight=object.kind==='WALL'?10:50;
 const width=direction==='s'?object.width:Math.max(minWidth,Math.min(2000,Math.round((object.width+deltaWidth)/10)*10));
 const height=direction==='e'?object.height:Math.max(minHeight,Math.min(2000,Math.round((object.height+deltaHeight)/10)*10));
 const anchor=rotateFloorPoint(object,{x:object.x+(direction==='s'?object.width/2:0),y:object.y+(direction==='e'?object.height/2:0)});
 const angle=(object.rotation??0)*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
 const at=(fraction:number)=>{
  const w=object.width+(width-object.width)*fraction,h=object.height+(height-object.height)*fraction;
  const localX=direction==='s'?0:w/2,localY=direction==='e'?0:h/2;
  const cx=anchor.x+localX*c-localY*s,cy=anchor.y+localX*s+localY*c;
  return {...object,width:w,height:h,x:cx-w/2,y:cy-h/2};
 };
 const fits=(o:FloorPlanObject)=>floorObjectCorners(o).every(p=>p.x>=-1e-10&&p.y>=-1e-10&&p.x<=area.width+1e-10&&p.y<=area.height+1e-10);
 const target=at(1);if(fits(target))return target;
 if(!objectInArea(object,area))return fitFloorObject(object,area);
 let low=0,high=1;
 for(let step=0;step<48;step++){const mid=(low+high)/2;if(fits(at(mid)))low=mid;else high=mid;}
 // Stay slightly within the limit rather than serializing an epsilon outside it.
 return at(Math.max(0,low-0.000001));
}

export function nextCopiedTableLabel(label: string, used: string[]): string {
  for (let index = 1; ; index++) {
    const suffix = index === 1 ? " copy" : " copy " + index;
    const candidate = label.slice(0, 30 - suffix.length) + suffix;
    if (!used.includes(candidate)) return candidate;
  }
}
