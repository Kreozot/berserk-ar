import type {
  CardReference,
  NormalizedCardImage,
  RecognitionResult,
} from './types';

/** Identifies an already detected and perspective-normalized card via a replaceable backend. */
export interface CardRecognizer {
  /** Prepares references/caches needed by the recognizer before live recognition starts. */
  prepare(catalog: readonly CardReference[]): Promise<void>;

  /** Recognizes one normalized card image or returns an explicit unknown result. */
  recognize(image: NormalizedCardImage): Promise<RecognitionResult>;

  /** Releases resources owned by the recognizer implementation. */
  dispose(): Promise<void>;
}
