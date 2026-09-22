import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { latestPath, parseTransport, saveReport } from './recognition-report.mjs';

const adb = process.platform === 'win32' ? 'adb.exe' : 'adb';
const run = (...args) => {
  const result = spawnSync(adb, args, { encoding: 'utf8', timeout: 30000 });
  if (result.error) throw new Error(`adb unavailable or timed out: ${result.error.message}`);
  if (result.status !== 0)
    throw new Error(`adb ${args[0]} failed: ${(result.stderr || result.stdout).trim()}`);
  return result.stdout;
};

let metro;
let metroOutput = '';
try {
  const devices = run('devices')
    .split(/\r?\n/)
    .slice(1)
    .filter((line) => /\tdevice$/.test(line))
    .map((line) => line.split('\t')[0]);
  if (devices.length !== 1)
    throw new Error(
      `Expected one authorized Android device; found ${devices.length}. Check USB debugging and adb devices.`,
    );
  const serial = devices[0];
  const device = (...args) => run('-s', serial, ...args);
  const packageName = 'com.kreozot.berserkar';
  if (!device('shell', 'pm', 'path', packageName).includes('package:'))
    throw new Error('Debug APK is not installed. Run npm run android:cv-regression once.');
  // Metro serves the opt-in JS bundle; fixtures are already bundled in the debug APK.
  const projectRoot = fileURLToPath(new URL('..', import.meta.url));
  metro = spawn(
    process.execPath,
    [
      path.join(projectRoot, 'node_modules/expo/bin/cli'),
      'start',
      '--dev-client',
      '--localhost',
      '--port',
      '8081',
    ],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        EXPO_PUBLIC_CV_REGRESSION: '1',
        CI: '1',
        // Expo resolves localhost when binding Metro. On Windows it may choose ::1,
        // while adb reverse connects to the IPv4 loopback address.
        NODE_OPTIONS: [process.env.NODE_OPTIONS, '--dns-result-order=ipv4first']
          .filter(Boolean)
          .join(' '),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const rememberMetroOutput = (chunk) => {
    metroOutput = (metroOutput + chunk.toString()).slice(-4000);
  };
  metro.stdout.on('data', rememberMetroOutput);
  metro.stderr.on('data', rememberMetroOutput);
  let metroStartError;
  metro.on('error', (error) => {
    metroStartError = error;
  });
  let ready = false;
  for (let i = 0; i < 60; i += 1) {
    if (metroStartError) throw new Error(`Cannot start Expo Metro: ${metroStartError.message}`);
    if (metro.exitCode !== null)
      throw new Error(`Expo Metro stopped before becoming ready. ${metroOutput.trim()}`);
    try {
      if (
        (await (await fetch('http://127.0.0.1:8081/status')).text()).includes(
          'packager-status:running',
        )
      ) {
        ready = true;
        break;
      }
    } catch {}
    await delay(1000);
  }
  if (!ready) throw new Error(`Metro did not become ready on port 8081. ${metroOutput.trim()}`);
  device('reverse', 'tcp:8081', 'tcp:8081');
  device('logcat', '-c');
  device('shell', 'am', 'force-stop', packageName);
  device(
    'shell',
    'am',
    'start',
    '-a',
    'android.intent.action.VIEW',
    '-d',
    'exp+berserk-ar://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081',
    packageName,
  );
  console.log('Running recognition fixtures on device…');
  let report;
  for (let i = 0; i < 180; i += 1) {
    await delay(1000);
    report = parseTransport(device('logcat', '-d', '-s', 'ReactNativeJS:I', '*:S'));
    if (report) break;
  }
  if (!report)
    throw new Error(
      'No completed report after 3 minutes. Check that the installed debug APK includes fixtures and Metro loaded the regression mode.',
    );
  await saveReport(latestPath, report);
  console.log(
    `Saved ${report.summary.total} cases to recognition-tests/results/latest.json (${report.summary.failed} failed).`,
  );
  if (report.cases.some((item) => item.error))
    throw new Error('Some fixture executions failed; inspect latest.json for error details.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (metro) metro.kill();
}
