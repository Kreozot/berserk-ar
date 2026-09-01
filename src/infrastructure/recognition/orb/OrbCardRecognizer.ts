import type { CardRecognizer } from '../../../core/vision/CardRecognizer';
import type {
  CardReference,
  NormalizedCardImage,
  RecognitionResult,
} from '../../../core/vision/types';

/** Prototype CardRecognizer adapter that keeps ORB/OpenCV details behind the core interface. */
export class OrbCardRecognizer implements CardRecognizer {
  /** Placeholder preparation hook for reference descriptor caches. */
  async prepare(_catalog: readonly CardReference[]): Promise<void> {
    throw new Error('ORB adapter is not wired to native OpenCV yet.');
  }

  /** Placeholder recognition hook for one normalized card image. */
  async recognize(_image: NormalizedCardImage): Promise<RecognitionResult> {
    throw new Error('ORB adapter is not wired to native OpenCV yet.');
  }

  /** Placeholder cleanup hook for future ORB descriptors and matcher resources. */
  async dispose(): Promise<void> {
    // Native descriptor/cache cleanup will live here.
  }
}
