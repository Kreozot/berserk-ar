export type Point = {
  x: number;
  y: number;
};

export type Quadrilateral = readonly [Point, Point, Point, Point];

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
