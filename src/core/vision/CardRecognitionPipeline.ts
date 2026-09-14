import type { Quadrilateral, RecognitionResult } from './types';

/** Optional implementation-neutral details shown only by development diagnostics. */
export type RecognitionDebugInfo = {
  readonly bestCandidateId: string | null;
  readonly summary: string;
};

/** One detected region after identification, with no native image handles crossing the boundary. */
export type CardRecognitionObservation = {
  readonly corners: Quadrilateral;
  readonly recognition: RecognitionResult;
  readonly evaluated: boolean;
  readonly debug: RecognitionDebugInfo;
};

export type CardRecognitionFrameResult = {
  readonly observations: readonly CardRecognitionObservation[];
  readonly detectorMs: number;
  readonly recognizerMs: number;
  readonly evaluatedCandidates: number;
  readonly skippedCandidates: number;
  readonly sceneReset: boolean;
};

/** Synchronous processor suitable for a camera worklet and replaceable native implementations. */
export type CardRecognitionPipeline<TFrame, TFrameAdapter> = (
  frame: TFrame,
  frameAdapter: TFrameAdapter,
  sessionId: number,
) => CardRecognitionFrameResult;
