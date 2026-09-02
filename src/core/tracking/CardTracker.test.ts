import { describe, expect, it } from 'vitest';

import type { Quadrilateral } from '../vision/types';
import { CardTracker, type TrackObservation } from './CardTracker';

/** Builds an axis-aligned card quadrilateral for tracker scenarios. */
function quad(left: number, top: number, width = 63, height = 89): Quadrilateral {
  return [
    { x: left, y: top },
    { x: left + width, y: top },
    { x: left + width, y: top + height },
    { x: left, y: top + height },
  ];
}

/** Builds a recognized tracker observation with concise defaults. */
function recognized(
  cardId: string,
  confidence = 0.8,
  evaluated = true,
  corners = quad(0, 0),
): TrackObservation {
  return {
    corners,
    recognition: { status: 'recognized', cardId, confidence },
    evaluated,
  };
}

/** Builds an unknown tracker observation with concise defaults. */
function unknown(confidence = 0, evaluated = true, corners = quad(0, 0)): TrackObservation {
  return {
    corners,
    recognition: { status: 'unknown', confidence },
    evaluated,
  };
}

describe('CardTracker', () => {
  it('keeps a stable track id while a card moves slightly', () => {
    const tracker = new CardTracker();
    const first = tracker.update([recognized('ll-001')])[0];
    const moved = tracker.update([recognized('ll-001', 0.7, true, quad(5, 3))])[0];

    expect(moved.trackId).toBe(first.trackId);
    expect(moved.recognition).toMatchObject({ status: 'recognized', cardId: 'll-001' });
  });

  it('retains identity across scheduled non-evaluated frames without UNKNOWN votes', () => {
    const tracker = new CardTracker();
    tracker.update([recognized('ll-001')]);

    const skipped = tracker.update([unknown(0, false)])[0];
    expect(skipped.recognition).toMatchObject({ status: 'recognized', cardId: 'll-001' });
    expect(skipped.retainedIdentity).toBe(true);

    tracker.update([recognized('ll-002', 0.8)]);
    tracker.update([unknown(0, false)]);
    const switched = tracker.update([recognized('ll-002', 0.8)])[0];
    expect(switched.recognition).toMatchObject({ status: 'recognized', cardId: 'll-002' });
  });

  it('requires two confident challenger confirmations before changing identity', () => {
    const tracker = new CardTracker();
    tracker.update([recognized('ll-001', 0.8)]);

    const firstChallenge = tracker.update([recognized('ll-002', 0.8)])[0];
    expect(firstChallenge.recognition).toMatchObject({ status: 'recognized', cardId: 'll-001' });
    expect(firstChallenge.retainedIdentity).toBe(true);

    const confirmed = tracker.update([recognized('ll-002', 0.8)])[0];
    expect(confirmed.recognition).toMatchObject({ status: 'recognized', cardId: 'll-002' });
    expect(confirmed.retainedIdentity).toBe(false);
  });

  it('does not switch to a low-confidence challenger', () => {
    const tracker = new CardTracker();
    tracker.update([recognized('ll-001', 0.8)]);

    for (let index = 0; index < 3; index += 1) {
      expect(tracker.update([recognized('ll-002', 0.2)])[0].recognition).toMatchObject({
        status: 'recognized',
        cardId: 'll-001',
      });
    }
  });

  it('keeps identity through eight evaluated UNKNOWN frames and drops it on the ninth', () => {
    const tracker = new CardTracker();
    tracker.update([recognized('ll-001', 0.8)]);

    for (let index = 0; index < 8; index += 1) {
      expect(tracker.update([unknown()])[0].recognition).toMatchObject({
        status: 'recognized',
        cardId: 'll-001',
      });
    }

    expect(tracker.update([unknown()])[0].recognition.status).toBe('unknown');
  });

  it('reset forgets prior physical tracks', () => {
    const tracker = new CardTracker();
    const before = tracker.update([recognized('ll-001')])[0];
    tracker.reset();
    const after = tracker.update([recognized('ll-001')])[0];
    expect(after.trackId).not.toBe(before.trackId);
  });

  it('removes a missing track after its TTL', () => {
    const tracker = new CardTracker();
    const before = tracker.update([recognized('ll-001')])[0];
    for (let index = 0; index < 9; index += 1) tracker.update([]);
    const after = tracker.update([recognized('ll-001')])[0];
    expect(after.trackId).not.toBe(before.trackId);
  });

  it('tracks two nearby physical cards independently', () => {
    const tracker = new CardTracker();
    const first = tracker.update([
      recognized('ll-001', 0.8, true, quad(0, 0)),
      recognized('ll-002', 0.8, true, quad(80, 0)),
    ]);
    const second = tracker.update([
      recognized('ll-001', 0.8, true, quad(3, 2)),
      recognized('ll-002', 0.8, true, quad(83, 2)),
    ]);

    expect(second[0].trackId).toBe(first[0].trackId);
    expect(second[1].trackId).toBe(first[1].trackId);
    expect(second[0].trackId).not.toBe(second[1].trackId);
  });
});
