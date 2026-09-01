import type { Quadrilateral, RecognitionResult } from '../../../core/vision/types';
import type { OpenCvCardCandidate } from '../../detection/opencv/detectCardQuadrilaterals';
import {
  recognizeCardCandidatesWithOrbNow,
  type OrbRecognitionDiagnostics,
  type RecognizedCardCandidate,
} from './recognizeCardCandidatesWithOrbNow';

type Bounds = {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly diagonal: number;
};

type SchedulerTrack = {
  readonly trackId: number;
  bounds: Bounds;
  missedFrames: number;
  lastOrbFrame: number;
  cached: RecognizedCardCandidate | null;
};

type SchedulerState = {
  frameIndex: number;
  nextTrackId: number;
  tracks: SchedulerTrack[];
};

type PairScore = {
  readonly trackIndex: number;
  readonly candidateIndex: number;
  readonly score: number;
};

type WorkletGlobal = typeof globalThis & {
  __berserkOrbSchedulerState?: SchedulerState;
};

export type ScheduledRecognitionBatch = {
  readonly results: RecognizedCardCandidate[];
  readonly orbCandidates: number;
};

const RECHECK_INTERVAL_FRAMES = 5;
const MAX_MISSED_FRAMES = 4;
const MIN_IOU = 0.02;
const MAX_NORMALIZED_CENTER_DISTANCE = 1.2;
const FORCE_RECHECK_CENTER_DISTANCE = 0.32;
const FORCE_RECHECK_SIZE_SIMILARITY = 0.72;

function boundsOf(corners: Quadrilateral): Bounds {
  'worklet';
  let left = corners[0].x;
  let right = corners[0].x;
  let top = corners[0].y;
  let bottom = corners[0].y;
  for (let index = 1; index < corners.length; index += 1) {
    const point = corners[index];
    left = Math.min(left, point.x);
    right = Math.max(right, point.x);
    top = Math.min(top, point.y);
    bottom = Math.max(bottom, point.y);
  }
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  return {
    left,
    top,
    right,
    bottom,
    width,
    height,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
    diagonal: Math.sqrt(width * width + height * height),
  };
}

function intersectionOverUnion(a: Bounds, b: Bounds): number {
  'worklet';
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  const intersection = width * height;
  const union = a.width * a.height + b.width * b.height - intersection;
  return union <= 0 ? 0 : intersection / union;
}

function normalizedCenterDistance(a: Bounds, b: Bounds): number {
  'worklet';
  const dx = a.centerX - b.centerX;
  const dy = a.centerY - b.centerY;
  return Math.sqrt(dx * dx + dy * dy) / Math.max((a.diagonal + b.diagonal) / 2, 1);
}

function sizeSimilarity(a: Bounds, b: Bounds): number {
  'worklet';
  const widthRatio = Math.min(a.width, b.width) / Math.max(a.width, b.width);
  const heightRatio = Math.min(a.height, b.height) / Math.max(a.height, b.height);
  return (widthRatio + heightRatio) / 2;
}

function matchScore(trackBounds: Bounds, candidateBounds: Bounds): number | null {
  'worklet';
  const iou = intersectionOverUnion(trackBounds, candidateBounds);
  const centerDistance = normalizedCenterDistance(trackBounds, candidateBounds);
  if (iou < MIN_IOU && centerDistance > MAX_NORMALIZED_CENTER_DISTANCE) return null;
  const centerScore = Math.max(0, 1 - centerDistance / MAX_NORMALIZED_CENTER_DISTANCE);
  const shapeScore = sizeSimilarity(trackBounds, candidateBounds);
  return iou * 0.5 + centerScore * 0.35 + shapeScore * 0.15;
}

function getState(): SchedulerState {
  'worklet';
  const scope = globalThis as WorkletGlobal;
  const cached = scope.__berserkOrbSchedulerState;
  if (cached != null) return cached;
  const created: SchedulerState = { frameIndex: 0, nextTrackId: 1, tracks: [] };
  scope.__berserkOrbSchedulerState = created;
  return created;
}

function skippedResult(
  candidate: OpenCvCardCandidate,
  cached: RecognizedCardCandidate
): RecognizedCardCandidate {
  'worklet';
  return {
    detectorCorners: candidate.detectorCorners,
    recognition: { status: 'unknown', confidence: 0 } as RecognitionResult,
    diagnostics: cached.diagnostics,
  };
}

