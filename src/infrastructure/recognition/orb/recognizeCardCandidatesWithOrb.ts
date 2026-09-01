import type { OpenCvCardCandidate } from '../../detection/opencv/detectCardQuadrilaterals';
import { recognizeScheduledCardCandidatesWithOrb } from './recognizeScheduledCardCandidatesWithOrb';
import type { RecognizedCardCandidate } from './recognizeCardCandidatesWithOrbNow';

export {
  getOrbRuntimeCacheInitCount,
  type OrbRecognitionDiagnostics,
  type RecognizedCardCandidate,
} from './recognizeCardCandidatesWithOrbNow';

/** Applies worklet-side scheduling and returns recognition results in candidate order. */
export function recognizeCardCandidatesWithOrb(
  candidates: readonly OpenCvCardCandidate[]
): RecognizedCardCandidate[] {
  'worklet';
  return recognizeScheduledCardCandidatesWithOrb(candidates).results;
}
