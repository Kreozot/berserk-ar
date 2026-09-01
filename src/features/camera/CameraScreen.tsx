import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View, type AppStateStatus } from 'react-native';
import { Camera, useCameraPermission, useFrameOutput } from 'react-native-vision-camera';
import { useResizer } from 'react-native-vision-camera-resizer';
import { scheduleOnRN } from 'react-native-worklets';

import { getCardById, type CardDefinition } from '../../catalog/cards';
import { CardTracker } from '../../core/tracking/CardTracker';
import type { Point, Quadrilateral, RecognitionResult } from '../../core/vision/types';
import {
  DETECTOR_HEIGHT,
  DETECTOR_WIDTH,
  detectNormalizedCardCandidates,
} from '../../infrastructure/detection/opencv/detectCardQuadrilaterals';
import {
  getOrbRuntimeCacheInitCount,
  recognizeCardCandidatesWithOrb,
  type OrbRecognitionDiagnostics,
  type RecognizedCardCandidate,
} from '../../infrastructure/recognition/orb/recognizeCardCandidatesWithOrb';
import { CardModal } from '../card/CardModal';
import { DetectedCardOverlay } from './DetectedCardOverlay';

type ViewDetection = {
  readonly trackId: string;
  readonly corners: Quadrilateral;
  readonly recognition: RecognitionResult;
  readonly diagnostics: OrbRecognitionDiagnostics;
  readonly retainedIdentity: boolean;
};

type PreviewSize = {
  readonly width: number;
  readonly height: number;
};

type CvWorkletGlobal = typeof globalThis & {
  __berserkCvProcessedFrames?: number;
};

type CvStatsLogger = (
  frameIndex: number,
  candidates: number,
  recognized: number,
  detectMs: number,
  orbMs: number,
  totalMs: number,
  cacheInitCount: number
) => void;

type CameraFeedProps = {
  readonly isActive: boolean;
  readonly onDetections: (detections: RecognizedCardCandidate[]) => void;
  readonly onCvError: (message: string) => void;
  readonly onCameraError: (message: string) => void;
  readonly onCvStats: CvStatsLogger;
};

function mapDetectorPointToPreview(point: Point, preview: PreviewSize): Point {
  const rotatedPoint = {
    x: DETECTOR_WIDTH - point.x,
    y: DETECTOR_HEIGHT - point.y,
  };

  const scale = Math.max(preview.width / DETECTOR_WIDTH, preview.height / DETECTOR_HEIGHT);
  const scaledWidth = DETECTOR_WIDTH * scale;
  const scaledHeight = DETECTOR_HEIGHT * scale;
  const cropX = (scaledWidth - preview.width) / 2;
  const cropY = (scaledHeight - preview.height) / 2;

  return {
    x: rotatedPoint.x * scale - cropX,
    y: rotatedPoint.y * scale - cropY,
  };
}

function compactCvError(stage: string, error: unknown): string {
  'worklet';

  const text = String(error);
  const tail = text.length > 420 ? `…${text.slice(-420)}` : text;
  return `${stage}: ${tail}`;
}

