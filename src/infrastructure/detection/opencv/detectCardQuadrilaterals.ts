import {
  ColorConversionCodes,
  ContourApproximationModes,
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
  ] as Quadrilateral;
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

/**
 * Detects card-shaped quadrilaterals on a VisionCamera worklet thread.
 *
 * The resizer outputs an upright 3:4 BGR image. We map the resulting points
 * back to Frame coordinates and then let VisionCamera convert them to its
 * camera coordinate system. That keeps preview crop/rotation concerns out of
 * OpenCV and the React UI.
 */
export function detectCardQuadrilaterals(frame: Frame, resizer: Resizer): Quadrilateral[] {
  'worklet';

  const resized = resizer.resize(frame);
  const gray = Mat.create();
  const blurred = Mat.create();
  const edges = Mat.create();
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

      return accepted.map((candidate) => {
        const cameraCorners = candidate.corners.map((point) => {
          const framePoint = mapResizedPointToFrame(point, frame.width, frame.height);
          const cameraPoint = frame.convertFramePointToCameraPoint(framePoint);
          return { x: cameraPoint.x, y: cameraPoint.y };
        });

        return cameraCorners as Quadrilateral;
      });
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
