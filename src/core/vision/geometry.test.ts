import { describe, expect, it } from 'vitest';

import type { Quadrilateral } from './types';
import {
  boundsOf,
  edgeLengths,
  intersectionOverUnion,
  isConvexQuadrilateral,
  maxAdjacentEdgeCosine,
  median,
  normalizedCenterDistance,
  oppositeEdgeSimilarity,
  orderClockwise,
  pointDistance,
  polygonArea,
  quadrilateralAspect,
  sizeSimilarity,
} from './geometry';

/** Builds an axis-aligned quadrilateral for concise geometry test fixtures. */
function quad(left: number, top: number, width: number, height: number): Quadrilateral {
  return [
    { x: left, y: top },
    { x: left + width, y: top },
    { x: left + width, y: top + height },
    { x: left, y: top + height },
  ];
}

describe('vision geometry', () => {
  it('computes Euclidean point distance', () => {
    expect(pointDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('orders four points and validates the point count', () => {
    expect(() => orderClockwise([{ x: 0, y: 0 }])).toThrow(/exactly 4/);
    expect(
      orderClockwise([
        { x: 10, y: 10 },
        { x: 0, y: 10 },
        { x: 10, y: 0 },
        { x: 0, y: 0 },
      ])
    ).toEqual(quad(0, 0, 10, 10));
  });

  it('computes polygon area for either winding direction', () => {
    const rectangle = quad(0, 0, 10, 20);
    expect(polygonArea(rectangle)).toBe(200);
    expect(polygonArea([...rectangle].reverse() as Quadrilateral)).toBe(200);
  });

  it('distinguishes convex, concave and collinear quadrilaterals', () => {
    expect(isConvexQuadrilateral(quad(0, 0, 10, 20))).toBe(true);
    expect(
      isConvexQuadrilateral([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 5 },
        { x: 0, y: 10 },
      ])
    ).toBe(false);
    expect(
      isConvexQuadrilateral([
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: 10 },
      ])
    ).toBe(false);
  });

  it('describes rectangle edge and shape metrics', () => {
    const rectangle = quad(0, 0, 63, 89);
    expect(edgeLengths(rectangle)).toEqual([63, 89, 63, 89]);
    expect(quadrilateralAspect(rectangle)).toBeCloseTo(63 / 89);
    expect(oppositeEdgeSimilarity(rectangle)).toBe(1);
    expect(maxAdjacentEdgeCosine(rectangle)).toBeCloseTo(0);
  });

  it('derives bounds, center and diagonal', () => {
    const bounds = boundsOf(quad(10, 20, 30, 40));
    expect(bounds).toMatchObject({
      left: 10,
      top: 20,
      right: 40,
      bottom: 60,
      width: 30,
      height: 40,
      centerX: 25,
      centerY: 40,
    });
    expect(bounds.diagonal).toBe(50);
  });

  it('computes intersection over union', () => {
    const base = boundsOf(quad(0, 0, 10, 10));
    expect(intersectionOverUnion(base, boundsOf(quad(0, 0, 10, 10)))).toBe(1);
    expect(intersectionOverUnion(base, boundsOf(quad(5, 0, 10, 10)))).toBeCloseTo(1 / 3);
    expect(intersectionOverUnion(base, boundsOf(quad(100, 100, 10, 10)))).toBe(0);
  });

  it('normalizes center distance and size similarity symmetrically', () => {
    const a = boundsOf(quad(0, 0, 10, 10));
    const b = boundsOf(quad(10, 0, 10, 10));
    const c = boundsOf(quad(0, 0, 20, 10));
    expect(normalizedCenterDistance(a, b)).toBeCloseTo(normalizedCenterDistance(b, a));
    expect(normalizedCenterDistance(a, a)).toBe(0);
    expect(sizeSimilarity(a, a)).toBe(1);
    expect(sizeSimilarity(a, c)).toBe(0.75);
  });

  it('computes median without mutating the input', () => {
    const values = [9, 1, 5, 3];
    expect(median([])).toBe(0);
    expect(median([9, 1, 5])).toBe(5);
    expect(median(values)).toBe(4);
    expect(values).toEqual([9, 1, 5, 3]);
  });
});