export function recognizeScheduledCardCandidatesWithOrb(
  candidates: readonly OpenCvCardCandidate[]
): ScheduledRecognitionBatch {
  'worklet';
  const state = getState();
  state.frameIndex += 1;

  if (candidates.length === 0) {
    for (const track of state.tracks) track.missedFrames += 1;
    state.tracks = state.tracks.filter((track) => track.missedFrames <= MAX_MISSED_FRAMES);
    return { results: [], orbCandidates: 0 };
  }

  const candidateBounds = candidates.map((candidate) => boundsOf(candidate.detectorCorners));
  const pairs: PairScore[] = [];
  for (let trackIndex = 0; trackIndex < state.tracks.length; trackIndex += 1) {
    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
      const score = matchScore(state.tracks[trackIndex].bounds, candidateBounds[candidateIndex]);
      if (score !== null) pairs.push({ trackIndex, candidateIndex, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score);

  const matchedTracks = new Set<number>();
  const matchedCandidates = new Set<number>();
  const candidateToTrack = new Map<number, SchedulerTrack>();
  for (const pair of pairs) {
    if (matchedTracks.has(pair.trackIndex) || matchedCandidates.has(pair.candidateIndex)) continue;
    matchedTracks.add(pair.trackIndex);
    matchedCandidates.add(pair.candidateIndex);
    candidateToTrack.set(pair.candidateIndex, state.tracks[pair.trackIndex]);
  }

  for (let trackIndex = 0; trackIndex < state.tracks.length; trackIndex += 1) {
    if (!matchedTracks.has(trackIndex)) state.tracks[trackIndex].missedFrames += 1;
  }

  const selectedCandidates: OpenCvCardCandidate[] = [];
  const selectedIndexes: number[] = [];
  const tracksForCandidate: SchedulerTrack[] = [];

  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
    const currentBounds = candidateBounds[candidateIndex];
    let track = candidateToTrack.get(candidateIndex);
    if (track === undefined) {
      track = {
        trackId: state.nextTrackId++,
        bounds: currentBounds,
        missedFrames: 0,
        lastOrbFrame: 0,
        cached: null,
      };
      state.tracks.push(track);
    }

    const centerDistance = normalizedCenterDistance(track.bounds, currentBounds);
    const currentSizeSimilarity = sizeSimilarity(track.bounds, currentBounds);
    const cachedRecognized = track.cached?.recognition.status === 'recognized';
    const dueForRecheck = state.frameIndex - track.lastOrbFrame >= RECHECK_INTERVAL_FRAMES;
    const geometryChanged =
      centerDistance >= FORCE_RECHECK_CENTER_DISTANCE ||
      currentSizeSimilarity <= FORCE_RECHECK_SIZE_SIMILARITY;
    const shouldRunOrb = !cachedRecognized || dueForRecheck || geometryChanged;

    track.bounds = currentBounds;
    track.missedFrames = 0;
    tracksForCandidate[candidateIndex] = track;
    if (shouldRunOrb) {
      selectedIndexes.push(candidateIndex);
      selectedCandidates.push(candidates[candidateIndex]);
    }
  }

  const actualResults = recognizeCardCandidatesWithOrbNow(selectedCandidates);
  const actualByCandidate = new Map<number, RecognizedCardCandidate>();
  for (let selectedIndex = 0; selectedIndex < selectedIndexes.length; selectedIndex += 1) {
    actualByCandidate.set(selectedIndexes[selectedIndex], actualResults[selectedIndex]);
  }

  const results: RecognizedCardCandidate[] = [];
  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
    const track = tracksForCandidate[candidateIndex];
    const actual = actualByCandidate.get(candidateIndex);
    if (actual != null) {
      track.cached = actual;
      track.lastOrbFrame = state.frameIndex;
      results.push(actual);
    } else if (track.cached != null) {
      results.push(skippedResult(candidates[candidateIndex], track.cached));
    } else {
      results.push({
        detectorCorners: candidates[candidateIndex].detectorCorners,
        recognition: { status: 'unknown', confidence: 0 },
        diagnostics: {
          bestCardId: null,
          queryDescriptors: 0,
          bestGoodMatches: 0,
          secondBestGoodMatches: 0,
          goodMatchRatio: 0,
          winnerMargin: 0,
          winnerRatio: 0,
        } as OrbRecognitionDiagnostics,
      });
    }
  }

  state.tracks = state.tracks.filter((track) => track.missedFrames <= MAX_MISSED_FRAMES);
  return { results, orbCandidates: selectedCandidates.length };
}
