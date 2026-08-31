import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View, type AppStateStatus } from 'react-native';
import { Camera, useCameraPermission, useFrameOutput } from 'react-native-vision-camera';
import { useResizer } from 'react-native-vision-camera-resizer';
import { scheduleOnRN } from 'react-native-worklets';

import { getCardById, type CardDefinition } from '../../catalog/cards';
import type { Point, Quadrilateral, RecognitionResult } from '../../core/vision/types';
import {
  DETECTOR_HEIGHT,
  DETECTOR_WIDTH,
  RECOGNITION_HEIGHT,
  RECOGNITION_WIDTH,
  detectNormalizedCardCandidates,
} from '../../infrastructure/detection/opencv/detectCardQuadrilaterals';
import {
  recognizeCardCandidatesWithOrb,
  type OrbRecognitionDiagnostics,
  type RecognizedCardCandidate,
} from '../../infrastructure/recognition/orb/recognizeCardCandidatesWithOrb';
import { CardModal } from '../card/CardModal';
import { DetectedCardOverlay } from './DetectedCardOverlay';

type ViewDetection = {
  readonly corners: Quadrilateral;
  readonly recognition: RecognitionResult;
  readonly diagnostics: OrbRecognitionDiagnostics;
};

type PreviewSize = {
  readonly width: number;
  readonly height: number;
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

export function CameraScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const [selectedCard, setSelectedCard] = useState<CardDefinition | null>(null);
  const [detections, setDetections] = useState<ViewDetection[]>([]);
  const [detectorError, setDetectorError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [previewSize, setPreviewSize] = useState<PreviewSize | null>(null);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);

  const { resizer: detectorResizer, error: detectorResizerError } = useResizer({
    width: DETECTOR_WIDTH,
    height: DETECTOR_HEIGHT,
    channelOrder: 'bgr',
    dataType: 'uint8',
    pixelLayout: 'interleaved',
    scaleMode: 'cover',
  });
  const { resizer: recognitionResizer, error: recognitionResizerError } = useResizer({
    width: RECOGNITION_WIDTH,
    height: RECOGNITION_HEIGHT,
    channelOrder: 'bgr',
    dataType: 'uint8',
    pixelLayout: 'interleaved',
    scaleMode: 'cover',
  });

  useEffect(() => {
    if (!hasPermission) {
      void requestPermission();
    }
  }, [hasPermission, requestPermission]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setAppState(nextState);
      if (nextState !== 'active') {
        setDetections([]);
        setCameraError(null);
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (selectedCard !== null) {
      setDetections([]);
    }
  }, [selectedCard]);

  const showDetections = useCallback(
    (cameraDetections: RecognizedCardCandidate[]) => {
      if (previewSize === null) {
        return;
      }

      const viewDetections = cameraDetections.map((detection): ViewDetection => ({
        corners: [
          mapDetectorPointToPreview(detection.detectorCorners[0], previewSize),
          mapDetectorPointToPreview(detection.detectorCorners[1], previewSize),
          mapDetectorPointToPreview(detection.detectorCorners[2], previewSize),
          mapDetectorPointToPreview(detection.detectorCorners[3], previewSize),
        ],
        recognition: detection.recognition,
        diagnostics: detection.diagnostics,
      }));

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

  const frameOutput = useFrameOutput({
    pixelFormat: 'yuv',
    // Keep enough camera detail for distant-card recognition. Geometry is still
    // downscaled to 240x320 by detectorResizer before any contour processing.
    targetResolution: { width: RECOGNITION_WIDTH, height: RECOGNITION_HEIGHT },
    enablePreviewSizedOutputBuffers: true,
    enablePhysicalBufferRotation: false,
    dropFramesWhileBusy: true,
    onFrame(frame) {
      'worklet';

      if (detectorResizer == null || recognitionResizer == null) {
        frame.dispose();
        return;
      }

      let candidates: ReturnType<typeof detectNormalizedCardCandidates> = [];
      let frameDisposed = false;
      try {
        candidates = detectNormalizedCardCandidates(frame, detectorResizer, recognitionResizer);

        // Both resized copies are complete now, so the scarce Camera buffer can
        // be returned before ORB performs expensive feature matching.
        frame.dispose();
        frameDisposed = true;

        const recognized = recognizeCardCandidatesWithOrb(candidates);
        scheduleOnRN(showDetections, recognized);
      } catch (error) {
        scheduleOnRN(showDetectorError, String(error));
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
  const nativeError =
    detectorResizerError != null
      ? String(detectorResizerError)
      : recognitionResizerError != null
        ? String(recognitionResizerError)
        : null;
  const visibleError = nativeError ?? detectorError ?? cameraError;
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
      <Camera
        device="back"
        isActive={isCameraActive}
        onError={(error) => {
          if (appState === 'active') {
            setCameraError(error.message);
          }
        }}
        orientationSource="interface"
        outputs={[frameOutput]}
        resizeMode="cover"
        style={StyleSheet.absoluteFill}
      />

      {detections.map((detection, index) => {
        const card =
          detection.recognition.status === 'recognized'
            ? (getCardById(detection.recognition.cardId) ?? null)
            : null;

        return (
          <DetectedCardOverlay
            key={index}
            card={card}
            confidence={detection.recognition.confidence}
            corners={detection.corners}
            diagnostics={detection.diagnostics}
            onPress={setSelectedCard}
          />
        );
      })}

      <View pointerEvents="none" style={styles.debugBadge}>
        <Text style={styles.debugText}>
          OPENCV + ORB · {recognizedCount}/{detections.length}
        </Text>
        <Text style={styles.debugSubtext}>
          DET {DETECTOR_WIDTH}×{DETECTOR_HEIGHT} · ORB SRC {RECOGNITION_WIDTH}×{RECOGNITION_HEIGHT}
        </Text>
      </View>

      {visibleError ? (
        <View pointerEvents="none" style={styles.errorBadge}>
          <Text numberOfLines={3} style={styles.errorText}>
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
