export type FrameProcessingDiagnostics = {
  readonly frameIndex: number;
  readonly detectorMs: number;
  readonly orbMs: number;
  readonly totalMs: number;
  readonly candidates: number;
  readonly orbChecked: number;
  readonly orbSkipped: number;
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
