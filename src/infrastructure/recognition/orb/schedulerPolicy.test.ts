import { describe, expect, it } from 'vitest';

import type { Quadrilateral } from '../../../core/vision/types';
import { boundsOf } from '../../../core/vision/geometry';
import {
  isSceneChurned,
  isSceneShifted,
  scoreSchedulerMatch,
  shouldRunOrbForTrack,
} from './schedulerPolicy';

/** Builds an axis-aligned card quadrilateral for scheduler fixtures. */
function quad(left: number, top: number, width = 63, height = 89): Quadrilateral {
  return [
    { x: left, y: top },
    { x: left + width, y: top },
    { x: left + width, y: top + height },
    { x: left, y: top + height },
  ];
}

describe('schedulerPolicy', () => {
  it('matches plausible tracks and rejects distant replacements', () => {
    const base = boundsOf(quad(0, 0));
    expect(scoreSchedulerMatch(base, boundsOf(quad(5, 4)))).toBeGreaterThan(0);
    expect(scoreSchedulerMatch(base, boundsOf(quad(1000, 0)))).toBeNull();
  });

  it('detects scene shift only with enough motion evidence', () => {
    expect(isSceneShifted(0.2, 2)).toBe(true);
    expect(isSceneShifted(0.2, 1)).toBe(false);
    expect(isSceneShifted(0.1, 4)).toBe(false);
  });

  it('detects scene churn only in sufficiently populated views', () => {
    expect(isSceneChurned(4, 4, 1)).toBe(true);
    expect(isSceneChurned(2, 4, 0)).toBe(false);
    expect(isSceneChurned(4, 4, 3)).toBe(false);
  });

  it('runs ORB for invalidated, stale or uncached tracks', () => {
    const stable = {
      forceOrbAll: false,
      cachedRecognized: true,
      framesSinceLastOrb: 1,
      recheckIntervalFrames: 5,
      centerDistance: 0.05,
      currentSizeSimilarity: 0.95,
    };

    expect(shouldRunOrbForTrack(stable)).toBe(false);
    expect(shouldRunOrbForTrack({ ...stable, forceOrbAll: true })).toBe(true);
    expect(shouldRunOrbForTrack({ ...stable, cachedRecognized: false })).toBe(true);
    expect(shouldRunOrbForTrack({ ...stable, framesSinceLastOrb: 5 })).toBe(true);
    expect(shouldRunOrbForTrack({ ...stable, centerDistance: 0.3 })).toBe(true);
    expect(shouldRunOrbForTrack({ ...stable, currentSizeSimilarity: 0.6 })).toBe(true);
  });
});
