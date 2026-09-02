import type { Point } from '../../core/vision/types';

export type PreviewSize = {
  readonly width: number;
  readonly height: number;
};

/** Maps detector-space coordinates into the cropped/rotated camera preview. */
export function mapDetectorPointToPreview(
  point: Point,
  preview: PreviewSize,
  detectorWidth: number,
  detectorHeight: number,
): Point {
  'worklet';
  const rotatedPoint = {
    x: detectorWidth - point.x,
    y: detectorHeight - point.y,
  };

  const scale = Math.max(preview.width / detectorWidth, preview.height / detectorHeight);
  const scaledWidth = detectorWidth * scale;
  const scaledHeight = detectorHeight * scale;
  const cropX = (scaledWidth - preview.width) / 2;
  const cropY = (scaledHeight - preview.height) / 2;

  return {
    x: rotatedPoint.x * scale - cropX,
    y: rotatedPoint.y * scale - cropY,
  };
}

/** Produces a compact, bounded error string suitable for the on-screen CV badge. */
export function compactCvError(stage: string, error: unknown): string {
  'worklet';
  const text = String(error);
  const tail = text.length > 420 ? `…${text.slice(-420)}` : text;
  return `${stage}: ${tail}`;
}
