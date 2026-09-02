import { describe, expect, it } from 'vitest';

import type { Quadrilateral } from '../core/vision/types';
import {
  type CvRegressionExpectation,
  type CvRegressionObservation,
  evaluateCvRegression,
} from './cvRegression';

/** Builds a normalized axis-aligned quadrilateral for regression fixtures. */
function quad(left: number, top: number, width: number, height: number): Quadrilateral {
  return [
    { x: left, y: top },
    { x: left + width, y: top },
    { x: left + width, y: top + height },
    { x: left, y: top + height },
  ];
}

/** Builds one expected card entry with concise defaults. */
function expected(
  label: string,
  cardId: string | null,
  corners: Quadrilateral,
): CvRegressionExpectation {
  return { label, cardId, corners };
}

/** Builds one observed card entry with concise defaults. */
function observed(cardId: string | null, corners: Quadrilateral): CvRegressionObservation {
  return { cardId, corners };
}

describe('evaluateCvRegression', () => {
  it('passes when every expected card has one close observation with the correct identity', () => {
    const result = evaluateCvRegression(
      [
        expected('left', 'll-001', quad(0.1, 0.1, 0.2, 0.3)),
        expected('right', 'll-002', quad(0.6, 0.1, 0.2, 0.3)),
      ],
      [
        observed('ll-002', quad(0.61, 0.11, 0.2, 0.3)),
        observed('ll-001', quad(0.11, 0.1, 0.2, 0.3)),
      ],
    );

    expect(result.passed).toBe(true);
    expect(result.matches).toHaveLength(2);
    expect(result.missedExpectationIndexes).toEqual([]);
    expect(result.unexpectedObservationIndexes).toEqual([]);
    expect(result.identityMismatchExpectationIndexes).toEqual([]);
  });

  it('reports missed and unexpected detections independently', () => {
    const result = evaluateCvRegression(
      [expected('card', 'll-001', quad(0.1, 0.1, 0.2, 0.3))],
      [observed('ll-001', quad(0.7, 0.6, 0.2, 0.3))],
    );

    expect(result.passed).toBe(false);
    expect(result.missedExpectationIndexes).toEqual([0]);
    expect(result.unexpectedObservationIndexes).toEqual([0]);
  });

  it('reports identity mismatches without treating a geometrically matched card as missing', () => {
    const result = evaluateCvRegression(
      [expected('card', 'll-001', quad(0.1, 0.1, 0.2, 0.3))],
      [observed('ll-009', quad(0.1, 0.1, 0.2, 0.3))],
    );

    expect(result.passed).toBe(false);
    expect(result.missedExpectationIndexes).toEqual([]);
    expect(result.identityMismatchExpectationIndexes).toEqual([0]);
  });

  it('allows detection-only expectations to match UNKNOWN observations', () => {
    const result = evaluateCvRegression(
      [expected('unknown-card', null, quad(0.1, 0.1, 0.2, 0.3))],
      [observed(null, quad(0.1, 0.1, 0.2, 0.3))],
    );

    expect(result.passed).toBe(true);
  });

  it('can ignore identity regressions when a fixture only targets detector geometry', () => {
    const result = evaluateCvRegression(
      [expected('card', 'll-001', quad(0.1, 0.1, 0.2, 0.3))],
      [observed('ll-004', quad(0.1, 0.1, 0.2, 0.3))],
      { requireIdentity: false },
    );

    expect(result.passed).toBe(true);
    expect(result.identityMismatchExpectationIndexes).toEqual([0]);
  });

  it('uses the highest-IoU one-to-one pairing when candidates overlap', () => {
    const result = evaluateCvRegression(
      [
        expected('a', 'll-001', quad(0.1, 0.1, 0.2, 0.3)),
        expected('b', 'll-002', quad(0.35, 0.1, 0.2, 0.3)),
      ],
      [observed('ll-002', quad(0.34, 0.1, 0.2, 0.3)), observed('ll-001', quad(0.1, 0.1, 0.2, 0.3))],
      { minIou: 0.1 },
    );

    expect(result.passed).toBe(true);
    expect(result.matches.map((match) => [match.expectationIndex, match.observationIndex])).toEqual(
      [
        [0, 1],
        [1, 0],
      ],
    );
  });
});
