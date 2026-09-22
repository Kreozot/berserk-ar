import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareReports, formatComparison, parseTransport } from './recognition-report.mjs';

const item = (id, passed = true, actual = 'll-001') => ({
  id,
  passed,
  expected: [{ label: 'card', cardId: 'll-001' }],
  actual: [{ cardId: actual }],
  missed: [],
  wrongIdentity: [],
  unexpected: 0,
  detectorMs: 10,
  orbMs: 20,
});
const report = (cases, timestamp = 'today') => ({
  schemaVersion: 1,
  timestamp,
  summary: {
    total: cases.length,
    passed: cases.filter((entry) => entry.passed).length,
    failed: cases.filter((entry) => !entry.passed).length,
    missed: 0,
    wrongIdentity: 0,
    unexpected: 0,
  },
  cases,
});

test('identical cases ignore timestamp and timing', () => {
  const result = compareReports(
    report([item('a')]),
    report([{ ...item('a'), detectorMs: 99 }], 'tomorrow'),
  );
  assert.deepEqual(result, {
    regressions: [],
    improvements: [],
    changed: [],
    added: [],
    removed: [],
  });
});
test('classifies regression, improvement, added and removed cases', () => {
  const result = compareReports(
    report([item('a'), item('b', false), item('old')]),
    report([item('a', false, 'll-002'), item('b'), item('new')]),
  );
  assert.deepEqual(result.regressions, ['a']);
  assert.deepEqual(result.improvements, ['b']);
  assert.deepEqual(result.added, ['new']);
  assert.deepEqual(result.removed, ['old']);
  assert.match(formatComparison(report([item('a')]), report([item('a', false)])), /failed: 0 -> 1/);
});
test('reassembles framed device output', () => {
  const json = JSON.stringify(report([item('a')]));
  const log = `[BerserkCVReport] BEGIN id 2\n[BerserkCVReport] CHUNK id 0 ${json.slice(0, 50)}\n[BerserkCVReport] CHUNK id 1 ${json.slice(50)}\n[BerserkCVReport] END id`;
  assert.deepEqual(parseTransport(log), report([item('a')]));
});
