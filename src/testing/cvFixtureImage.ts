import type { Point, Quadrilateral } from '../core/vision/types';

export type ImageSize = {
  readonly width: number;
  readonly height: number;
};

export type ImageCrop = ImageSize & {
  readonly left: number;
  readonly top: number;
};

export type SupportedPixelFormat =
  | 'ARGB'
  | 'BGRA'
  | 'ABGR'
  | 'RGBA'
  | 'XRGB'
  | 'BGRX'
  | 'XBGR'
  | 'RGBX'
  | 'RGB'
  | 'BGR';

/** Returns the centered source crop consumed by a `cover` resize into the detector dimensions. */
export function centerCoverCrop(source: ImageSize, target: ImageSize): ImageCrop {
  if (source.width <= 0 || source.height <= 0 || target.width <= 0 || target.height <= 0) {
    throw new Error('Source and target image dimensions must be positive.');
  }

  const sourceAspect = source.width / source.height;
  const targetAspect = target.width / target.height;
  if (sourceAspect > targetAspect) {
    const width = source.height * targetAspect;
    return { left: (source.width - width) / 2, top: 0, width, height: source.height };
  }

  const height = source.width / targetAspect;
  return { left: 0, top: (source.height - height) / 2, width: source.width, height };
}

/** Maps one detector-space point back into full-source normalized fixture coordinates. */
export function detectorPointToFixture(
  point: Point,
  detector: ImageSize,
  source: ImageSize,
  crop: ImageCrop,
): Point {
  return {
    x: (crop.left + (point.x / detector.width) * crop.width) / source.width,
    y: (crop.top + (point.y / detector.height) * crop.height) / source.height,
  };
}

/** Maps a detector quadrilateral into the normalized coordinate system used by expected.json. */
export function detectorQuadToFixture(
  corners: Quadrilateral,
  detector: ImageSize,
  source: ImageSize,
  crop: ImageCrop,
): Quadrilateral {
  return corners.map((point) => detectorPointToFixture(point, detector, source, crop)) as [
    Point,
    Point,
    Point,
    Point,
  ];
}

/** Converts the raw formats emitted by Nitro Image into the BGR bytes used by production OpenCV. */
export function rawPixelsToBgr(
  bytes: Uint8Array,
  width: number,
  height: number,
  pixelFormat: string,
): Uint8Array {
  if (
    !['ARGB', 'BGRA', 'ABGR', 'RGBA', 'XRGB', 'BGRX', 'XBGR', 'RGBX', 'RGB', 'BGR'].includes(
      pixelFormat,
    )
  ) {
    throw new Error(`Unsupported fixture pixel format: ${pixelFormat}`);
  }

  const format = pixelFormat as SupportedPixelFormat;
  const channels = format.length;
  const pixelCount = width * height;
  if (bytes.length !== pixelCount * channels) {
    throw new Error(
      `Invalid ${format} fixture buffer: expected ${pixelCount * channels} bytes, received ${bytes.length}.`,
    );
  }

  const redIndex = format.indexOf('R');
  const greenIndex = format.indexOf('G');
  const blueIndex = format.indexOf('B');
  const bgr = new Uint8Array(pixelCount * 3);
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const sourceOffset = pixel * channels;
    const targetOffset = pixel * 3;
    bgr[targetOffset] = bytes[sourceOffset + blueIndex];
    bgr[targetOffset + 1] = bytes[sourceOffset + greenIndex];
    bgr[targetOffset + 2] = bytes[sourceOffset + redIndex];
  }
  return bgr;
}
