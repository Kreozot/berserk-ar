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

export const DETECTOR_WIDTH = 240;
export const DETECTOR_HEIGHT = 320;

const MIN_AREA_RATIO = 0.01;
const MAX_AREA_RATIO = 0.72;
const MIN_RECTANGULARITY = 0.42;
const MIN_CARD_ASPECT = 0.42;
const MAX_CARD_ASPECT = 0.92;
const MAX_CANDIDATES = 6;

const APPROX_EPSILON_RATIOS = [0.018, 0.025, 0.035, 0.05] as const;

type ScoredQuadrilateral = {
  corners: Quadrilateral;
  area: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  cardAspect: number;
};

/**
 * Infrastructure-only representation. `detectorCorners` are coordinates in
 * the upright 240x320 image produced by VisionCamera Resizer. The normalized
 * Mat stays on the CV worklet and is consumed by ORB before being released.
 */
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

function getCardAspect(corners: Quadrilateral): number {
  'worklet';

  const sideA = (distance(corners[0], corners[1]) + distance(corners[2], corners[3])) / 2;
  const sideB = (distance(corners[1], corners[2]) + distance(corners[3], corners[0])) / 2;
  const shortSide = Math.min(sideA, sideB);
  const longSide = Math.max(sideA, sideB);
  return longSide <= 0 ? 0 : shortSide / longSide;
}

function overlapsExisting(candidate: ScoredQuadrilateral, accepted: readonly ScoredQuadrilateral[]): boolean {
  'worklet';

  return accepted.some((other) => {
    const dx = candidate.centerX - other.centerX;
    const dy = candidate.centerY - other.centerY;
    const distanceSquared = dx * dx + dy * dy;
    const referenceSize = Math.min(candidate.width, candidate.height, other.width, other.height);
    return distanceSquared < referenceSize * referenceSize * 0.12;
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

function collectQuadrilaterals(
  contours: PointVectorOfVectors,
  imageArea: number,
  scored: ScoredQuadrilateral[]
): void {
  'worklet';

  for (let index = 0; index < contours.length; index += 1) {
    const contour = contours.get(index);
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
      const rect = OpenCV.boundingRect(approx);
      try {
        const rectArea = rect.width * rect.height;
        if (rectArea <= 0 || area / rectArea < MIN_RECTANGULARITY) {
          continue;
        }

        if (rect.width >= DETECTOR_WIDTH * 0.98 || rect.height >= DETECTOR_HEIGHT * 0.98) {
          continue;
        }

        const rawPoints = approx.getAll().map((point) => ({ x: point.x, y: point.y }));
        const corners = orderClockwise(rawPoints);
        const cardAspect = getCardAspect(corners);

        // A Berserk card is ~0.71 short/long. Keep generous perspective
        // tolerance, but reject long merged contours (e.g. two neighbouring
        // cards detected as one shape) and near-square UI/texture rectangles.
        if (cardAspect < MIN_CARD_ASPECT || cardAspect > MAX_CARD_ASPECT) {
          continue;
        }

        scored.push({
          corners,
          area,
          centerX: rect.x + rect.width / 2,
          centerY: rect.y + rect.height / 2,
          width: rect.width,
          height: rect.height,
          cardAspect,
        });
      } finally {
        rect.release();
      }
    } finally {
      approx.release();
    }
  }
}

/**
 * Detects cards and perspective-normalizes each accepted candidate.
 *
 * We inspect both raw Canny edges and a lightly closed copy. Raw edges keep
 * nearby cards separate; the closed pass recovers cards whose outline has small
 * gaps from blur/glare. RETR_LIST lets us retain individual card contours even
 * when another larger contour surrounds them.
 */
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
      collectQuadrilaterals(rawContours, imageArea, scored);
      collectQuadrilaterals(closedContours, imageArea, scored);

      // Prefer the strongest outer contour when raw/closed passes report the
      // same card. Card-aspect closeness is a tie-breaker for similar areas.
      scored.sort((a, b) => {
        const areaDelta = b.area - a.area;
        if (Math.abs(areaDelta) > imageArea * 0.002) {
          return areaDelta;
        }
        return Math.abs(a.cardAspect - 0.708) - Math.abs(b.cardAspect - 0.708);
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
          normalizedCandidates.push({
            detectorCorners: candidate.corners,
            normalizedImage: normalizeCardPerspective(input, candidate.corners),
          });
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
