import type {
  CardReference,
  NormalizedCardImage,
  RecognitionResult,
} from './types';

/**
 * Identifies an already detected and perspective-normalized card.
 * The application depends on this interface, not on ORB/OpenCV directly.
 */
export interface CardRecognizer {
  prepare(catalog: readonly CardReference[]): Promise<void>;
  recognize(image: NormalizedCardImage): Promise<RecognitionResult>;
  dispose(): Promise<void>;
}
