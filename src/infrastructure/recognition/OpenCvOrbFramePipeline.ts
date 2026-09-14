import type { Frame } from 'react-native-vision-camera';
import type { Resizer } from 'react-native-vision-camera-resizer';

import type {
  CardRecognitionObservation,
  CardRecognitionPipeline,
  RecognitionDebugInfo,
} from '../../core/vision/CardRecognitionPipeline';
import {
  DETECTOR_HEIGHT,
  DETECTOR_WIDTH,
  detectNormalizedCardCandidates,
} from '../detection/opencv/detectCardQuadrilaterals';
import type { OrbRecognitionDiagnostics } from './orb/recognizeCardCandidatesWithOrb';
import { recognizeCardCandidatesWithOrbBatch } from './orb/recognizeCardCandidatesWithOrb';

export const CAMERA_RECOGNITION_WIDTH = DETECTOR_WIDTH;
export const CAMERA_RECOGNITION_HEIGHT = DETECTOR_HEIGHT;
export const CAMERA_RECOGNITION_LABEL = 'OPENCV + ORB + TRACK';

function toDebugInfo(diagnostics: OrbRecognitionDiagnostics): RecognitionDebugInfo {
  'worklet';
  return {
    bestCandidateId: diagnostics.bestCardId,
    summary: [
      `q=${diagnostics.queryDescriptors}`,
      `m=${diagnostics.bestGoodMatches}/${diagnostics.secondBestGoodMatches}`,
      `gm=${diagnostics.goodMatchRatio.toFixed(2)}`,
      `Δ=${diagnostics.winnerMargin}`,
      `wr=${diagnostics.winnerRatio.toFixed(2)}`,
    ].join('  '),
  };
}

/** Owns detection/recognition intermediates and exposes only core pipeline results to the camera UI. */
export const processOpenCvOrbFrame: CardRecognitionPipeline<Frame, Resizer> = (
  frame,
  resizer,
  sessionId,
) => {
  'worklet';
  const startedAt = Date.now();
  let candidates: ReturnType<typeof detectNormalizedCardCandidates> = [];
  try {
    try {
      candidates = detectNormalizedCardCandidates(frame, resizer);
    } catch (error) {
      throw new Error(`DETECT/WARP: ${String(error)}`);
    }
    const afterDetect = Date.now();
    let batch: ReturnType<typeof recognizeCardCandidatesWithOrbBatch>;
    try {
      batch = recognizeCardCandidatesWithOrbBatch(candidates, sessionId);
    } catch (error) {
      throw new Error(`RECOGNIZE: ${String(error)}`);
    }
    const finishedAt = Date.now();
    const observations: CardRecognitionObservation[] = batch.results.map((result) => ({
      corners: result.detectorCorners,
      recognition: result.recognition,
      evaluated: result.evaluated,
      debug: toDebugInfo(result.diagnostics),
    }));
    return {
      observations,
      detectorMs: afterDetect - startedAt,
      recognizerMs: finishedAt - afterDetect,
      evaluatedCandidates: batch.orbCandidates,
      skippedCandidates: candidates.length - batch.orbCandidates,
      sceneReset: batch.sceneReset,
    };
  } finally {
    for (const candidate of candidates) candidate.normalizedImage.release();
  }
};
