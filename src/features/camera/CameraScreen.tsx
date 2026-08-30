import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Camera,
  useCameraPermission,
  useFrameOutput,
  type CameraRef,
} from 'react-native-vision-camera';
import { useResizer } from 'react-native-vision-camera-resizer';
import { scheduleOnRN } from 'react-native-worklets';

import { getCardById, type CardDefinition } from '../../catalog/cards';
import type { Quadrilateral, RecognitionResult } from '../../core/vision/types';
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

export function CameraScreen() {
  const cameraRef = useRef<CameraRef>(null);
  const { hasPermission, requestPermission } = useCameraPermission();
  const [selectedCard, setSelectedCard] = useState<CardDefinition | null>(null);
  const [detections, setDetections] = useState<ViewDetection[]>([]);
  const [detectorError, setDetectorError] = useState<string | null>(null);
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

  const showDetections = useCallback((cameraDetections: RecognizedCardCandidate[]) => {
    const camera = cameraRef.current;
    if (camera === null) {
      return;
    }

    try {
      const viewDetections = cameraDetections.map((detection): ViewDetection => ({
        corners: [
          camera.convertCameraPointToViewPoint(detection.cameraCorners[0]),
          camera.convertCameraPointToViewPoint(detection.cameraCorners[1]),
          camera.convertCameraPointToViewPoint(detection.cameraCorners[2]),
          camera.convertCameraPointToViewPoint(detection.cameraCorners[3]),
        ],
        recognition: detection.recognition,
        diagnostics: detection.diagnostics,
      }));

      // Empty CV results are very common. Avoid forcing a React render on every
      // camera frame when the UI is already empty.
      setDetections((current) =>
        current.length === 0 && viewDetections.length === 0 ? current : viewDetections
      );
      setDetectorError(null);
    } catch {
      // Preview conversion can briefly fail while the native preview is mounting.
    }
  }, []);

  const showDetectorError = useCallback((message: string) => {
    setDetectorError((current) => (current === message ? current : message));
    setDetections((current) => (current.length === 0 ? current : []));
  }, []);

  const frameOutput = useFrameOutput({
    pixelFormat: 'yuv',
    // The camera now negotiates a small CV stream up front instead of producing
    // 480x640 buffers just to resize them again. This is intentionally separate
    // from the full-screen preview resolution.
    targetResolution: { width: DETECTOR_WIDTH, height: DETECTOR_HEIGHT },
    enablePreviewSizedOutputBuffers: true,
    // Kept on for this first device-tuning pass so detector coordinates map
    // directly back to Frame coordinates. Once geometry is verified we can let
    // the GPU Resizer handle rotation and remove this extra camera-side work.
    enablePhysicalBufferRotation: true,
    dropFramesWhileBusy: true,
    onFrame(frame) {
      'worklet';

      if (resizer == null) {
        frame.dispose();
        return;
      }

      let candidates: ReturnType<typeof detectNormalizedCardCandidates> = [];
      try {
        candidates = detectNormalizedCardCandidates(frame, resizer);
        const recognized = recognizeCardCandidatesWithOrb(candidates);
        scheduleOnRN(showDetections, recognized);
      } catch (error) {
        scheduleOnRN(showDetectorError, String(error));
      } finally {
        for (const candidate of candidates) {
          candidate.normalizedImage.release();
        }
        frame.dispose();
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
    <View style={styles.container}>
      <Camera
        ref={cameraRef}
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

      <View pointerEvents="none" style={styles.debugBadge}>
        <Text style={styles.debugText}>
          OPENCV + ORB · {recognizedCount}/{detections.length}
        </Text>
        <Text style={styles.debugSubtext}>REAL IDENTIFICATION · CV 240×320</Text>
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
