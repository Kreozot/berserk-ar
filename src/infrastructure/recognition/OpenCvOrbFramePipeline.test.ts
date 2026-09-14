import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OpenCvCardCandidate } from '../detection/opencv/detectCardQuadrilaterals';
import { detectNormalizedCardCandidates } from '../detection/opencv/detectCardQuadrilaterals';
import { processOpenCvOrbFrame } from './OpenCvOrbFramePipeline';
import { recognizeCardCandidatesWithOrbBatch } from './orb/recognizeCardCandidatesWithOrb';

vi.mock('../detection/opencv/detectCardQuadrilaterals', () => ({
  DETECTOR_WIDTH: 360,
  DETECTOR_HEIGHT: 480,
  detectNormalizedCardCandidates: vi.fn(),
}));

vi.mock('./orb/recognizeCardCandidatesWithOrb', () => ({
  recognizeCardCandidatesWithOrbBatch: vi.fn(),
}));

const corners = [
  { x: 0, y: 0 },
  { x: 63, y: 0 },
  { x: 63, y: 89 },
  { x: 0, y: 89 },
] as const;

function candidate() {
  return {
    detectorCorners: corners,
    normalizedImage: { release: vi.fn() },
  } as unknown as OpenCvCardCandidate;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('processOpenCvOrbFrame', () => {
  it('maps native results to the core contract and releases intermediate images', () => {
    const detected = candidate();
    vi.mocked(detectNormalizedCardCandidates).mockReturnValue([detected]);
    vi.mocked(recognizeCardCandidatesWithOrbBatch).mockReturnValue({
      results: [
        {
          detectorCorners: corners,
          recognition: { status: 'recognized', cardId: 'll-001', confidence: 0.8 },
          evaluated: true,
          diagnostics: {
            bestCardId: 'll-001',
            queryDescriptors: 100,
            bestGoodMatches: 30,
            secondBestGoodMatches: 10,
            goodMatchRatio: 0.3,
            winnerMargin: 20,
            winnerRatio: 3,
          },
        },
      ],
      orbCandidates: 1,
      sceneReset: false,
    });

    const result = processOpenCvOrbFrame({} as never, {} as never, 7);

    expect(recognizeCardCandidatesWithOrbBatch).toHaveBeenCalledWith([detected], 7);
    expect(result).toMatchObject({
      observations: [
        {
          corners,
          recognition: { status: 'recognized', cardId: 'll-001', confidence: 0.8 },
          evaluated: true,
          debug: {
            bestCandidateId: 'll-001',
            summary: 'q=100  m=30/10  gm=0.30  Δ=20  wr=3.00',
          },
        },
      ],
      evaluatedCandidates: 1,
      skippedCandidates: 0,
      sceneReset: false,
    });
    expect(detected.normalizedImage.release).toHaveBeenCalledOnce();
  });

  it('releases all detected images when recognition fails and reports the pipeline stage', () => {
    const first = candidate();
    const second = candidate();
    vi.mocked(detectNormalizedCardCandidates).mockReturnValue([first, second]);
    vi.mocked(recognizeCardCandidatesWithOrbBatch).mockImplementation(() => {
      throw new Error('native matcher failed');
    });

    expect(() => processOpenCvOrbFrame({} as never, {} as never, 1)).toThrow(
      'RECOGNIZE: Error: native matcher failed',
    );
    expect(first.normalizedImage.release).toHaveBeenCalledOnce();
    expect(second.normalizedImage.release).toHaveBeenCalledOnce();
  });

  it('labels detection failures without attempting recognition', () => {
    vi.mocked(detectNormalizedCardCandidates).mockImplementation(() => {
      throw 'invalid frame';
    });

    expect(() => processOpenCvOrbFrame({} as never, {} as never, 1)).toThrow(
      'DETECT/WARP: invalid frame',
    );
    expect(recognizeCardCandidatesWithOrbBatch).not.toHaveBeenCalled();
  });
});
