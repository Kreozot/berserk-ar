import { Directory, File, Paths } from 'expo-file-system';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CV_FIXTURE_ASSETS } from './cvFixtureAssets';
import { summarizeCvFixtureRun } from './cvFixtureRunSummary';
import { type CvFixtureRunResult, runCvFixture } from './runCvFixture';

type FixtureStatus =
  | { readonly name: string; readonly state: 'pending' | 'running' }
  | { readonly name: string; readonly state: 'complete'; readonly result: CvFixtureRunResult }
  | { readonly name: string; readonly state: 'error'; readonly message: string };

function readableError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function saveReport(results: readonly FixtureStatus[]): string {
  const directory = new Directory(Paths.document, 'cv-regression');
  directory.create({ idempotent: true, intermediates: true });
  const report = new File(directory, 'latest.json');
  report.create({ overwrite: true, intermediates: true });
  report.write(
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        detectorSize: { width: 360, height: 480 },
        fixtures: results,
      },
      null,
      2,
    ),
  );
  return report.uri;
}

/** Runs the real-frame corpus without mounting CameraFeed or coupling it to runner UI state. */
export function CvRegressionScreen() {
  const [statuses, setStatuses] = useState<FixtureStatus[]>(
    CV_FIXTURE_ASSETS.map(({ name }) => ({ name, state: 'pending' })),
  );
  const [isRunning, setIsRunning] = useState(false);
  const [reportUri, setReportUri] = useState<string | null>(null);
  const mounted = useRef(true);
  const hasAutoStarted = useRef(false);

  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const runAll = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);
    setReportUri(null);
    const next: FixtureStatus[] = CV_FIXTURE_ASSETS.map(({ name }) => ({
      name,
      state: 'pending',
    }));
    setStatuses(next);

    for (let index = 0; index < CV_FIXTURE_ASSETS.length; index += 1) {
      const fixture = CV_FIXTURE_ASSETS[index];
      next[index] = { name: fixture.name, state: 'running' };
      if (mounted.current) setStatuses([...next]);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      try {
        const result = await runCvFixture(fixture);
        next[index] = { name: fixture.name, state: 'complete', result };
        console.log(`[BerserkCVRegression] ${fixture.name}: ${summarizeCvFixtureRun(result)}`);
      } catch (error) {
        const message = readableError(error);
        next[index] = { name: fixture.name, state: 'error', message };
        console.error(`[BerserkCVRegression] ${fixture.name}: ERROR · ${message}`);
      }
      if (mounted.current) setStatuses([...next]);
    }

    const uri = saveReport(next);
    const passed = next.filter(
      (status) => status.state === 'complete' && status.result.evaluation.passed,
    ).length;
    console.log(`[BerserkCVRegression] COMPLETE · ${passed}/${next.length} passed · ${uri}`);
    if (mounted.current) {
      setReportUri(uri);
      setIsRunning(false);
    }
  }, [isRunning]);

  useEffect(() => {
    if (!hasAutoStarted.current) {
      hasAutoStarted.current = true;
      void runAll();
    }
  }, [runAll]);

  const complete = statuses.filter((status) => status.state === 'complete');
  const passed = complete.filter((status) => status.result.evaluation.passed).length;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>CV REGRESSION</Text>
      <Text style={styles.summary}>
        {isRunning ? 'RUNNING' : 'COMPLETE'} · {passed}/{statuses.length} PASS
      </Text>
      <Text numberOfLines={2} style={styles.report}>
        {reportUri ?? 'Report will be saved after the run.'}
      </Text>
      <Pressable disabled={isRunning} onPress={() => void runAll()} style={styles.button}>
        <Text style={styles.buttonText}>{isRunning ? 'Running…' : 'Run again'}</Text>
      </Pressable>
      <ScrollView contentContainerStyle={styles.list}>
        {statuses.map((status) => {
          const passedFixture = status.state === 'complete' && status.result.evaluation.passed;
          const detail =
            status.state === 'complete'
              ? summarizeCvFixtureRun(status.result)
              : status.state === 'error'
                ? `ERROR · ${status.message}`
                : status.state.toUpperCase();
          return (
            <View key={status.name} style={styles.row}>
              <Text style={styles.name}>{status.name}</Text>
              <Text
                style={
                  status.state === 'complete'
                    ? passedFixture
                      ? styles.pass
                      : styles.fail
                    : status.state === 'error'
                      ? styles.fail
                      : styles.pending
                }
              >
                {detail}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#101010', paddingHorizontal: 16, paddingTop: 48 },
  title: { color: '#ffffff', fontSize: 22, fontWeight: '800', letterSpacing: 1.5 },
  summary: { marginTop: 8, color: '#ffffff', fontSize: 15, fontWeight: '700' },
  report: { marginTop: 6, color: '#999999', fontSize: 10 },
  button: {
    alignItems: 'center',
    marginTop: 14,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    paddingVertical: 10,
  },
  buttonText: { color: '#111111', fontSize: 13, fontWeight: '800' },
  list: { gap: 8, paddingBottom: 32, paddingTop: 14 },
  row: { borderRadius: 8, backgroundColor: '#1d1d1d', padding: 10 },
  name: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  pass: { marginTop: 4, color: '#39d77d', fontSize: 10 },
  fail: { marginTop: 4, color: '#ff6b6b', fontSize: 10 },
  pending: { marginTop: 4, color: '#d8b94b', fontSize: 10 },
});
