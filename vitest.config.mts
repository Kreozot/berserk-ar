import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: [
        'src/catalog/catalogLookup.ts',
        'src/core/tracking/CardTracker.ts',
        'src/core/tracking/trackingPolicy.ts',
        'src/core/vision/geometry.ts',
        'src/core/vision/frameDiagnostics.ts',
        'src/features/camera/cameraGeometry.ts',
        'src/features/camera/cvDiagnostics.ts',
        'src/features/camera/cvFixtureCapture.ts',
        'src/features/camera/overlayGeometry.ts',
        'src/infrastructure/detection/opencv/cardQuadGeometry.ts',
        'src/infrastructure/detection/opencv/perspectiveGeometry.ts',
        'src/infrastructure/recognition/orb/orbScoring.ts',
        'src/infrastructure/recognition/orb/schedulerPolicy.ts',
        'src/testing/cvFixtureManifest.ts',
        'src/testing/cvFixtureImage.ts',
        'src/testing/cvFixtureRunSummary.ts',
        'src/testing/cvRegressionMode.ts',
        'src/testing/cvRegression.ts',
      ],
      thresholds: {
        perFile: true,
        statements: 95,
        branches: 75,
        functions: 100,
        lines: 95,
      },
    },
  },
});
