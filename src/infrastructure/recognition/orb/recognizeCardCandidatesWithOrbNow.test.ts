import { Mat, OpenCV } from 'react-native-fast-opencv';
import { loadImage } from 'react-native-nitro-image';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CardTracker } from '../../../core/tracking/CardTracker';
import { runCvFixture } from '../../../testing/runCvFixture';
import type { OpenCvCardCandidate } from '../../detection/opencv/detectCardQuadrilaterals';
import { detectNormalizedCardCandidatesFromBgr } from '../../detection/opencv/detectCardQuadrilaterals';
import { recognizeCardCandidatesWithOrbNow } from './recognizeCardCandidatesWithOrbNow';
import { recognizeScheduledCardCandidatesWithOrb } from './recognizeScheduledCardCandidatesWithOrb';

vi.mock('react-native-fast-opencv', () => ({
  ColorConversionCodes: { COLOR_BGR2GRAY: 1 },
  DataTypes: { CV_8U: 1 },
  NormTypes: { NORM_HAMMING: 1 },
  ORBScoreType: { HARRIS_SCORE: 1 },
  Mat: { create: vi.fn(), createFromBuffer: vi.fn() },
  OpenCV: {
    ORB_create: vi.fn(),
    BFMatcher_create: vi.fn(),
    cvtColor: vi.fn(),
    detectAndCompute: vi.fn(),
    knnMatchBF: vi.fn(),
  },
}));
vi.mock('./referenceDescriptors.generated', () => ({
  ORB_REFERENCE_DESCRIPTORS: [
    { cardId: 'll-001', rows: 40, cols: 32, data: [] },
    { cardId: 'll-002', rows: 40, cols: 32, data: [] },
  ],
}));

vi.mock('expo-file-system', () => ({ Directory: vi.fn(), File: vi.fn(), Paths: {} }));
vi.mock('react-native-nitro-image', () => ({ loadImage: vi.fn() }));
vi.mock('../../detection/opencv/detectCardQuadrilaterals', () => ({
  DETECTOR_WIDTH: 360,
  DETECTOR_HEIGHT: 480,
  createOpenCvDetectorDiagnostics: vi.fn(() => ({})),
  detectNormalizedCardCandidatesFromBgr: vi.fn(),
}));

function mat(rows = 356, cols = 252) {
  return { rows, cols, release: vi.fn() } as unknown as Mat;
}

function candidate(x = 0): OpenCvCardCandidate {
  return {
    detectorCorners: [
      { x, y: 0 },
      { x: x + 63, y: 0 },
      { x: x + 63, y: 89 },
      { x, y: 89 },
    ],
    normalizedImage: mat(),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  Reflect.deleteProperty(globalThis, '__berserkOrbRuntimeCache');
  Reflect.deleteProperty(globalThis, '__berserkOrbSchedulerState');
  vi.mocked(Mat.create).mockImplementation(() => mat());
  vi.mocked(Mat.createFromBuffer).mockImplementation(() => mat(40, 32));
  vi.mocked(OpenCV.detectAndCompute).mockReturnValue({
    keypoints: { release: vi.fn() },
    descriptors: mat(40, 32),
  } as unknown as ReturnType<typeof OpenCV.detectAndCompute>);
  vi.mocked(OpenCV.knnMatchBF).mockImplementation(
    () =>
      ({
        length: 0,
        get: vi.fn(),
        release: vi.fn(),
      }) as unknown as ReturnType<typeof OpenCV.knnMatchBF>,
  );
});

