import type { Quadrilateral, RecognitionResult } from '../vision/types';
import { boundsOf, type Bounds } from '../vision/geometry';
import { scoreTrackMatch } from './trackingPolicy';

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
const CONFIDENCE_ALPHA = 0.35;

/**
 * Updates a track's remembered card identity from one recognition observation.
 * Returns true when the previous identity is intentionally retained.
 */
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

/**
 * Maintains stable physical-card tracks and temporal identity across CV frames.
 * It smooths short recognition failures without permanently sticking to stale cards.
 */
export class CardTracker {
  private nextTrackNumber = 1;
  private tracks: TrackState[] = [];

  /** Drops all active tracks, for example after leaving the camera scene. */
  reset(): void {
    this.tracks = [];
  }

  /** Matches observations to existing tracks and returns their stable identities. */
  update(observations: readonly TrackObservation[]): TrackedObservation[] {
    const observationBounds = observations.map((observation) => boundsOf(observation.corners));
    const pairs: PairScore[] = [];

    for (let trackIndex = 0; trackIndex < this.tracks.length; trackIndex += 1) {
      for (let observationIndex = 0; observationIndex < observations.length; observationIndex += 1) {
        const score = scoreTrackMatch(this.tracks[trackIndex].bounds, observationBounds[observationIndex]);
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
