import {
  BorderTypes,
  DataTypes,
  DecompTypes,
  InterpolationFlags,
  Mat,
  OpenCV,
  Point2f,
  Point2fVector,
  Scalar,
  Size,
} from 'react-native-fast-opencv';

import type { Quadrilateral } from '../../../core/vision/types';
import { orientShortEdgeAsWidth } from './perspectiveGeometry';

/**
 * Berserk cards use the standard 63:89 card aspect ratio. Keeping a stable
 * normalized size gives the recognizer comparable geometry regardless of perspective.
 */
export const NORMALIZED_CARD_WIDTH = 252;
export const NORMALIZED_CARD_HEIGHT = 356;

/**
 * Perspective-warps one detected card into the canonical portrait-sized image used by ORB.
 * All temporary native OpenCV objects are explicitly released before returning.
 */
export function normalizeCardPerspective(source: Mat, corners: Quadrilateral): Mat {
  'worklet';

  const orientedCorners = orientShortEdgeAsWidth(corners);
  const sourcePoints = Point2fVector.create();
  const destinationPoints = Point2fVector.create();
  const outputSize = Size.create(NORMALIZED_CARD_WIDTH, NORMALIZED_CARD_HEIGHT);
  const borderValue = Scalar.create(0, 0, 0, 0);
  const normalized = Mat.create(0, 0, DataTypes.CV_8U);

  const sourcePointObjects = [
    Point2f.create(orientedCorners[0].x, orientedCorners[0].y),
    Point2f.create(orientedCorners[1].x, orientedCorners[1].y),
    Point2f.create(orientedCorners[2].x, orientedCorners[2].y),
    Point2f.create(orientedCorners[3].x, orientedCorners[3].y),
  ] as const;
  const destinationPointObjects = [
    Point2f.create(0, 0),
    Point2f.create(NORMALIZED_CARD_WIDTH - 1, 0),
    Point2f.create(NORMALIZED_CARD_WIDTH - 1, NORMALIZED_CARD_HEIGHT - 1),
    Point2f.create(0, NORMALIZED_CARD_HEIGHT - 1),
  ] as const;

  let transform: Mat | null = null;

  try {
    for (const point of sourcePointObjects) sourcePoints.push(point);
    for (const point of destinationPointObjects) destinationPoints.push(point);

    transform = OpenCV.getPerspectiveTransform(
      sourcePoints,
      destinationPoints,
      DecompTypes.DECOMP_LU
    );
    OpenCV.warpPerspective(
      source,
      normalized,
      transform,
      outputSize,
      InterpolationFlags.INTER_LINEAR,
      BorderTypes.BORDER_REPLICATE,
      borderValue
    );
    return normalized;
  } catch (error) {
    normalized.release();
    throw error;
  } finally {
    transform?.release();
    borderValue.release();
    outputSize.release();
    sourcePoints.release();
    destinationPoints.release();
    for (const point of sourcePointObjects) point.release();
    for (const point of destinationPointObjects) point.release();
  }
}
