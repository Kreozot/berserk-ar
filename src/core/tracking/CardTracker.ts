import type { Quadrilateral, RecognitionResult } from '../vision/types';

export type TrackObservation = {
  readonly corners: Quadrilateral;
  readonly recognition: RecognitionResult;
  readonly evaluated: boolean;
};

export type TrackedObservation = {
  readonly trackId: string;
  readonly observationIndex: number;
  readonly corners: Quadrilateral;
  readonly recognition: RecognitionResult;
  readonly retainedIdentity: boolean;
};

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

type TrackState = {
  readonly trackId: string;
  corners: Quadrilateral;
  bounds: Bounds;
  missedFrames: number;
  unknownStreak: number;
  cardId: string | null;
  confidence: number;
  challengerCardId: string | null;
  challengerStreak: number;
};

type PairScore = {
  readonly trackIndex: number;
  readonly observationIndex: number;
  readonly score: number;
};

const MAX_MISSED_FRAMES = 8;
const MAX_UNKNOWN_STREAK = 8;
const CHALLENGER_CONFIRMATIONS = 2;
const MIN_SWITCH_CONFIDENCE = 0.28;
const MIN_IOU = 0.02;
const MAX_NORMALIZED_CENTER_DISTANCE = 1.35;
const CONFIDENCE_ALPHA = 0.35;

function boundsOf(corners: Quadrilateral): Bounds {
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);
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
  const dx = a.centerX - b.centerX;
  const dy = a.centerY - b.centerY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return distance / Math.max((a.diagonal + b.diagonal) / 2, 1);
}

function sizeSimilarity(a: Bounds, b: Bounds): number {
  const widthRatio = Math.min(a.width, b.width) / Math.max(a.width, b.width);
  const heightRatio = Math.min(a.height, b.height) / Math.max(a.height, b.height);
  return (widthRatio + heightRatio) / 2;
}

function matchScore(track: TrackState, observationBounds: Bounds): number | null {
  const iou = intersectionOverUnion(track.bounds, observationBounds);
  const centerDistance = normalizedCenterDistance(track.bounds, observationBounds);
  if (iou < MIN_IOU && centerDistance > MAX_NORMALIZED_CENTER_DISTANCE) {
    return null;
  }

  const centerScore = Math.max(0, 1 - centerDistance / MAX_NORMALIZED_CENTER_DISTANCE);
  const shapeScore = sizeSimilarity(track.bounds, observationBounds);
  return iou * 0.5 + centerScore * 0.35 + shapeScore * 0.15;
}

function updateIdentity(
  track: TrackState,
  recognition: RecognitionResult,
  evaluated: boolean
): boolean {
  if (!evaluated) {
    return track.cardId !== null;
  }

  if (recognition.status === 'unknown') {
    track.unknownStreak += 1;
    track.challengerCardId = null;
    track.challengerStreak = 0;
    if (track.cardId !== null && track.unknownStreak <= MAX_UNKNOWN_STREAK) {
      track.confidence *= 0.97;
      return true;
    }
    track.cardId = null;
    track.confidence = recognition.confidence;
    return false;
  }

  track.unknownStreak = 0;
  if (track.cardId === null) {
    track.cardId = recognition.cardId;
    track.confidence = recognition.confidence;
    track.challengerCardId = null;
    track.challengerStreak = 0;
    return false;
  }

  if (track.cardId === recognition.cardId) {
    track.confidence =
      track.confidence * (1 - CONFIDENCE_ALPHA) + recognition.confidence * CONFIDENCE_ALPHA;
    track.challengerCardId = null;
    track.challengerStreak = 0;
    return false;
  }

  if (recognition.confidence < MIN_SWITCH_CONFIDENCE) {
    track.confidence *= 0.98;
    return true;
  }

  if (track.challengerCardId === recognition.cardId) {
    track.challengerStreak += 1;
  } else {
    track.challengerCardId = recognition.cardId;
    track.challengerStreak = 1;
  }

  if (track.challengerStreak >= CHALLENGER_CONFIRMATIONS) {
    track.cardId = recognition.cardId;
    track.confidence = recognition.confidence;
    track.challengerCardId = null;
    track.challengerStreak = 0;
    return false;
  }

  track.confidence *= 0.98;
  return true;
}

export class CardTracker {
  private nextTrackNumber = 1;
  private tracks: TrackState[] = [];

  reset(): void {
    this.tracks = [];
  }

  update(observations: readonly TrackObservation[]): TrackedObservation[] {
    const observationBounds = observations.map((observation) => boundsOf(observation.corners));
    const pairs: PairScore[] = [];

    for (let trackIndex = 0; trackIndex < this.tracks.length; trackIndex += 1) {
      for (let observationIndex = 0; observationIndex < observations.length; observationIndex += 1) {
        const score = matchScore(this.tracks[trackIndex], observationBounds[observationIndex]);
        if (score !== null) {
          pairs.push({ trackIndex, observationIndex, score });
        }
      }
    }

    pairs.sort((a, b) => b.score - a.score);
    const matchedTracks = new Set<number>();
    const matchedObservations = new Set<number>();
    const observationToTrack = new Map<number, TrackState>();

    for (const pair of pairs) {
      if (matchedTracks.has(pair.trackIndex) || matchedObservations.has(pair.observationIndex)) {
        continue;
      }
      matchedTracks.add(pair.trackIndex);
      matchedObservations.add(pair.observationIndex);
      observationToTrack.set(pair.observationIndex, this.tracks[pair.trackIndex]);
    }

    for (let trackIndex = 0; trackIndex < this.tracks.length; trackIndex += 1) {
      if (!matchedTracks.has(trackIndex)) {
        this.tracks[trackIndex].missedFrames += 1;
      }
    }

    const result: TrackedObservation[] = [];
    for (let observationIndex = 0; observationIndex < observations.length; observationIndex += 1) {
      const observation = observations[observationIndex];
      let track = observationToTrack.get(observationIndex);
      if (track === undefined) {
        track = {
          trackId: `track-${this.nextTrackNumber++}`,
          corners: observation.corners,
          bounds: observationBounds[observationIndex],
          missedFrames: 0,
          unknownStreak: 0,
          cardId: null,
          confidence: 0,
          challengerCardId: null,
          challengerStreak: 0,
        };
        this.tracks.push(track);
      }

      track.corners = observation.corners;
      track.bounds = observationBounds[observationIndex];
      track.missedFrames = 0;
      const retainedIdentity = updateIdentity(track, observation.recognition, observation.evaluated);

      const recognition: RecognitionResult =
        track.cardId === null
          ? observation.recognition.status === 'unknown'
            ? observation.recognition
            : { status: 'unknown', confidence: observation.recognition.confidence }
          : { status: 'recognized', cardId: track.cardId, confidence: track.confidence };

      result.push({
        trackId: track.trackId,
        observationIndex,
        corners: observation.corners,
        recognition,
        retainedIdentity,
      });
    }

    this.tracks = this.tracks.filter((track) => track.missedFrames <= MAX_MISSED_FRAMES);
    return result;
  }
}
