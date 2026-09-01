const test = require('node:test');
const assert = require('node:assert/strict');

const geometry = require('../../../.test-dist/src/core/vision/geometry.js');
const { scoreTrackMatch } = require('../../../.test-dist/src/core/tracking/trackingPolicy.js');

const quad = (left, top, width, height) => [
  { x: left, y: top },
  { x: left + width, y: top },
  { x: left + width, y: top + height },
  { x: left, y: top + height },
];

test('scoreTrackMatch favors nearby matching bounds and rejects distant cards', () => {
  const base = geometry.boundsOf(quad(0, 0, 63, 89));
  const near = geometry.boundsOf(quad(3, 2, 63, 89));
  const far = geometry.boundsOf(quad(1000, 1000, 63, 89));
  assert.ok(scoreTrackMatch(base, near) > 0.5);
  assert.equal(scoreTrackMatch(base, far), null);
});
