import { describe, expect, it } from 'vitest';

import {
  centerCoverCrop,
  detectorPointToFixture,
  detectorQuadToFixture,
  rawPixelsToBgr,
} from './cvFixtureImage';

describe('centerCoverCrop', () => {
  it('crops a tall fixture vertically like the production cover resize', () => {
    expect(centerCoverCrop({ width: 1080, height: 2340 }, { width: 360, height: 480 })).toEqual({
      left: 0,
      top: 450,
      width: 1080,
      height: 1440,
    });
  });

  it('crops a wide fixture horizontally', () => {
    expect(centerCoverCrop({ width: 2000, height: 1000 }, { width: 360, height: 480 })).toEqual({
      left: 625,
      top: 0,
      width: 750,
      height: 1000,
    });
  });

  it('rejects invalid dimensions', () => {
    expect(() => centerCoverCrop({ width: 0, height: 100 }, { width: 360, height: 480 })).toThrow(
      'must be positive',
    );
  });
});

describe('detectorPointToFixture', () => {
  it('maps detector corners back through the cover crop', () => {
    const source = { width: 1080, height: 2340 };
    const detector = { width: 360, height: 480 };
    const crop = centerCoverCrop(source, detector);

    expect(detectorPointToFixture({ x: 0, y: 0 }, detector, source, crop)).toEqual({
      x: 0,
      y: 450 / 2340,
    });
    expect(detectorPointToFixture({ x: 360, y: 480 }, detector, source, crop)).toEqual({
      x: 1,
      y: 1890 / 2340,
    });
  });

  it('maps all four corners of a detector quadrilateral', () => {
    const source = { width: 100, height: 100 };
    const detector = { width: 10, height: 10 };
    const crop = centerCoverCrop(source, detector);

    expect(
      detectorQuadToFixture(
        [
          { x: 1, y: 2 },
          { x: 8, y: 2 },
          { x: 8, y: 9 },
          { x: 1, y: 9 },
        ],
        detector,
        source,
        crop,
      ),
    ).toEqual([
      { x: 0.1, y: 0.2 },
      { x: 0.8, y: 0.2 },
      { x: 0.8, y: 0.9 },
      { x: 0.1, y: 0.9 },
    ]);
  });
});

describe('rawPixelsToBgr', () => {
  it('converts common Android RGBA bytes to BGR', () => {
    expect(rawPixelsToBgr(new Uint8Array([10, 20, 30, 255]), 1, 1, 'RGBA')).toEqual(
      new Uint8Array([30, 20, 10]),
    );
  });

  it('preserves BGR and handles leading alpha', () => {
    expect(rawPixelsToBgr(new Uint8Array([3, 2, 1]), 1, 1, 'BGR')).toEqual(
      new Uint8Array([3, 2, 1]),
    );
    expect(rawPixelsToBgr(new Uint8Array([255, 1, 2, 3]), 1, 1, 'ARGB')).toEqual(
      new Uint8Array([3, 2, 1]),
    );
  });

  it('rejects unsupported formats and malformed buffers', () => {
    expect(() => rawPixelsToBgr(new Uint8Array(4), 1, 1, 'unknown')).toThrow('Unsupported');
    expect(() => rawPixelsToBgr(new Uint8Array(3), 1, 1, 'RGBA')).toThrow('expected 4 bytes');
  });
});
