import { describe, expect, it } from 'vitest';

import { cvFixtureRegressionOptions, parseCvFixtureManifest } from './cvFixtureManifest';

function validManifest(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    category: 'single-card',
    description: 'One physical card photographed on a table',
    expectations: [
      {
        label: 'center-card',
        cardId: 'll-003',
        corners: [
          { x: 0.1, y: 0.2 },
          { x: 0.4, y: 0.2 },
          { x: 0.4, y: 0.7 },
          { x: 0.1, y: 0.7 },
        ],
      },
    ],
  };
}

describe('parseCvFixtureManifest', () => {
  it('parses a valid fixture and matching overrides', () => {
    const input = { ...validManifest(), minIou: 0.65, requireIdentity: false };
    const manifest = parseCvFixtureManifest(input);

    expect(manifest).toBe(input);
    expect(cvFixtureRegressionOptions(manifest)).toEqual({ minIou: 0.65, requireIdentity: false });
  });

  it('allows an empty false-positive scene and omitted matching overrides', () => {
    const manifest = parseCvFixtureManifest({
      schemaVersion: 1,
      category: 'false-positives',
      description: 'Rectangular objects but no physical cards',
      expectations: [],
    });

    expect(cvFixtureRegressionOptions(manifest)).toEqual({});
  });

  it.each([
    [null, 'root must be an object'],
    [{ ...validManifest(), typo: true }, 'root.typo is not supported'],
    [{ ...validManifest(), schemaVersion: 2 }, 'schemaVersion must be 1'],
    [{ ...validManifest(), category: 'synthetic' }, 'category must be one of'],
    [{ ...validManifest(), description: '  ' }, 'description must be a non-empty string'],
    [{ ...validManifest(), expectations: null }, 'expectations must be an array'],
    [{ ...validManifest(), minIou: 0 }, 'minIou must be a finite number'],
    [{ ...validManifest(), minIou: Number.NaN }, 'minIou must be a finite number'],
    [{ ...validManifest(), requireIdentity: 'yes' }, 'requireIdentity must be a boolean'],
  ])('rejects an invalid manifest root %#', (input, message) => {
    expect(() => parseCvFixtureManifest(input)).toThrow(message);
  });

  it.each([
    [null, 'expectations[0] must be an object'],
    [{ label: '', cardId: null, corners: [] }, 'label must be a non-empty string'],
    [{ label: 'card', cardId: '', corners: [] }, 'cardId must be a non-empty string or null'],
    [{ label: 'card', cardId: null, corners: [] }, 'corners must contain exactly four points'],
    [
      { label: 'card', cardId: null, corners: [null, null, null, null] },
      'corners[0] must be an object',
    ],
    [
      {
        label: 'card',
        cardId: null,
        corners: [
          { x: -1, y: 0, z: 1 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ],
      },
      'corners[0].z is not supported',
    ],
    [
      {
        label: 'card',
        cardId: null,
        corners: [
          { x: 0.5, y: 0 },
          { x: 0.5, y: 0.2 },
          { x: 0.5, y: 0.8 },
          { x: 0.5, y: 1 },
        ],
      },
      'corners must cover a non-zero area',
    ],
  ])('rejects an invalid expectation %#', (expectation, message) => {
    expect(() =>
      parseCvFixtureManifest({
        ...validManifest(),
        expectations: [expectation],
      }),
    ).toThrow(message);
  });

  it('reports duplicate labels and unsupported expectation fields', () => {
    const expectation = (validManifest().expectations as Record<string, unknown>[])[0];
    expect(() =>
      parseCvFixtureManifest({
        ...validManifest(),
        expectations: [expectation, { ...expectation, ignored: true }],
      }),
    ).toThrow('expectations[1].label duplicates');
    expect(() =>
      parseCvFixtureManifest({
        ...validManifest(),
        expectations: [{ ...expectation, ignored: true }],
      }),
    ).toThrow('expectations[0].ignored is not supported');
  });
});
