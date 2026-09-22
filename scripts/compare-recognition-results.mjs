import {
  baselinePath,
  compareReports,
  formatComparison,
  latestPath,
  readReport,
} from './recognition-report.mjs';

try {
  const baseline = await readReport(baselinePath, true);
  if (baseline.uninitialized)
    throw new Error(
      'Baseline has not been captured yet. Run recognition:test:device, then recognition:update-baseline.',
    );
  const current = await readReport(latestPath);
  console.log(formatComparison(baseline, current));
  const diff = compareReports(baseline, current);
  if (diff.regressions.length || diff.removed.length) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
