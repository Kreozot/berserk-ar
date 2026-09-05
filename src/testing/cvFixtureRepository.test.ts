import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CV_FIXTURE_ASSETS } from './cvFixtureAssets';
import {
  CV_FIXTURE_CATEGORIES,
  type CvFixtureManifest,
  parseCvFixtureManifest,
} from './cvFixtureManifest';

const FIXTURE_ROOT = resolve(import.meta.dirname, '../../fixtures/cv');
const CARD_CATALOG_PATH = resolve(import.meta.dirname, '../../data/cards/legends-of-laar.json');
const EXPECTED_FIXTURE_FILES = ['expected.json', 'frame.jpg'];

type Fixture = {
  name: string;
  manifest: CvFixtureManifest;
};

function jpegDimensions(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error('frame.jpg is not a JPEG image');
  }

  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;

    const segmentLength = bytes.readUInt16BE(offset);
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isStartOfFrame && offset + 7 <= bytes.length) {
      return {
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5),
      };
    }

    if (segmentLength < 2) break;
    offset += segmentLength;
  }

  throw new Error('frame.jpg has no supported JPEG size marker');
}

function readFixtures(): { fixtures: Fixture[]; issues: string[] } {
  const directories = readdirSync(FIXTURE_ROOT, { withFileTypes: true }).filter((entry) =>
    entry.isDirectory(),
  );
  const fixtures: Fixture[] = [];
  const issues: string[] = [];

  if (directories.length === 0) issues.push('no real-frame fixture directories found');

  for (const directory of directories) {
    const fixturePath = resolve(FIXTURE_ROOT, directory.name);
    const framePath = resolve(fixturePath, 'frame.jpg');
    const manifestPath = resolve(fixturePath, 'expected.json');
    const actualFiles = readdirSync(fixturePath).sort();

    if (JSON.stringify(actualFiles) !== JSON.stringify(EXPECTED_FIXTURE_FILES)) {
      issues.push(
        `${directory.name} must contain only ${EXPECTED_FIXTURE_FILES.join(' and ')}; found ${actualFiles.join(', ')}`,
      );
    }
    if (!existsSync(framePath)) issues.push(`${directory.name}/frame.jpg is missing`);
    if (!existsSync(manifestPath)) {
      issues.push(`${directory.name}/expected.json is missing`);
      continue;
    }

    try {
      const manifest = parseCvFixtureManifest(JSON.parse(readFileSync(manifestPath, 'utf8')));
      fixtures.push({ name: directory.name, manifest });
    } catch (error) {
      issues.push(`${directory.name}/expected.json: ${(error as Error).message}`);
    }

    if (existsSync(framePath)) {
      try {
        const dimensions = jpegDimensions(framePath);
        if (dimensions.width <= 0 || dimensions.height <= 0) {
          issues.push(
            `${directory.name}/frame.jpg has invalid dimensions ${dimensions.width}x${dimensions.height}`,
          );
        }
      } catch (error) {
        issues.push(`${directory.name}/frame.jpg: ${(error as Error).message}`);
      }
    }
  }

  return { fixtures, issues };
}

describe('CV fixture repository', () => {
  it('contains only complete, valid real-frame fixture directories', () => {
    const { issues } = readFixtures();

    expect(issues).toEqual([]);
  });

  it('covers every planned real-world category', () => {
    const { fixtures, issues } = readFixtures();
    expect(issues).toEqual([]);

    const categories = new Set(fixtures.map(({ manifest }) => manifest.category));
    expect(categories).toEqual(new Set(CV_FIXTURE_CATEGORIES));

    const falsePositiveFixtures = fixtures.filter(
      ({ manifest }) => manifest.category === 'false-positives',
    );
    expect(falsePositiveFixtures.length).toBeGreaterThan(0);
    expect(falsePositiveFixtures.every(({ manifest }) => manifest.expectations.length === 0)).toBe(
      true,
    );
  });

  it('references only identities available to the production recognizer', () => {
    const { fixtures, issues } = readFixtures();
    expect(issues).toEqual([]);

    const catalog = JSON.parse(readFileSync(CARD_CATALOG_PATH, 'utf8')) as {
      cards: { id: string }[];
    };
    const knownCardIds = new Set(catalog.cards.map(({ id }) => id));
    const unknownReferences = fixtures.flatMap(({ name, manifest }) =>
      manifest.expectations
        .filter(({ cardId }) => cardId !== null && !knownCardIds.has(cardId))
        .map(({ label, cardId }) => `${name}/${label}: ${cardId}`),
    );

    expect(unknownReferences).toEqual([]);
  });

  it('registers every real frame for the Android on-device runner', () => {
    const fixtureDirectories = readdirSync(FIXTURE_ROOT, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const registeredNames = CV_FIXTURE_ASSETS.map(({ name }) => name).sort();

    expect(registeredNames).toEqual(fixtureDirectories);
    expect(
      CV_FIXTURE_ASSETS.every(
        ({ name, resourceName }) => resourceName === `cv-fixtures/${name}.jpg`,
      ),
    ).toBe(true);
  });
});
