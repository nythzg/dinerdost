"use client";
import { useRef, useState } from "react";
import {
  floorOutline,
  validFloorOutline,
  floorEllipse,
  ellipseOutline,
  type FloorPoint,
  type FloorPlanSize,
} from "@dinerdost/core";

export function OutlineEditor({
  area,
  initial,
  apply,
}: {
  area: FloorPlanSize;
  initial: FloorPoint[] | null;
  apply: (points: FloorPoint[]) => void;
}) {
  const [points, setPoints] = useState<FloorPoint[]>(
    initial ?? floorOutline("Rectangle", area),
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [selectedEdge,setSelectedEdge]=useState<number|null>(null);
  const selectEdge=(index:number)=>{setSelectedEdge(index);setSelected(null)};
  const selectCorner=(index:number)=>{setSelected(index);setSelectedEdge(null)};
  const dragging = useRef<{
      index: number;
      edge: boolean;
      start: FloorPoint;
      points: FloorPoint[];
    } | null>(null),
    surface = useRef<SVGSVGElement>(null);
  const valid = validFloorOutline(points, area);
  const ellipse = floorEllipse(points);
  const position = (event: { clientX: number; clientY: number }) => {
    const rect = surface.current!.getBoundingClientRect(),
      scale = Math.min(
        rect.width / (area.width + 120),
        rect.height / (area.height + 120),
      );
    return {
      x:
        (event.clientX -
          rect.left -
          (rect.width - (area.width + 120) * scale) / 2) /
          scale -
        60,
      y:
        (event.clientY -
          rect.top -
          (rect.height - (area.height + 120) * scale) / 2) /
          scale -
        60,
    };
  };
  const resizeEdge = (
    index: number,
    dx: number,
    dy: number,
    original: FloorPoint[],
  ) => {
    const oval = floorEllipse(original);
    if (oval) {
      let { x, y, width, height } = oval;
      if (index === 0)
        width = Math.max(200, Math.min(area.width - x, width + dx));
      if (index === 6)
        height = Math.max(200, Math.min(area.height - y, height + dy));
      if (index === 12) {
        const next = Math.max(0, Math.min(x + width - 200, x + dx));
        width += x - next;
        x = next;
      }
      if (index === 18) {
        const next = Math.max(0, Math.min(y + height - 200, y + dy));
        height += y - next;
        y = next;
      }
      setPoints(ellipseOutline({ x, y, width, height }));
      return;
    }
    const next = (index + 1) % original.length,
      a = original[index],
      b = original[next],
      nx = -(b.y - a.y),
      ny = b.x - a.x,
      den = nx * nx + ny * ny;
    const distance = (dx * nx + dy * ny) / den;
    let mx = Math.round((nx * distance) / 10) * 10,
      my = Math.round((ny * distance) / 10) * 10;
    mx = Math.max(
      -Math.min(a.x, b.x),
      Math.min(area.width - Math.max(a.x, b.x), mx),
    );
    my = Math.max(
      -Math.min(a.y, b.y),
      Math.min(area.height - Math.max(a.y, b.y), my),
    );
    setPoints(
      original.map((p, i) =>
        i === index || i === next ? { x: p.x + mx, y: p.y + my } : p,
      ),
    );
  };
  const update = (index: number, change: FloorPoint) =>
    setPoints((previous) =>
      previous.map((p, i) =>
        i === index
          ? {
              x: Math.max(
                0,
                Math.min(area.width, Math.round(change.x / 10) * 10),
              ),
              y: Math.max(
                0,
                Math.min(area.height, Math.round(change.y / 10) * 10),
              ),
            }
          : p,
      ),
    );
  const edgeStart=selectedEdge===null?null:points[selectedEdge],edgeEnd=selectedEdge===null?null:points[(selectedEdge+1)%points.length];
  const midpoint=edgeStart&&edgeEnd?{x:Math.round((edgeStart.x+edgeEnd.x)/2),y:Math.round((edgeStart.y+edgeEnd.y)/2)}:null;
  const canAddCorner=!!midpoint&&points.length<24&&!ellipse&&!points.some(p=>p.x===midpoint.x&&p.y===midpoint.y);
  const addCorner = () => {
    if(selectedEdge===null||!canAddCorner||!midpoint)return;
    const index=selectedEdge;
    setPoints([
      ...points.slice(0, index + 1),
      midpoint,
      ...points.slice(index + 1),
    ]);
    selectCorner(index + 1);
  };
  return (
    <div className="outline-editor">
      <div className="outline-shapes">
        {(["Rectangle", "Circle"] as const).map(
          (shape) => (
            <button
              className="button"
              key={shape}
              onClick={() => {
                setPoints(floorOutline(shape, area));
                setSelected(null);setSelectedEdge(null);
              }}
            >
              {shape}
            </button>
          ),
        )}
      </div>
      <svg
        ref={surface}
        viewBox={`-60 -60 ${area.width + 120} ${area.height + 120}`}
        aria-label="Edit floor outline"
        className="outline-preview"
        onPointerMove={(event) => {
          if (dragging.current === null || !surface.current) return;
          const target = position(event),
            drag = dragging.current;
          if (drag.edge || floorEllipse(drag.points))
            resizeEdge(
              drag.index,
              target.x - drag.start.x,
              target.y - drag.start.y,
              drag.points,
            );
          else update(drag.index, target);
        }}
        onPointerUp={() => {
          dragging.current = null;
        }}
        onPointerCancel={() => {
          dragging.current = null;
        }}
      >
        <rect width={area.width} height={area.height} rx={10} fill="#eef0e9" />
        {ellipse ? (
          <ellipse
            cx={ellipse.x + ellipse.width / 2}
            cy={ellipse.y + ellipse.height / 2}
            rx={ellipse.width / 2}
            ry={ellipse.height / 2}
            fill={valid ? "#e0ecdf" : "#fbe7e4"}
            stroke="#285b45"
            strokeWidth={5}
          />
        ) : (
          <polygon
            points={points.map((p) => p.x + "," + p.y).join(" ")}
            fill={valid ? "#e0ecdf" : "#fbe7e4"}
            stroke={valid ? "#285b45" : "#ac4338"}
            strokeWidth={5}
          />
        )}
        {!ellipse &&
          points.map((p, i) => {
            const q = points[(i + 1) % points.length];
            return (
              <line
                key={i}
                x1={p.x}
                y1={p.y}
                x2={q.x}
                y2={q.y}
                stroke="transparent"
                strokeWidth={Math.max(area.width, area.height) / 16}
                role="button"
                tabIndex={0}
                aria-label={"Edge " + (i + 1)}
                aria-pressed={selectedEdge===i}
                onFocus={()=>selectEdge(i)}
                onClick={()=>selectEdge(i)}
                style={{ cursor: "move", touchAction: "none" }}
                onPointerDown={(event) => {
                  selectEdge(i);
                  dragging.current = {
                    index: i,
                    edge: true,
                    start: position(event),
                    points,
                  };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onKeyDown={(event) => {
                  if(event.key==='Enter'||event.key===' '){event.preventDefault();selectEdge(i);return;}
                  const delta = {
                    ArrowLeft: [-10, 0],
                    ArrowRight: [10, 0],
                    ArrowUp: [0, -10],
                    ArrowDown: [0, 10],
                  }[event.key];
                  if (delta) {
                    event.preventDefault();
                    resizeEdge(i, delta[0], delta[1], points);
                  }
                }}
              />
            );
          })}
        {!ellipse&&selectedEdge!==null&&<line className="outline-selected-edge" x1={points[selectedEdge].x} y1={points[selectedEdge].y} x2={points[(selectedEdge+1)%points.length].x} y2={points[(selectedEdge+1)%points.length].y} stroke="#193f30" strokeWidth="5" vectorEffect="non-scaling-stroke" pointerEvents="none"/>}
        {points.map(
          (p, i) =>
            (!ellipse || i % 6 === 0) && (
              <g key={i}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={Math.max(area.width, area.height) / 20}
                  fill="transparent"
                  role="button"
                  tabIndex={0}
                  aria-label={
                    ellipse
                      ? "Resize " +
                        ["right", "bottom", "left", "top"][i / 6] +
                        " edge"
                      : "Corner " + (i + 1)
                  }
                  aria-pressed={selected === i}
                  onFocus={() => selectCorner(i)}
                  onClick={() => selectCorner(i)}
                  onPointerDown={(event) => {
                    selectCorner(i);
                    dragging.current = {
                      index: i,
                      edge: false,
                      start: position(event),
                      points,
                    };
                    event.currentTarget.setPointerCapture(event.pointerId);
                  }}
                  onKeyDown={(event) => {
                    const move = {
                      ArrowLeft: [-10, 0],
                      ArrowRight: [10, 0],
                      ArrowUp: [0, -10],
                      ArrowDown: [0, 10],
                    }[event.key];
                    if (move) {
                      event.preventDefault();
                      if (ellipse) resizeEdge(i, move[0], move[1], points);
                      else update(i, { x: p.x + move[0], y: p.y + move[1] });
                    }
                  }}
                />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={
                    Math.max(area.width, area.height) /
                    (selected === i || selectedEdge===i || (selectedEdge!==null&&(selectedEdge+1)%points.length===i) ? 40 : 55)
                  }
                  fill={selected === i || selectedEdge===i || (selectedEdge!==null&&(selectedEdge+1)%points.length===i) ? "#193f30" : "#285b45"}
                  stroke="white"
                  strokeWidth={5}
                  pointerEvents="none"
                />
              </g>
            ),
        )}
      </svg>
      <p className="outline-hint" role="status">{ellipse?'Drag an edge to resize the circle.':selectedEdge===null?'Select an edge to add a corner between its endpoints. Drag an edge or corner to reshape.':`Edge ${selectedEdge+1} selected · Add corner inserts halfway between corner ${selectedEdge+1} and corner ${(selectedEdge+1)%points.length+1}.`}</p>
      <div className="outline-actions">
        <button
          className="button"
          disabled={!canAddCorner}
          onClick={addCorner}
        >
          Add corner
        </button>
        <button
          className="button"
          aria-label="Remove corner"
          disabled={selected === null || points.length <= 3 || !!ellipse}
          onClick={() => {
            setPoints((previous) => previous.filter((_, i) => i !== selected));
            setSelected(null);setSelectedEdge(null);
          }}
        >
          Remove
        </button>

      </div>
      {!valid && (
        <p className="error" role="alert">
          Make the floor larger and keep its edges from crossing.
        </p>
      )}
      <button
        className="button primary full-width"
        disabled={!valid}
        onClick={() => apply(points)}
      >
        Apply outline
      </button>
    </div>
  );
}
