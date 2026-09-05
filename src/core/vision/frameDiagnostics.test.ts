import { describe, expect, it } from 'vitest';

import { completeFrameDiagnostics } from './frameDiagnostics';

describe('completeFrameDiagnostics', () => {
  it('combines frame processing and tracker measurements without changing the source', () => {
    const processing = {
      frameIndex: 20,
      detectorMs: 9,
      orbMs: 14,
      totalMs: 23,
      candidates: 6,
      orbChecked: 2,
      orbSkipped: 4,
      sceneReset: true,
    };

    expect(completeFrameDiagnostics(processing, 3, 5)).toEqual({
      ...processing,
      recognized: 3,
      trackerCount: 5,
    });
    expect(processing).not.toHaveProperty('recognized');
  });
});
