import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Camera,
  useAsyncRunner,
  useCameraPermission,
  useFrameOutput,
  type CameraRef,
} from 'react-native-vision-camera';
import { useResizer } from 'react-native-vision-camera-resizer';
import { scheduleOnRN } from 'react-native-worklets';

import { getCardById, type CardDefinition } from '../../catalog/cards';
import type { Quadrilateral } from '../../core/vision/types';
import {
  DETECTOR_HEIGHT,
  DETECTOR_WIDTH,
  detectCardQuadrilaterals,
} from '../../infrastructure/detection/opencv/detectCardQuadrilaterals';
import { CardModal } from '../card/CardModal';
import { DetectedCardOverlay } from './DetectedCardOverlay';

const mockRecognizedCard = getCardById('ll-001');

export function CameraScreen() {
  const cameraRef = useRef<CameraRef>(null);
  const { hasPermission, requestPermission } = useCameraPermission();
  const [selectedCard, setSelectedCard] = useState<CardDefinition | null>(null);
  const [detectedCards, setDetectedCards] = useState<Quadrilateral[]>([]);
  const [detectorError, setDetectorError] = useState<string | null>(null);
  const asyncRunner = useAsyncRunner();
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
      setDetectedCards([]);
    }
  }, [selectedCard]);

  const showDetections = useCallback((cameraQuads: Quadrilateral[]) => {
    const camera = cameraRef.current;
    if (camera === null) {
      return;
    }

    try {
      const viewQuads = cameraQuads.map((quad): Quadrilateral => [
        camera.convertCameraPointToViewPoint(quad[0]),
        camera.convertCameraPointToViewPoint(quad[1]),
        camera.convertCameraPointToViewPoint(quad[2]),
        camera.convertCameraPointToViewPoint(quad[3]),
      ]);
      setDetectedCards(viewQuads);
      setDetectorError(null);
    } catch {
      // Preview conversion can briefly fail while the native preview is mounting.
    }
  }, []);

  const showDetectorError = useCallback((message: string) => {
    setDetectorError(message);
    setDetectedCards([]);
  }, []);

  const frameOutput = useFrameOutput({
    pixelFormat: 'yuv',
    targetResolution: { width: 480, height: 640 },
    enablePhysicalBufferRotation: true,
    dropFramesWhileBusy: true,
    onFrame(frame) {
      'worklet';

      if (resizer == null) {
        frame.dispose();
        return;
      }

      const wasHandled = asyncRunner.runAsync(() => {
        'worklet';

        try {
          const quadrilaterals = detectCardQuadrilaterals(frame, resizer);
          scheduleOnRN(showDetections, quadrilaterals);
        } catch (error) {
          scheduleOnRN(showDetectorError, String(error));
        } finally {
          frame.dispose();
        }
      });

      if (!wasHandled) {
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

      {mockRecognizedCard
        ? detectedCards.map((corners, index) => (
            <DetectedCardOverlay
              key={index}
              card={mockRecognizedCard}
              corners={corners}
              onPress={setSelectedCard}
            />
          ))
        : null}

      <View pointerEvents="none" style={styles.debugBadge}>
        <Text style={styles.debugText}>OPENCV SHAPES · {detectedCards.length}</Text>
        <Text style={styles.debugSubtext}>IDENTIFICATION: MOCK ll-001</Text>
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
