import { describe, expect, it } from 'vitest';

import { compactCvError, mapDetectorPointToPreview } from './cameraGeometry';

describe('cameraGeometry', () => {
  it('maps detector coordinates into the rotated/cropped preview', () => {
    expect(
      mapDetectorPointToPreview({ x: 0, y: 0 }, { width: 360, height: 480 }, 360, 480)
    ).toEqual({ x: 360, y: 480 });

    const mapped = mapDetectorPointToPreview(
      { x: 180, y: 240 },
      { width: 720, height: 1280 },
      360,
      480
    );
    expect(mapped.x).toBeCloseTo(360);
    expect(mapped.y).toBeCloseTo(640);
  });

  it('compacts CV errors for the debug badge', () => {
    expect(compactCvError('ORB', new Error('boom'))).toMatch(/^ORB: /);
    const result = compactCvError('CV', 'x'.repeat(1000));
    expect(result.length).toBeLessThan(430);
    expect(result).toContain('…');
  });
});
