export type Point = {
  x: number;
  y: number;
};

export type Quadrilateral = readonly [Point, Point, Point, Point];

/**
 * Opaque image/frame references owned by an adapter. Keeping native OpenCV /
 * VisionCamera types out of the core makes implementations replaceable.
 */
export type CameraFrame = {
  readonly handle: unknown;
  readonly width: number;
  readonly height: number;
  readonly timestampMs: number;
};

export type NormalizedCardImage = {
  readonly handle: unknown;
  readonly width: number;
  readonly height: number;
};

export type DetectedCard = {
  readonly detectionId: string;
  readonly corners: Quadrilateral;
  readonly normalizedImage: NormalizedCardImage;
};

export type CardReference = {
  readonly id: string;
  readonly nameRu: string;
  readonly imagePath: string;
};

export type RecognitionResult =
  | {
      readonly status: 'recognized';
      readonly cardId: string;
      readonly confidence: number;
    }
  | {
      readonly status: 'unknown';
      readonly confidence: number;
    };
