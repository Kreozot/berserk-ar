import {
  ColorConversionCodes,
  DataTypes,
  Mat,
  NormTypes,
  OpenCV,
  ORBScoreType,
  type BFMatcher,
  type ORB,
} from 'react-native-fast-opencv';

import type { Quadrilateral, RecognitionResult } from '../../../core/vision/types';
import type { OpenCvCardCandidate } from '../../detection/opencv/detectCardQuadrilaterals';
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

// Conservative prototype thresholds. These deliberately prefer UNKNOWN until
// we tune them against photos/video of physical cards and negative objects.
const MIN_QUERY_DESCRIPTORS = 45;
const MIN_GOOD_MATCHES = 28;
const MIN_GOOD_MATCH_RATIO = 0.09;
const MIN_WINNER_MARGIN = 10;
const MIN_WINNER_RATIO = 1.28;

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
};

type ReferenceMat = {
  readonly cardId: string;
  readonly descriptors: Mat;
};

type RankedReference = {
  readonly cardId: string;
  readonly goodMatches: number;
};

function clamp01(value: number): number {
  'worklet';
  return Math.max(0, Math.min(1, value));
}

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
    ORB_FAST_THRESHOLD
  );
}

function createReferenceMats(): ReferenceMat[] {
  'worklet';

  return ORB_REFERENCE_DESCRIPTORS.map((reference) => ({
    cardId: reference.cardId,
    descriptors: Mat.createFromBuffer(
      'uint8',
      reference.rows,
      reference.cols,
      1,
      new Uint8Array(reference.data)
    ),
  }));
}

function countGoodMatches(
  matcher: BFMatcher,
  queryDescriptors: Mat,
  referenceDescriptors: Mat
): number {
  'worklet';

  const matches = OpenCV.knnMatchBF(matcher, queryDescriptors, referenceDescriptors, 2);
  try {
    let goodMatches = 0;
    for (let index = 0; index < matches.length; index += 1) {
      const pair = matches.get(index);
      if (pair.length < 2) {
        continue;
      }

      if (pair[0].distance < LOWE_RATIO * pair[1].distance) {
        goodMatches += 1;
      }
    }
    return goodMatches;
  } finally {
    matches.release();
  }
}

function scoreConfidence(
  bestGoodMatches: number,
  secondBestGoodMatches: number,
  queryDescriptors: number
): number {
  'worklet';

  const matchStrength = clamp01(bestGoodMatches / 100);
  const queryCoverage = clamp01(bestGoodMatches / Math.max(queryDescriptors * 0.35, 1));
  const separation = clamp01((bestGoodMatches - secondBestGoodMatches) / 45);
  return clamp01(matchStrength * 0.45 + queryCoverage * 0.25 + separation * 0.3);
}

function recognizeOne(
  image: Mat,
  orb: ORB,
  matcher: BFMatcher,
  references: readonly ReferenceMat[]
): { recognition: RecognitionResult; diagnostics: OrbRecognitionDiagnostics } {
  'worklet';

  const gray = Mat.create(0, 0, DataTypes.CV_8U);
  try {
    OpenCV.cvtColor(image, gray, ColorConversionCodes.COLOR_BGR2GRAY);
    const { keypoints, descriptors } = OpenCV.detectAndCompute(orb, gray);

    try {
      const queryDescriptors = descriptors.rows;
      if (queryDescriptors < MIN_QUERY_DESCRIPTORS) {
        return {
          recognition: { status: 'unknown', confidence: 0 },
          diagnostics: {
            bestCardId: null,
            queryDescriptors,
            bestGoodMatches: 0,
            secondBestGoodMatches: 0,
            goodMatchRatio: 0,
            winnerMargin: 0,
            winnerRatio: 0,
          },
        };
      }

      const ranking: RankedReference[] = references.map((reference) => ({
        cardId: reference.cardId,
        goodMatches: countGoodMatches(matcher, descriptors, reference.descriptors),
      }));
      ranking.sort((a, b) => b.goodMatches - a.goodMatches);

      const best = ranking[0];
      const second = ranking[1];
      const goodMatchRatio = best.goodMatches / Math.max(queryDescriptors, 1);
      const winnerMargin = best.goodMatches - second.goodMatches;
      const winnerRatio = best.goodMatches / Math.max(second.goodMatches, 1);
      const confidence = scoreConfidence(
        best.goodMatches,
        second.goodMatches,
        queryDescriptors
      );

      const recognized =
        best.goodMatches >= MIN_GOOD_MATCHES &&
        goodMatchRatio >= MIN_GOOD_MATCH_RATIO &&
        winnerMargin >= MIN_WINNER_MARGIN &&
        winnerRatio >= MIN_WINNER_RATIO;

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
 * Recognizes every normalized candidate while sharing one ORB instance,
 * matcher and reference matrices for the whole processed camera frame.
 * All native OpenCV objects are released before returning to React Native.
 */
export function recognizeCardCandidatesWithOrb(
  candidates: readonly OpenCvCardCandidate[]
): RecognizedCardCandidate[] {
  'worklet';

  if (candidates.length === 0) {
    return [];
  }

  const orb = createOrb();
  const matcher = OpenCV.BFMatcher_create(NormTypes.NORM_HAMMING, false);
  const references = createReferenceMats();

  try {
    return candidates.map((candidate) => {
      const { recognition, diagnostics } = recognizeOne(
        candidate.normalizedImage,
        orb,
        matcher,
        references
      );
      return {
        detectorCorners: candidate.detectorCorners,
        recognition,
        diagnostics,
      };
    });
  } finally {
    for (const reference of references) {
      reference.descriptors.release();
    }
    matcher.release();
    orb.release();
  }
}
