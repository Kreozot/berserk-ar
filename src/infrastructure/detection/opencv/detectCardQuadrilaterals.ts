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

import { edgeLengths, orderClockwise, polygonArea } from '../../../core/vision/geometry';
import type { Point, Quadrilateral } from '../../../core/vision/types';
import {
  isStableCardQuad,
  overlapsAcceptedQuad,
  scoreCardShape,
  summarizeCardQuad,
} from './cardQuadGeometry';
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

/** Approximates one contour at several tolerances until it becomes exactly four-sided. */
function approximateQuadrilateral(contour: PointVector, perimeter: number): PointVector | null {
  'worklet';
  for (const epsilonRatio of APPROX_EPSILON_RATIOS) {
    const approx = PointVector.create();
    OpenCV.approxPolyDP(contour, approx, perimeter * epsilonRatio, true);
    if (approx.length === 4) return approx;
    approx.release();
  }
  return null;
}

/** Copies four native OpenCV points to plain JS points and normalizes their clockwise order. */
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

/** Filters and scores contours that look geometrically like individual physical cards. */
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
      if (areaRatio < MIN_AREA_RATIO || areaRatio > MAX_AREA_RATIO) continue;

      const { value: perimeter } = OpenCV.arcLength(contour, true);
      const approx = approximateQuadrilateral(contour, perimeter);
      if (approx === null) continue;

      try {
        const corners = readQuadrilateral(approx);
        if (!isStableCardQuad(corners)) continue;

        const quadArea = polygonArea(corners);
        const quadPerimeter = edgeLengths(corners).reduce((sum, edge) => sum + edge, 0);
        const contourQuadFill = area / Math.max(quadArea, 1);
        const perimeterExcess = perimeter / Math.max(quadPerimeter, 1);
        const { cardAspect, edgeSimilarity, angleCosine } = summarizeCardQuad(corners);

        if (
          contourQuadFill < MIN_CONTOUR_QUAD_FILL ||
          contourQuadFill > MAX_CONTOUR_QUAD_FILL ||
          perimeterExcess > MAX_PERIMETER_EXCESS ||
          cardAspect < MIN_CARD_ASPECT ||
          cardAspect > MAX_CARD_ASPECT ||
          edgeSimilarity < MIN_OPPOSITE_EDGE_RATIO ||
          angleCosine > MAX_ADJACENT_EDGE_COSINE
        ) continue;

        const rect = OpenCV.boundingRect(approx);
        try {
          if (rect.width >= DETECTOR_WIDTH * 0.98 || rect.height >= DETECTOR_HEIGHT * 0.98) continue;
          scored.push({
            corners,
            area,
            centerX: rect.x + rect.width / 2,
            centerY: rect.y + rect.height / 2,
            width: rect.width,
            height: rect.height,
            cardAspect,
            source,
            shapeScore: scoreCardShape(
              cardAspect,
              EXPECTED_CARD_ASPECT,
              contourQuadFill,
              edgeSimilarity,
              angleCosine
            ),
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

/**
 * Detects card-like contours and perspective-normalizes each accepted candidate from one camera frame.
 * The returned Mats are owned by the caller and must be released.
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
      OpenCV.findContours(edges, rawContours, RetrievalModes.RETR_LIST, ContourApproximationModes.CHAIN_APPROX_SIMPLE);

      OpenCV.morphologyEx(edges, closedEdges, MorphTypes.MORPH_CLOSE, closeKernel);
      OpenCV.findContours(closedEdges, closedContours, RetrievalModes.RETR_LIST, ContourApproximationModes.CHAIN_APPROX_SIMPLE);

      const imageArea = DETECTOR_WIDTH * DETECTOR_HEIGHT;
      const scored: ScoredQuadrilateral[] = [];
      collectQuadrilaterals(rawContours, imageArea, 'raw', scored);
      collectQuadrilaterals(closedContours, imageArea, 'closed', scored);

      scored.sort((a, b) => {
        if (a.source !== b.source) return a.source === 'raw' ? -1 : 1;
        const qualityDelta = b.shapeScore - a.shapeScore;
        if (Math.abs(qualityDelta) > 0.04) return qualityDelta;
        return b.area - a.area;
      });

      const accepted: ScoredQuadrilateral[] = [];
      for (const candidate of scored) {
        if (!overlapsAcceptedQuad(candidate, accepted)) accepted.push(candidate);
        if (accepted.length >= MAX_CANDIDATES) break;
      }

      const normalizedCandidates: OpenCvCardCandidate[] = [];
      try {
        for (const candidate of accepted) {
          try {
            const normalizedImage = normalizeCardPerspective(input, candidate.corners);
            if (normalizedImage.rows > 0 && normalizedImage.cols > 0) {
              normalizedCandidates.push({ detectorCorners: candidate.corners, normalizedImage });
            } else {
              normalizedImage.release();
            }
          } catch {
            // A single malformed contour should not discard the valid cards in this frame.
          }
        }
        return normalizedCandidates;
      } catch (error) {
        for (const candidate of normalizedCandidates) candidate.normalizedImage.release();
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

/** Detects only card corner quadrilaterals and releases the intermediate normalized Mats. */
export function detectCardQuadrilaterals(frame: Frame, resizer: Resizer): Quadrilateral[] {
  'worklet';
  const candidates = detectNormalizedCardCandidates(frame, resizer);
  try {
    return candidates.map((candidate) => candidate.detectorCorners);
  } finally {
    for (const candidate of candidates) candidate.normalizedImage.release();
  }
}
