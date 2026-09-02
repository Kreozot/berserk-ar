import type { OpenCvCardCandidate } from '../../detection/opencv/detectCardQuadrilaterals';
import type { RecognizedCardCandidate } from './recognizeCardCandidatesWithOrbNow';
import { recognizeScheduledCardCandidatesWithOrb } from './recognizeScheduledCardCandidatesWithOrb';

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