describe('ORB processing failures', () => {
  it('returns evaluated UNKNOWN for an empty native descriptor matrix and releases its wrappers', () => {
    const descriptors = mat(0, 0);
    const keypoints = { release: vi.fn() };
    vi.mocked(OpenCV.detectAndCompute).mockReturnValue({
      keypoints,
      descriptors,
    } as unknown as ReturnType<typeof OpenCV.detectAndCompute>);
    expect(recognizeCardCandidatesWithOrbNow([candidate()])[0]).toMatchObject({
      evaluated: true,
      recognition: { status: 'unknown', confidence: 0 },
      diagnostics: { queryDescriptors: 0 },
    });
    expect(OpenCV.knnMatchBF).not.toHaveBeenCalled();
    expect(descriptors.release).toHaveBeenCalledOnce();
    expect(keypoints.release).toHaveBeenCalledOnce();
  });
  it('rejects a fixture on a native error instead of reporting an ordinary detection/identity result', async () => {
    const detectorImage = {
      toRawPixelData: () => ({
        buffer: new ArrayBuffer(360 * 480 * 3),
        width: 360,
        height: 480,
        pixelFormat: 'BGR',
      }),
      dispose: vi.fn(),
    };
    const croppedImage = { resize: () => detectorImage, dispose: vi.fn() };
    const sourceImage = { width: 360, height: 480, crop: () => croppedImage, dispose: vi.fn() };
    vi.mocked(loadImage).mockReturnValue(sourceImage as unknown as ReturnType<typeof loadImage>);
    const detected = candidate();
    vi.mocked(detectNormalizedCardCandidatesFromBgr).mockReturnValue([detected]);
    vi.mocked(OpenCV.detectAndCompute).mockImplementation(() => {
      throw new Error('native extraction failed');
    });
    await expect(
      runCvFixture({
        name: 'native-failure',
        resourceName: 'native-failure.jpg',
        manifest: {
          schemaVersion: 1,
          category: 'single-card',
          description: 'Native failure',
          expectations: [],
        },
      }),
    ).rejects.toThrow('ORB candidate 1/1: Error: native extraction failed');
    expect(detected.normalizedImage.release).toHaveBeenCalledOnce();
    expect(detectorImage.dispose).toHaveBeenCalledOnce();
    expect(croppedImage.dispose).toHaveBeenCalledOnce();
    expect(sourceImage.dispose).toHaveBeenCalledOnce();
  });

  it('still returns evaluated UNKNOWN when matching succeeds without enough evidence', () => {
    expect(recognizeCardCandidatesWithOrbNow([candidate()])[0]).toMatchObject({
      evaluated: true,
      recognition: { status: 'unknown' },
    });
  });

  it('still treats too few descriptors as a normal evaluated UNKNOWN', () => {
    vi.mocked(OpenCV.detectAndCompute).mockReturnValue({
      keypoints: { release: vi.fn() },
      descriptors: mat(10, 32),
    } as unknown as ReturnType<typeof OpenCV.detectAndCompute>);
    expect(recognizeCardCandidatesWithOrbNow([candidate()])[0]).toMatchObject({
      evaluated: true,
      recognition: { status: 'unknown' },
      diagnostics: { queryDescriptors: 10 },
    });
  });

  it('reports native extraction errors with candidate context and releases the grayscale Mat', () => {
    const gray = mat();
    vi.mocked(Mat.create).mockReturnValue(gray);
    vi.mocked(OpenCV.detectAndCompute).mockImplementation(() => {
      throw new Error('native extraction failed');
    });
    expect(() => recognizeCardCandidatesWithOrbNow([candidate()])).toThrow(
      'ORB candidate 1/1: Error: native extraction failed',
    );
    expect(gray.release).toHaveBeenCalledOnce();
  });

  it('rejects the batch when a later candidate fails instead of returning partial UNKNOWN votes', () => {
    vi.mocked(OpenCV.cvtColor)
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw 'native conversion failed';
      });
    expect(() => recognizeCardCandidatesWithOrbNow([candidate(), candidate(80)])).toThrow(
      'ORB candidate 2/2: native conversion failed',
    );
  });

  it('propagates matcher failures and releases descriptors and keypoints', () => {
    const descriptors = mat(40, 32);
    const keypoints = { release: vi.fn() };
    vi.mocked(OpenCV.detectAndCompute).mockReturnValue({
      descriptors,
      keypoints,
    } as unknown as ReturnType<typeof OpenCV.detectAndCompute>);
    vi.mocked(OpenCV.knnMatchBF).mockImplementation(() => {
      throw new Error('matcher failed');
    });
    expect(() => recognizeCardCandidatesWithOrbNow([candidate()])).toThrow('matcher failed');
    expect(descriptors.release).toHaveBeenCalledOnce();
    expect(keypoints.release).toHaveBeenCalledOnce();
  });

  it('propagates cache initialization errors rather than reporting UNKNOWN', () => {
    vi.mocked(OpenCV.ORB_create).mockImplementation(() => {
      throw new Error('ORB unavailable');
    });
    expect(() => recognizeCardCandidatesWithOrbNow([candidate()])).toThrow('ORB unavailable');
  });

  it('retries a failed geometry recheck immediately without erasing tracked identity', () => {
    // Make reference 1 win with 30 good matches; reference 2 has no matches.
    let calls = 0;
    vi.mocked(OpenCV.knnMatchBF).mockImplementation(
      () =>
        ({
          length: calls++ % 2 === 0 ? 30 : 0,
          get: () => [{ distance: 1 }, { distance: 10 }],
          release: vi.fn(),
        }) as unknown as ReturnType<typeof OpenCV.knnMatchBF>,
    );
    const tracker = new CardTracker();
    const applyFrame = (x: number) => {
      const batch = recognizeScheduledCardCandidatesWithOrb([candidate(x)], 1);
      return tracker.update(
        batch.results.map((result) => ({
          corners: result.detectorCorners,
          recognition: result.recognition,
          evaluated: result.evaluated,
        })),
      );
    };
    const first = applyFrame(0)[0];
    expect(first.recognition.status).toBe('recognized');
    vi.mocked(OpenCV.detectAndCompute).mockImplementationOnce(() => {
      throw new Error('temporary failure');
    });
    expect(() => applyFrame(30)).toThrow('temporary failure');
    expect(tracker.trackCount).toBe(1);
    const beforeRetry = vi.mocked(OpenCV.detectAndCompute).mock.calls.length;
    const recovered = applyFrame(30)[0];
    expect(OpenCV.detectAndCompute).toHaveBeenCalledTimes(beforeRetry + 1);
    expect(recovered.trackId).toBe(first.trackId);
    expect(recovered.recognition).toEqual(first.recognition);
  });
});
