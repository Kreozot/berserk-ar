import {
  type BFMatcher,
  ColorConversionCodes,
  DataTypes,
  Mat,
  NormTypes,
  OpenCV,
  type ORB,
  ORBScoreType,
} from 'react-native-fast-opencv';

import type { Quadrilateral, RecognitionResult } from '../../../core/vision/types';
import type { OpenCvCardCandidate } from '../../detection/opencv/detectCardQuadrilaterals';
import {
  MIN_QUERY_DESCRIPTORS,
  passesOrbRecognitionThresholds,
  scoreOrbConfidence,
} from './orbScoring';
import { ORB_REFERENCE_DESCRIPTORS } from './referenceDescriptors.generated';

const ORB_NFEATURES = 600;
const ORB_SCALE_FACTOR = 1.2;
const ORB_NLEVELS = 8;
const ORB_EDGE_THRESHOLD = 15;
const ORB_FIRST_LEVEL = 0;
const ORB_WTA_K = 2;
const ORB_PATCH_SIZE = 31;
const ORB_FAST_THRESHOLD = 10;
const LOWE_RATIO = 0.75;

export type OrbRecognitionDiagnostics = {
  readonly bestCardId: string | null;
  readonly queryDescriptors: number;
  readonly bestGoodMatches: number;
  readonly secondBestGoodMatches: number;
  readonly goodMatchRatio: number;
  readonly winnerMargin: number;
  readonly winnerRatio: number;
};

export type RecognizedCardCandidate = {
  readonly detectorCorners: Quadrilateral;
  readonly recognition: RecognitionResult;
  readonly diagnostics: OrbRecognitionDiagnostics;
  readonly evaluated: boolean;
};

type ReferenceMat = { readonly cardId: string; readonly descriptors: Mat };
type RankedReference = { readonly cardId: string; readonly goodMatches: number };
type OrbRuntimeCache = {
  readonly orb: ORB;
  readonly matcher: BFMatcher;
  readonly references: readonly ReferenceMat[];
};
type WorkletGlobal = typeof globalThis & {
  __berserkOrbRuntimeCache?: OrbRuntimeCache;
  __berserkOrbRuntimeCacheInitCount?: number;
};

/** Creates zero-valued diagnostics for candidates that cannot be evaluated. */
function emptyDiagnostics(queryDescriptors = 0): OrbRecognitionDiagnostics {
  'worklet';
  return {
    bestCardId: null,
    queryDescriptors,
    bestGoodMatches: 0,
    secondBestGoodMatches: 0,
    goodMatchRatio: 0,
    winnerMargin: 0,
    winnerRatio: 0,
  };
}

/** Creates a consistent UNKNOWN result while preserving the query descriptor count. */
function unknownResult(queryDescriptors = 0): {
  recognition: RecognitionResult;
  diagnostics: OrbRecognitionDiagnostics;
} {
  'worklet';
  return {
    recognition: { status: 'unknown', confidence: 0 },
    diagnostics: emptyDiagnostics(queryDescriptors),
  };
}

/** Creates the configured ORB feature detector used for both references and camera crops. */
function createOrb(): ORB {
  'worklet';
  return OpenCV.ORB_create(
    ORB_NFEATURES,
    ORB_SCALE_FACTOR,
    ORB_NLEVELS,
    ORB_EDGE_THRESHOLD,
    ORB_FIRST_LEVEL,
    ORB_WTA_K,
    ORBScoreType.HARRIS_SCORE,
    ORB_PATCH_SIZE,
    ORB_FAST_THRESHOLD,
  );
}

/** Materializes generated reference descriptor buffers as native OpenCV Mats. */
function createReferenceMats(): ReferenceMat[] {
  'worklet';
  return ORB_REFERENCE_DESCRIPTORS.map((reference) => ({
    cardId: reference.cardId,
    descriptors: Mat.createFromBuffer(
      'uint8',
      reference.rows,
      reference.cols,
      1,
      new Uint8Array(reference.data),
    ),
  }));
}

/** Returns the single ORB/matcher/reference cache owned by the current worklet runtime. */
function getOrbRuntimeCache(): OrbRuntimeCache {
  'worklet';
  const scope = globalThis as WorkletGlobal;
  const cached = scope.__berserkOrbRuntimeCache;
  if (cached != null) return cached;
  const created: OrbRuntimeCache = {
    orb: createOrb(),
    matcher: OpenCV.BFMatcher_create(NormTypes.NORM_HAMMING, false),
    references: createReferenceMats(),
  };
  scope.__berserkOrbRuntimeCache = created;
  scope.__berserkOrbRuntimeCacheInitCount = (scope.__berserkOrbRuntimeCacheInitCount ?? 0) + 1;
  return created;
}

