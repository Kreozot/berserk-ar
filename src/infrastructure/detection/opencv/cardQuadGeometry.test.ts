import { describe, expect, it } from 'vitest';

import type { Quadrilateral } from '../../../core/vision/types';
import {
  asQuadrilateral,
  isStableCardQuad,
  overlapsAcceptedQuad,
  scoreCardShape,
  summarizeCardQuad,
} from './cardQuadGeometry';

/** Builds an axis-aligned quadrilateral for detector geometry fixtures. */
function quad(left: number, top: number, width: number, height: number): Quadrilateral {
  return [
    { x: left, y: top },
    { x: left + width, y: top },
    { x: left + width, y: top + height },
    { x: left, y: top + height },
  ];
}

describe('cardQuadGeometry', () => {
  it('accepts stable card-sized rectangles and rejects invalid shapes', () => {
    expect(isStableCardQuad(quad(0, 0, 63, 89))).toBe(true);
    expect(isStableCardQuad(quad(0, 0, 2, 3))).toBe(false);
    expect(
      isStableCardQuad([
        { x: Number.NaN, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ])
    ).toBe(false);
  });

  it('summarizes ideal rectangle geometry', () => {
    const summary = summarizeCardQuad(quad(0, 0, 63, 89));
    expect(summary.cardAspect).toBeCloseTo(63 / 89);
    expect(summary.edgeSimilarity).toBe(1);
    expect(summary.angleCosine).toBeCloseTo(0);
  });

  it('scores ideal card geometry above poor geometry', () => {
    const ideal = scoreCardShape(63 / 89, 63 / 89, 1, 1, 0);
    const poor = scoreCardShape(0.5, 63 / 89, 0.72, 0.5, 0.78);
    expect(ideal).toBeCloseTo(1);
    expect(ideal).toBeGreaterThan(poor);
  });

  it('deduplicates nearby centers without merging adjacent cards', () => {
    const accepted = [{ centerX: 50, centerY: 50, width: 60, height: 90 }];
    expect(
      overlapsAcceptedQuad({ centerX: 52, centerY: 52, width: 60, height: 90 }, accepted)
    ).toBe(true);
    expect(
      overlapsAcceptedQuad({ centerX: 120, centerY: 50, width: 60, height: 90 }, accepted)
    ).toBe(false);
  });

  it('validates conversion to a quadrilateral tuple', () => {
    const points = quad(0, 0, 10, 20);
    expect(asQuadrilateral(points)).toEqual(points);
    expect(() => asQuadrilateral(points.slice(0, 3))).toThrow(/Expected 4/);
  });
});
