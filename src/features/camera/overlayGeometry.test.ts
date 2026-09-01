import { describe, expect, it } from 'vitest';

import { getOverlayLineGeometry } from './overlayGeometry';

describe('getOverlayLineGeometry', () => {
  it('describes a horizontal overlay edge', () => {
    expect(getOverlayLineGeometry({ x: 0, y: 10 }, { x: 10, y: 10 })).toEqual({
      left: 0,
      top: 8.5,
      width: 10,
      height: 3,
      angleRad: 0,
    });
  });

  it('describes a vertical overlay edge', () => {
    const vertical = getOverlayLineGeometry({ x: 5, y: 0 }, { x: 5, y: 10 });
    expect(vertical.width).toBe(10);
    expect(vertical.angleRad).toBeCloseTo(Math.PI / 2);
  });
});
