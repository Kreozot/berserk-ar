import type { CameraFrame, DetectedCard } from './types';

/** Finds card-shaped regions and normalizes perspective using a replaceable backend. */
export interface CardDetector {
  /** Detects cards in one camera frame and returns normalized detections. */
  detect(frame: CameraFrame): Promise<DetectedCard[]>;

  /** Releases resources owned by the detector implementation. */
  dispose(): Promise<void>;
}