const CameraFeed = memo(function CameraFeed({
  isActive,
  onDetections,
  onCvError,
  onCameraError,
  onCvStats,
}: CameraFeedProps) {
  const { resizer, error: resizerError } = useResizer({
    width: DETECTOR_WIDTH,
    height: DETECTOR_HEIGHT,
    channelOrder: 'bgr',
    dataType: 'uint8',
    pixelLayout: 'interleaved',
    scaleMode: 'cover',
  });

  useEffect(() => {
    console.log('[BerserkCamera] mount');
    return () => console.log('[BerserkCamera] unmount');
  }, []);

  useEffect(() => {
    if (resizerError != null) {
      onCvError(`RESIZER: ${String(resizerError)}`);
    }
  }, [onCvError, resizerError]);

  const frameOutput = useFrameOutput({
    pixelFormat: 'yuv',
    targetResolution: { width: DETECTOR_WIDTH, height: DETECTOR_HEIGHT },
    enablePreviewSizedOutputBuffers: true,
    enablePhysicalBufferRotation: false,
    dropFramesWhileBusy: true,
    onFrame(frame) {
      'worklet';

      if (resizer == null) {
        frame.dispose();
        return;
      }

      const startedAt = Date.now();
      let candidates: ReturnType<typeof detectNormalizedCardCandidates> = [];
      let frameDisposed = false;
      try {
        try {
          candidates = detectNormalizedCardCandidates(frame, resizer);
        } catch (error) {
          scheduleOnRN(onCvError, compactCvError('DETECT/WARP', error));
          return;
        }

        const afterDetect = Date.now();
        frame.dispose();
        frameDisposed = true;

        try {
          const recognized = recognizeCardCandidatesWithOrb(candidates);
          const finishedAt = Date.now();
          scheduleOnRN(onDetections, recognized);

          const scope = globalThis as CvWorkletGlobal;
          const frameIndex = (scope.__berserkCvProcessedFrames ?? 0) + 1;
          scope.__berserkCvProcessedFrames = frameIndex;
          if (frameIndex % 10 === 0) {
            const recognizedCount = recognized.filter(
              (candidate) => candidate.recognition.status === 'recognized'
            ).length;
            scheduleOnRN(
              onCvStats,
              frameIndex,
              candidates.length,
              recognizedCount,
              afterDetect - startedAt,
              finishedAt - afterDetect,
              finishedAt - startedAt,
              getOrbRuntimeCacheInitCount()
            );
          }
        } catch (error) {
          scheduleOnRN(onCvError, compactCvError('ORB', error));
        }
      } finally {
        for (const candidate of candidates) {
          candidate.normalizedImage.release();
        }
        if (!frameDisposed) {
          frame.dispose();
        }
      }
    },
  });

  const outputs = useMemo(() => [frameOutput], [frameOutput]);
  const handleCameraError = useCallback(
    (error: { message: string }) => onCameraError(error.message),
    [onCameraError]
  );

  return (
    <Camera
      device="back"
      isActive={isActive}
      onError={handleCameraError}
      orientationSource="interface"
      outputs={outputs}
      resizeMode="cover"
      style={StyleSheet.absoluteFill}
    />
  );
});

