import type { CvFixtureRunResult } from './runCvFixture';

/** Produces a compact stable failure line for the on-device UI and Metro logs. */
export function summarizeCvFixtureRun(result: CvFixtureRunResult): string {
  const { evaluation } = result;
  if (evaluation.passed) {
    return `PASS · ${result.observations.length} observed · ${result.detectorMs + result.orbMs} ms`;
  }
  return [
    `FAIL · missed ${evaluation.missedExpectationIndexes.length}`,
    `unexpected ${evaluation.unexpectedObservationIndexes.length}`,
    `wrong ID ${evaluation.identityMismatchExpectationIndexes.length}`,
  ].join(' · ');
}
