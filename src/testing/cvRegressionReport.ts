export type CvRegressionReportResult =
  | { readonly status: 'saved'; readonly uri: string }
  | { readonly status: 'error'; readonly message: string };

function readableError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Converts report persistence failures into explicit runner state instead of aborting completion. */
export function finishCvRegressionReport(saveReport: () => string): CvRegressionReportResult {
  try {
    return { status: 'saved', uri: saveReport() };
  } catch (error) {
    return { status: 'error', message: readableError(error) };
  }
}
