import {
  memo,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Camera,
  type CameraRef,
  useCameraPermission,
  useFrameOutput,
} from 'react-native-vision-camera';
import { useResizer } from 'react-native-vision-camera-resizer';
import { scheduleOnRN } from 'react-native-worklets';

import { type CardDefinition, getCardById } from '../../catalog/cards';
import type {
  CardRecognitionObservation,
  RecognitionDebugInfo,
} from '../../core/vision/CardRecognitionPipeline';
import {
  completeFrameDiagnostics,
  type FrameDiagnostics,
  type FrameProcessingDiagnostics,
} from '../../core/vision/frameDiagnostics';
import type { Quadrilateral, RecognitionResult } from '../../core/vision/types';
import {
  CAMERA_RECOGNITION_HEIGHT,
  CAMERA_RECOGNITION_LABEL,
  CAMERA_RECOGNITION_WIDTH,
  processCameraRecognitionFrame,
} from '../../infrastructure/recognition/cameraRecognitionPipeline';
import { CardModal } from '../card/CardModal';
import { CameraRecognitionSession } from './CameraRecognitionSession';
import { CvDiagnosticsPanel } from './CvDiagnosticsPanel';
import { CvFixtureCaptureControls } from './CvFixtureCaptureControls';
import { compactCvError, mapDetectorPointToPreview, type PreviewSize } from './cameraGeometry';
import { isCvDiagnosticsEnabled } from './cvDiagnostics';
import { isCvFixtureCaptureEnabled } from './cvFixtureCapture';
import { DetectedCardOverlay } from './DetectedCardOverlay';

const CV_FIXTURE_CAPTURE_ENABLED = isCvFixtureCaptureEnabled(
  __DEV__,
  process.env.EXPO_PUBLIC_CV_CAPTURE,
);
const CV_DIAGNOSTICS_ENABLED = isCvDiagnosticsEnabled(
  __DEV__,
  process.env.EXPO_PUBLIC_CV_DIAGNOSTICS,
);

const FRAME_TARGET_RESOLUTION = {
  width: CAMERA_RECOGNITION_WIDTH,
  height: CAMERA_RECOGNITION_HEIGHT,
};

type ViewDetection = {
  readonly trackId: string;
  readonly corners: Quadrilateral;
  readonly recognition: RecognitionResult;
  readonly debug: RecognitionDebugInfo;
  readonly retainedIdentity: boolean;
};

type CvWorkletGlobal = typeof globalThis & {
  __berserkCvProcessedFrames?: number;
};

type CameraFeedProps = {
  readonly cameraRef: RefObject<CameraRef | null>;
  readonly diagnosticsEnabled: boolean;
  readonly sessionId: number | null;
  readonly onDetections: (
    sessionId: number,
    detections: readonly CardRecognitionObservation[],
    diagnostics: FrameProcessingDiagnostics | null,
  ) => void;
  readonly onCvError: (sessionId: number, message: string) => void;
  readonly onCameraError: (sessionId: number, message: string) => void;
};

/**
 * Owns the stable VisionCamera/frame-output lifecycle.
 * Keeping it memoized isolates native camera configuration from overlay state updates.
 */
const CameraFeed = memo(function CameraFeed({
  cameraRef,
  diagnosticsEnabled,
  sessionId,
  onDetections,
  onCvError,
  onCameraError,
}: CameraFeedProps) {
  const { resizer, error: resizerError } = useResizer({
    width: CAMERA_RECOGNITION_WIDTH,
    height: CAMERA_RECOGNITION_HEIGHT,
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
    if (resizerError != null && sessionId !== null) {
      onCvError(sessionId, `RESIZER: ${String(resizerError)}`);
    }
  }, [onCvError, resizerError, sessionId]);

  const frameOutput = useFrameOutput({
    pixelFormat: 'yuv',
    targetResolution: FRAME_TARGET_RESOLUTION,
    enablePreviewSizedOutputBuffers: true,
    enablePhysicalBufferRotation: false,
    dropFramesWhileBusy: true,
    onFrame(frame) {
      'worklet';

      if (resizer == null || sessionId === null) {
        frame.dispose();
        return;
      }

      try {
        try {
          const result = processCameraRecognitionFrame(frame, resizer, sessionId);
          const scope = globalThis as CvWorkletGlobal;
          const frameIndex = (scope.__berserkCvProcessedFrames ?? 0) + 1;
          scope.__berserkCvProcessedFrames = frameIndex;
          const diagnostics: FrameProcessingDiagnostics | null = diagnosticsEnabled
            ? {
                frameIndex,
                detectorMs: result.detectorMs,
                recognizerMs: result.recognizerMs,
                totalMs: result.detectorMs + result.recognizerMs,
                candidates: result.observations.length,
                recognitionChecked: result.evaluatedCandidates,
                recognitionSkipped: result.skippedCandidates,
                sceneReset: result.sceneReset,
              }
            : null;
          scheduleOnRN(onDetections, sessionId, result.observations, diagnostics);
        } catch (error) {
          scheduleOnRN(onCvError, sessionId, compactCvError('PIPELINE', error));
        }
      } finally {
        frame.dispose();
      }
    },
  });

  const outputs = useMemo(() => [frameOutput], [frameOutput]);
  const handleCameraError = useCallback(
    (error: { message: string }) => {
      if (sessionId !== null) onCameraError(sessionId, error.message);
    },
    [onCameraError, sessionId],
  );

  return (
    <Camera
      device="back"
      isActive={sessionId !== null}
      onError={handleCameraError}
      orientationSource="interface"
      outputs={outputs}
      ref={cameraRef}
      resizeMode="cover"
      style={StyleSheet.absoluteFill}
    />
  );
});

