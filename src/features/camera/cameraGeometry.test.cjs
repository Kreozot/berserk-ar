const test = require('node:test');
const assert = require('node:assert/strict');

const cameraGeometry = require('../../../.test-dist/src/features/camera/cameraGeometry.js');

const approx = (actual, expected, epsilon = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
};

test('mapDetectorPointToPreview applies 180-degree mapping and cover crop', () => {
  assert.deepEqual(
    cameraGeometry.mapDetectorPointToPreview({ x: 0, y: 0 }, { width: 360, height: 480 }, 360, 480),
    { x: 360, y: 480 }
  );
  const mapped = cameraGeometry.mapDetectorPointToPreview(
    { x: 180, y: 240 },
    { width: 720, height: 1280 },
    360,
    480
  );
  approx(mapped.x, 360);
  approx(mapped.y, 640);
});

test('compactCvError prefixes stage and bounds long messages', () => {
  assert.equal(cameraGeometry.compactCvError('ORB', new Error('boom')).startsWith('ORB: '), true);
  const result = cameraGeometry.compactCvError('CV', 'x'.repeat(1000));
  assert.ok(result.length < 430);
  assert.ok(result.includes('…'));
});
