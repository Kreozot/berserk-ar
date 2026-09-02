# CV regression fixtures

This directory is the source of truth for real camera scenes used to catch detector and recognizer regressions.

## Why this exists

Pure unit tests protect geometry, scheduling, tracking, and scoring rules, but they cannot answer questions such as:

- did a detector threshold change stop finding cards on a crowded board?
- did a change create a new false-positive rectangle?
- did ORB start confusing two visually similar cards?
- did glare or perspective make a previously stable scene regress?

Golden fixtures let us preserve those real-world cases as repeatable checks.

## Directory layout

Add each scene as its own folder:

```text
fixtures/cv/
  single-card-front/
    frame.jpg
    expected.json
  crowded-board-01/
    frame.jpg
    expected.json
  glare-01/
    frame.jpg
    expected.json
```

Do not add synthetic photographs as substitutes for physical validation. A fixture should come from a real camera frame that reproduced useful behavior on-device.

## `expected.json`

Corners use image-normalized coordinates, where `(0, 0)` is the top-left and `(1, 1)` is the bottom-right. This keeps expectations stable if the stored image is resized later.

```json
{
  "schemaVersion": 1,
  "category": "four-cards",
  "description": "Four cards on a table, moderate perspective",
  "minIou": 0.5,
  "requireIdentity": true,
  "expectations": [
    {
      "label": "left-card",
      "cardId": "ll-003",
      "corners": [
        { "x": 0.12, "y": 0.18 },
        { "x": 0.31, "y": 0.2 },
        { "x": 0.3, "y": 0.53 },
        { "x": 0.11, "y": 0.51 }
      ]
    }
  ]
}
```

Use `cardId: null` when the fixture is intentionally detector-only: the physical card rectangle must be found, but recognition may remain `UNKNOWN`.

`schemaVersion` is currently `1`. `category` must be one of `single-card`, `four-cards`, `crowded-board`, `perspective`, `glare`, `partial-overlap`, or `false-positives`. A false-positive scene may use an empty `expectations` array when no physical card should be detected.

Every fixture directory must contain exactly named `frame.jpg` and `expected.json` files. Expectation labels must be unique within the scene, corners must contain four finite points inside `0..1`, and optional `minIou` / `requireIdentity` values override the evaluator defaults. The unit suite validates every fixture directory automatically, so malformed annotations or missing frames fail before the fixture can enter the regression corpus.

## Matching policy

`src/testing/cvRegression.ts` compares expected and observed cards using one-to-one highest-IoU matching. The default minimum IoU is `0.5`.

A full detector+recognizer fixture fails on:

- an expected card that was not detected;
- an unexpected detected rectangle;
- a geometrically matched card with the wrong identity.

Detector-only runs can set `requireIdentity: false` while still reporting identity mismatches for diagnostics.

## Fixture categories to collect first

1. one clean card;
2. four cards with small gaps;
3. a crowded game board;
4. strong perspective near the frame edge;
5. glare/reflections;
6. partial occlusion or overlapping cards;
7. non-card rectangular objects that must not become detections;
8. camera pan between two different groups of cards.

The next integration step is an offline/on-device adapter that feeds each stored frame through the production detector/ORB pipeline and converts its output to `CvRegressionObservation[]`. The evaluator itself is intentionally pure and already CI-testable.
