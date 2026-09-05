import { Directory, File, Paths } from 'expo-file-system';
import { LineTypes, Mat, OpenCV, Point, Scalar } from 'react-native-fast-opencv';
import { loadImage } from 'react-native-nitro-image';

import {
  DETECTOR_HEIGHT,
  DETECTOR_WIDTH,
  detectNormalizedCardCandidatesFromBgr,
} from '../infrastructure/detection/opencv/detectCardQuadrilaterals';
import { recognizeCardCandidatesWithOrbNow } from '../infrastructure/recognition/orb/recognizeCardCandidatesWithOrbNow';
import type { CvFixtureAsset } from './cvFixtureAssets';
import { centerCoverCrop, detectorQuadToFixture, rawPixelsToBgr } from './cvFixtureImage';
import { cvFixtureRegressionOptions } from './cvFixtureManifest';
import {
  type CvRegressionObservation,
  type CvRegressionResult,
  evaluateCvRegression,
} from './cvRegression';

export type CvFixtureRunResult = {
  readonly fixtureName: string;
  readonly category: string;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly detectorMs: number;
  readonly orbMs: number;
  readonly diagnosticUri: string | null;
  readonly observations: readonly CvRegressionObservation[];
  readonly evaluation: CvRegressionResult;
};

const DETECTOR_SIZE = { width: DETECTOR_WIDTH, height: DETECTOR_HEIGHT } as const;

function drawNormalizedQuad(
  image: Mat,
  corners: CvRegressionObservation['corners'],
  width: number,
  height: number,
  color: Scalar,
): void {
  for (let index = 0; index < corners.length; index += 1) {
    const startCorner = corners[index];
    const endCorner = corners[(index + 1) % corners.length];
    const start = Point.create(startCorner.x * width, startCorner.y * height);
    const end = Point.create(endCorner.x * width, endCorner.y * height);
    try {
      OpenCV.line(image, start, end, color, 7, LineTypes.LINE_AA);
    } finally {
      end.release();
      start.release();
    }
  }
}

function saveDiagnosticImage(
  fixture: CvFixtureAsset,
  sourceImage: Awaited<ReturnType<typeof loadImage>>,
  observations: readonly CvRegressionObservation[],
): string {
  const raw = sourceImage.toRawPixelData();
  const bgrBytes = rawPixelsToBgr(
    new Uint8Array(raw.buffer),
    raw.width,
    raw.height,
    raw.pixelFormat,
  );
  const image = Mat.createFromBuffer('uint8', raw.height, raw.width, 3, bgrBytes);
  const expectedColor = Scalar.create(0, 220, 0, 255);
  const observedColor = Scalar.create(0, 0, 255, 255);
  try {
    for (const expectation of fixture.manifest.expectations) {
      drawNormalizedQuad(image, expectation.corners, raw.width, raw.height, expectedColor);
    }
    for (const observation of observations) {
      drawNormalizedQuad(image, observation.corners, raw.width, raw.height, observedColor);
    }

    const directory = new Directory(Paths.document, 'cv-regression', 'diagnostics');
    directory.create({ idempotent: true, intermediates: true });
    const output = new File(directory, `${fixture.name}.jpg`);
    image.saveToFile(output.uri, 'jpeg', 0.92);
    return output.uri;
  } finally {
    observedColor.release();
    expectedColor.release();
    image.release();
  }
}

/** Runs one real JPEG through the same BGR detector and immediate ORB recognizer as live frames. */
export async function runCvFixture(fixture: CvFixtureAsset): Promise<CvFixtureRunResult> {
  const sourceImage = await Promise.resolve(loadImage({ resource: fixture.resourceName }));
  const source = { width: sourceImage.width, height: sourceImage.height };
  const crop = centerCoverCrop(source, DETECTOR_SIZE);
  const croppedImage = sourceImage.crop(
    crop.left,
    crop.top,
    crop.left + crop.width,
    crop.top + crop.height,
  );
  const detectorImage = croppedImage.resize(DETECTOR_WIDTH, DETECTOR_HEIGHT);
  const raw = detectorImage.toRawPixelData();
  const bgrBytes = rawPixelsToBgr(
    new Uint8Array(raw.buffer),
    raw.width,
    raw.height,
    raw.pixelFormat,
  );
  const bgr = Mat.createFromBuffer('uint8', DETECTOR_HEIGHT, DETECTOR_WIDTH, 3, bgrBytes);

  let candidates: ReturnType<typeof detectNormalizedCardCandidatesFromBgr> = [];
  try {
    const detectorStartedAt = Date.now();
    candidates = detectNormalizedCardCandidatesFromBgr(bgr);
    const detectorFinishedAt = Date.now();
    const recognized = recognizeCardCandidatesWithOrbNow(candidates);
    const orbFinishedAt = Date.now();
    const observations = recognized.map(
      (candidate): CvRegressionObservation => ({
        cardId: candidate.recognition.status === 'recognized' ? candidate.recognition.cardId : null,
        corners: detectorQuadToFixture(candidate.detectorCorners, DETECTOR_SIZE, source, crop),
      }),
    );
    const evaluation = evaluateCvRegression(
      fixture.manifest.expectations,
      observations,
      cvFixtureRegressionOptions(fixture.manifest),
    );

    return {
      fixtureName: fixture.name,
      category: fixture.manifest.category,
      sourceWidth: source.width,
      sourceHeight: source.height,
      detectorMs: detectorFinishedAt - detectorStartedAt,
      orbMs: orbFinishedAt - detectorFinishedAt,
      diagnosticUri: evaluation.passed
        ? null
        : saveDiagnosticImage(fixture, sourceImage, observations),
      observations,
      evaluation,
    };
  } finally {
    for (const candidate of candidates) candidate.normalizedImage.release();
    bgr.release();
    detectorImage.dispose();
    croppedImage.dispose();
    sourceImage.dispose();
  }
}
