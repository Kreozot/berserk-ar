import {
  type Bounds,
  boundsOf,
  median,
  normalizedCenterDistance,
  sizeSimilarity,
} from '../../../core/vision/geometry';
import type { RecognitionResult } from '../../../core/vision/types';
import type { OpenCvCardCandidate } from '../../detection/opencv/detectCardQuadrilaterals';
import {
  type OrbRecognitionDiagnostics,
  type RecognizedCardCandidate,
  recognizeCardCandidatesWithOrbNow,
} from './recognizeCardCandidatesWithOrbNow';
import {
  isSceneChurned,
  isSceneShifted,
  scoreSchedulerMatch,
  shouldRunOrbForTrack,
} from './schedulerPolicy';

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
  forceOrbFramesRemaining: number;
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
const SCENE_FORCE_ORB_FRAMES = 2;

/** Returns the persistent scheduler state stored inside the frame-output worklet runtime. */
function getState(): SchedulerState {
  'worklet';
  const scope = globalThis as WorkletGlobal;
  const cached = scope.__berserkOrbSchedulerState;
  if (cached != null) return cached;
  const created: SchedulerState = {
    frameIndex: 0,
    nextTrackId: 1,
    tracks: [],
    forceOrbFramesRemaining: 0,
  };
  scope.__berserkOrbSchedulerState = created;
  return created;
}

/** Creates a non-evaluated result so the UI tracker can retain identity without counting a stale vote. */
function skippedResult(
  candidate: OpenCvCardCandidate,
  cached: RecognizedCardCandidate,
): RecognizedCardCandidate {
  'worklet';
  return {
    detectorCorners: candidate.detectorCorners,
    recognition: { status: 'unknown', confidence: 0 } as RecognitionResult,
    diagnostics: cached.diagnostics,
    evaluated: false,
  };
}

/**
 * Runs ORB only for candidates that need a fresh evaluation while preserving candidate order.
 * Stable recognized tracks are rechecked periodically or immediately after geometry/scene changes.
 */
export function recognizeScheduledCardCandidatesWithOrb(
  candidates: readonly OpenCvCardCandidate[],
): ScheduledRecognitionBatch {
  'worklet';
  const state = getState();
  state.frameIndex += 1;

  if (candidates.length === 0) {
    for (const track of state.tracks) track.missedFrames += 1;
    state.tracks = state.tracks.filter((track) => track.missedFrames <= MAX_MISSED_FRAMES);
    return { results: [], orbCandidates: 0 };
  }

  const previousTrackCount = state.tracks.length;
  const candidateBounds = candidates.map((candidate) => boundsOf(candidate.detectorCorners));
  const pairs: PairScore[] = [];
  for (let trackIndex = 0; trackIndex < state.tracks.length; trackIndex += 1) {
    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
      const score = scoreSchedulerMatch(
        state.tracks[trackIndex].bounds,
        candidateBounds[candidateIndex],
      );
      if (score !== null) pairs.push({ trackIndex, candidateIndex, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score);

  const matchedTracks = new Set<number>();
  const matchedCandidates = new Set<number>();
  const candidateToTrack = new Map<number, SchedulerTrack>();
  const acceptedPairs: PairScore[] = [];
  for (const pair of pairs) {
    if (matchedTracks.has(pair.trackIndex) || matchedCandidates.has(pair.candidateIndex)) continue;
    matchedTracks.add(pair.trackIndex);
    matchedCandidates.add(pair.candidateIndex);
    candidateToTrack.set(pair.candidateIndex, state.tracks[pair.trackIndex]);
    acceptedPairs.push(pair);
  }

  const matchedMotion = acceptedPairs.map((pair) =>
    normalizedCenterDistance(
      state.tracks[pair.trackIndex].bounds,
      candidateBounds[pair.candidateIndex],
    ),
  );
  if (
    isSceneShifted(median(matchedMotion), acceptedPairs.length) ||
    isSceneChurned(previousTrackCount, candidates.length, acceptedPairs.length)
  ) {
    state.forceOrbFramesRemaining = SCENE_FORCE_ORB_FRAMES;
  }

  for (let trackIndex = 0; trackIndex < state.tracks.length; trackIndex += 1) {
    if (!matchedTracks.has(trackIndex)) state.tracks[trackIndex].missedFrames += 1;
  }

  const selectedCandidates: OpenCvCardCandidate[] = [];
  const selectedIndexes: number[] = [];
  const tracksForCandidate: SchedulerTrack[] = [];
  const forceOrbAll = state.forceOrbFramesRemaining > 0;

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
    const shouldRunOrb = shouldRunOrbForTrack({
      forceOrbAll,
      cachedRecognized,
      framesSinceLastOrb: state.frameIndex - track.lastOrbFrame,
      recheckIntervalFrames: RECHECK_INTERVAL_FRAMES,
      centerDistance,
      currentSizeSimilarity,
    });

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
        evaluated: false,
      });
    }
  }

  if (state.forceOrbFramesRemaining > 0) state.forceOrbFramesRemaining -= 1;
  state.tracks = state.tracks.filter((track) => track.missedFrames <= MAX_MISSED_FRAMES);
  return { results, orbCandidates: selectedCandidates.length };
}
