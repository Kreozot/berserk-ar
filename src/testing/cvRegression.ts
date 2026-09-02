import { boundsOf, intersectionOverUnion } from '../core/vision/geometry';
import type { Quadrilateral } from '../core/vision/types';

export type CvRegressionExpectation = {
  /** Stable label used in failure output, for example `left-ll-003`. */
  label: string;
  /** Expected card identity. Null means detection is required but recognition may stay UNKNOWN. */
  cardId: string | null;
  /** Expected card corners normalized to the fixture image size (0..1). */
  corners: Quadrilateral;
};

export type CvRegressionObservation = {
  /** Recognized card identity, or null for UNKNOWN. */
  cardId: string | null;
  /** Observed card corners normalized to the fixture image size (0..1). */
  corners: Quadrilateral;
};

export type CvRegressionOptions = {
  /** Minimum bounding-box IoU for an observation to represent an expected physical card. */
  minIou: number;
  /** Whether an expected non-null cardId must match the observation identity. */
  requireIdentity: boolean;
};

export type CvRegressionMatch = {
  expectationIndex: number;
  observationIndex: number;
  iou: number;
  identityMatches: boolean;
};

export type CvRegressionResult = {
  matches: CvRegressionMatch[];
  missedExpectationIndexes: number[];
  unexpectedObservationIndexes: number[];
  identityMismatchExpectationIndexes: number[];
  passed: boolean;
};

const DEFAULT_OPTIONS: CvRegressionOptions = {
  minIou: 0.5,
  requireIdentity: true,
};

/**
 * Greedily pairs expected and observed cards by highest IoU, then reports geometry and identity regressions.
 * The matcher deliberately operates on normalized coordinates so fixtures remain stable across camera resolutions.
 */
export function evaluateCvRegression(
  expectations: readonly CvRegressionExpectation[],
  observations: readonly CvRegressionObservation[],
  options: Partial<CvRegressionOptions> = {},
): CvRegressionResult {
  const resolvedOptions = { ...DEFAULT_OPTIONS, ...options };
  const candidatePairs: CvRegressionMatch[] = [];

  for (let expectationIndex = 0; expectationIndex < expectations.length; expectationIndex += 1) {
    const expectationBounds = boundsOf(expectations[expectationIndex].corners);

    for (let observationIndex = 0; observationIndex < observations.length; observationIndex += 1) {
      const iou = intersectionOverUnion(expectationBounds, boundsOf(observations[observationIndex].corners));
      if (iou < resolvedOptions.minIou) continue;

      const expectedCardId = expectations[expectationIndex].cardId;
      candidatePairs.push({
        expectationIndex,
        observationIndex,
        iou,
        identityMatches: expectedCardId === null || expectedCardId === observations[observationIndex].cardId,
      });
    }
  }

  candidatePairs.sort((left, right) => right.iou - left.iou);

  const usedExpectations = new Set<number>();
  const usedObservations = new Set<number>();
  const matches: CvRegressionMatch[] = [];

  for (const pair of candidatePairs) {
    if (usedExpectations.has(pair.expectationIndex) || usedObservations.has(pair.observationIndex)) continue;
    usedExpectations.add(pair.expectationIndex);
    usedObservations.add(pair.observationIndex);
    matches.push(pair);
  }

  const missedExpectationIndexes = expectations
    .map((_, index) => index)
    .filter((index) => !usedExpectations.has(index));
  const unexpectedObservationIndexes = observations
    .map((_, index) => index)
    .filter((index) => !usedObservations.has(index));
  const identityMismatchExpectationIndexes = matches
    .filter((match) => !match.identityMatches)
    .map((match) => match.expectationIndex);

  return {
    matches,
    missedExpectationIndexes,
    unexpectedObservationIndexes,
    identityMismatchExpectationIndexes,
    passed:
      missedExpectationIndexes.length === 0 &&
      unexpectedObservationIndexes.length === 0 &&
      (!resolvedOptions.requireIdentity || identityMismatchExpectationIndexes.length === 0),
  };
}
