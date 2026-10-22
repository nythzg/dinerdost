import {
  floorObjectCorners,
  rotateFloorPoint,
  type FloorPlanObject,
  type FloorPlanSize,
} from "./floor-plan";
export type FloorPoint = { x: number; y: number };
const epsilon = 0.00001;
const cross = (a: FloorPoint, b: FloorPoint, c: FloorPoint) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function onSegment(p: FloorPoint, a: FloorPoint, b: FloorPoint) {
  return (
    Math.abs(cross(a, b, p)) < epsilon &&
    p.x >= Math.min(a.x, b.x) - epsilon &&
    p.x <= Math.max(a.x, b.x) + epsilon &&
    p.y >= Math.min(a.y, b.y) - epsilon &&
    p.y <= Math.max(a.y, b.y) + epsilon
  );
}
function intersects(
  a: FloorPoint,
  b: FloorPoint,
  c: FloorPoint,
  d: FloorPoint,
) {
  return (
    (cross(a, b, c) * cross(a, b, d) < 0 &&
      cross(c, d, a) * cross(c, d, b) < 0) ||
    onSegment(a, c, d) ||
    onSegment(b, c, d) ||
    onSegment(c, a, b) ||
    onSegment(d, a, b)
  );
}
export function floorOutline(
  shape: "Rectangle" | "L-shaped" | "U-shaped" | "Circle",
  area: FloorPlanSize,
): FloorPoint[] {
  if (shape === "Circle") {
    const radius = Math.min(area.width, area.height) / 2;
    return ellipseOutline({
      x: area.width / 2 - radius,
      y: area.height / 2 - radius,
      width: radius * 2,
      height: radius * 2,
    });
  }
  const points =
    shape === "L-shaped"
      ? [
          [0, 0],
          [1, 0],
          [1, 0.5],
          [0.55, 0.5],
          [0.55, 1],
          [0, 1],
        ]
      : shape === "U-shaped"
        ? [
            [0, 0],
            [0.35, 0],
            [0.35, 0.6],
            [0.65, 0.6],
            [0.65, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ]
        : [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ];
  return points.map(([x, y]) => ({
    x: Math.round(x * area.width),
    y: Math.round(y * area.height),
  }));
}
export function ellipseOutline(bounds: {
  x: number;
  y: number;
  width: number;
  height: number;
}): FloorPoint[] {
  const left = Math.round(bounds.x),
    top = Math.round(bounds.y);
  bounds = {
    x: left,
    y: top,
    width: Math.round(bounds.x + bounds.width) - left,
    height: Math.round(bounds.y + bounds.height) - top,
  };
  return Array.from({ length: 24 }, (_, i) => ({
    x: Math.round(
      bounds.x +
        bounds.width / 2 +
        (Math.cos((i * Math.PI) / 12) * bounds.width) / 2,
    ),
    y: Math.round(
      bounds.y +
        bounds.height / 2 +
        (Math.sin((i * Math.PI) / 12) * bounds.height) / 2,
    ),
  }));
}
export function floorEllipse(points: FloorPoint[]) {
  if (points.length !== 24) return null;
  const x = Math.min(...points.map((p) => p.x)),
    y = Math.min(...points.map((p) => p.y)),
    width = Math.max(...points.map((p) => p.x)) - x,
    height = Math.max(...points.map((p) => p.y)) - y;
  const expected = ellipseOutline({ x, y, width, height });
  return expected.every(
    (p, i) =>
      Math.abs(p.x - points[i].x) < 0.01 && Math.abs(p.y - points[i].y) < 0.01,
  )
    ? { x, y, width, height }
    : null;
}
export function validFloorOutline(
  points: FloorPoint[],
  area: FloorPlanSize,
): boolean {
  if (
    points.length < 3 ||
    points.length > 24 ||
    points.some(
      (p) =>
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        p.x < 0 ||
        p.y < 0 ||
        p.x > area.width ||
        p.y > area.height,
    )
  )
    return false;
  if (new Set(points.map((p) => p.x + "," + p.y)).size !== points.length)
    return false;
  let twiceArea = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    twiceArea += a.x * b.y - b.x * a.y;
    // A turn may be straight, but an edge must not double back on itself.
    const c = points[(i + 2) % points.length];
    if (
      Math.abs(cross(a, b, c)) < epsilon &&
      (a.x - b.x) * (c.x - b.x) + (a.y - b.y) * (c.y - b.y) > 0
    )
      return false;
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      if (intersects(a, b, points[j], points[(j + 1) % points.length]))
        return false;
    }
  }
  return Math.abs(twiceArea) >= 60000;
}
export function pointInFloor(p: FloorPoint, points: FloorPoint[]): boolean {
  const ellipse = floorEllipse(points);
  if (ellipse)
    return (
      ((p.x - ellipse.x - ellipse.width / 2) / (ellipse.width / 2)) ** 2 +
        ((p.y - ellipse.y - ellipse.height / 2) / (ellipse.height / 2)) ** 2 <=
      1 + epsilon
    );
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j],
      b = points[i];
    if (onSegment(p, a, b)) return true;
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}
export function objectInFloor(
  object: FloorPlanObject,
  points: FloorPoint[],
): boolean {
  const l = object.x,
    r = l + object.width,
    t = object.y,
    b = t + object.height;
  if (!floorObjectCorners(object).every((p) => pointInFloor(p, points)))
    return false;
  if (floorEllipse(points)) return true;
  // Concave cut-outs can cross a rectangle whose four corners are all inside.
  // Clip every boundary edge to the rectangle and reject any interior segment.
  for (let i = 0; i < points.length; i++) {
    const a = rotateFloorPoint(object, points[i], true),
      c = rotateFloorPoint(object, points[(i + 1) % points.length], true),
      dx = c.x - a.x,
      dy = c.y - a.y;
    let start = 0,
      end = 1,
      empty = false;
    for (const [p, q] of [
      [-dx, a.x - l],
      [dx, r - a.x],
      [-dy, a.y - t],
      [dy, b - a.y],
    ]) {
      if (Math.abs(p) < epsilon) {
        if (q < 0) empty = true;
      } else if (p < 0) start = Math.max(start, q / p);
      else end = Math.min(end, q / p);
    }
    if (empty || start > end) continue;
    const mid = (start + end) / 2,
      x = a.x + dx * mid,
      y = a.y + dy * mid;
    if (
      x > l + epsilon &&
      x < r - epsilon &&
      y > t + epsilon &&
      y < b - epsilon
    )
      return false;
  }
  return true;
}
