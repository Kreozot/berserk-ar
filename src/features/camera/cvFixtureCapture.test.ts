import { describe, expect, it } from 'vitest';

import { createCvFixtureFrameName, isCvFixtureCaptureEnabled } from './cvFixtureCapture';

describe('isCvFixtureCaptureEnabled', () => {
  it('requires both a development build and the explicit capture flag', () => {
    expect(isCvFixtureCaptureEnabled(true, '1')).toBe(true);
    expect(isCvFixtureCaptureEnabled(false, '1')).toBe(false);
    expect(isCvFixtureCaptureEnabled(true, undefined)).toBe(false);
    expect(isCvFixtureCaptureEnabled(true, 'true')).toBe(false);
  });
});

describe('createCvFixtureFrameName', () => {
  it('creates a stable UTC timestamped JPEG name', () => {
    expect(createCvFixtureFrameName(new Date('2026-09-05T12:34:56.789Z'))).toBe(
      'berserk-cv-20260905T123456789Z.jpg',
    );
  });
});
