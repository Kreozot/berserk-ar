const test = require('node:test');
const assert = require('node:assert/strict');

const { getOverlayLineGeometry } = require('../../../.test-dist/src/features/camera/overlayGeometry.js');

const approx = (actual, expected, epsilon = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
};

test('getOverlayLineGeometry describes horizontal and vertical lines', () => {
  assert.deepEqual(getOverlayLineGeometry({ x: 0, y: 10 }, { x: 10, y: 10 }), {
    left: 0,
    top: 8.5,
    width: 10,
    height: 3,
    angleRad: 0,
  });
  const vertical = getOverlayLineGeometry({ x: 5, y: 0 }, { x: 5, y: 10 });
  assert.equal(vertical.width, 10);
  approx(vertical.angleRad, Math.PI / 2);
});
