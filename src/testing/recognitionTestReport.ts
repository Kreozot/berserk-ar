import { CV_FIXTURE_ASSETS } from './cvFixtureAssets';
import type { CvFixtureRunResult } from './runCvFixture';

export type RecognitionCase = {
  id: string;
  category: string;
  passed: boolean;
  expected: readonly { label: string; cardId: string | null }[];
  actual: readonly { cardId: string | null }[];
  missed: readonly string[];
  wrongIdentity: readonly string[];
  unexpected: number;
  detectorMs: number;
  orbMs: number;
  error?: string;
};

export type RecognitionTestReport = {
  schemaVersion: 1;
  timestamp: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    missed: number;
    wrongIdentity: number;
    unexpected: number;
  };
  cases: RecognitionCase[];
};

export type FixtureStatus =
  | { readonly name: string; readonly state: 'pending' | 'running' }
  | { readonly name: string; readonly state: 'complete'; readonly result: CvFixtureRunResult }
  | { readonly name: string; readonly state: 'error'; readonly message: string };

/** Converts runner state into a transport-independent, stable fixture report. */
export function collectRecognitionTestReport(
  statuses: readonly FixtureStatus[],
): RecognitionTestReport {
  const cases = statuses.map((status): RecognitionCase => {
    const fixture = CV_FIXTURE_ASSETS.find((item) => item.name === status.name);
    if (!fixture) throw new Error(`Unknown fixture: ${status.name}`);
    const result = status.state === 'complete' ? status.result : null;
    const expectations = fixture.manifest.expectations;
    return {
      id: status.name,
      category: fixture.manifest.category,
      passed: result?.evaluation.passed ?? false,
      expected: expectations.map(({ label, cardId }) => ({ label, cardId })),
      actual: result?.observations.map(({ cardId }) => ({ cardId })) ?? [],
      missed:
        result?.evaluation.missedExpectationIndexes.map((index) => expectations[index].label) ?? [],
      wrongIdentity:
        result?.evaluation.identityMismatchExpectationIndexes.map(
          (index) => expectations[index].label,
        ) ?? [],
      unexpected: result?.evaluation.unexpectedObservationIndexes.length ?? 0,
      detectorMs: result?.detectorMs ?? 0,
      orbMs: result?.orbMs ?? 0,
      ...(status.state === 'error' ? { error: status.message } : {}),
    };
  });
  return {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    summary: {
      total: cases.length,
      passed: cases.filter((item) => item.passed).length,
      failed: cases.filter((item) => !item.passed).length,
      missed: cases.reduce((sum, item) => sum + item.missed.length, 0),
      wrongIdentity: cases.reduce((sum, item) => sum + item.wrongIdentity.length, 0),
      unexpected: cases.reduce((sum, item) => sum + item.unexpected, 0),
    },
    cases,
  };
}

/** Android log lines have a size limit, so send a framed JSON payload in short pieces. */
export function emitRecognitionTestReport(report: RecognitionTestReport): void {
  const json = JSON.stringify(report);
  const runId = Date.now().toString(36);
  const chunks = json.match(/.{1,800}/g) ?? [];
  console.log(`[BerserkCVReport] BEGIN ${runId} ${chunks.length}`);
  chunks.forEach((chunk, index) => {
    console.log(`[BerserkCVReport] CHUNK ${runId} ${index} ${chunk}`);
  });
  console.log(`[BerserkCVReport] END ${runId}`);
}
