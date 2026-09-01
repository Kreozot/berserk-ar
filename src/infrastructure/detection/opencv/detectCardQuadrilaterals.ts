import {
  ColorConversionCodes,
  ContourApproximationModes,
  DataTypes,
  Mat,
  MorphShapes,
  MorphTypes,
  OpenCV,
  PointVector,
  PointVectorOfVectors,
  RetrievalModes,
  Size,
} from 'react-native-fast-opencv';
import type { Frame } from 'react-native-vision-camera';
import type { Resizer } from 'react-native-vision-camera-resizer';

import type { Point, Quadrilateral } from '../../../core/vision/types';
import { normalizeCardPerspective } from './normalizeCardPerspective';

// One shared source keeps native buffer pressure down while giving contour
// detection enough detail for a table with many relatively small cards.
export const DETECTOR_WIDTH = 360;
export const DETECTOR_HEIGHT = 480;
export const RECOGNITION_WIDTH = DETECTOR_WIDTH;
export const RECOGNITION_HEIGHT = DETECTOR_HEIGHT;

const EXPECTED_CARD_ASPECT = 63 / 89;
const MIN_AREA_RATIO = 0.0025;
const MAX_AREA_RATIO = 0.72;
const MIN_CARD_ASPECT = 0.5;
const MAX_CARD_ASPECT = 0.86;
const MIN_CONTOUR_QUAD_FILL = 0.72;
const MAX_CONTOUR_QUAD_FILL = 1.28;
const MAX_PERIMETER_EXCESS = 1.45;
const MIN_OPPOSITE_EDGE_RATIO = 0.5;
const MAX_ADJACENT_EDGE_COSINE = 0.78;
const MAX_CANDIDATES = 18;
const MIN_QUAD_EDGE = 6;
const MIN_QUAD_AREA = 90;

const APPROX_EPSILON_RATIOS = [0.018, 0.025, 0.035, 0.05] as const;

type CandidateSource = 'raw' | 'closed';

type ScoredQuadrilateral = {
  corners: Quadrilateral;
  area: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  cardAspect: number;
  source: CandidateSource;
  shapeScore: number;
};

export type OpenCvCardCandidate = {
  detectorCorners: Quadrilateral;
  normalizedImage: Mat;
};

function distance(a: Point, b: Point): number {
  'worklet';
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function orderClockwise(points: readonly Point[]): Quadrilateral {
  'worklet';

  const centerX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const centerY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const ordered = [...points].sort(
    (a, b) => Math.atan2(a.y - centerY, a.x - centerX) - Math.atan2(b.y - centerY, b.x - centerX)
  );

  let firstIndex = 0;
  let smallestSum = Number.POSITIVE_INFINITY;
  for (let index = 0; index < ordered.length; index += 1) {
    const point = ordered[index];
    const sum = point.x + point.y;
    if (sum < smallestSum) {
      smallestSum = sum;
      firstIndex = index;
    }
  }

  return [
    ordered[firstIndex],
    ordered[(firstIndex + 1) % 4],
    ordered[(firstIndex + 2) % 4],
    ordered[(firstIndex + 3) % 4],
  ];
}

function polygonArea(corners: Quadrilateral): number {
  'worklet';

  let twiceArea = 0;
  for (let index = 0; index < 4; index += 1) {
    const current = corners[index];
    const next = corners[(index + 1) % 4];
    twiceArea += current.x * next.y - next.x * current.y;
  }
  return Math.abs(twiceArea) / 2;
}

function isConvex(corners: Quadrilateral): boolean {
  'worklet';

  let sign = 0;
  for (let index = 0; index < 4; index += 1) {
    const a = corners[index];
    const b = corners[(index + 1) % 4];
    const c = corners[(index + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 0.001) {
      return false;
    }
    const currentSign = cross > 0 ? 1 : -1;
    if (sign === 0) {
      sign = currentSign;
    } else if (sign !== currentSign) {
      return false;
    }
  }
  return true;
}

function edgeLengths(corners: Quadrilateral): [number, number, number, number] {
  'worklet';
  return [
    distance(corners[0], corners[1]),
    distance(corners[1], corners[2]),
    distance(corners[2], corners[3]),
    distance(corners[3], corners[0]),
  ];
}

function getCardAspect(corners: Quadrilateral): number {
  'worklet';
  const edges = edgeLengths(corners);
  const sideA = (edges[0] + edges[2]) / 2;
  const sideB = (edges[1] + edges[3]) / 2;
  const shortSide = Math.min(sideA, sideB);
  const longSide = Math.max(sideA, sideB);
  return longSide <= 0 ? 0 : shortSide / longSide;
}

function oppositeEdgeSimilarity(corners: Quadrilateral): number {
  'worklet';
  const edges = edgeLengths(corners);
  const pairA = Math.min(edges[0], edges[2]) / Math.max(edges[0], edges[2], 1);
  const pairB = Math.min(edges[1], edges[3]) / Math.max(edges[1], edges[3], 1);
  return Math.min(pairA, pairB);
}

function maxAdjacentEdgeCosine(corners: Quadrilateral): number {
  'worklet';

  let maximum = 0;
  for (let index = 0; index < 4; index += 1) {
    const previous = corners[(index + 3) % 4];
    const current = corners[index];
    const next = corners[(index + 1) % 4];
    const ax = previous.x - current.x;
    const ay = previous.y - current.y;
    const bx = next.x - current.x;
    const by = next.y - current.y;
    const lengthA = Math.sqrt(ax * ax + ay * ay);
    const lengthB = Math.sqrt(bx * bx + by * by);
    if (lengthA <= 0 || lengthB <= 0) {
      return 1;
    }
    const cosine = Math.abs((ax * bx + ay * by) / (lengthA * lengthB));
    maximum = Math.max(maximum, cosine);
  }
  return maximum;
}

function isStableQuad(corners: Quadrilateral): boolean {
  'worklet';

  for (const point of corners) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return false;
    }
  }

  const edges = edgeLengths(corners);
  if (edges.some((edge) => edge < MIN_QUAD_EDGE)) {
    return false;
  }

  return polygonArea(corners) >= MIN_QUAD_AREA && isConvex(corners);
}

