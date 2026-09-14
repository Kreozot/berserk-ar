import { describe, expect, it, vi } from 'vitest';

import { finishCvRegressionReport } from './cvRegressionReport';

describe('finishCvRegressionReport', () => {
  it('returns the saved report URI', () => {
    expect(finishCvRegressionReport(() => 'file:///latest.json')).toEqual({
      status: 'saved',
      uri: 'file:///latest.json',
    });
  });

  it('returns an Error message without throwing', () => {
    const save = vi.fn(() => {
      throw new Error('storage unavailable');
    });
    expect(finishCvRegressionReport(save)).toEqual({
      status: 'error',
      message: 'storage unavailable',
    });
    expect(save).toHaveBeenCalledOnce();
  });

  it('normalizes non-Error native exceptions', () => {
    expect(
      finishCvRegressionReport(() => {
        throw 'permission denied';
      }),
    ).toEqual({ status: 'error', message: 'permission denied' });
  });
});