/** Returns how many times the ORB runtime cache has been initialized for diagnostics. */
export function getOrbRuntimeCacheInitCount(): number {
  'worklet';
  return (globalThis as WorkletGlobal).__berserkOrbRuntimeCacheInitCount ?? 0;
}

/** Counts Lowe-ratio-filtered Hamming matches between one query and one reference card. */
function countGoodMatches(
  matcher: BFMatcher,
  queryDescriptors: Mat,
  referenceDescriptors: Mat,
): number {
  'worklet';
  if (
    queryDescriptors.rows <= 0 ||
    queryDescriptors.cols <= 0 ||
    referenceDescriptors.rows <= 0 ||
    referenceDescriptors.cols <= 0 ||
    queryDescriptors.cols !== referenceDescriptors.cols
  )
    return 0;

  const matches = OpenCV.knnMatchBF(matcher, queryDescriptors, referenceDescriptors, 2);
  try {
    let goodMatches = 0;
    for (let index = 0; index < matches.length; index += 1) {
      const pair = matches.get(index);
      if (pair.length >= 2 && pair[0].distance < LOWE_RATIO * pair[1].distance) goodMatches += 1;
    }
    return goodMatches;
  } finally {
    matches.release();
  }
}

/** Runs full ORB recognition for one normalized card crop and returns diagnostics. */
function recognizeOne(
  image: Mat,
  orb: ORB,
  matcher: BFMatcher,
  references: readonly ReferenceMat[],
): { recognition: RecognitionResult; diagnostics: OrbRecognitionDiagnostics } {
  'worklet';
  if (image.rows <= 0 || image.cols <= 0) return unknownResult();

  const gray = Mat.create(0, 0, DataTypes.CV_8U);
  try {
    OpenCV.cvtColor(image, gray, ColorConversionCodes.COLOR_BGR2GRAY);
    if (gray.rows <= 0 || gray.cols <= 0) return unknownResult();
    const { keypoints, descriptors } = OpenCV.detectAndCompute(orb, gray);
    try {
      const queryDescriptors = descriptors.rows;
      if (queryDescriptors < MIN_QUERY_DESCRIPTORS || descriptors.cols <= 0) {
        return unknownResult(Math.max(queryDescriptors, 0));
      }
      const ranking: RankedReference[] = references.map((reference) => ({
        cardId: reference.cardId,
        goodMatches: countGoodMatches(matcher, descriptors, reference.descriptors),
      }));
      ranking.sort((a, b) => b.goodMatches - a.goodMatches);
      const best = ranking[0];
      const second = ranking[1];
      if (best == null || second == null) return unknownResult(queryDescriptors);

      const goodMatchRatio = best.goodMatches / Math.max(queryDescriptors, 1);
      const winnerMargin = best.goodMatches - second.goodMatches;
      const winnerRatio = best.goodMatches / Math.max(second.goodMatches, 1);
      const confidence = scoreOrbConfidence(best.goodMatches, second.goodMatches, queryDescriptors);
      const recognized = passesOrbRecognitionThresholds(
        best.goodMatches,
        second.goodMatches,
        queryDescriptors,
      );

      return {
        recognition: recognized
          ? { status: 'recognized', cardId: best.cardId, confidence }
          : { status: 'unknown', confidence },
        diagnostics: {
          bestCardId: best.cardId,
          queryDescriptors,
          bestGoodMatches: best.goodMatches,
          secondBestGoodMatches: second.goodMatches,
          goodMatchRatio,
          winnerMargin,
          winnerRatio,
        },
      };
    } finally {
      descriptors.release();
      keypoints.release();
    }
  } finally {
    gray.release();
  }
}

/**
 * Immediately evaluates every candidate. A native failure rejects the entire batch so callers
 * report a processing error instead of feeding fabricated UNKNOWN votes into tracking/evaluation.
 */
export function recognizeCardCandidatesWithOrbNow(
  candidates: readonly OpenCvCardCandidate[],
): RecognizedCardCandidate[] {
  'worklet';
  if (candidates.length === 0) return [];
  const { orb, matcher, references } = getOrbRuntimeCache();
  return candidates.map((candidate, index) => {
    try {
      const { recognition, diagnostics } = recognizeOne(
        candidate.normalizedImage,
        orb,
        matcher,
        references,
      );
      return {
        detectorCorners: candidate.detectorCorners,
        recognition,
        diagnostics,
        evaluated: true,
      };
    } catch (error) {
      throw new Error(`ORB candidate ${index + 1}/${candidates.length}: ${String(error)}`);
    }
  });
}
