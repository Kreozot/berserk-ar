import { describe, expect, it } from 'vitest';
import { missingCvFixtureAssetMessage, summarizeCvFixtureRun } from './cvFixtureRunSummary';
import type { CvFixtureRunResult } from './runCvFixture';

function result(passed: boolean): CvFixtureRunResult {
  return {
    fixtureName: 'fixture',
    category: 'single-card',
    sourceWidth: 1080,
    sourceHeight: 2340,
    detectorMs: 12,
    detectorDiagnostics: {
      rawContours: 0,
      closedContours: 0,
      areaRejected: 0,
      notQuadrilateral: 0,
      unstable: 0,
      fillRejected: 0,
      perimeterRejected: 0,
      aspectRejected: 0,
      oppositeEdgesRejected: 0,
      anglesRejected: 0,
      frameBoundsRejected: 0,
      scored: 0,
      duplicates: 0,
      accepted: 0,
    },
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

describe('missingCvFixtureAssetMessage', () => {
  it('points stale debug builds to the self-synchronizing command', () => {
    expect(
      missingCvFixtureAssetMessage('single-card', new Error('java.io.FileNotFoundException')),
    ).toBe(
      'Debug fixture asset single-card is unavailable. Rebuild with npm run android:cv-regression. Native error: java.io.FileNotFoundException',
    );
  });
});