function overlapsExisting(candidate: ScoredQuadrilateral, accepted: readonly ScoredQuadrilateral[]): boolean {
  'worklet';

  return accepted.some((other) => {
    const dx = candidate.centerX - other.centerX;
    const dy = candidate.centerY - other.centerY;
    const distanceSquared = dx * dx + dy * dy;
    const referenceSize = Math.min(candidate.width, candidate.height, other.width, other.height);
    // Prefer an already accepted raw contour to a larger morphology-merged contour.
    return distanceSquared < referenceSize * referenceSize * 0.6;
  });
}

function approximateQuadrilateral(contour: PointVector, perimeter: number): PointVector | null {
  'worklet';

  for (const epsilonRatio of APPROX_EPSILON_RATIOS) {
    const approx = PointVector.create();
    OpenCV.approxPolyDP(contour, approx, perimeter * epsilonRatio, true);
    if (approx.length === 4) {
      return approx;
    }
    approx.release();
  }

  return null;
}

function readQuadrilateral(approx: PointVector): Quadrilateral {
  'worklet';

  const result: Point[] = [];
  for (let index = 0; index < 4; index += 1) {
    const point = approx.get(index);
    try {
      result.push({ x: point.x, y: point.y });
    } finally {
      point.release();
    }
  }

  return orderClockwise(result);
}

function collectQuadrilaterals(
  contours: PointVectorOfVectors,
  imageArea: number,
  source: CandidateSource,
  scored: ScoredQuadrilateral[]
): void {
  'worklet';

  for (let index = 0; index < contours.length; index += 1) {
    const contour = contours.get(index);
    try {
      const { value: area } = OpenCV.contourArea(contour, false);
      const areaRatio = area / imageArea;
      if (areaRatio < MIN_AREA_RATIO || areaRatio > MAX_AREA_RATIO) {
        continue;
      }

      const { value: perimeter } = OpenCV.arcLength(contour, true);
      const approx = approximateQuadrilateral(contour, perimeter);
      if (approx === null) {
        continue;
      }

      try {
        const corners = readQuadrilateral(approx);
        if (!isStableQuad(corners)) {
          continue;
        }

        const quadArea = polygonArea(corners);
        const quadPerimeter = edgeLengths(corners).reduce((sum, edge) => sum + edge, 0);
        const contourQuadFill = area / Math.max(quadArea, 1);
        const perimeterExcess = perimeter / Math.max(quadPerimeter, 1);
        const cardAspect = getCardAspect(corners);
        const edgeSimilarity = oppositeEdgeSimilarity(corners);
        const angleCosine = maxAdjacentEdgeCosine(corners);

        if (
          contourQuadFill < MIN_CONTOUR_QUAD_FILL ||
          contourQuadFill > MAX_CONTOUR_QUAD_FILL ||
          perimeterExcess > MAX_PERIMETER_EXCESS ||
          cardAspect < MIN_CARD_ASPECT ||
          cardAspect > MAX_CARD_ASPECT ||
          edgeSimilarity < MIN_OPPOSITE_EDGE_RATIO ||
          angleCosine > MAX_ADJACENT_EDGE_COSINE
        ) {
          continue;
        }

        const rect = OpenCV.boundingRect(approx);
        try {
          if (rect.width >= DETECTOR_WIDTH * 0.98 || rect.height >= DETECTOR_HEIGHT * 0.98) {
            continue;
          }

          const aspectScore = 1 - Math.min(1, Math.abs(cardAspect - EXPECTED_CARD_ASPECT) / 0.22);
          const fillScore = 1 - Math.min(1, Math.abs(1 - contourQuadFill));
          const shapeScore = aspectScore * 0.4 + edgeSimilarity * 0.25 + fillScore * 0.2 + (1 - angleCosine) * 0.15;

          scored.push({
            corners,
            area,
            centerX: rect.x + rect.width / 2,
            centerY: rect.y + rect.height / 2,
            width: rect.width,
            height: rect.height,
            cardAspect,
            source,
            shapeScore,
          });
        } finally {
          rect.release();
        }
      } finally {
        approx.release();
      }
    } finally {
      contour.release();
    }
  }
}

