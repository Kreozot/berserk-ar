import type { OpenCvCardCandidate } from '../../detection/opencv/detectCardQuadrilaterals';
import type { RecognizedCardCandidate } from './recognizeCardCandidatesWithOrbNow';
import {
  recognizeScheduledCardCandidatesWithOrb,
  type ScheduledRecognitionBatch,
} from './recognizeScheduledCardCandidatesWithOrb';

export {
  getOrbRuntimeCacheInitCount,
  type OrbRecognitionDiagnostics,
  type RecognizedCardCandidate,
} from './recognizeCardCandidatesWithOrbNow';

/** Applies worklet-side scheduling and returns recognition results in candidate order. */
export function recognizeCardCandidatesWithOrb(
  candidates: readonly OpenCvCardCandidate[],
): RecognizedCardCandidate[] {
  'worklet';
  return recognizeScheduledCardCandidatesWithOrb(candidates).results;
}

/** Applies worklet-side scheduling and exposes the counts needed by frame diagnostics. */
export function recognizeCardCandidatesWithOrbBatch(
  candidates: readonly OpenCvCardCandidate[],
  sessionId: number,
): ScheduledRecognitionBatch {
  'worklet';
  return recognizeScheduledCardCandidatesWithOrb(candidates, sessionId);
}
