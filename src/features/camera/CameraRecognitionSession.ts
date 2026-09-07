import { CardTracker, type TrackObservation } from '../../core/tracking/CardTracker';

let nextSessionId = 1;

/** Owns temporal identity and rejects callbacks from stopped or superseded camera sessions. */
export class CameraRecognitionSession {
  private sessionId: number | null = null;
  private readonly tracker = new CardTracker();

  activate(): number {
    if (this.sessionId === null) this.sessionId = nextSessionId++;
    return this.sessionId;
  }

  deactivate(): void {
    this.sessionId = null;
    this.tracker.reset();
  }

  accepts(sessionId: number): boolean {
    return this.sessionId === sessionId;
  }

  get trackCount(): number {
    return this.tracker.trackCount;
  }

  update(sessionId: number, observations: readonly TrackObservation[]) {
    if (!this.accepts(sessionId)) return null;
    return this.tracker.update(observations);
  }
}
