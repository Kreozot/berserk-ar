import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseCvFixtureManifest } from './cvFixtureManifest';

const FIXTURE_ROOT = resolve(import.meta.dirname, '../../fixtures/cv');

describe('CV fixture repository', () => {
  it('contains only complete, valid real-frame fixture directories', () => {
    const directories = readdirSync(FIXTURE_ROOT, { withFileTypes: true }).filter((entry) =>
      entry.isDirectory(),
    );
    const issues: string[] = [];

    for (const directory of directories) {
      const fixturePath = resolve(FIXTURE_ROOT, directory.name);
      const framePath = resolve(fixturePath, 'frame.jpg');
      const manifestPath = resolve(fixturePath, 'expected.json');

      if (!existsSync(framePath)) issues.push(`${directory.name}/frame.jpg is missing`);
      if (!existsSync(manifestPath)) {
        issues.push(`${directory.name}/expected.json is missing`);
        continue;
      }

      try {
        parseCvFixtureManifest(JSON.parse(readFileSync(manifestPath, 'utf8')));
      } catch (error) {
        issues.push(`${directory.name}/expected.json: ${(error as Error).message}`);
      }
    }

    expect(issues).toEqual([]);
  });
});
