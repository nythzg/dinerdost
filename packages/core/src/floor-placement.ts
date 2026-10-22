import {
  floorObjectCorners,
  objectInArea,
  type FloorPlanObject,
  type FloorPlanSize,
} from "./floor-plan";
import { objectInFloor, type FloorPoint } from "./floor-outline";

/** Place a newly created physical table within the saved floor, without moving existing objects. */
export function placeFloorTable(
  table: FloorPlanObject,
  area: FloorPlanSize,
  outline: FloorPoint[] | null,
  existing: FloorPlanObject[],
): FloorPlanObject | null {
  const bounds = (o: FloorPlanObject) => {
    const corners = floorObjectCorners(o);
    return {
      left: Math.min(...corners.map((p) => p.x)),
      right: Math.max(...corners.map((p) => p.x)),
      top: Math.min(...corners.map((p) => p.y)),
      bottom: Math.max(...corners.map((p) => p.y)),
    };
  };
  const occupied = existing
    .filter((o) => o.kind === "TABLE" || o.kind === "WALL")
    .map(bounds);
  for (const [width, height] of [
    [120, 90],
    [90, 60],
    [60, 50],
  ]) {
    for (let y = 0; y + height <= area.height; y += 20)
      for (let x = 0; x + width <= area.width; x += 20) {
        const next = { ...table, x, y, width, height, rotation: 0 };
        if (
          !objectInArea(next, area) ||
          (outline && !objectInFloor(next, outline))
        )
          continue;
        if (
          occupied.some(
            (o) =>
              x < o.right + 10 &&
              x + width + 10 > o.left &&
              y < o.bottom + 10 &&
              y + height + 10 > o.top,
          )
        )
          continue;
        return next;
      }
  }
  return null;
}
