import { describe, expect, it } from 'vitest';

import {
  clamp01,
  passesOrbRecognitionThresholds,
  requiredGoodMatches,
  scoreOrbConfidence,
} from './orbScoring';

describe('orbScoring', () => {
  it('clamps confidence contributions to 0..1', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(2)).toBe(1);
  });

  it('computes dynamic required match counts within configured bounds', () => {
    expect(requiredGoodMatches(40)).toBe(18);
    expect(requiredGoodMatches(200)).toBe(24);
    expect(requiredGoodMatches(1000)).toBe(28);
  });

  it('assigns more confidence to stronger and better-separated winners', () => {
    const weak = scoreOrbConfidence(18, 10, 100);
    const strong = scoreOrbConfidence(50, 8, 150);
    expect(strong).toBeGreaterThan(weak);
    expect(weak).toBeGreaterThanOrEqual(0);
    expect(strong).toBeLessThanOrEqual(1);
  });

  it('requires every recognition threshold to pass', () => {
    expect(passesOrbRecognitionThresholds(30, 10, 100)).toBe(true);
    expect(passesOrbRecognitionThresholds(17, 1, 100)).toBe(false);
    expect(passesOrbRecognitionThresholds(20, 14, 100)).toBe(false);
    expect(passesOrbRecognitionThresholds(20, 12, 200)).toBe(false);
  });
});