export function detectNormalizedCardCandidates(
  frame: Frame,
  resizer: Resizer
): OpenCvCardCandidate[] {
  'worklet';

  const resized = resizer.resize(frame);
  const gray = Mat.create(0, 0, DataTypes.CV_8U);
  const blurred = Mat.create(0, 0, DataTypes.CV_8U);
  const edges = Mat.create(0, 0, DataTypes.CV_8U);
  const closedEdges = Mat.create(0, 0, DataTypes.CV_8U);
  const blurKernel = Size.create(3, 3);
  const closeKernelSize = Size.create(3, 3);
  const closeKernel = OpenCV.getStructuringElement(MorphShapes.MORPH_RECT, closeKernelSize);
  const rawContours = PointVectorOfVectors.create();
  const closedContours = PointVectorOfVectors.create();

  try {
    const pixels = new Uint8Array(resized.getPixelBuffer());
    const input = Mat.createFromBuffer('uint8', DETECTOR_HEIGHT, DETECTOR_WIDTH, 3, pixels);

    try {
      OpenCV.cvtColor(input, gray, ColorConversionCodes.COLOR_BGR2GRAY);
      OpenCV.GaussianBlur(gray, blurred, blurKernel, 0);
      OpenCV.Canny(blurred, edges, 40, 120);

      OpenCV.findContours(
        edges,
        rawContours,
        RetrievalModes.RETR_LIST,
        ContourApproximationModes.CHAIN_APPROX_SIMPLE
      );

      OpenCV.morphologyEx(edges, closedEdges, MorphTypes.MORPH_CLOSE, closeKernel);
      OpenCV.findContours(
        closedEdges,
        closedContours,
        RetrievalModes.RETR_LIST,
        ContourApproximationModes.CHAIN_APPROX_SIMPLE
      );

      const imageArea = DETECTOR_WIDTH * DETECTOR_HEIGHT;
      const scored: ScoredQuadrilateral[] = [];
      collectQuadrilaterals(rawContours, imageArea, 'raw', scored);
      collectQuadrilaterals(closedContours, imageArea, 'closed', scored);

      scored.sort((a, b) => {
        if (a.source !== b.source) {
          return a.source === 'raw' ? -1 : 1;
        }
        const qualityDelta = b.shapeScore - a.shapeScore;
        if (Math.abs(qualityDelta) > 0.04) {
          return qualityDelta;
        }
        return b.area - a.area;
      });

      const accepted: ScoredQuadrilateral[] = [];
      for (const candidate of scored) {
        if (!overlapsExisting(candidate, accepted)) {
          accepted.push(candidate);
        }
        if (accepted.length >= MAX_CANDIDATES) {
          break;
        }
      }

      const normalizedCandidates: OpenCvCardCandidate[] = [];
      try {
        for (const candidate of accepted) {
          try {
            const normalizedImage = normalizeCardPerspective(input, candidate.corners);
            if (normalizedImage.rows > 0 && normalizedImage.cols > 0) {
              normalizedCandidates.push({
                detectorCorners: candidate.corners,
                normalizedImage,
              });
            } else {
              normalizedImage.release();
            }
          } catch {
            // A single malformed contour should not discard the valid cards in this frame.
          }
        }
        return normalizedCandidates;
      } catch (error) {
        for (const candidate of normalizedCandidates) {
          candidate.normalizedImage.release();
        }
        throw error;
      }
    } finally {
      input.release();
    }
  } finally {
    closedContours.release();
    rawContours.release();
    closeKernel.release();
    closeKernelSize.release();
    blurKernel.release();
    closedEdges.release();
    edges.release();
    blurred.release();
    gray.release();
    resized.dispose();
  }
}

export function detectCardQuadrilaterals(frame: Frame, resizer: Resizer): Quadrilateral[] {
  'worklet';

  const candidates = detectNormalizedCardCandidates(frame, resizer);
  try {
    return candidates.map((candidate) => candidate.detectorCorners);
  } finally {
    for (const candidate of candidates) {
      candidate.normalizedImage.release();
    }
  }
}
