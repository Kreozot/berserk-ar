const test = require('node:test');
const assert = require('node:assert/strict');

const geometry = require('../.test-dist/src/core/vision/geometry.js');
const { scoreTrackMatch } = require('../.test-dist/src/core/tracking/trackingPolicy.js');
const { findById } = require('../.test-dist/src/catalog/catalogLookup.js');
const cameraGeometry = require('../.test-dist/src/features/camera/cameraGeometry.js');
const { getOverlayLineGeometry } = require('../.test-dist/src/features/camera/overlayGeometry.js');
const cardQuad = require('../.test-dist/src/infrastructure/detection/opencv/cardQuadGeometry.js');
const { orientShortEdgeAsWidth } = require('../.test-dist/src/infrastructure/detection/opencv/perspectiveGeometry.js');
const orb = require('../.test-dist/src/infrastructure/recognition/orb/orbScoring.js');
const scheduler = require('../.test-dist/src/infrastructure/recognition/orb/schedulerPolicy.js');

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

test('edgeLengths, aspect, opposite-edge similarity and angle cosine describe rectangles', () => {
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

test('scoreTrackMatch favors nearby matching bounds and rejects distant cards', () => {
  const base = geometry.boundsOf(quad(0, 0, 63, 89));
  const near = geometry.boundsOf(quad(3, 2, 63, 89));
  const far = geometry.boundsOf(quad(1000, 1000, 63, 89));
  assert.ok(scoreTrackMatch(base, near) > 0.5);
  assert.equal(scoreTrackMatch(base, far), null);
});

test('findById returns the matching object and undefined when absent', () => {
  const items = [{ id: 'a', value: 1 }, { id: 'b', value: 2 }];
  assert.equal(findById(items, 'b'), items[1]);
  assert.equal(findById(items, 'missing'), undefined);
});

test('mapDetectorPointToPreview applies 180-degree mapping and cover crop', () => {
  assert.deepEqual(
    cameraGeometry.mapDetectorPointToPreview({ x: 0, y: 0 }, { width: 360, height: 480 }, 360, 480),
    { x: 360, y: 480 }
  );
  const mapped = cameraGeometry.mapDetectorPointToPreview({ x: 180, y: 240 }, { width: 720, height: 1280 }, 360, 480);
  approx(mapped.x, 360);
  approx(mapped.y, 640);
});

test('compactCvError prefixes stage and bounds long messages', () => {
  assert.equal(cameraGeometry.compactCvError('ORB', new Error('boom')).startsWith('ORB: '), true);
  const result = cameraGeometry.compactCvError('CV', 'x'.repeat(1000));
  assert.ok(result.length < 430);
  assert.ok(result.includes('…'));
});

test('getOverlayLineGeometry describes horizontal and vertical lines', () => {
  assert.deepEqual(getOverlayLineGeometry({ x: 0, y: 10 }, { x: 10, y: 10 }), {
    left: 0, top: 8.5, width: 10, height: 3, angleRad: 0,
  });
  const vertical = getOverlayLineGeometry({ x: 5, y: 0 }, { x: 5, y: 10 });
  assert.equal(vertical.width, 10);
  approx(vertical.angleRad, Math.PI / 2);
});

test('card quad stability accepts card-sized rectangles and rejects tiny/invalid shapes', () => {
  assert.equal(cardQuad.isStableCardQuad(quad(0, 0, 63, 89)), true);
  assert.equal(cardQuad.isStableCardQuad(quad(0, 0, 2, 3)), false);
  assert.equal(cardQuad.isStableCardQuad([{ x: NaN, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]), false);
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

test('orientShortEdgeAsWidth preserves portrait cards and rotates landscape assignment', () => {
  const portrait = quad(0, 0, 63, 89);
  assert.deepEqual(orientShortEdgeAsWidth(portrait), portrait);
  const landscape = quad(0, 0, 89, 63);
  assert.deepEqual(orientShortEdgeAsWidth(landscape), [landscape[1], landscape[2], landscape[3], landscape[0]]);
});

test('ORB clamp and dynamic required matches respect bounds', () => {
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
