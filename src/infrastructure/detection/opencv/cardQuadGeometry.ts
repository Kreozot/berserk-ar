import {
  edgeLengths,
  isConvexQuadrilateral,
  maxAdjacentEdgeCosine,
  oppositeEdgeSimilarity,
  polygonArea,
  quadrilateralAspect,
} from '../../../core/vision/geometry';
import type { Point, Quadrilateral } from '../../../core/vision/types';

export type CardQuadSummary = {
  readonly cardAspect: number;
  readonly edgeSimilarity: number;
  readonly angleCosine: number;
};

export type QuadCenterSize = {
  readonly centerX: number;
  readonly centerY: number;
  readonly width: number;
  readonly height: number;
};

export type CardAspectGateMetrics = {
  readonly areaRatio: number;
  readonly cardAspect: number;
  readonly edgeSimilarity: number;
  readonly angleCosine: number;
};

export const MIN_QUAD_EDGE = 6;
export const MIN_QUAD_AREA = 90;
const MIN_CARD_ASPECT = 0.32;
const MIN_UNRESTRICTED_CARD_ASPECT = 0.5;
const MAX_UNRESTRICTED_CARD_ASPECT = 0.86;
const MAX_CARD_ASPECT = 0.96;
const MIN_EXTREME_PERSPECTIVE_AREA_RATIO = 0.025;
const MIN_EXTREME_PERSPECTIVE_EDGE_SIMILARITY = 0.82;
const MAX_EXTREME_PERSPECTIVE_ANGLE_COSINE = 0.45;
const MIN_NEAR_SQUARE_EDGE_SIMILARITY = 0.88;
const MAX_NEAR_SQUARE_ANGLE_COSINE = 0.3;

/** Checks finite coordinates, minimum edge length, area and convexity for a candidate quad. */
export function isStableCardQuad(corners: Quadrilateral): boolean {
  'worklet';
  for (const point of corners) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
  }
  if (edgeLengths(corners).some((edge) => edge < MIN_QUAD_EDGE)) return false;
  return polygonArea(corners) >= MIN_QUAD_AREA && isConvexQuadrilateral(corners);
}

/** Computes the geometry metrics used by detector filtering and scoring. */
export function summarizeCardQuad(corners: Quadrilateral): CardQuadSummary {
  'worklet';
  return {
    cardAspect: quadrilateralAspect(corners),
    edgeSimilarity: oppositeEdgeSimilarity(corners),
    angleCosine: maxAdjacentEdgeCosine(corners),
  };
}

/** Allows evidence-backed extreme aspects only when the remaining geometry is strong. */
export function passesCardAspectGate(metrics: CardAspectGateMetrics): boolean {
  'worklet';
  const { areaRatio, cardAspect, edgeSimilarity, angleCosine } = metrics;
  if (cardAspect < MIN_CARD_ASPECT || cardAspect > MAX_CARD_ASPECT) return false;
  if (cardAspect < MIN_UNRESTRICTED_CARD_ASPECT) {
    return (
      areaRatio >= MIN_EXTREME_PERSPECTIVE_AREA_RATIO &&
      edgeSimilarity >= MIN_EXTREME_PERSPECTIVE_EDGE_SIMILARITY &&
      angleCosine <= MAX_EXTREME_PERSPECTIVE_ANGLE_COSINE
    );
  }
  if (cardAspect > MAX_UNRESTRICTED_CARD_ASPECT) {
    return (
      edgeSimilarity >= MIN_NEAR_SQUARE_EDGE_SIMILARITY &&
      angleCosine <= MAX_NEAR_SQUARE_ANGLE_COSINE
    );
  }
  return true;
}

/** Computes the card-shape quality score used to rank accepted contours. */
export function scoreCardShape(
  cardAspect: number,
  expectedCardAspect: number,
  contourQuadFill: number,
  edgeSimilarity: number,
  angleCosine: number,
): number {
  'worklet';
  const aspectScore = 1 - Math.min(1, Math.abs(cardAspect - expectedCardAspect) / 0.22);
  const fillScore = 1 - Math.min(1, Math.abs(1 - contourQuadFill));
  return aspectScore * 0.4 + edgeSimilarity * 0.25 + fillScore * 0.2 + (1 - angleCosine) * 0.15;
}

/** Returns whether a candidate center is close enough to an accepted quad to be treated as a duplicate. */
export function overlapsAcceptedQuad(
  candidate: QuadCenterSize,
  accepted: readonly QuadCenterSize[],
): boolean {
  'worklet';
  return accepted.some((other) => {
    const dx = candidate.centerX - other.centerX;
    const dy = candidate.centerY - other.centerY;
    const distanceSquared = dx * dx + dy * dy;
    const referenceSize = Math.min(candidate.width, candidate.height, other.width, other.height);
    return distanceSquared < referenceSize * referenceSize * 0.6;
  });
}

/** Converts four plain points into a quadrilateral tuple after validating the count. */
export function asQuadrilateral(points: readonly Point[]): Quadrilateral {
  'worklet';
  if (points.length !== 4) throw new Error(`Expected 4 points, received ${points.length}`);
  return [points[0], points[1], points[2], points[3]];
}
