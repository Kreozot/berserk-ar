export const MIN_QUERY_DESCRIPTORS = 40;
export const MIN_GOOD_MATCHES_FLOOR = 18;
export const MAX_GOOD_MATCHES_REQUIREMENT = 28;
export const MIN_GOOD_MATCH_RATIO = 0.16;
export const MIN_WINNER_MARGIN = 8;
export const MIN_WINNER_RATIO = 1.8;

/** Clamps a numeric confidence contribution to the inclusive 0..1 range. */
export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Computes the dynamic number of Lowe-ratio matches required for recognition. */
export function requiredGoodMatches(queryDescriptors: number): number {
  return Math.max(
    MIN_GOOD_MATCHES_FLOOR,
    Math.min(MAX_GOOD_MATCHES_REQUIREMENT, Math.ceil(queryDescriptors * 0.12))
  );
}

/** Combines match strength, query coverage and winner separation into confidence. */
export function scoreOrbConfidence(
  bestGoodMatches: number,
  secondBestGoodMatches: number,
  queryDescriptors: number
): number {
  const matchStrength = clamp01(bestGoodMatches / 80);
  const queryCoverage = clamp01(bestGoodMatches / Math.max(queryDescriptors * 0.3, 1));
  const separation = clamp01((bestGoodMatches - secondBestGoodMatches) / 35);
  return clamp01(matchStrength * 0.4 + queryCoverage * 0.3 + separation * 0.3);
}

/** Returns whether the ranked ORB metrics satisfy all recognition thresholds. */
export function passesOrbRecognitionThresholds(
  bestGoodMatches: number,
  secondBestGoodMatches: number,
  queryDescriptors: number
): boolean {
  const goodMatchRatio = bestGoodMatches / Math.max(queryDescriptors, 1);
  const winnerMargin = bestGoodMatches - secondBestGoodMatches;
  const winnerRatio = bestGoodMatches / Math.max(secondBestGoodMatches, 1);
  return (
    bestGoodMatches >= requiredGoodMatches(queryDescriptors) &&
    goodMatchRatio >= MIN_GOOD_MATCH_RATIO &&
    winnerMargin >= MIN_WINNER_MARGIN &&
    winnerRatio >= MIN_WINNER_RATIO
  );
}
