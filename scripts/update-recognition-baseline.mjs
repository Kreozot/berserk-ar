import { baselinePath, latestPath, readReport, saveReport } from './recognition-report.mjs';

try {
  const report = await readReport(latestPath);
  await saveReport(baselinePath, { ...report, timestamp: undefined });
  console.log('Baseline updated from latest device report. Review the diff before committing.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
