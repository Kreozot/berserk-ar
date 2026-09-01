const test = require('node:test');
const assert = require('node:assert/strict');

const { CardTracker } = require('../../../.test-dist/src/core/tracking/CardTracker.js');

const quad = (left, top, width = 63, height = 89) => [
  { x: left, y: top },
  { x: left + width, y: top },
  { x: left + width, y: top + height },
  { x: left, y: top + height },
];

const recognized = (cardId, confidence = 0.8, evaluated = true, corners = quad(0, 0)) => ({
  corners,
  recognition: { status: 'recognized', cardId, confidence },
  evaluated,
});

const unknown = (confidence = 0, evaluated = true, corners = quad(0, 0)) => ({
  corners,
  recognition: { status: 'unknown', confidence },
  evaluated,
});

test('assigns a stable track id while a card moves slightly', () => {
  const tracker = new CardTracker();
  const first = tracker.update([recognized('ll-001')])[0];
  const moved = tracker.update([recognized('ll-001', 0.7, true, quad(5, 3))])[0];
  assert.equal(moved.trackId, first.trackId);
  assert.equal(moved.recognition.status, 'recognized');
  assert.equal(moved.recognition.cardId, 'll-001');
});

test('retains identity across scheduled non-evaluated frames without UNKNOWN votes', () => {
  const tracker = new CardTracker();
  tracker.update([recognized('ll-001')]);
  const skipped = tracker.update([unknown(0, false)])[0];
  assert.equal(skipped.recognition.status, 'recognized');
  assert.equal(skipped.recognition.cardId, 'll-001');
  assert.equal(skipped.retainedIdentity, true);

  tracker.update([recognized('ll-002', 0.8)]);
  tracker.update([unknown(0, false)]);
  const switchResult = tracker.update([recognized('ll-002', 0.8)])[0];
  assert.equal(switchResult.recognition.status, 'recognized');
  assert.equal(switchResult.recognition.cardId, 'll-002');
});

test('requires two confident challenger confirmations before changing identity', () => {
  const tracker = new CardTracker();
  tracker.update([recognized('ll-001', 0.8)]);
  const firstChallenge = tracker.update([recognized('ll-002', 0.8)])[0];
  assert.equal(firstChallenge.recognition.cardId, 'll-001');
  assert.equal(firstChallenge.retainedIdentity, true);

  const confirmed = tracker.update([recognized('ll-002', 0.8)])[0];
  assert.equal(confirmed.recognition.cardId, 'll-002');
  assert.equal(confirmed.retainedIdentity, false);
});

test('does not switch to a low-confidence challenger', () => {
  const tracker = new CardTracker();
  tracker.update([recognized('ll-001', 0.8)]);
  for (let index = 0; index < 3; index += 1) {
    const result = tracker.update([recognized('ll-002', 0.2)])[0];
    assert.equal(result.recognition.cardId, 'll-001');
  }
});

test('keeps identity through eight evaluated UNKNOWN frames and drops it on the ninth', () => {
  const tracker = new CardTracker();
  tracker.update([recognized('ll-001', 0.8)]);
  for (let index = 0; index < 8; index += 1) {
    const result = tracker.update([unknown()])[0];
    assert.equal(result.recognition.status, 'recognized');
    assert.equal(result.recognition.cardId, 'll-001');
  }
  const dropped = tracker.update([unknown()])[0];
  assert.equal(dropped.recognition.status, 'unknown');
});

test('reset forgets prior physical tracks', () => {
  const tracker = new CardTracker();
  const before = tracker.update([recognized('ll-001')])[0];
  tracker.reset();
  const after = tracker.update([recognized('ll-001')])[0];
  assert.notEqual(after.trackId, before.trackId);
});

test('removes a missing track after its TTL so a returning card gets a new track id', () => {
  const tracker = new CardTracker();
  const before = tracker.update([recognized('ll-001')])[0];
  for (let index = 0; index < 9; index += 1) tracker.update([]);
  const after = tracker.update([recognized('ll-001')])[0];
  assert.notEqual(after.trackId, before.trackId);
});

test('tracks two nearby physical cards independently', () => {
  const tracker = new CardTracker();
  const first = tracker.update([
    recognized('ll-001', 0.8, true, quad(0, 0)),
    recognized('ll-002', 0.8, true, quad(80, 0)),
  ]);
  const second = tracker.update([
    recognized('ll-001', 0.8, true, quad(3, 2)),
    recognized('ll-002', 0.8, true, quad(83, 2)),
  ]);
  assert.equal(second[0].trackId, first[0].trackId);
  assert.equal(second[1].trackId, first[1].trackId);
  assert.notEqual(second[0].trackId, second[1].trackId);
});
