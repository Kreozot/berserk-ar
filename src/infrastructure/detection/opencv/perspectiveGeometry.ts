import type { Quadrilateral } from '../../../core/vision/types';
import { pointDistance } from '../../../core/vision/geometry';

/** Rotates corner assignment so the observed short edge maps to normalized image width. */
export function orientShortEdgeAsWidth(corners: Quadrilateral): Quadrilateral {
  const horizontalPair =
    (pointDistance(corners[0], corners[1]) + pointDistance(corners[2], corners[3])) / 2;
  const verticalPair =
    (pointDistance(corners[1], corners[2]) + pointDistance(corners[3], corners[0])) / 2;

  return horizontalPair <= verticalPair
    ? corners
    : [corners[1], corners[2], corners[3], corners[0]];
}
