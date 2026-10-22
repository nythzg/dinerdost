import {
  type FloorPlanObject,
  type FloorPlanSize,
} from "./floor-plan";
import {floorObjectsOverlap,floorObjectAllowed} from "./floor-layout";
import { type FloorPoint } from "./floor-outline";

/** Place a newly created physical table within the saved floor, without moving existing objects. */
export function placeFloorTable(
  table: FloorPlanObject,
  area: FloorPlanSize,
  outline: FloorPoint[] | null,
  existing: FloorPlanObject[],
  roundness=0,
): FloorPlanObject | null {
  for (const [width, height] of [
    [120, 90],
    [90, 60],
    [60, 50],
  ]) {
    for (let y = 0; y + height <= area.height; y += 20)
      for (let x = 0; x + width <= area.width; x += 20) {
        const next = { ...table, x, y, width, height, rotation: 0 };
        if (
          !floorObjectAllowed(next,area,outline,roundness)
        )
          continue;
        if (
          existing.some(o=>floorObjectsOverlap(next,o))
        )
          continue;
        return next;
      }
  }
  return null;
}
