const test = require('node:test');
const assert = require('node:assert/strict');

const cardQuad = require('../../../../.test-dist/src/infrastructure/detection/opencv/cardQuadGeometry.js');

const quad = (left, top, width, height) => [
  { x: left, y: top },
  { x: left + width, y: top },
  { x: left + width, y: top + height },
  { x: left, y: top + height },
];

const approx = (actual, expected, epsilon = 1e-9) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
};

test('card quad stability accepts card-sized rectangles and rejects tiny/invalid shapes', () => {
  assert.equal(cardQuad.isStableCardQuad(quad(0, 0, 63, 89)), true);
  assert.equal(cardQuad.isStableCardQuad(quad(0, 0, 2, 3)), false);
  assert.equal(
    cardQuad.isStableCardQuad([{ x: NaN, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]),
    false
  );
});

test('summarizeCardQuad reports ideal rectangle metrics', () => {
  const summary = cardQuad.summarizeCardQuad(quad(0, 0, 63, 89));
  approx(summary.cardAspect, 63 / 89);
  assert.equal(summary.edgeSimilarity, 1);
  approx(summary.angleCosine, 0);
});

test('scoreCardShape rewards card aspect, fill, parallel edges and right angles', () => {
  const ideal = cardQuad.scoreCardShape(63 / 89, 63 / 89, 1, 1, 0);
  const poor = cardQuad.scoreCardShape(0.5, 63 / 89, 0.72, 0.5, 0.78);
  assert.ok(ideal > poor);
  approx(ideal, 1);
});

test('overlapsAcceptedQuad detects near duplicate centers but keeps adjacent cards distinct', () => {
  const accepted = [{ centerX: 50, centerY: 50, width: 60, height: 90 }];
  assert.equal(cardQuad.overlapsAcceptedQuad({ centerX: 52, centerY: 52, width: 60, height: 90 }, accepted), true);
  assert.equal(cardQuad.overlapsAcceptedQuad({ centerX: 120, centerY: 50, width: 60, height: 90 }, accepted), false);
});

test('asQuadrilateral validates tuple size and preserves point order', () => {
  const points = quad(0, 0, 10, 20);
  assert.deepEqual(cardQuad.asQuadrilateral(points), points);
  assert.throws(() => cardQuad.asQuadrilateral(points.slice(0, 3)), /Expected 4/);
});
