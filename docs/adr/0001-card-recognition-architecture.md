# ADR 0001: Replaceable card-recognition architecture

Status: Accepted

## Context

For the first Berserk AR prototype we need to recognize a small, controlled set of 19 cards from «Легенды Лаара» in a live camera feed.

The fastest reasonable approach for this dataset is classical computer vision rather than a trained ML model:

1. detect card-shaped quadrilaterals;
2. rectify perspective;
3. extract local visual features;
4. identify a card by ORB feature matching against reference images.

However, the recognition strategy is likely to change once the catalog grows to hundreds or thousands of cards. Possible future implementations include learned image embeddings, an object detector + retrieval pipeline, or another native CV backend.

Therefore the application must not depend directly on ORB/OpenCV outside the recognition adapter.

## Decision

Use **React Native + VisionCamera + OpenCV + ORB** for the first prototype, behind explicit application interfaces.

### Layers

```text
UI / Camera screen
        |
        v
CardRecognitionPipeline interface
        |
        +----------------------+
        |                      |
        v                      v
OpenCvOrbFramePipeline  Future pipeline
(OpenCV + ORB)          (embeddings / ML / etc.)
```

Card detection is also separated from card identification:

```text
Camera frame
    |
    v
detectNormalizedCardCandidates
    -> quadrilateral(s)
    |
    v
PerspectiveNormalizer
    -> normalized card image(s)
    |
    v
recognizeCardCandidatesWithOrbBatch
    -> cardId + confidence
```

These are private stages of `OpenCvOrbFramePipeline`; they can evolve independently without
becoming application contracts.

## Public contracts

### CardRecognitionPipeline

The camera integration invokes one synchronous worklet-compatible processor:

```ts
type CardRecognitionPipeline<TFrame, TFrameAdapter> = (
  frame: TFrame,
  frameAdapter: TFrameAdapter,
  sessionId: number,
) => CardRecognitionFrameResult;
```

The result must support an explicit unknown state. The UI must never infer a card simply because one candidate happens to score highest.

```ts
type RecognitionResult =
  | {
      status: 'recognized';
      cardId: string;
      confidence: number;
    }
  | {
      status: 'unknown';
      confidence: number;
    };
```

`CardRecognitionFrameResult` contains plain observations, timings and scheduler counts. It contains
no native handles. Detection and identification remain separate inside the adapter, where their
intermediate images can be owned and released safely.

## First implementation

### Camera
- `react-native-vision-camera`
- frame processor / native processing path

### Detection
- OpenCV contour detection
- quadrilateral filtering by geometry/aspect ratio
- perspective transform to a normalized portrait image

### Identification
- ORB keypoints + descriptors generated for each reference image
- descriptor matching against the 19 reference cards
- geometric validation of matches where useful
- confidence threshold below which result is `unknown`

### UI overlay
The UI consumes only detection/recognition results and is unaware of OpenCV or ORB.

The first overlay can be implemented with regular React Native views. If profiling later shows that this is insufficiently smooth, rendering can move to Skia without changing the recognition contracts.

## Replaceability rules

1. No OpenCV types or intermediate image handles may cross the adapter boundary into application/UI code.
2. No ORB-specific score type may be exposed as the public result; adapters normalize identity to `confidence` and optional diagnostics to plain display text.
3. Catalog entries use stable project card IDs, not OpenCV descriptor IDs or array indexes.
4. Reference preprocessing/caching belongs inside the recognizer implementation.
5. The recognizer must return `unknown` when confidence is below its own configured threshold.
6. Detection and identification remain separate concerns.
7. Camera acquisition remains separate from recognition; recorded images/test fixtures must be usable without a live camera.

## Expected migration to embeddings

A future implementation should be possible by adding, for example:

```text
src/infrastructure/recognition/EmbeddingFramePipeline
```

implementing the same `CardRecognitionPipeline` contract and changing only
`cameraRecognitionPipeline.ts` dependency wiring:

```ts
const processFrame: CardRecognitionPipeline<Frame, ModelRunner> = processEmbeddingFrame;
```

No camera screen, card detail screen, overlay component, or catalog format should need to change.

## Consequences

### Positive
- fastest path to validating the idea with 19 cards;
- no custom ML training required;
- easy to benchmark locally;
- recognition algorithm can be swapped later;
- detection and recognition can evolve independently;
- computer-vision dependencies stay outside UI code.

### Negative
- more abstraction than a throwaway prototype needs;
- ORB may degrade with glare, blur, severe perspective distortion, partial occlusion, or visually similar cards;
- an ML/embedding implementation may eventually outperform it as the catalog grows.

## Validation criterion

We keep ORB only if the physical-card test set shows acceptable recognition accuracy and latency. The architecture deliberately treats ORB as the first adapter, not as a permanent product constraint.
