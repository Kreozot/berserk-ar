import type {CardDetector} from '../../../core/vision/CardDetector';
import type {CameraFrame, DetectedCard} from '../../../core/vision/types';

/**
 * First prototype detector: contours -> quadrilateral filtering ->
 * perspective normalization.
 */
export class OpenCvCardDetector implements CardDetector {
  async detect(_frame: CameraFrame): Promise<DetectedCard[]> {
    throw new Error('OpenCV detector is not wired to native OpenCV yet.');
  }

  async dispose(): Promise<void> {
    // Native resources will be released here.
  }
}
