import type { Point } from '../../core/vision/types';

export type OverlayLineGeometry = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly angleRad: number;
};

/** Computes the absolute-positioned rectangle and angle used to draw one overlay edge. */
export function getOverlayLineGeometry(start: Point, end: Point): OverlayLineGeometry {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angleRad = Math.atan2(dy, dx);
  const centerX = (start.x + end.x) / 2;
  const centerY = (start.y + end.y) / 2;
  return {
    left: centerX - length / 2,
    top: centerY - 1.5,
    width: length,
    height: 3,
    angleRad,
  };
}
