/** Keeps the native fixture runner restricted to explicit Android development builds. */
export function isCvRegressionModeEnabled(
  isDevelopment: boolean,
  platform: string,
  flag: string | undefined,
): boolean {
  return isDevelopment && platform === 'android' && flag === '1';
}
