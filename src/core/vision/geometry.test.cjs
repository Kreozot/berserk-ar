const test = require('node:test');
const assert = require('node:assert/strict');

const geometry = require('../../../.test-dist/src/core/vision/geometry.js');

const quad = (left, top, width, height) => [
  { x: left, y: top },
  { x: left + width, y: top },
  { x: left + width, y: top + height },
  { x: left, y: top + height },
];

const approx = (actual, expected, epsilon = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
};

test('pointDistance returns Euclidean distance', () => {
  assert.equal(geometry.pointDistance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});

test('orderClockwise validates count and starts at top-left-ish point', () => {
  assert.throws(() => geometry.orderClockwise([{ x: 0, y: 0 }]), /exactly 4/);
  assert.deepEqual(
    geometry.orderClockwise([{ x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 0 }]),
    quad(0, 0, 10, 10)
  );
});

test('polygonArea handles either winding direction', () => {
  assert.equal(geometry.polygonArea(quad(0, 0, 10, 20)), 200);
  assert.equal(geometry.polygonArea([...quad(0, 0, 10, 20)].reverse()), 200);
});

test('isConvexQuadrilateral rejects collinear and concave quads', () => {
  assert.equal(geometry.isConvexQuadrilateral(quad(0, 0, 10, 20)), true);
  assert.equal(geometry.isConvexQuadrilateral([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 10 }]), false);
  assert.equal(geometry.isConvexQuadrilateral([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }]), false);
});

test('edge lengths, aspect, opposite-edge similarity and angle cosine describe rectangles', () => {
  const rect = quad(0, 0, 63, 89);
  assert.deepEqual(geometry.edgeLengths(rect), [63, 89, 63, 89]);
  approx(geometry.quadrilateralAspect(rect), 63 / 89);
  assert.equal(geometry.oppositeEdgeSimilarity(rect), 1);
  approx(geometry.maxAdjacentEdgeCosine(rect), 0);
});

test('boundsOf derives box, center and diagonal', () => {
  const bounds = geometry.boundsOf(quad(10, 20, 30, 40));
  assert.deepEqual(
    { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom, width: bounds.width, height: bounds.height, centerX: bounds.centerX, centerY: bounds.centerY },
    { left: 10, top: 20, right: 40, bottom: 60, width: 30, height: 40, centerX: 25, centerY: 40 }
  );
  assert.equal(bounds.diagonal, 50);
});

test('intersectionOverUnion handles identical, partial and separate bounds', () => {
  const a = geometry.boundsOf(quad(0, 0, 10, 10));
  const same = geometry.boundsOf(quad(0, 0, 10, 10));
  const half = geometry.boundsOf(quad(5, 0, 10, 10));
  const far = geometry.boundsOf(quad(100, 100, 10, 10));
  assert.equal(geometry.intersectionOverUnion(a, same), 1);
  approx(geometry.intersectionOverUnion(a, half), 1 / 3);
  assert.equal(geometry.intersectionOverUnion(a, far), 0);
});

test('normalizedCenterDistance and sizeSimilarity are normalized and symmetric', () => {
  const a = geometry.boundsOf(quad(0, 0, 10, 10));
  const b = geometry.boundsOf(quad(10, 0, 10, 10));
  const c = geometry.boundsOf(quad(0, 0, 20, 10));
  approx(geometry.normalizedCenterDistance(a, b), geometry.normalizedCenterDistance(b, a));
  assert.equal(geometry.normalizedCenterDistance(a, a), 0);
  assert.equal(geometry.sizeSimilarity(a, a), 1);
  assert.equal(geometry.sizeSimilarity(a, c), 0.75);
});

test('median supports empty, odd and even lists without mutating input', () => {
  const values = [9, 1, 5, 3];
  assert.equal(geometry.median([]), 0);
  assert.equal(geometry.median([9, 1, 5]), 5);
  assert.equal(geometry.median(values), 4);
  assert.deepEqual(values, [9, 1, 5, 3]);
});
