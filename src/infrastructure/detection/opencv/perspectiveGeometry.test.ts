import { describe, expect, it } from 'vitest';

import type { Quadrilateral } from '../../../core/vision/types';
import { orientShortEdgeAsWidth } from './perspectiveGeometry';

/** Builds an axis-aligned quadrilateral for perspective-orientation fixtures. */
function quad(left: number, top: number, width: number, height: number): Quadrilateral {
  return [
    { x: left, y: top },
    { x: left + width, y: top },
    { x: left + width, y: top + height },
    { x: left, y: top + height },
  ];
}

describe('orientShortEdgeAsWidth', () => {
  it('keeps portrait card assignment unchanged', () => {
    const portrait = quad(0, 0, 63, 89);
    expect(orientShortEdgeAsWidth(portrait)).toEqual(portrait);
  });

  it('rotates landscape assignment so the short edge becomes normalized width', () => {
    const landscape = quad(0, 0, 89, 63);
    expect(orientShortEdgeAsWidth(landscape)).toEqual([
      landscape[1],
      landscape[2],
      landscape[3],
      landscape[0],
    ]);
  });
});
