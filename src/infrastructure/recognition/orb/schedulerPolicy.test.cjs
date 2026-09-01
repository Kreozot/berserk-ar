const test = require('node:test');
const assert = require('node:assert/strict');

const geometry = require('../../../../.test-dist/src/core/vision/geometry.js');
const scheduler = require('../../../../.test-dist/src/infrastructure/recognition/orb/schedulerPolicy.js');

const quad = (left, top, width, height) => [
  { x: left, y: top },
  { x: left + width, y: top },
  { x: left + width, y: top + height },
  { x: left, y: top + height },
];

test('scoreSchedulerMatch keeps plausible tracks and rejects distant replacements', () => {
  const base = geometry.boundsOf(quad(0, 0, 63, 89));
  const near = geometry.boundsOf(quad(5, 4, 63, 89));
  const far = geometry.boundsOf(quad(1000, 0, 63, 89));
  assert.ok(scheduler.scoreSchedulerMatch(base, near) > 0);
  assert.equal(scheduler.scoreSchedulerMatch(base, far), null);
});

test('scene shift and churn policies trigger only with enough evidence', () => {
  assert.equal(scheduler.isSceneShifted(0.2, 2), true);
  assert.equal(scheduler.isSceneShifted(0.2, 1), false);
  assert.equal(scheduler.isSceneShifted(0.1, 4), false);
  assert.equal(scheduler.isSceneChurned(4, 4, 1), true);
  assert.equal(scheduler.isSceneChurned(2, 4, 0), false);
  assert.equal(scheduler.isSceneChurned(4, 4, 3), false);
});

test('shouldRunOrbForTrack covers cache, interval and geometry invalidation', () => {
  const stable = {
    forceOrbAll: false,
    cachedRecognized: true,
    framesSinceLastOrb: 1,
    recheckIntervalFrames: 5,
    centerDistance: 0.05,
    currentSizeSimilarity: 0.95,
  };
  assert.equal(scheduler.shouldRunOrbForTrack(stable), false);
  assert.equal(scheduler.shouldRunOrbForTrack({ ...stable, forceOrbAll: true }), true);
  assert.equal(scheduler.shouldRunOrbForTrack({ ...stable, cachedRecognized: false }), true);
  assert.equal(scheduler.shouldRunOrbForTrack({ ...stable, framesSinceLastOrb: 5 }), true);
  assert.equal(scheduler.shouldRunOrbForTrack({ ...stable, centerDistance: 0.3 }), true);
  assert.equal(scheduler.shouldRunOrbForTrack({ ...stable, currentSizeSimilarity: 0.6 }), true);
});
