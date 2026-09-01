import { describe, expect, it } from 'vitest';

import type { Quadrilateral } from '../vision/types';
import { boundsOf } from '../vision/geometry';
import { scoreTrackMatch } from './trackingPolicy';

/** Builds an axis-aligned card quadrilateral for track-matching fixtures. */
function quad(left: number, top: number, width = 63, height = 89): Quadrilateral {
  return [
    { x: left, y: top },
    { x: left + width, y: top },
    { x: left + width, y: top + height },
    { x: left, y: top + height },
  ];
}

describe('scoreTrackMatch', () => {
  it('favors nearby matching bounds', () => {
    const base = boundsOf(quad(0, 0));
    const near = boundsOf(quad(3, 2));
    expect(scoreTrackMatch(base, near)).toBeGreaterThan(0.5);
  });

  it('rejects implausibly distant observations', () => {
    const base = boundsOf(quad(0, 0));
    const far = boundsOf(quad(1000, 1000));
    expect(scoreTrackMatch(base, far)).toBeNull();
  });
});
