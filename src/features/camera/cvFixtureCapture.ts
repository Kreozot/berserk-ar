export type CapturedCvFixtureFrame = {
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
};

/** Keeps fixture capture unavailable in production even if the environment flag leaks into a build. */
export function isCvFixtureCaptureEnabled(
  isDevelopment: boolean,
  flag: string | undefined,
): boolean {
  return isDevelopment && flag === '1';
}

/** Creates sortable, collision-resistant names without relying on device locale settings. */
export function createCvFixtureFrameName(capturedAt: Date): string {
  const timestamp = capturedAt.toISOString().replaceAll(/[-:.]/g, '');
  return `berserk-cv-${timestamp}.jpg`;
}
