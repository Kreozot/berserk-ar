import type { FrameDiagnostics } from '../../core/vision/frameDiagnostics';

export type CvDiagnosticsLines = {
  readonly timing: string;
  readonly pipeline: string;
  readonly scene: string;
};

/** Keeps live diagnostics unavailable unless explicitly enabled in a development build. */
export function isCvDiagnosticsEnabled(isDevelopment: boolean, flag: string | undefined): boolean {
  return isDevelopment && flag === '1';
}

/** Formats the compact, stable text shown by the live CV diagnostics panel. */
export function formatCvDiagnostics(diagnostics: FrameDiagnostics): CvDiagnosticsLines {
  return {
    timing:
      `FRAME ${diagnostics.frameIndex} · DET ${diagnostics.detectorMs}ms · ` +
      `REC ${diagnostics.recognizerMs}ms · TOTAL ${diagnostics.totalMs}ms`,
    pipeline:
      `CAND ${diagnostics.candidates} · CHECK ${diagnostics.recognitionChecked}/` +
      `${diagnostics.recognitionSkipped} · REC ${diagnostics.recognized} · ` +
      `TRACK ${diagnostics.trackerCount}`,
    scene: diagnostics.sceneReset ? 'SCENE RESET' : 'SCENE STABLE',
  };
}
