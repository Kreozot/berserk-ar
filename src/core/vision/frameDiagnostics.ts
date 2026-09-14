export type FrameProcessingDiagnostics = {
  readonly frameIndex: number;
  readonly detectorMs: number;
  readonly recognizerMs: number;
  readonly totalMs: number;
  readonly candidates: number;
  readonly recognitionChecked: number;
  readonly recognitionSkipped: number;
  readonly sceneReset: boolean;
};

export type FrameDiagnostics = FrameProcessingDiagnostics & {
  readonly recognized: number;
  readonly trackerCount: number;
};

/** Completes worklet-side timings and scheduler counts with UI tracker state. */
export function completeFrameDiagnostics(
  processing: FrameProcessingDiagnostics,
  recognized: number,
  trackerCount: number,
): FrameDiagnostics {
  return { ...processing, recognized, trackerCount };
}
