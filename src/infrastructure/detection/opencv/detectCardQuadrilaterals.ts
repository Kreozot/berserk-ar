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

// Keep contour search cheap, but preserve a higher-resolution source for ORB.
export const DETECTOR_WIDTH = 240;
export const DETECTOR_HEIGHT = 320;
export const RECOGNITION_WIDTH = 480;
export const RECOGNITION_HEIGHT = 640;

const MIN_AREA_RATIO = 0.0035;
const MAX_AREA_RATIO = 0.72;
const MIN_RECTANGULARITY = 0.42;
const MIN_CARD_ASPECT = 0.42;
const MAX_CARD_ASPECT = 0.92;
const MAX_CANDIDATES = 18;

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
 * Infrastructure-only representation. `detectorCorners` stay in the upright
 * 240x320 detector coordinate space used by the overlay. `normalizedImage` is
 * warped from a separate 480x640 source so ORB retains detail on distant cards.
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

function scaleCorners(corners: Quadrilateral, scaleX: number, scaleY: number): Quadrilateral {
  'worklet';
  return [
    { x: corners[0].x * scaleX, y: corners[0].y * scaleY },
    { x: corners[1].x * scaleX, y: corners[1].y * scaleY },
    { x: corners[2].x * scaleX, y: corners[2].y * scaleY },
    { x: corners[3].x * scaleX, y: corners[3].y * scaleY },
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
 * Finds card geometry on a cheap 240x320 copy, then perspective-normalizes the
 * accepted regions from a 480x640 copy of the same Frame. This keeps contour
 * cost low while giving ORB four times as many source pixels per scene.
 */
export function detectNormalizedCardCandidates(
  frame: Frame,
  detectorResizer: Resizer,
  recognitionResizer: Resizer
): OpenCvCardCandidate[] {
  'worklet';

  const detectorResized = detectorResizer.resize(frame);
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
    const detectorPixels = new Uint8Array(detectorResized.getPixelBuffer());
    const detectorInput = Mat.createFromBuffer(
      'uint8',
      DETECTOR_HEIGHT,
      DETECTOR_WIDTH,
      3,
      detectorPixels
    );

    try {
      OpenCV.cvtColor(detectorInput, gray, ColorConversionCodes.COLOR_BGR2GRAY);
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

      if (accepted.length === 0) {
        return [];
      }

      const recognitionResized = recognitionResizer.resize(frame);
      try {
        const recognitionPixels = new Uint8Array(recognitionResized.getPixelBuffer());
        const recognitionInput = Mat.createFromBuffer(
          'uint8',
          RECOGNITION_HEIGHT,
          RECOGNITION_WIDTH,
          3,
          recognitionPixels
        );

        try {
          const scaleX = RECOGNITION_WIDTH / DETECTOR_WIDTH;
          const scaleY = RECOGNITION_HEIGHT / DETECTOR_HEIGHT;
          const normalizedCandidates: OpenCvCardCandidate[] = [];

          try {
            for (const candidate of accepted) {
              normalizedCandidates.push({
                detectorCorners: candidate.corners,
                normalizedImage: normalizeCardPerspective(
                  recognitionInput,
                  scaleCorners(candidate.corners, scaleX, scaleY)
                ),
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
          recognitionInput.release();
        }
      } finally {
        recognitionResized.dispose();
      }
    } finally {
      detectorInput.release();
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
    detectorResized.dispose();
  }
}

export function detectCardQuadrilaterals(
  frame: Frame,
  detectorResizer: Resizer,
  recognitionResizer: Resizer
): Quadrilateral[] {
  'worklet';

  const candidates = detectNormalizedCardCandidates(frame, detectorResizer, recognitionResizer);
  try {
    return candidates.map((candidate) => candidate.detectorCorners);
  } finally {
    for (const candidate of candidates) {
      candidate.normalizedImage.release();
    }
  }
}
