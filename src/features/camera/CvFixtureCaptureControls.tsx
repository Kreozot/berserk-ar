import { Directory } from 'expo-file-system';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { type CapturedCvFixtureFrame, createCvFixtureFrameName } from './cvFixtureCapture';

type CvFixtureCaptureControlsProps = {
  readonly captureFrame: () => Promise<CapturedCvFixtureFrame>;
};

function readableCaptureError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Owns debug-only export state without causing CameraFeed or overlay state updates. */
export function CvFixtureCaptureControls({ captureFrame }: CvFixtureCaptureControlsProps) {
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState('Сначала выберите папку для JPEG-кадров.');

  const selectDirectory = useCallback(async () => {
    setIsBusy(true);
    try {
      const selected = await Directory.pickDirectoryAsync();
      setDirectory(selected);
      setStatus(`Папка: ${selected.name}`);
    } catch (error) {
      setStatus(`Папка не выбрана: ${readableCaptureError(error)}`);
    } finally {
      setIsBusy(false);
    }
  }, []);

  const saveFrame = useCallback(async () => {
    if (directory === null) return;

    setIsBusy(true);
    setStatus('Сохраняю кадр…');
    try {
      const captured = await captureFrame();
      const fileName = createCvFixtureFrameName(new Date());
      const file = directory.createFile(fileName, 'image/jpeg');
      file.write(captured.bytes);
      setStatus(`Сохранено: ${fileName} · ${captured.width}×${captured.height}`);
    } catch (error) {
      setStatus(`Ошибка сохранения: ${readableCaptureError(error)}`);
    } finally {
      setIsBusy(false);
    }
  }, [captureFrame, directory]);

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>CV FIXTURE CAPTURE</Text>
      <Text numberOfLines={2} style={styles.status}>
        {status}
      </Text>
      <View style={styles.actions}>
        <Pressable
          disabled={isBusy}
          onPress={() => void selectDirectory()}
          style={[styles.button, isBusy && styles.buttonDisabled]}
        >
          <Text style={styles.buttonText}>Выбрать папку</Text>
        </Pressable>
        <Pressable
          disabled={isBusy || directory === null}
          onPress={() => void saveFrame()}
          style={[styles.button, (isBusy || directory === null) && styles.buttonDisabled]}
        >
          <Text style={styles.buttonText}>{isBusy ? 'Подождите…' : 'Снять кадр'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    right: 16,
    bottom: 28,
    left: 16,
    zIndex: 20,
    borderWidth: 1,
    borderColor: '#36d978',
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.86)',
    padding: 12,
  },
  title: { color: '#36d978', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  status: { marginTop: 6, color: '#ffffff', fontSize: 11, lineHeight: 15 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  button: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: '#111111', fontSize: 12, fontWeight: '700' },
});
