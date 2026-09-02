import type { CvRegressionExpectation, CvRegressionOptions } from './cvRegression';

export const CV_FIXTURE_CATEGORIES = [
  'single-card',
  'four-cards',
  'crowded-board',
  'perspective',
  'glare',
  'partial-overlap',
  'false-positives',
] as const;

export type CvFixtureCategory = (typeof CV_FIXTURE_CATEGORIES)[number];

export type CvFixtureManifest = {
  readonly schemaVersion: 1;
  readonly category: CvFixtureCategory;
  readonly description: string;
  readonly expectations: readonly CvRegressionExpectation[];
  readonly minIou?: number;
  readonly requireIdentity?: boolean;
};

const ROOT_KEYS = new Set([
  'schemaVersion',
  'category',
  'description',
  'expectations',
  'minIou',
  'requireIdentity',
]);
const EXPECTATION_KEYS = new Set(['label', 'cardId', 'corners']);
const POINT_KEYS = new Set(['x', 'y']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function reportUnknownKeys(
  value: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
  path: string,
  issues: string[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) issues.push(`${path}.${key} is not supported`);
  }
}

function validatePoint(value: unknown, path: string, issues: string[]): void {
  if (!isRecord(value)) {
    issues.push(`${path} must be an object with numeric x and y`);
    return;
  }

  reportUnknownKeys(value, POINT_KEYS, path, issues);
  for (const coordinate of ['x', 'y'] as const) {
    const coordinateValue = value[coordinate];
    if (
      typeof coordinateValue !== 'number' ||
      !Number.isFinite(coordinateValue) ||
      coordinateValue < 0 ||
      coordinateValue > 1
    ) {
      issues.push(`${path}.${coordinate} must be a finite number from 0 to 1`);
    }
  }
}

function validateCorners(value: unknown, path: string, issues: string[]): void {
  if (!Array.isArray(value) || value.length !== 4) {
    issues.push(`${path} must contain exactly four points`);
    return;
  }

  for (let index = 0; index < value.length; index += 1) {
    validatePoint(value[index], `${path}[${index}]`, issues);
  }

  if (value.every(isRecord)) {
    const xs = value.map((point) => point.x).filter((x): x is number => typeof x === 'number');
    const ys = value.map((point) => point.y).filter((y): y is number => typeof y === 'number');
    if (
      xs.length === 4 &&
      ys.length === 4 &&
      (Math.max(...xs) === Math.min(...xs) || Math.max(...ys) === Math.min(...ys))
    ) {
      issues.push(`${path} must cover a non-zero area`);
    }
  }
}

function validateExpectation(
  value: unknown,
  index: number,
  labels: Set<string>,
  issues: string[],
): void {
  const path = `expectations[${index}]`;
  if (!isRecord(value)) {
    issues.push(`${path} must be an object`);
    return;
  }

  reportUnknownKeys(value, EXPECTATION_KEYS, path, issues);
  if (typeof value.label !== 'string' || value.label.trim().length === 0) {
    issues.push(`${path}.label must be a non-empty string`);
  } else if (labels.has(value.label)) {
    issues.push(`${path}.label duplicates ${JSON.stringify(value.label)}`);
  } else {
    labels.add(value.label);
  }

  if (
    value.cardId !== null &&
    (typeof value.cardId !== 'string' || value.cardId.trim().length === 0)
  ) {
    issues.push(`${path}.cardId must be a non-empty string or null`);
  }

  validateCorners(value.corners, `${path}.corners`, issues);
}

/** Validates and narrows the JSON stored in one fixture's expected.json file. */
export function parseCvFixtureManifest(value: unknown): CvFixtureManifest {
  const issues: string[] = [];
  if (!isRecord(value)) {
    throw new Error('Invalid CV fixture manifest:\n- root must be an object');
  }

  reportUnknownKeys(value, ROOT_KEYS, 'root', issues);
  if (value.schemaVersion !== 1) {
    issues.push('schemaVersion must be 1');
  }
  if (
    typeof value.category !== 'string' ||
    !CV_FIXTURE_CATEGORIES.includes(value.category as CvFixtureCategory)
  ) {
    issues.push(`category must be one of: ${CV_FIXTURE_CATEGORIES.join(', ')}`);
  }
  if (typeof value.description !== 'string' || value.description.trim().length === 0) {
    issues.push('description must be a non-empty string');
  }

  if (!Array.isArray(value.expectations)) {
    issues.push('expectations must be an array');
  } else {
    const labels = new Set<string>();
    for (let index = 0; index < value.expectations.length; index += 1) {
      validateExpectation(value.expectations[index], index, labels, issues);
    }
  }

  if (
    value.minIou !== undefined &&
    (typeof value.minIou !== 'number' ||
      !Number.isFinite(value.minIou) ||
      value.minIou <= 0 ||
      value.minIou > 1)
  ) {
    issues.push('minIou must be a finite number greater than 0 and at most 1');
  }
  if (value.requireIdentity !== undefined && typeof value.requireIdentity !== 'boolean') {
    issues.push('requireIdentity must be a boolean');
  }

  if (issues.length > 0) {
    throw new Error(`Invalid CV fixture manifest:\n- ${issues.join('\n- ')}`);
  }

  return value as CvFixtureManifest;
}

/** Converts manifest-level matching overrides into evaluator options. */
export function cvFixtureRegressionOptions(
  manifest: CvFixtureManifest,
): Partial<CvRegressionOptions> {
  return {
    ...(manifest.minIou === undefined ? {} : { minIou: manifest.minIou }),
    ...(manifest.requireIdentity === undefined
      ? {}
      : { requireIdentity: manifest.requireIdentity }),
  };
}
