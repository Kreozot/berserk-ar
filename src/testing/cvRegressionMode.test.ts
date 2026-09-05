import { describe, expect, it } from 'vitest';

import { isCvRegressionModeEnabled } from './cvRegressionMode';

describe('isCvRegressionModeEnabled', () => {
  it('requires Android, development mode and the explicit flag', () => {
    expect(isCvRegressionModeEnabled(true, 'android', '1')).toBe(true);
    expect(isCvRegressionModeEnabled(false, 'android', '1')).toBe(false);
    expect(isCvRegressionModeEnabled(true, 'ios', '1')).toBe(false);
    expect(isCvRegressionModeEnabled(true, 'android', undefined)).toBe(false);
  });
});
