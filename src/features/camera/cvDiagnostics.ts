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
      `ORB ${diagnostics.orbMs}ms · TOTAL ${diagnostics.totalMs}ms`,
    pipeline:
      `CAND ${diagnostics.candidates} · ORB ${diagnostics.orbChecked}/` +
      `${diagnostics.orbSkipped} · REC ${diagnostics.recognized} · ` +
      `TRACK ${diagnostics.trackerCount}`,
    scene: diagnostics.sceneReset ? 'SCENE RESET' : 'SCENE STABLE',
  };
}