export function CameraScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const [selectedCard, setSelectedCard] = useState<CardDefinition | null>(null);
  const [detections, setDetections] = useState<ViewDetection[]>([]);
  const [detectorError, setDetectorError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [previewSize, setPreviewSize] = useState<PreviewSize | null>(null);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const trackerRef = useRef<CardTracker | null>(null);
  if (trackerRef.current === null) {
    trackerRef.current = new CardTracker();
  }

  useEffect(() => {
    if (!hasPermission) {
      void requestPermission();
    }
  }, [hasPermission, requestPermission]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setAppState(nextState);
      if (nextState !== 'active') {
        trackerRef.current?.reset();
        setDetections([]);
        setCameraError(null);
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (selectedCard !== null) {
      trackerRef.current?.reset();
      setDetections([]);
    }
  }, [selectedCard]);

  const showDetections = useCallback(
    (cameraDetections: RecognizedCardCandidate[]) => {
      if (previewSize === null || trackerRef.current === null) {
        return;
      }

      const tracked = trackerRef.current.update(
        cameraDetections.map((detection) => ({
          corners: detection.detectorCorners,
          recognition: detection.recognition,
        }))
      );

      const viewDetections = tracked.map((track): ViewDetection => {
        const source = cameraDetections[track.observationIndex];
        return {
          trackId: track.trackId,
          corners: [
            mapDetectorPointToPreview(track.corners[0], previewSize),
            mapDetectorPointToPreview(track.corners[1], previewSize),
            mapDetectorPointToPreview(track.corners[2], previewSize),
            mapDetectorPointToPreview(track.corners[3], previewSize),
          ],
          recognition: track.recognition,
          diagnostics: source.diagnostics,
          retainedIdentity: track.retainedIdentity,
        };
      });

      setDetections((current) =>
        current.length === 0 && viewDetections.length === 0 ? current : viewDetections
      );
      setDetectorError(null);
    },
    [previewSize]
  );

  const showDetectorError = useCallback((message: string) => {
    setDetectorError((current) => (current === message ? current : message));
    setDetections((current) => (current.length === 0 ? current : []));
  }, []);

  const showCameraError = useCallback(
    (message: string) => {
      if (appState === 'active') {
        setCameraError(message);
      }
    },
    [appState]
  );

  const logCvStats = useCallback<CvStatsLogger>(
    (frameIndex, candidates, recognized, detectMs, orbMs, totalMs, cacheInitCount) => {
      console.log(
        `[BerserkCV] frame=${frameIndex} candidates=${candidates} recognized=${recognized} ` +
          `detect=${detectMs}ms orb=${orbMs}ms total=${totalMs}ms cacheInit=${cacheInitCount}`
      );
    },
    []
  );

  if (!hasPermission) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionTitle}>Нужен доступ к камере</Text>
        <Text style={styles.permissionText}>
          Камера используется только для поиска и распознавания карт перед телефоном.
        </Text>
        <Pressable onPress={() => void requestPermission()} style={styles.permissionButton}>
          <Text style={styles.permissionButtonText}>Разрешить камеру</Text>
        </Pressable>
      </View>
    );
  }

  const isCameraActive = appState === 'active' && selectedCard === null;
  const visibleError = detectorError ?? cameraError;
  const recognizedCount = detections.filter(
    (detection) => detection.recognition.status === 'recognized'
  ).length;

  return (
    <View
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setPreviewSize((current) =>
          current?.width === width && current.height === height ? current : { width, height }
        );
      }}
      style={styles.container}
    >
      <CameraFeed
        isActive={isCameraActive}
        onCameraError={showCameraError}
        onCvError={showDetectorError}
        onCvStats={logCvStats}
        onDetections={showDetections}
      />

      {detections.map((detection) => {
        const card =
          detection.recognition.status === 'recognized'
            ? (getCardById(detection.recognition.cardId) ?? null)
            : null;

        return (
          <DetectedCardOverlay
            key={detection.trackId}
            card={card}
            confidence={detection.recognition.confidence}
            corners={detection.corners}
            diagnostics={detection.diagnostics}
            onPress={setSelectedCard}
            retainedIdentity={detection.retainedIdentity}
            trackId={detection.trackId}
          />
        );
      })}

      <View pointerEvents="none" style={styles.debugBadge}>
        <Text style={styles.debugText}>
          OPENCV + ORB + TRACK · {recognizedCount}/{detections.length}
        </Text>
        <Text style={styles.debugSubtext}>
          CV {DETECTOR_WIDTH}×{DETECTOR_HEIGHT} · SINGLE SRC
        </Text>
      </View>

      {visibleError ? (
        <View pointerEvents="none" style={styles.errorBadge}>
          <Text numberOfLines={5} style={styles.errorText}>
            CV ERROR: {visibleError}
          </Text>
        </View>
      ) : null}

      <CardModal card={selectedCard} onClose={() => setSelectedCard(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111111',
    paddingHorizontal: 32,
  },
  permissionTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  permissionText: {
    marginTop: 12,
    color: '#bbbbbb',
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  permissionButton: {
    marginTop: 24,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  permissionButtonText: {
    color: '#111111',
    fontSize: 15,
    fontWeight: '700',
  },
  debugBadge: {
    position: 'absolute',
    top: 48,
    alignSelf: 'center',
    alignItems: 'center',
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  debugText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  debugSubtext: {
    marginTop: 3,
    color: '#cccccc',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.7,
  },
  errorBadge: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(120,0,0,0.82)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  errorText: {
    color: '#ffffff',
    fontSize: 11,
    lineHeight: 15,
  },
});
