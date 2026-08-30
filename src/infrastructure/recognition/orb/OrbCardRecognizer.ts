import type {CardRecognizer} from '../../../core/vision/CardRecognizer';
import type {
  CardReference,
  NormalizedCardImage,
  RecognitionResult,
} from '../../../core/vision/types';

/**
 * First prototype implementation.
 *
 * OpenCV/ORB-specific descriptor types and thresholds must stay inside this
 * adapter. The rest of the application sees only CardRecognizer.
 */
export class OrbCardRecognizer implements CardRecognizer {
  async prepare(_catalog: readonly CardReference[]): Promise<void> {
    throw new Error('ORB adapter is not wired to native OpenCV yet.');
  }

  async recognize(_image: NormalizedCardImage): Promise<RecognitionResult> {
    throw new Error('ORB adapter is not wired to native OpenCV yet.');
  }

  async dispose(): Promise<void> {
    // Native descriptor/cache cleanup will live here.
  }
}
