import type { Point, Quadrilateral } from './types';

export type Bounds = {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly diagonal: number;
};

/** Returns the Euclidean distance between two points. */
export function pointDistance(a: Point, b: Point): number {
  'worklet';
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Orders four points clockwise and starts the result at the top-left-ish point. */
export function orderClockwise(points: readonly Point[]): Quadrilateral {
  'worklet';
  if (points.length !== 4) {
    throw new Error(`Expected exactly 4 points, received ${points.length}`);
  }
  const centerX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const centerY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const ordered = [...points].sort(
    (a, b) => Math.atan2(a.y - centerY, a.x - centerX) - Math.atan2(b.y - centerY, b.x - centerX)
  );
  let firstIndex = 0;
  let smallestSum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < ordered.length; index += 1) {
    const sum = ordered[index].x + ordered[index].y;
    if (sum < smallestSum) {
      smallestSum = sum;
      firstIndex = index;
    }
  }
  return [
    ordered[firstIndex],
    ordered[(firstIndex + 1) % 4],
    ordered[(firstIndex + 2) % 4],
    ordered[(firstIndex + 3) % 4],
  ];
}

/** Computes the absolute polygon area of a quadrilateral with the shoelace formula. */
export function polygonArea(corners: Quadrilateral): number {
  'worklet';
  let twiceArea = 0;
  for (let index = 0; index < 4; index += 1) {
    const current = corners[index];
    const next = corners[(index + 1) % 4];
    twiceArea += current.x * next.y - next.x * current.y;
  }
  return Math.abs(twiceArea) / 2;
}

/** Returns whether all four turns of a quadrilateral have the same non-zero orientation. */
export function isConvexQuadrilateral(corners: Quadrilateral): boolean {
  'worklet';
  let sign = 0;
  for (let index = 0; index < 4; index += 1) {
    const a = corners[index];
    const b = corners[(index + 1) % 4];
    const c = corners[(index + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 0.001) return false;
    const currentSign = cross > 0 ? 1 : -1;
    if (sign === 0) sign = currentSign;
    else if (sign !== currentSign) return false;
  }
  return true;
}

/** Returns the lengths of the four consecutive quadrilateral edges. */
export function edgeLengths(corners: Quadrilateral): [number, number, number, number] {
  'worklet';
  return [
    pointDistance(corners[0], corners[1]),
    pointDistance(corners[1], corners[2]),
    pointDistance(corners[2], corners[3]),
    pointDistance(corners[3], corners[0]),
  ];
}

/** Returns the short-side/long-side aspect ratio of a quadrilateral. */
export function quadrilateralAspect(corners: Quadrilateral): number {
  'worklet';
  const edges = edgeLengths(corners);
  const sideA = (edges[0] + edges[2]) / 2;
  const sideB = (edges[1] + edges[3]) / 2;
  const shortSide = Math.min(sideA, sideB);
  const longSide = Math.max(sideA, sideB);
  return longSide <= 0 ? 0 : shortSide / longSide;
}

/** Measures how similar each pair of opposite edges is, from 0 to 1. */
export function oppositeEdgeSimilarity(corners: Quadrilateral): number {
  'worklet';
  const edges = edgeLengths(corners);
  const pairA = Math.min(edges[0], edges[2]) / Math.max(edges[0], edges[2], 1);
  const pairB = Math.min(edges[1], edges[3]) / Math.max(edges[1], edges[3], 1);
  return Math.min(pairA, pairB);
}

/** Returns the largest absolute cosine between adjacent edges; rectangles are near zero. */
export function maxAdjacentEdgeCosine(corners: Quadrilateral): number {
  'worklet';
  let maximum = 0;
  for (let index = 0; index < 4; index += 1) {
    const previous = corners[(index + 3) % 4];
    const current = corners[index];
    const next = corners[(index + 1) % 4];
    const ax = previous.x - current.x;
    const ay = previous.y - current.y;
    const bx = next.x - current.x;
    const by = next.y - current.y;
    const lengthA = Math.sqrt(ax * ax + ay * ay);
    const lengthB = Math.sqrt(bx * bx + by * by);
    if (lengthA <= 0 || lengthB <= 0) return 1;
    maximum = Math.max(maximum, Math.abs((ax * bx + ay * by) / (lengthA * lengthB)));
  }
  return maximum;
}

/** Converts quadrilateral corners to an axis-aligned bounding box and derived center metrics. */
export function boundsOf(corners: Quadrilateral): Bounds {
  'worklet';
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  return {
    left,
    top,
    right,
    bottom,
    width,
    height,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
    diagonal: Math.sqrt(width * width + height * height),
  };
}

/** Computes axis-aligned intersection-over-union for two bounds. */
export function intersectionOverUnion(a: Bounds, b: Bounds): number {
  'worklet';
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  const intersection = width * height;
  const union = a.width * a.height + b.width * b.height - intersection;
  return union <= 0 ? 0 : intersection / union;
}

/** Measures center displacement normalized by the average object diagonal. */
export function normalizedCenterDistance(a: Bounds, b: Bounds): number {
  'worklet';
  const dx = a.centerX - b.centerX;
  const dy = a.centerY - b.centerY;
  return Math.sqrt(dx * dx + dy * dy) / Math.max((a.diagonal + b.diagonal) / 2, 1);
}

/** Measures width/height similarity between two bounds, from 0 to 1. */
export function sizeSimilarity(a: Bounds, b: Bounds): number {
  'worklet';
  const widthRatio = Math.min(a.width, b.width) / Math.max(a.width, b.width);
  const heightRatio = Math.min(a.height, b.height) / Math.max(a.height, b.height);
  return (widthRatio + heightRatio) / 2;
}

/** Returns the median of a numeric list, or zero for an empty list. */
export function median(values: readonly number[]): number {
  'worklet';
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}
