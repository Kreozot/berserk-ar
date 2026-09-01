import type { Bounds } from '../vision/geometry';
import {
  intersectionOverUnion,
  normalizedCenterDistance,
  sizeSimilarity,
} from '../vision/geometry';

export const TRACK_MIN_IOU = 0.02;
export const TRACK_MAX_NORMALIZED_CENTER_DISTANCE = 1.35;

/**
 * Scores how likely two bounds belong to the same physical card.
 * Returns null when they are too far apart to be a plausible match.
 */
export function scoreTrackMatch(trackBounds: Bounds, observationBounds: Bounds): number | null {
  const iou = intersectionOverUnion(trackBounds, observationBounds);
  const centerDistance = normalizedCenterDistance(trackBounds, observationBounds);
  if (iou < TRACK_MIN_IOU && centerDistance > TRACK_MAX_NORMALIZED_CENTER_DISTANCE) {
    return null;
  }

  const centerScore = Math.max(
    0,
    1 - centerDistance / TRACK_MAX_NORMALIZED_CENTER_DISTANCE
  );
  const shapeScore = sizeSimilarity(trackBounds, observationBounds);
  return iou * 0.5 + centerScore * 0.35 + shapeScore * 0.15;
}
