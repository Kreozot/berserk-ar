import type { Bounds } from '../../../core/vision/geometry';
import {
  intersectionOverUnion,
  normalizedCenterDistance,
  sizeSimilarity,
} from '../../../core/vision/geometry';

export const SCHEDULER_MIN_IOU = 0.02;
export const SCHEDULER_MAX_NORMALIZED_CENTER_DISTANCE = 1.2;
export const FORCE_RECHECK_CENTER_DISTANCE = 0.22;
export const FORCE_RECHECK_SIZE_SIMILARITY = 0.72;
export const SCENE_SHIFT_MEDIAN_DISTANCE = 0.18;
export const SCENE_SHIFT_MIN_MATCHES = 2;
export const SCENE_CHURN_MIN_TRACKS = 3;
export const SCENE_CHURN_MATCH_RATIO = 0.45;

/** Scores whether a current candidate plausibly continues a scheduler track. */
export function scoreSchedulerMatch(trackBounds: Bounds, candidateBounds: Bounds): number | null {
  const iou = intersectionOverUnion(trackBounds, candidateBounds);
  const centerDistance = normalizedCenterDistance(trackBounds, candidateBounds);
  if (iou < SCHEDULER_MIN_IOU && centerDistance > SCHEDULER_MAX_NORMALIZED_CENTER_DISTANCE) {
    return null;
  }
  const centerScore = Math.max(0, 1 - centerDistance / SCHEDULER_MAX_NORMALIZED_CENTER_DISTANCE);
  const shapeScore = sizeSimilarity(trackBounds, candidateBounds);
  return iou * 0.5 + centerScore * 0.35 + shapeScore * 0.15;
}

/** Detects a global scene shift from the median motion of accepted track matches. */
export function isSceneShifted(medianSceneMotion: number, acceptedPairCount: number): boolean {
  return acceptedPairCount >= SCENE_SHIFT_MIN_MATCHES && medianSceneMotion >= SCENE_SHIFT_MEDIAN_DISTANCE;
}

/** Detects scene churn when too few old tracks survive in a multi-card view. */
export function isSceneChurned(
  previousTrackCount: number,
  candidateCount: number,
  acceptedPairCount: number
): boolean {
  const comparableCount = Math.max(1, Math.min(previousTrackCount, candidateCount));
  const matchRatio = acceptedPairCount / comparableCount;
  return (
    previousTrackCount >= SCENE_CHURN_MIN_TRACKS &&
    candidateCount >= SCENE_CHURN_MIN_TRACKS &&
    matchRatio < SCENE_CHURN_MATCH_RATIO
  );
}

/** Decides whether a candidate needs a fresh ORB evaluation on the current frame. */
export function shouldRunOrbForTrack(args: {
  forceOrbAll: boolean;
  cachedRecognized: boolean;
  framesSinceLastOrb: number;
  recheckIntervalFrames: number;
  centerDistance: number;
  currentSizeSimilarity: number;
}): boolean {
  return (
    args.forceOrbAll ||
    !args.cachedRecognized ||
    args.framesSinceLastOrb >= args.recheckIntervalFrames ||
    args.centerDistance >= FORCE_RECHECK_CENTER_DISTANCE ||
    args.currentSizeSimilarity <= FORCE_RECHECK_SIZE_SIMILARITY
  );
}