/**
 * Main camera experience: requests permission, tracks recognized cards, renders overlays,
 * and opens the selected card while keeping camera lifecycle isolated in CameraFeed.
 */
export function CameraScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const [selectedCard, setSelectedCard] = useState<CardDefinition | null>(null);
  const [detections, setDetections] = useState<ViewDetection[]>([]);
  const [detectorError, setDetectorError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [frameDiagnostics, setFrameDiagnostics] = useState<FrameDiagnostics | null>(null);
  const [previewSize, setPreviewSize] = useState<PreviewSize | null>(null);
  // Preserve every lifecycle event, including a pause/resume batched into one React commit.
  const [appState, setAppState] = useState(() => ({ status: AppState.currentState }));
  const cameraRef = useRef<CameraRef>(null);
  const [session] = useState(() => new CameraRecognitionSession());
  const [sessionId, setSessionId] = useState<number | null>(null);

  const stopSession = useCallback(() => {
    session.deactivate();
    setSessionId(null);
    setDetections([]);
    setFrameDiagnostics(null);
    setCameraError(null);
    setDetectorError(null);
  }, [session]);

  const selectCard = useCallback(
    (card: CardDefinition) => {
      // Invalidate queued callbacks immediately, before React commits the modal.
      stopSession();
      setSelectedCard(card);
    },
    [stopSession],
  );

  useLayoutEffect(() => {
    if (hasPermission && appState.status === 'active' && selectedCard === null) {
      setSessionId(session.activate());
    } else {
      stopSession();
    }
    return () => session.deactivate();
  }, [appState, hasPermission, selectedCard, session, stopSession]);

  useEffect(() => {
    if (!hasPermission) void requestPermission();
  }, [hasPermission, requestPermission]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setAppState({ status: nextState });
      if (nextState !== 'active') {
        stopSession();
      }
    });
    return () => subscription.remove();
  }, [stopSession]);

  const showDetections = useCallback(
    (
      resultSessionId: number,
      cameraDetections: readonly CardRecognitionObservation[],
      processingDiagnostics: FrameProcessingDiagnostics | null,
    ) => {
      if (previewSize === null) return;

      const tracked = session.update(
        resultSessionId,
        cameraDetections.map((detection) => ({
          corners: detection.corners,
          recognition: detection.recognition,
          evaluated: detection.evaluated,
        })),
      );
      if (tracked === null) return;

      const viewDetections = tracked.map((track): ViewDetection => {
        const source = cameraDetections[track.observationIndex];
        return {
          trackId: track.trackId,
          corners: [
            mapDetectorPointToPreview(
              track.corners[0],
              previewSize,
              CAMERA_RECOGNITION_WIDTH,
              CAMERA_RECOGNITION_HEIGHT,
            ),
            mapDetectorPointToPreview(
              track.corners[1],
              previewSize,
              CAMERA_RECOGNITION_WIDTH,
              CAMERA_RECOGNITION_HEIGHT,
            ),
            mapDetectorPointToPreview(
              track.corners[2],
              previewSize,
              CAMERA_RECOGNITION_WIDTH,
              CAMERA_RECOGNITION_HEIGHT,
            ),
            mapDetectorPointToPreview(
              track.corners[3],
              previewSize,
              CAMERA_RECOGNITION_WIDTH,
              CAMERA_RECOGNITION_HEIGHT,
            ),
          ],
          recognition: track.recognition,
          debug: source.debug,
          retainedIdentity: track.retainedIdentity,
        };
      });

      setDetections((current) =>
        current.length === 0 && viewDetections.length === 0 ? current : viewDetections,
      );
      if (processingDiagnostics !== null) {
        const recognized = tracked.filter(
          (track) => track.recognition.status === 'recognized',
        ).length;
        const diagnostics = completeFrameDiagnostics(
          processingDiagnostics,
          recognized,
          session.trackCount,
        );
        setFrameDiagnostics(diagnostics);
        if (diagnostics.frameIndex % 10 === 0) {
          console.log(
            `[BerserkCV] frame=${diagnostics.frameIndex} candidates=${diagnostics.candidates} ` +
              `checked=${diagnostics.recognitionChecked} skipped=${diagnostics.recognitionSkipped} ` +
              `recognized=${diagnostics.recognized} tracker=${diagnostics.trackerCount} ` +
              `sceneReset=${diagnostics.sceneReset} detect=${diagnostics.detectorMs}ms ` +
              `recognizer=${diagnostics.recognizerMs}ms total=${diagnostics.totalMs}ms`,
          );
        }
      }
      setDetectorError(null);
    },
    [previewSize, session],
  );

  const showDetectorError = useCallback(
    (resultSessionId: number, message: string) => {
      if (!session.accepts(resultSessionId)) return;
      setDetectorError((current) => (current === message ? current : message));
      setDetections((current) => (current.length === 0 ? current : []));
    },
    [session],
  );

  const showCameraError = useCallback(
    (resultSessionId: number, message: string) => {
      if (session.accepts(resultSessionId)) setCameraError(message);
    },
    [session],
  );

  const captureFixtureFrame = useCallback(async () => {
    const camera = cameraRef.current;
    if (camera === null) throw new Error('Camera preview is not ready yet.');

    const snapshot = await camera.takeSnapshot();
    try {
      const encoded = await snapshot.toEncodedImageDataAsync('jpg', 100);
      return {
        bytes: new Uint8Array(encoded.buffer),
        width: encoded.width,
        height: encoded.height,
      };
    } finally {
      snapshot.dispose();
    }
  }, []);

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

  const visibleError = detectorError ?? cameraError;
  const recognizedCount = detections.filter(
    (detection) => detection.recognition.status === 'recognized',
  ).length;

  return (
    <View
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setPreviewSize((current) =>
          current?.width === width && current.height === height ? current : { width, height },
        );
      }}
      style={styles.container}
    >
      <CameraFeed
        cameraRef={cameraRef}
        diagnosticsEnabled={CV_DIAGNOSTICS_ENABLED}
        sessionId={sessionId}
        onCameraError={showCameraError}
        onCvError={showDetectorError}
        onDetections={showDetections}
      />

      {CV_FIXTURE_CAPTURE_ENABLED ? (
        <CvFixtureCaptureControls captureFrame={captureFixtureFrame} />
      ) : null}

      {CV_DIAGNOSTICS_ENABLED ? <CvDiagnosticsPanel diagnostics={frameDiagnostics} /> : null}

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
            debug={detection.debug}
            onPress={selectCard}
            retainedIdentity={detection.retainedIdentity}
            trackId={detection.trackId}
          />
        );
      })}

      <View
        pointerEvents="none"
        style={[styles.debugBadge, CV_DIAGNOSTICS_ENABLED && styles.debugBadgeWithPanel]}
      >
        <Text style={styles.debugText}>
          {CAMERA_RECOGNITION_LABEL} · {recognizedCount}/{detections.length}
        </Text>
        <Text style={styles.debugSubtext}>
          CV {CAMERA_RECOGNITION_WIDTH}×{CAMERA_RECOGNITION_HEIGHT} · SINGLE SRC
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
  container: { flex: 1, backgroundColor: '#000000' },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111111',
    paddingHorizontal: 32,
  },
  permissionTitle: { color: '#ffffff', fontSize: 22, fontWeight: '700', textAlign: 'center' },
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
  permissionButtonText: { color: '#111111', fontSize: 15, fontWeight: '700' },
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
  debugText: { color: '#ffffff', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  debugBadgeWithPanel: { top: 146 },
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
  errorText: { color: '#ffffff', fontSize: 11, lineHeight: 15 },
});
