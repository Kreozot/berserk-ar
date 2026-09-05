import { describe, expect, it } from 'vitest';
import { summarizeCvFixtureRun } from './cvFixtureRunSummary';
import type { CvFixtureRunResult } from './runCvFixture';

function result(passed: boolean): CvFixtureRunResult {
  return {
    fixtureName: 'fixture',
    category: 'single-card',
    sourceWidth: 1080,
    sourceHeight: 2340,
    detectorMs: 12,
    orbMs: 8,
    diagnosticUri: null,
    observations: passed ? [{ cardId: 'll-001', corners: [] as never }] : [],
    evaluation: {
      passed,
      matches: [],
      missedExpectationIndexes: passed ? [] : [0],
      unexpectedObservationIndexes: passed ? [] : [0, 1],
      identityMismatchExpectationIndexes: passed ? [] : [0],
    },
  };
}

describe('summarizeCvFixtureRun', () => {
  it('summarizes passing timing and observation count', () => {
    expect(summarizeCvFixtureRun(result(true))).toBe('PASS · 1 observed · 20 ms');
  });

  it('summarizes every regression class', () => {
    expect(summarizeCvFixtureRun(result(false))).toBe(
      'FAIL · missed 1 · unexpected 2 · wrong ID 1',
    );
  });
});
