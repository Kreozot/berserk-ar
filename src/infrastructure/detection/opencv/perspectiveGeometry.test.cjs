const test = require('node:test');
const assert = require('node:assert/strict');

const { orientShortEdgeAsWidth } = require('../../../../.test-dist/src/infrastructure/detection/opencv/perspectiveGeometry.js');

const quad = (left, top, width, height) => [
  { x: left, y: top },
  { x: left + width, y: top },
  { x: left + width, y: top + height },
  { x: left, y: top + height },
];

test('orientShortEdgeAsWidth preserves portrait cards and rotates landscape assignment', () => {
  const portrait = quad(0, 0, 63, 89);
  assert.deepEqual(orientShortEdgeAsWidth(portrait), portrait);

  const landscape = quad(0, 0, 89, 63);
  assert.deepEqual(orientShortEdgeAsWidth(landscape), [landscape[1], landscape[2], landscape[3], landscape[0]]);
});
