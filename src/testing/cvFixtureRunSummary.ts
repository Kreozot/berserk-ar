import type { CvFixtureRunResult } from './runCvFixture';

/** Explains how to repair a stale debug APK that does not contain generated fixture assets. */
export function missingCvFixtureAssetMessage(name: string, error: unknown): string {
  const nativeMessage = error instanceof Error ? error.message : String(error);
  return (
    `Debug fixture asset ${name} is unavailable. ` +
    `Rebuild with npm run android:cv-regression. Native error: ${nativeMessage}`
  );
}

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
