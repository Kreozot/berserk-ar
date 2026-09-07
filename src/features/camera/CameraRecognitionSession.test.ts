import { describe, expect, it, vi } from 'vitest';

import type { TrackObservation } from '../../core/tracking/CardTracker';
import type { OpenCvCardCandidate } from '../../infrastructure/detection/opencv/detectCardQuadrilaterals';
import { recognizeCardCandidatesWithOrbBatch } from '../../infrastructure/recognition/orb/recognizeCardCandidatesWithOrb';
import { recognizeCardCandidatesWithOrbNow } from '../../infrastructure/recognition/orb/recognizeCardCandidatesWithOrbNow';
import { CameraRecognitionSession } from './CameraRecognitionSession';

vi.mock('../../infrastructure/recognition/orb/recognizeCardCandidatesWithOrbNow', () => ({
  recognizeCardCandidatesWithOrbNow: vi.fn(),
}));

const observation: TrackObservation = {
  corners: [
    { x: 0, y: 0 },
    { x: 63, y: 0 },
    { x: 63, y: 89 },
    { x: 0, y: 89 },
  ],
  recognition: { status: 'recognized', cardId: 'll-001', confidence: 0.8 },
  evaluated: true,
};

describe('CameraRecognitionSession', () => {
  it('keeps the same session and identity during normal active updates', () => {
    const session = new CameraRecognitionSession();
    const id = session.activate();
    const first = session.update(id, [observation]);
    expect(session.activate()).toBe(id);
    expect(session.update(id, [observation])?.[0].trackId).toBe(first?.[0].trackId);
    expect(session.trackCount).toBe(1);
  });

  it('rejects queued detections and errors while paused and after resuming', () => {
    const session = new CameraRecognitionSession();
    const oldId = session.activate();
    session.update(oldId, [observation]);
    session.deactivate();
    expect(session.accepts(oldId)).toBe(false);
    expect(session.update(oldId, [observation])).toBeNull();
    expect(session.trackCount).toBe(0);

    const newId = session.activate();
    expect(newId).not.toBe(oldId);
    expect(session.accepts(oldId)).toBe(false);
    expect(session.update(oldId, [observation])).toBeNull();
    expect(session.trackCount).toBe(0);
    expect(session.update(newId, [observation])?.[0].recognition).toEqual(observation.recognition);
  });

  it('does not reuse a token across screen remounts or repeated stops', () => {
    const previous = new CameraRecognitionSession();
    const oldId = previous.activate();
    previous.deactivate();
    previous.deactivate();
    const remounted = new CameraRecognitionSession();
    expect(remounted.activate()).not.toBe(oldId);
    expect(remounted.accepts(oldId)).toBe(false);
  });

  it('evaluates the first resumed frame instead of reusing the previous scheduler cache', () => {
    const session = new CameraRecognitionSession();
    // Mats are opaque here: only native feature extraction is mocked, not scheduling or tracking.
    const candidates = [
      { detectorCorners: observation.corners, normalizedImage: {} },
    ] as OpenCvCardCandidate[];
    const recognize = vi.mocked(recognizeCardCandidatesWithOrbNow);
    recognize.mockImplementation((items) =>
      items.map((item) => ({
        detectorCorners: item.detectorCorners,
        recognition: observation.recognition,
        evaluated: true,
        diagnostics: {
          bestCardId: 'll-001',
          queryDescriptors: 100,
          bestGoodMatches: 80,
          secondBestGoodMatches: 10,
          goodMatchRatio: 0.8,
          winnerMargin: 70,
          winnerRatio: 8,
        },
      })),
    );
    const oldId = session.activate();
    const first = recognizeCardCandidatesWithOrbBatch(candidates, oldId);
    session.update(oldId, [observation]);
    expect(first.orbCandidates).toBe(1);
    expect(recognizeCardCandidatesWithOrbBatch(candidates, oldId).orbCandidates).toBe(0);

    session.deactivate();
    const newId = session.activate();
    const resumed = recognizeCardCandidatesWithOrbBatch(candidates, newId);
    expect(resumed.orbCandidates).toBe(1);
    const tracked = session.update(
      newId,
      resumed.results.map((result) => ({
        corners: result.detectorCorners,
        recognition: result.recognition,
        evaluated: result.evaluated,
      })),
    );
    expect(tracked?.[0].recognition).toEqual(observation.recognition);
    expect(recognizeCardCandidatesWithOrbBatch(candidates, newId).orbCandidates).toBe(0);
  });
});
