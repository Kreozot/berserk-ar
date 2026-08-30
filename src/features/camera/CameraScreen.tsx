import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Camera, useCameraPermission, useFrameOutput } from 'react-native-vision-camera';
import { useResizer } from 'react-native-vision-camera-resizer';
import { scheduleOnRN } from 'react-native-worklets';

import { getCardById, type CardDefinition } from '../../catalog/cards';
import type { Point, Quadrilateral, RecognitionResult } from '../../core/vision/types';
import {
  DETECTOR_HEIGHT,
  DETECTOR_WIDTH,
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

type CalibrationPoint = {
  readonly label: string;
  readonly point: Point;
};

const DEBUG_CALIBRATION_POINTS: readonly CalibrationPoint[] = [
  { label: 'D-TL', point: { x: DETECTOR_WIDTH * 0.25, y: DETECTOR_HEIGHT * 0.25 } },
  { label: 'D-TR', point: { x: DETECTOR_WIDTH * 0.75, y: DETECTOR_HEIGHT * 0.25 } },
  { label: 'D-BR', point: { x: DETECTOR_WIDTH * 0.75, y: DETECTOR_HEIGHT * 0.75 } },
  { label: 'D-BL', point: { x: DETECTOR_WIDTH * 0.25, y: DETECTOR_HEIGHT * 0.75 } },
];

function mapDetectorPointToPreview(point: Point, preview: PreviewSize): Point {
  // Device testing shows the upright detector image is 180° opposite to the
  // displayed back-camera preview: a physical bottom-left card was reported at
  // detector top-right, and vice versa. Rotate detector coordinates around the
  // image center before applying the same centered `cover` transform as preview.
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
  const [previewSize, setPreviewSize] = useState<PreviewSize | null>(null);
  const { resizer, error: resizerError } = useResizer({
    width: DETECTOR_WIDTH,
    height: DETECTOR_HEIGHT,
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

      let candidates: ReturnType<typeof detectNormalizedCardCandidates> = [];
      let frameDisposed = false;
      try {
        candidates = detectNormalizedCardCandidates(frame, resizer);

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

  const nativeError = resizerError == null ? null : String(resizerError);
  const visibleError = nativeError ?? detectorError;
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
        isActive={selectedCard === null}
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

      {previewSize ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {DEBUG_CALIBRATION_POINTS.map(({ label, point }) => {
            const mapped = mapDetectorPointToPreview(point, previewSize);
            return (
              <View
                key={label}
                style={[styles.calibrationPoint, { left: mapped.x - 15, top: mapped.y - 10 }]}
              >
                <Text style={styles.calibrationText}>{label}</Text>
              </View>
            );
          })}
        </View>
      ) : null}

      <View pointerEvents="none" style={styles.debugBadge}>
        <Text style={styles.debugText}>
          OPENCV + ORB · {recognizedCount}/{detections.length}
        </Text>
        <Text style={styles.debugSubtext}>
          REAL IDENTIFICATION · CV {DETECTOR_WIDTH}×{DETECTOR_HEIGHT} · ROT180
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
  calibrationPoint: {
    position: 'absolute',
    minWidth: 30,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderWidth: 1,
    borderColor: '#ffffff',
  },
  calibrationText: {
    color: '#ffffff',
    fontSize: 8,
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
