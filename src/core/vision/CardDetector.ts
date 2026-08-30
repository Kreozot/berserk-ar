import type {CameraFrame, DetectedCard} from './types';

/**
 * Finds card-shaped regions and normalizes perspective.
 * Implementations may use OpenCV, ML, or another backend.
 */
export interface CardDetector {
  detect(frame: CameraFrame): Promise<DetectedCard[]>;
  dispose(): Promise<void>;
}
