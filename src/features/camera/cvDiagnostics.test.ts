import { describe, expect, it } from 'vitest';

import { formatCvDiagnostics, isCvDiagnosticsEnabled } from './cvDiagnostics';

describe('isCvDiagnosticsEnabled', () => {
  it('requires development mode and an explicit flag', () => {
    expect(isCvDiagnosticsEnabled(true, '1')).toBe(true);
    expect(isCvDiagnosticsEnabled(false, '1')).toBe(false);
    expect(isCvDiagnosticsEnabled(true, undefined)).toBe(false);
    expect(isCvDiagnosticsEnabled(true, '0')).toBe(false);
  });
});

describe('formatCvDiagnostics', () => {
  it('formats timings, pipeline counts and a stable scene', () => {
    expect(
      formatCvDiagnostics({
        frameIndex: 40,
        detectorMs: 8,
        orbMs: 17,
        totalMs: 25,
        candidates: 6,
        orbChecked: 2,
        orbSkipped: 4,
        recognized: 3,
        trackerCount: 5,
        sceneReset: false,
      }),
    ).toEqual({
      timing: 'FRAME 40 · DET 8ms · ORB 17ms · TOTAL 25ms',
      pipeline: 'CAND 6 · ORB 2/4 · REC 3 · TRACK 5',
      scene: 'SCENE STABLE',
    });
  });

  it('surfaces scheduler scene resets', () => {
    const lines = formatCvDiagnostics({
      frameIndex: 1,
      detectorMs: 0,
      orbMs: 0,
      totalMs: 0,
      candidates: 0,
      orbChecked: 0,
      orbSkipped: 0,
      recognized: 0,
      trackerCount: 0,
      sceneReset: true,
    });

    expect(lines.scene).toBe('SCENE RESET');
  });
});
