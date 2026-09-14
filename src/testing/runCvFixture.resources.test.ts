import { Directory } from 'expo-file-system';
import { Mat, OpenCV, Point, Scalar } from 'react-native-fast-opencv';
import { loadImage } from 'react-native-nitro-image';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { detectNormalizedCardCandidatesFromBgr } from '../infrastructure/detection/opencv/detectCardQuadrilaterals';
import { recognizeCardCandidatesWithOrbNow } from '../infrastructure/recognition/orb/recognizeCardCandidatesWithOrbNow';
import type { CvFixtureAsset } from './cvFixtureAssets';
import { runCvFixture } from './runCvFixture';

vi.mock('react-native-fast-opencv', () => ({
  Mat: { createFromBuffer: vi.fn() },
  Point: { create: vi.fn() },
  Scalar: { create: vi.fn() },
  OpenCV: { line: vi.fn() },
  LineTypes: { LINE_AA: 1 },
}));
vi.mock('react-native-nitro-image', () => ({ loadImage: vi.fn() }));
vi.mock('expo-file-system', () => ({
  Directory: vi.fn(),
  File: class {
    uri = 'file:///diagnostic.jpg';
  },
  Paths: { document: 'file:///' },
}));
vi.mock('../infrastructure/detection/opencv/detectCardQuadrilaterals', () => ({
  DETECTOR_WIDTH: 360,
  DETECTOR_HEIGHT: 480,
  createOpenCvDetectorDiagnostics: vi.fn(() => ({})),
  detectNormalizedCardCandidatesFromBgr: vi.fn(),
}));
vi.mock('../infrastructure/recognition/orb/recognizeCardCandidatesWithOrbNow', () => ({
  recognizeCardCandidatesWithOrbNow: vi.fn(),
}));

const corners = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
] as const;
const detectorCorners = corners.map(({ x, y }) => ({ x: x * 360, y: y * 480 }));
const fixture: CvFixtureAsset = {
  name: 'resource-test',
  resourceName: 'resource-test.jpg',
  manifest: {
    schemaVersion: 1,
    category: 'single-card',
    description: 'Resource ownership',
    expectations: [{ label: 'card', cardId: 'll-001', corners }],
  },
};
let failAt: string | null;
let created: { name: string; cleanup: ReturnType<typeof vi.fn> }[];

function step(name: string) {
  if (failAt === name) throw new Error(`failure at ${name}`);
}

function resource(name: string) {
  step(name);
  const cleanup = vi.fn();
  created.push({ name, cleanup });
  return { dispose: cleanup, release: cleanup };
}

function pixels(stage: string) {
  step(stage);
  return {
    width: 360,
    height: 480,
    buffer: new ArrayBuffer(360 * 480 * 3),
    pixelFormat: failAt === 'pixel-conversion' ? 'INVALID' : 'BGR',
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  failAt = null;
  created = [];
  vi.mocked(loadImage).mockImplementation(
    () =>
      ({
        ...resource('load'),
        width: 360,
        height: 480,
        toRawPixelData: () => pixels('diagnostic-pixels'),
        crop: () => ({
          ...resource('crop'),
          resize: () => ({ ...resource('resize'), toRawPixelData: () => pixels('pixels') }),
        }),
      }) as unknown as ReturnType<typeof loadImage>,
  );
  let matIndex = 0;
  vi.mocked(Mat.createFromBuffer).mockImplementation(
    () =>
      ({
        ...resource(matIndex++ === 0 ? 'bgr' : 'diagnostic-mat'),
        saveToFile: () => step('save'),
      }) as unknown as Mat,
  );
  let scalarIndex = 0;
  vi.mocked(Scalar.create).mockImplementation(
    () => resource(scalarIndex++ === 0 ? 'expected-color' : 'observed-color') as unknown as Scalar,
  );
  let pointIndex = 0;
  vi.mocked(Point.create).mockImplementation(
    () => resource(pointIndex++ % 2 === 0 ? 'point-start' : 'point-end') as unknown as Point,
  );
  vi.mocked(OpenCV.line).mockImplementation(() => step('line'));
  vi.mocked(Directory).mockImplementation(
    class {
      create = () => step('mkdir');
    } as unknown as typeof Directory,
  );
  vi.mocked(detectNormalizedCardCandidatesFromBgr).mockImplementation(() => {
    step('detect');
    return [{ detectorCorners, normalizedImage: resource('candidate') }] as unknown as ReturnType<
      typeof detectNormalizedCardCandidatesFromBgr
    >;
  });
  vi.mocked(recognizeCardCandidatesWithOrbNow).mockImplementation(() => {
    step('recognize');
    return [
      { detectorCorners, recognition: { status: 'recognized', cardId: 'll-002', confidence: 0.8 } },
    ] as unknown as ReturnType<typeof recognizeCardCandidatesWithOrbNow>;
  });
});

function expectReleased() {
  for (const { name, cleanup } of created) {
    expect(cleanup, `${name} must be released exactly once`).toHaveBeenCalledOnce();
  }
}

describe('fixture native resource ownership', () => {
  it.each([
    'load',
    'crop',
    'resize',
    'pixels',
    'bgr',
    'detect',
    'recognize',
    'diagnostic-pixels',
    'diagnostic-mat',
    'expected-color',
    'observed-color',
    'point-start',
    'point-end',
    'line',
    'mkdir',
    'save',
  ])('releases every acquired resource when %s fails', async (stage) => {
    failAt = stage;
    await expect(runCvFixture(fixture)).rejects.toThrow(`failure at ${stage}`);
    expectReleased();
  });

  it('releases images if pixel format conversion rejects the buffer', async () => {
    failAt = 'pixel-conversion';
    await expect(runCvFixture(fixture)).rejects.toThrow();
    expect(created.map(({ name }) => name)).toEqual(['load', 'crop', 'resize']);
    expectReleased();
  });

  it('releases all resources after saving a failed fixture diagnostic', async () => {
    const result = await runCvFixture(fixture);
    expect(result.evaluation.passed).toBe(false);
    expect(result.diagnosticUri).toBe('file:///diagnostic.jpg');
    expect(created.some(({ name }) => name === 'diagnostic-mat')).toBe(true);
    expectReleased();
  });

  it('releases resources on a passing fixture without allocating a diagnostic image', async () => {
    vi.mocked(recognizeCardCandidatesWithOrbNow).mockReturnValue([
      { detectorCorners, recognition: { status: 'recognized', cardId: 'll-001', confidence: 0.8 } },
    ] as unknown as ReturnType<typeof recognizeCardCandidatesWithOrbNow>);
    const result = await runCvFixture(fixture);
    expect(result.evaluation.passed).toBe(true);
    expect(result.diagnosticUri).toBeNull();
    expect(created.map(({ name }) => name)).toEqual(['load', 'crop', 'resize', 'bgr', 'candidate']);
    expectReleased();
  });

  it('cleans up an ordinary UNKNOWN result too', async () => {
    vi.mocked(recognizeCardCandidatesWithOrbNow).mockReturnValue([
      { detectorCorners, recognition: { status: 'unknown', confidence: 0 } },
    ] as unknown as ReturnType<typeof recognizeCardCandidatesWithOrbNow>);
    const result = await runCvFixture(fixture);
    expect(result.observations[0].cardId).toBeNull();
    expectReleased();
  });
});
