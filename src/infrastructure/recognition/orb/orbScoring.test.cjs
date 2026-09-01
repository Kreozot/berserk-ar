const test = require('node:test');
const assert = require('node:assert/strict');

const orb = require('../../../../.test-dist/src/infrastructure/recognition/orb/orbScoring.js');

test('clamp01 and requiredGoodMatches respect configured bounds', () => {
  assert.equal(orb.clamp01(-1), 0);
  assert.equal(orb.clamp01(0.4), 0.4);
  assert.equal(orb.clamp01(2), 1);
  assert.equal(orb.requiredGoodMatches(40), 18);
  assert.equal(orb.requiredGoodMatches(200), 24);
  assert.equal(orb.requiredGoodMatches(1000), 28);
});

test('scoreOrbConfidence increases with stronger and better separated matches', () => {
  const weak = orb.scoreOrbConfidence(18, 10, 100);
  const strong = orb.scoreOrbConfidence(50, 8, 150);
  assert.ok(strong > weak);
  assert.ok(strong <= 1 && weak >= 0);
});

test('passesOrbRecognitionThresholds requires every threshold', () => {
  assert.equal(orb.passesOrbRecognitionThresholds(30, 10, 100), true);
  assert.equal(orb.passesOrbRecognitionThresholds(17, 1, 100), false);
  assert.equal(orb.passesOrbRecognitionThresholds(20, 14, 100), false);
  assert.equal(orb.passesOrbRecognitionThresholds(20, 12, 200), false);
});
