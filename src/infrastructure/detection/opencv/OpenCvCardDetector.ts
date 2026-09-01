import type { CardDetector } from '../../../core/vision/CardDetector';
import type { CameraFrame, DetectedCard } from '../../../core/vision/types';

/** Prototype CardDetector adapter reserved for a fully encapsulated OpenCV implementation. */
export class OpenCvCardDetector implements CardDetector {
  /** Placeholder detector entry point until the interface adapter is wired to the native pipeline. */
  async detect(_frame: CameraFrame): Promise<DetectedCard[]> {
    throw new Error('OpenCV detector is not wired to native OpenCV yet.');
  }

  /** Placeholder cleanup hook for future detector-owned native resources. */
  async dispose(): Promise<void> {
    // Native resources will be released here.
  }
}
