import {
  ColorConversionCodes,
  ContourApproximationModes,
  DataTypes,
  Mat,
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

export const DETECTOR_WIDTH = 360;
export const DETECTOR_HEIGHT = 480;

const MIN_AREA_RATIO = 0.025;
const MAX_AREA_RATIO = 0.8;
const MIN_RECTANGULARITY = 0.55;
const MAX_CANDIDATES = 8;

type ScoredQuadrilateral = {
  corners: Quadrilateral;
  area: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
};

/**
 * Infrastructure-only representation. The normalized Mat intentionally never
 * crosses into core/UI; it is consumed by the recognizer on the same CV
 * worklet and must be released by the caller.
 */
export type OpenCvCardCandidate = {
  cameraCorners: Quadrilateral;
  normalizedImage: Mat;
};

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

function mapResizedPointToFrame(point: Point, frameWidth: number, frameHeight: number): Point {
  'worklet';

  const scale = Math.max(DETECTOR_WIDTH / frameWidth, DETECTOR_HEIGHT / frameHeight);
  const scaledWidth = frameWidth * scale;
  const scaledHeight = frameHeight * scale;
  const cropX = (scaledWidth - DETECTOR_WIDTH) / 2;
  const cropY = (scaledHeight - DETECTOR_HEIGHT) / 2;

  return {
    x: (point.x + cropX) / scale,
    y: (point.y + cropY) / scale,
  };
}

function overlapsExisting(candidate: ScoredQuadrilateral, accepted: readonly ScoredQuadrilateral[]): boolean {
  'worklet';

  return accepted.some((other) => {
    const dx = candidate.centerX - other.centerX;
    const dy = candidate.centerY - other.centerY;
    const distanceSquared = dx * dx + dy * dy;
    const referenceSize = Math.min(candidate.width, candidate.height, other.width, other.height);
    return distanceSquared < referenceSize * referenceSize * 0.16;
  });
}

function toCameraCorners(
  corners: Quadrilateral,
  frame: Frame
): Quadrilateral {
  'worklet';

  const p0 = mapResizedPointToFrame(corners[0], frame.width, frame.height);
  const p1 = mapResizedPointToFrame(corners[1], frame.width, frame.height);
  const p2 = mapResizedPointToFrame(corners[2], frame.width, frame.height);
  const p3 = mapResizedPointToFrame(corners[3], frame.width, frame.height);
  const c0 = frame.convertFramePointToCameraPoint(p0);
  const c1 = frame.convertFramePointToCameraPoint(p1);
  const c2 = frame.convertFramePointToCameraPoint(p2);
  const c3 = frame.convertFramePointToCameraPoint(p3);

  return [
    { x: c0.x, y: c0.y },
    { x: c1.x, y: c1.y },
    { x: c2.x, y: c2.y },
    { x: c3.x, y: c3.y },
  ];
}

/**
 * Detects cards and perspective-normalizes each accepted candidate.
 *
 * Pixel-heavy work stays entirely on the CV worklet. Only camera-space corner
 * DTOs should be scheduled back to React Native. The caller owns every
 * `normalizedImage` and must release it after recognition.
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
  const kernel = Size.create(5, 5);
  const contours = PointVectorOfVectors.create();

  try {
    const pixels = new Uint8Array(resized.getPixelBuffer());
    const input = Mat.createFromBuffer('uint8', DETECTOR_HEIGHT, DETECTOR_WIDTH, 3, pixels);

    try {
      OpenCV.cvtColor(input, gray, ColorConversionCodes.COLOR_BGR2GRAY);
      OpenCV.GaussianBlur(gray, blurred, kernel, 0);
      OpenCV.Canny(blurred, edges, 60, 160);
      OpenCV.findContours(
        edges,
        contours,
        RetrievalModes.RETR_EXTERNAL,
        ContourApproximationModes.CHAIN_APPROX_SIMPLE
      );

      const imageArea = DETECTOR_WIDTH * DETECTOR_HEIGHT;
      const scored: ScoredQuadrilateral[] = [];

      for (let index = 0; index < contours.length; index += 1) {
        const contour = contours.get(index);
        const { value: area } = OpenCV.contourArea(contour, false);
        const areaRatio = area / imageArea;
        if (areaRatio < MIN_AREA_RATIO || areaRatio > MAX_AREA_RATIO) {
          continue;
        }

        const { value: perimeter } = OpenCV.arcLength(contour, true);
        const approx = PointVector.create();

        try {
          OpenCV.approxPolyDP(contour, approx, perimeter * 0.025, true);
          if (approx.length !== 4) {
            continue;
          }

          const rect = OpenCV.boundingRect(approx);
          try {
            const rectArea = rect.width * rect.height;
            if (rectArea <= 0 || area / rectArea < MIN_RECTANGULARITY) {
              continue;
            }

            if (
              rect.width >= DETECTOR_WIDTH * 0.96 ||
              rect.height >= DETECTOR_HEIGHT * 0.96
            ) {
              continue;
            }

            const rawPoints = approx.getAll().map((point) => ({ x: point.x, y: point.y }));
            const corners = orderClockwise(rawPoints);
            scored.push({
              corners,
              area,
              centerX: rect.x + rect.width / 2,
              centerY: rect.y + rect.height / 2,
              width: rect.width,
              height: rect.height,
            });
          } finally {
            rect.release();
          }
        } finally {
          approx.release();
        }
      }

      scored.sort((a, b) => b.area - a.area);
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
            cameraCorners: toCameraCorners(candidate.corners, frame),
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
    contours.release();
    kernel.release();
    edges.release();
    blurred.release();
    gray.release();
    resized.dispose();
  }
}

/**
 * Geometry-only compatibility wrapper used by the current Camera UI. Once ORB
 * recognition is connected, the camera pipeline will consume
 * `detectNormalizedCardCandidates` directly and avoid this extra release step.
 */
export function detectCardQuadrilaterals(frame: Frame, resizer: Resizer): Quadrilateral[] {
  'worklet';

  const candidates = detectNormalizedCardCandidates(frame, resizer);
  try {
    return candidates.map((candidate) => candidate.cameraCorners);
  } finally {
    for (const candidate of candidates) {
      candidate.normalizedImage.release();
    }
  }
}
