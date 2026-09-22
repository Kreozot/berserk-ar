import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const root = path.resolve(import.meta.dirname, '..');
export const latestPath = path.join(root, 'recognition-tests/results/latest.json');
export const baselinePath = path.join(root, 'recognition-tests/baseline.json');

export function validateReport(value, allowUninitialized = false) {
  if (value?.schemaVersion !== 1 || !Array.isArray(value.cases) || !value.summary)
    throw new Error('Invalid recognition report (schema version 1 required).');
  if (value.uninitialized && allowUninitialized) return value;
  if (value.uninitialized || value.cases.length === 0)
    throw new Error('Report has no measured cases. Run recognition:test:device first.');
  const ids = new Set();
  for (const item of value.cases) {
    if (
      typeof item.id !== 'string' ||
      !item.id ||
      ids.has(item.id) ||
      typeof item.passed !== 'boolean' ||
      !Array.isArray(item.expected) ||
      !Array.isArray(item.actual)
    )
      throw new Error(`Invalid or duplicate case: ${item.id}`);
    ids.add(item.id);
  }
  if (value.summary.total !== value.cases.length)
    throw new Error('Report summary total does not match cases.');
  return value;
}

export async function readReport(file, allowUninitialized = false) {
  try {
    return validateReport(JSON.parse(await readFile(file, 'utf8')), allowUninitialized);
  } catch (error) {
    throw new Error(`Cannot read ${path.relative(root, file)}: ${error.message}`);
  }
}

export async function saveReport(file, report) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`);
}

export function parseTransport(log) {
  const records = log
    .split(/\r?\n/)
    .map((line) => line.match(/\[BerserkCVReport\] (BEGIN|CHUNK|END) (\w+)(?: (.*))?$/))
    .filter(Boolean);
  const begin = [...records].reverse().find((record) => record[1] === 'BEGIN');
  if (!begin) return null;
  const id = begin[2];
  const count = Number(begin[3]);
  if (
    !Number.isInteger(count) ||
    count <= 0 ||
    !records.some((record) => record[1] === 'END' && record[2] === id)
  )
    return null;
  const chunks = new Map(
    records
      .filter((record) => record[1] === 'CHUNK' && record[2] === id)
      .map((record) => {
        const match = record[3]?.match(/^(\d+) (.*)$/);
        return match ? [Number(match[1]), match[2]] : [-1, ''];
      }),
  );
  if (chunks.size < count) return null;
  try {
    return validateReport(
      JSON.parse(Array.from({ length: count }, (_, index) => chunks.get(index)).join('')),
    );
  } catch (error) {
    throw new Error(`Device report is incomplete or invalid: ${error.message}`);
  }
}

export function compareReports(baseline, current) {
  const before = new Map(baseline.cases.map((item) => [item.id, item]));
  const after = new Map(current.cases.map((item) => [item.id, item]));
  const regressions = [],
    improvements = [],
    changed = [],
    added = [],
    removed = [];
  for (const item of current.cases) {
    const old = before.get(item.id);
    if (!old) {
      added.push(item.id);
      continue;
    }
    if (old.passed && !item.passed) regressions.push(item.id);
    else if (!old.passed && item.passed) improvements.push(item.id);
    if (
      JSON.stringify({
        expected: old.expected,
        actual: old.actual,
        missed: old.missed,
        wrongIdentity: old.wrongIdentity,
        unexpected: old.unexpected,
        error: old.error,
      }) !==
      JSON.stringify({
        expected: item.expected,
        actual: item.actual,
        missed: item.missed,
        wrongIdentity: item.wrongIdentity,
        unexpected: item.unexpected,
        error: item.error,
      })
    )
      changed.push(item.id);
  }
  for (const item of baseline.cases) if (!after.has(item.id)) removed.push(item.id);
  return { regressions, improvements, changed, added, removed };
}

export function formatComparison(baseline, current) {
  const diff = compareReports(baseline, current);
  const lines = [
    'Recognition regression report',
    `Cases: baseline ${baseline.summary.total}, current ${current.summary.total}`,
  ];
  for (const key of ['passed', 'failed', 'missed', 'wrongIdentity', 'unexpected']) {
    lines.push(
      `${key}: ${baseline.summary[key]} -> ${current.summary[key]} (${(current.summary[key] - baseline.summary[key]) >= 0 ? '+' : ''}${current.summary[key] - baseline.summary[key]})`,
    );
  }
  for (const [title, ids] of Object.entries({
    'Regressed cases': diff.regressions,
    'Improved cases': diff.improvements,
    'Added cases': diff.added,
    'Removed cases': diff.removed,
    'Changed observations': diff.changed,
  })) {
    lines.push(`${title}: ${ids.length ? ids.join(', ') : 'none'}`);
  }
  for (const id of diff.changed) {
    const old = baseline.cases.find((item) => item.id === id);
    const now = current.cases.find((item) => item.id === id);
    lines.push(
      `  ${id}: expected ${JSON.stringify(now.expected)}; baseline ${JSON.stringify(old.actual)}; current ${JSON.stringify(now.actual)}`,
    );
  }
  lines.push(
    'Timing is measured but excluded from regression decisions because device load affects it.',
  );
  return lines.join('\n');
}
